import { CONTENT, setAirMoisture } from '../content';
import { breakItem } from './breakage';
import { type Command, type Entity, type InputSnapshot, type ItemStack, type SimContext, type SimEvent, type SimState, type SimSystem, type SpawnInit, TICK_DT, type ThingId, type WorldSampler, emptyInput, emptyQueues, unpackKey } from '../types';
import { LatticeSampler, generateLatticeChunk } from './world/underworld';
import { InputQueues } from './inputQueue';
import { Matter, Terrain, VolumeStore, WorldTiles, createWorldSystem, unloadFarChunks } from './world';
import { SpatialHash, physicsSystem } from './physics';
import { aiSystem } from './ai';
import { applyCheat, cheatSystem } from './cheats';
import { buildStructure } from './structures';
import { cheatDef } from '../content/cheats';
import { deserialize, serialize } from './persistence';
import { ecologySystem } from './ecology';
import { effectsSystem } from './effects';
import { generateChunk } from './world/chunkgen';
import { interactionSystem } from './interaction';
import { magicSystem } from './magic';
import { dress, makeEntity, startKit } from './templates';
import { makeRng, newPlayer } from './simState';
import { meleeSystem } from './melee';
import { openFloorNear, swapRealm } from './world/realms';
import { playerSystem } from './player';
import { rpgSystem } from './rpg';
import { socialSystem } from './social';
import { statusSystem } from './statuses';
import { structuresIn } from './world/sites';
import { weatherSystem } from './weather';

export { createState } from './simState';


/** Hands the renderer whichever realm's far ground is current, without it ever needing to know about realms. */
class RealmSampler implements WorldSampler {
  constructor(private readonly current: () => WorldSampler) {}
  sample(x: number, y: number, detail: number): ReturnType<WorldSampler['sample']> {
    return this.current().sample(x, y, detail);
  }
  naturalKinds(cx: number, cy: number): Uint8Array {
    return this.current().naturalKinds(cx, cy);
  }
}

/**
 * The headless simulation. Owns system order; the only place that imports sim submodules.
 * Feed it Commands, call step() at 20 Hz, read the events it returns.
 */
export class Simulation {
  state: SimState;
  terrain: Terrain;
  tiles: WorldTiles;
  matter: Matter;
  /** What the renderer samples beyond loaded tiles: the land, or the lattice of the underworld, whichever the party is in. */
  readonly sampler: WorldSampler;
  private readonly lattice: LatticeSampler;
  readonly query = new SpatialHash();
  private commands: Command[] = [];
  private events: SimEvent[] = [];
  private systems: SimSystem[] = [];
  private ctx: SimContext;
  private inputs = new InputQueues();

  constructor(state: SimState) {
    this.state = state;
    this.terrain = new Terrain(state.seed);
    // Clouds gather over damp land: the sky reads this world's moisture (render and rain agree).
    setAirMoisture((x, y) => this.terrain.moisture(x, y));
    this.tiles = new WorldTiles(state, this.terrain);
    this.matter = new Matter(state, this.tiles);
    this.sampler = new RealmSampler(() => (CONTENT.realms[this.state.realm]?.ground === 'lattice' ? this.lattice : this.terrain));
    this.lattice = new LatticeSampler(state.seed);
    this.ctx = this.buildContext();
    this.systems = this.buildSystems();
  }

  static fromSave(bytes: Uint8Array): Simulation | null {
    const s = deserialize(bytes, (seed, cx, cy, realm) => Simulation.regenChunk(seed, cx, cy, realm), () => new VolumeStore());
    return s ? new Simulation(s) : null;
  }

  static newVolume(): VolumeStore {
    return new VolumeStore();
  }

  static regenChunk(seed: number, cx: number, cy: number, realm = 'overworld'): ReturnType<typeof generateChunk> {
    if (CONTENT.realms[realm]?.ground === 'lattice') return generateLatticeChunk(seed, cx, cy);
    return generateChunk(new Terrain(seed), cx, cy);
  }

  save(): Uint8Array {
    return serialize(this.state);
  }

