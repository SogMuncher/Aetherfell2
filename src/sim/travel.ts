// Moving the party between realms: travel through a way down or up, and a party wipe carrying them to the surface.
import { CONTENT, isFollower } from '../content';
import type { Entity, SimContext } from '../types';
import { interactionSystem } from './interaction';
import { openFloorNear, swapRealm } from './world/realms';
import type { SpatialHash } from './physics';
import type { WorldTiles } from './world';

/** A party wipe where the realm says so (the underworld) sends the survivors to the surface instead of waking them one by one. */
export function checkWipe(ctx: SimContext): void {
  const { state } = ctx;
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
    ctx.emit({ type: 'notice', player: e.id, text: 'Darkness takes you… and you wake on the surface, battered but alive.' });
  }
  state.journal.push({ tick: state.tick, day: state.weather.day, text: 'The party was lost in the underworld and carried back to the surface.' });
}

/** Takes the whole party into another realm: the world around them is swapped, they are set down together at the same spot. */
export function travel(ctx: SimContext, tiles: WorldTiles, query: SpatialHash): void {
  const { state } = ctx;
  const t = state.queues.travel[0];
  state.queues.travel = [];
  if (!t || t.to === state.realm || !CONTENT.realms[t.to]) return;
  state.queues.use = [];
  const elapsed = swapRealm(state, t.to);
  tiles.resetCache();
  const def = CONTENT.realms[t.to];
  const base = openFloorNear(tiles, t.x, t.y);
  const z0 = tiles.ground(base.x, base.y);
  // The way back stands where they arrive.
  const marker = def?.arrival?.thing;
  if (marker !== undefined) {
    let have = false;
    for (const e of state.entities.values()) if (e.def === marker && Math.hypot(e.pos.x - base.x, e.pos.y - base.y) < 3) have = true;
    if (!have) ctx.spawn(marker, base.x, base.y, { z: z0, prevZ: z0 });
  }
  // The travellers and whoever they hired: everyone `swapRealm` brought along is set down around the spot.
  const party: Entity[] = Object.values(state.players).map((id) => state.entities.get(id)).filter((e): e is Entity => !!e);
  for (const e of state.entities.values()) if (isFollower(CONTENT, e)) party.push(e);
  party.forEach((e, k) => {
    const a = (k / Math.max(1, party.length)) * Math.PI * 2 + 0.6;
    const r = k === 0 ? 1.4 : 1.8;
    const at = openFloorNear(tiles, base.x + Math.cos(a) * r, base.y + Math.sin(a) * r, 6);
    const z = tiles.ground(at.x, at.y);
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
    if (e.ai) {
      e.ai.path = undefined;
      e.ai.aim = undefined;
    }
  });
  // Time went on where they were not: fire kept burning and rain kept drying, within limits.
  if (elapsed > 0) {
    const passes = Math.min(elapsed, 200);
    query.rebuild(state.entities.values());
    for (let i = 0; i < passes; i++) interactionSystem(ctx);
    state.queues.use = [];
  }
  query.rebuild(state.entities.values());
  ctx.emit({ type: 'realmChanged', realm: t.to, x: base.x, y: base.y });
}