  private buildContext(): SimContext {
    const state = this.state;
    const rng = makeRng(state);
    const spawn = (thing: ThingId, x: number, y: number, init?: SpawnInit): Entity => {
      const e = makeEntity(CONTENT, state.nextEntityId++, thing, x, y, init);
      dress(CONTENT, e, rng);
      state.entities.set(e.id, e);
      return e;
    };
    return {
      state,
      tiles: this.tiles,
      matter: this.matter,
      query: this.query,
      rng,
      dt: TICK_DT,
      content: CONTENT,
      emit: (e) => this.events.push(e),
      // With a seed the building comes out the same wherever and whenever it is raised.
      build: (def, site, seed) => buildStructure(def, state.volume, site, seed === undefined ? rng : makeRng({ rng: seed | 0 })),
      spawn,
      dropItems: (x: number, y: number, z: number, items: readonly ItemStack[]): void => {
        for (const s of items) {
          const a = rng.range(0, Math.PI * 2);
          const v = rng.range(1, 2.6);
          spawn('looseItem', x, y, { z, prevZ: z, vz: rng.range(2.5, 4.5), vel: { x: Math.cos(a) * v, y: Math.sin(a) * v }, item: { id: s.id, count: s.count } });
        }
      },
      breakItem: (item, x, y, z, by) => breakItem(this.ctx, item, x, y, z, by),
    };
  }

  private buildSystems(): SimSystem[] {
    return [
      weatherSystem,
      createWorldSystem(this.terrain, this.tiles),
      ecologySystem,
      playerSystem,
      cheatSystem,
      aiSystem,
      meleeSystem,
      magicSystem,
      physicsSystem,
      interactionSystem,
      statusSystem,
      effectsSystem,
      rpgSystem,
      socialSystem,
    ];
  }

  enqueue(cmd: Command): void {
    this.commands.push(cmd);
  }

  /** Advance one fixed 50 ms tick. Returns everything that happened. */
  step(): SimEvent[] {
    const { state } = this;
    state.tick++;
    for (const e of state.entities.values()) {
      e.prev.x = e.pos.x;
      e.prev.y = e.pos.y;
      e.prevZ = e.z;
      e.age++;
    }
    this.applyCommands();
    this.playInputs();
    this.query.rebuild(state.entities.values());
    for (const sys of this.systems) sys(this.ctx);
    this.checkWipe();
    this.travel();

    // End of tick: clear shared one-tick queues, remove the dead, publish tile changes.
    state.queues.use = [];
    state.queues.kills = [];
    for (const [id, e] of state.entities) {
      if (!e.dead) continue;
      if (e.player) {
        e.dead = false;
        continue;
      }
      state.entities.delete(id);
    }
    for (const k of state.tileChanges) {
      const { x, y } = unpackKey(k);
      this.events.push({ type: 'tileChanged', x, y, cell: this.tiles.cell(x, y) });
    }
    state.tileChanges.clear();
    for (const b of state.volume.takeDirty()) this.events.push({ type: 'volumeChanged', brick: state.volume.exportBrick(b) });
    const out = this.events;
    this.events = [];
    return out;
  }

  /** A party wipe where the realm says so (the underworld) sends the survivors to the surface instead of waking them one by one. */
  private checkWipe(): void {
    const { state } = this;
    const to = CONTENT.realms[state.realm]?.wipe;
    if (to === undefined) return;
    const party = Object.values(state.players).map((id) => state.entities.get(id)).filter((e): e is Entity => !!e && !!e.player);
    if (party.length === 0 || !party.every((e) => (e.player?.downed ?? 0) > 0)) return;
    let x = 0;
    let y = 0;
    for (const e of party) {
      x += e.pos.x / party.length;
      y += e.pos.y / party.length;
    }
    state.queues.travel.push({ to, x, y, by: party[0]?.id ?? 0 });
    for (const e of party) {
      if (!e.player) continue;
      e.player.downed = 0;
      e.hp = Math.round(e.maxHp * 0.5);
      e.status = {};
      this.events.push({ type: 'notice', player: e.id, text: 'Darkness takes you… and you wake on the surface, battered but alive.' });
    }
    state.journal.push({ tick: state.tick, day: state.weather.day, text: 'The party was lost in the underworld and carried back to the surface.' });
  }

  /** Takes the whole party into another realm: the world around them is swapped, they are set down together at the same spot. */
  private travel(): void {
    const { state } = this;
    const t = state.queues.travel[0];
    state.queues.travel = [];
    if (!t || t.to === state.realm || !CONTENT.realms[t.to]) return;
    state.queues.use = [];
    const elapsed = swapRealm(state, t.to);
    this.tiles.resetCache();
    const def = CONTENT.realms[t.to];
    const base = openFloorNear(this.tiles, t.x, t.y);
    const z0 = this.tiles.ground(base.x, base.y);
    // The way back stands where they arrive.
    const marker = def?.arrival?.thing;
    if (marker !== undefined) {
      let have = false;
      for (const e of state.entities.values()) if (e.def === marker && Math.hypot(e.pos.x - base.x, e.pos.y - base.y) < 3) have = true;
      if (!have) this.ctx.spawn(marker, base.x, base.y, { z: z0, prevZ: z0 });
    }
    const party = Object.values(state.players).map((id) => state.entities.get(id)).filter((e): e is Entity => !!e);
    party.forEach((e, k) => {
      const a = (k / Math.max(1, party.length)) * Math.PI * 2 + 0.6;
      const r = k === 0 ? 1.4 : 1.8;
      const at = openFloorNear(this.tiles, base.x + Math.cos(a) * r, base.y + Math.sin(a) * r, 6);
      const z = this.tiles.ground(at.x, at.y);
      e.pos.x = at.x;
      e.pos.y = at.y;
      e.prev.x = at.x;
      e.prev.y = at.y;
      e.z = z;
      e.prevZ = z;
      e.vel.x = 0;
      e.vel.y = 0;
      e.vz = 0;
      if (e.player) e.player.gliding = false;
    });
    // Time went on where they were not: fire kept burning and rain kept drying, within limits.
    if (elapsed > 0) {
      const passes = Math.min(elapsed, 200);
      this.query.rebuild(state.entities.values());
      for (let i = 0; i < passes; i++) interactionSystem(this.ctx);
      state.queues.use = [];
    }
    this.query.rebuild(state.entities.values());
    this.events.push({ type: 'realmChanged', realm: t.to, x: base.x, y: base.y });
  }

  /** A guest's copy follows the host into another realm (the host announces it with `realmChanged`). */
  followRealm(to: string): void {
    if (to === this.state.realm || !CONTENT.realms[to]) return;
    swapRealm(this.state, to);
    this.tiles.resetCache();
  }

  private applyCommands(): void {
    const { state } = this;
    const cmds = this.commands;
    this.commands = [];
    for (const c of cmds) {
      switch (c.type) {
        case 'join': {
          const existing = state.players[c.playerId];
          if (existing !== undefined && state.entities.has(existing)) break;
          const back = state.absent[c.playerId];
          if (back?.player) {
            // A traveller we know: they come back exactly as they left, at the same spot.
            delete state.absent[c.playerId];
            back.player.name = c.name || back.player.name;
            back.prev = { x: back.pos.x, y: back.pos.y };
            back.prevZ = back.z;
            state.entities.set(back.id, back);
            state.players[c.playerId] = back.id;
            this.events.push({ type: 'playerJoined', playerId: c.playerId, name: back.player.name });
            if (state.tick > 1) state.journal.push({ tick: state.tick, day: state.weather.day, text: `${back.player.name} rejoined the party.` });
            break;
          }
          const spawn = this.findSpawn();
          const z = this.tiles.ground(spawn.x, spawn.y);
          const e = this.ctx.spawn('player', spawn.x, spawn.y, { z, prevZ: z, player: newPlayer(c.playerId, c.name, spawn) });
          startKit(CONTENT, e);
          state.players[c.playerId] = e.id;
          this.events.push({ type: 'playerJoined', playerId: c.playerId, name: c.name });
          if (state.tick > 1) state.journal.push({ tick: state.tick, day: state.weather.day, text: `${c.name} joined the party.` });
          break;
        }
        case 'leave': {
          const id = state.players[c.playerId];
          if (id !== undefined) {
            const e = state.entities.get(id);
            if (e?.player?.holding != null) {
              const held = state.entities.get(e.player.holding);
              if (held) held.heldBy = null;
            }
            if (e) {
              if (e.player) {
                e.player.holding = null;
                e.player.dialogue = null;
                e.player.input = emptyInput(0, e.player.input.yaw);
              }
              state.absent[c.playerId] = e;
            }
            state.entities.delete(id);
            delete state.players[c.playerId];
            this.inputs.forget(c.playerId);
            this.events.push({ type: 'playerLeft', playerId: c.playerId });
          }
          break;
        }
        case 'input': {
          const id = state.players[c.playerId];
          if (id === undefined) break;
          const p = state.entities.get(id)?.player;
          if (!p) break;
          this.inputs.add(c.playerId, c.input, p.input);
          break;
        }
        case 'cheat': {
          const id = state.players[c.playerId];
          const e = id !== undefined ? state.entities.get(id) : undefined;
          const def = cheatDef(c.cheat);
          if (e?.player && def) applyCheat(this.ctx, e, def, c.value);
          break;
        }
      }
    }
  }

  /** Each player plays one waiting input per tick (see InputQueues.play). */
  private playInputs(): void {
    const { state } = this;
    for (const [pid, id] of Object.entries(state.players)) {
      const p = state.entities.get(id)?.player;
      if (p) p.input = this.inputs.play(pid, p.input);
    }
  }

  /**
   * The world was loaded: every character in it is set aside until their traveller joins again,
   * so nobody stands in the world unplayed. Call before the local player joins.
   */
  parkPlayers(): void {
    const { state } = this;
    for (const [pid, id] of Object.entries(state.players)) {
      const e = state.entities.get(id);
      if (e?.player) {
        e.player.holding = null;
        e.player.dialogue = null;
        e.player.input = emptyInput(0, e.player.input.yaw);
        state.absent[pid] = e;
      }
      state.entities.delete(id);
    }
    state.players = {};
    this.inputs.clear();
  }

  /**
   * A guest moving its own traveller straight away instead of waiting for the host: one tick of
   * walking, jumping, gliding and bumping into things, using exactly the host's rules but touching
   * nothing else (no creatures, no events, no shared randomness). The host's answer replaces it
   * when it arrives; main.ts then replays the inputs the host has not seen yet.
   */
  predict(playerId: string, input: InputSnapshot): void {
    const real = this.state;
    const id = real.players[playerId];
    const e = id !== undefined ? real.entities.get(id) : undefined;
    if (!e?.player) return;
    const own = new Map<number, Entity>([[e.id, e]]);
    const held = e.player.holding !== null ? real.entities.get(e.player.holding) : undefined;
    if (held) own.set(held.id, held);
    const mini: SimState = { ...real, entities: own, players: { [playerId]: e.id }, queues: emptyQueues(), tileChanges: new Set() };
    const query = new SpatialHash();
    const ctx: SimContext = {
      ...this.ctx,
      state: mini,
      query,
      rng: makeRng({ ...mini, rng: real.tick }),
      emit: () => {},
      spawn: (thing, x, y, init) => makeEntity(CONTENT, -1, thing, x, y, init),
      dropItems: () => {},
      breakItem: () => {},
    };
    for (const o of own.values()) {
      o.prev.x = o.pos.x;
      o.prev.y = o.pos.y;
      o.prevZ = o.z;
    }
    // Only moving is foreseen. Presses (use, grab, talk…) wait for the host's answer.
    e.player.input = { ...input, interact: false, grab: false, cast: false, prepare: null, useItem: null, dropItem: null, throwItem: null, pickUp: null, wear: null, choice: null };
    query.rebuild(own.values());
    playerSystem(ctx);
    physicsSystem(ctx);
  }

  /** A guest's copy of the world: forget untouched land far from us (the host does this in its world system). */
  trimAround(x: number, y: number): void {
    unloadFarChunks(this.state, [{ x, y }], this.tiles);
  }

  /** New players start next to a friend, or on a road near the origin. */
  private findSpawn(): { x: number; y: number } {
    // Beside a friend, on a clear spot (a body standing half in a tree or bush cannot move at all).
    const clear = (x: number, y: number): boolean => {
      for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
        if (this.tiles.blocked(x + dx, y + dy) || this.tiles.info(x + dx, y + dy).liquid) return false;
      }
      return true;
    };
    for (const id of Object.values(this.state.players)) {
      const e = this.state.entities.get(id);
      if (!e) continue;
      const fx = Math.floor(e.pos.x) + 0.5;
      const fy = Math.floor(e.pos.y) + 0.5;
      for (let r = 1; r <= 4; r++) {
        for (let a = 0; a < 8; a++) {
          const x = fx + Math.round(Math.cos((a * Math.PI) / 4) * r);
          const y = fy + Math.round(Math.sin((a * Math.PI) / 4) * r);
          if (clear(x, y)) return { x, y };
        }
      }
      return { x: e.pos.x, y: e.pos.y };
    }
    for (let r = 0; r < 2000; r += 7) {
      for (let a = 0; a < 6.28; a += 0.4) {
        const x = Math.floor(Math.cos(a) * r) + 0.5;
        const y = Math.floor(Math.sin(a) * r) + 0.5;
        const g = this.terrain.ground(x, y, 4);
        if (g < 3 || g > 60) continue;
        // Not where a house is planned: it is raised only once someone comes near, so the ground looks free.
        if (this.terrain.sitesNear(x, y).some((site) => structuresIn(site, x - 2, y - 2, x + 2, y + 2).length > 0)) continue;
        if (this.terrain.roadAt(x, y, g) > 0.3 && !this.tiles.blocked(x, y)) return { x, y };
      }
    }
    return { x: 0.5, y: 0.5 };
  }
}
