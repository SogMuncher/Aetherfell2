import type { CheatDef, CheatValue, Entity, SimContext, SimSystem } from '../../types';
import { bagOf, addItem } from '../../types';
import { tuneHeld } from '../../content';

const FLY_SPEED = 12;
/** Keeps a dive slower than the speed at which landing starts to hurt. */
const FLY_DIVE_LIMIT = 12;

/**
 * Debug cheats. `applyCheat` runs a `cheat` Command (the list of cheats is data in
 * content/cheats.ts); `cheatSystem` keeps the ongoing ones going every tick (flying, endless
 * aether). God mode is honoured where harm is applied (sim/effects). Every value is checked here,
 * because a guest's request arrives from the network.
 */
export function applyCheat(ctx: SimContext, e: Entity, def: CheatDef, value: CheatValue): void {
  const { state, content, tiles } = ctx;
  const p = e.player;
  if (!p) return;
  const tell = (text: string): void => ctx.emit({ type: 'notice', player: e.id, text: `Cheat: ${text}` });
  const a = def.action;
  switch (a.type) {
    case 'toggle': {
      const cheats = (p.cheats ??= {});
      const on = !cheats[a.flag];
      cheats[a.flag] = on;
      if (a.flag === 'fly' && on) p.gliding = false;
      tell(`${def.name} ${on ? 'on' : 'off'}.`);
      break;
    }
    case 'restore':
      e.hp = e.maxHp;
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
      p.downed = 0;
      e.status = {};
      tell('fully healed.');
      break;
    case 'addSkill':
      for (const s of Object.values(p.skills)) s.level += a.levels;
      tell(`every skill raised by ${a.levels}.`);
      break;
    case 'giveItem': {
      const item = typeof value === 'string' ? content.items[value] : undefined;
      if (!item || typeof value !== 'string') return tell('no such item.');
      const count = def.arg.kind === 'item' ? def.arg.count : 1;
      addItem(bagOf(e), value, count);
      ctx.emit({ type: 'pickup', player: e.id, item: value, count });
      break;
    }
    case 'learnRune': {
      if (typeof value !== 'string' || !content.runes[value]) return tell('no such rune.');
      if (p.runes.includes(value)) return tell('you already know that rune.');
      p.runes.push(value);
      ctx.emit({ type: 'runeLearned', player: e.id, rune: value });
      break;
    }
    case 'learnAllRunes': {
      let n = 0;
      for (const r of content.runeOrder) {
        if (p.runes.includes(r)) continue;
        p.runes.push(r);
        n++;
      }
      tell(n ? `learned ${n} rune${n === 1 ? '' : 's'}.` : 'you already know every rune.');
      break;
    }
    case 'teleportPlace': {
      const loc = typeof value === 'number' ? state.locations.find((l) => l.id === value) : undefined;
      if (!loc) return tell('that place is not known yet.');
      // Land at the edge of the place, not on top of a well or a wall.
      moveTo(ctx, e, loc.pos.x + Math.min(loc.radius, 12), loc.pos.y + 0.5);
      tell(`off to ${loc.name}.`);
      break;
    }
    case 'travelRealm': {
      const to = typeof value === 'string' ? value : '';
      if (!ctx.content.realms[to]) return tell('no such realm.');
      if (to === state.realm) return tell('you are already there.');
      state.queues.travel.push({ to, x: e.pos.x, y: e.pos.y, by: e.id });
      tell(`off to ${ctx.content.realms[to]?.name ?? to}.`);
      break;
    }
    case 'teleportAhead': {
      const lim = def.arg.kind === 'number' ? def.arg : { min: 1, max: 1000 };
      const d = typeof value === 'number' && Number.isFinite(value) ? Math.max(lim.min, Math.min(lim.max, value)) : lim.min;
      moveTo(ctx, e, e.pos.x + Math.cos(e.angle) * d, e.pos.y + Math.sin(e.angle) * d);
      tell(`${Math.round(d)} m ahead.`);
      break;
    }
    case 'tuneHeld': {
      const lim = def.arg.kind === 'number' ? def.arg : { min: 0, max: 1 };
      if (typeof value !== 'number' || !Number.isFinite(value)) break;
      const v = Math.max(lim.min, Math.min(lim.max, value));
      const name = tuneHeld(content, e, a.tune, v);
      tell(name ? `${name}: ${def.name.toLowerCase()} set to ${v}.` : 'nothing in hand to tune.');
      break;
    }
    case 'setTime': {
      const h = typeof value === 'number' && Number.isFinite(value) ? ((value % 24) + 24) % 24 : 12;
      state.weather.time = h / 24;
      tell(`it is now ${String(Math.floor(h)).padStart(2, '0')}:${h % 1 >= 0.5 ? '30' : '00'}.`);
      break;
    }
    case 'setWeather': {
      const w = state.weather;
      const sky = value === 'storm' ? { rain: 0.95, cloud: 1, wind: 9 } : value === 'rain' ? { rain: 0.45, cloud: 0.7, wind: 4 } : value === 'clear' ? { rain: 0, cloud: 0.15, wind: 2 } : null;
      if (!sky) return tell('no such weather.');
      w.rain = w.rainTarget = sky.rain;
      w.cloud = sky.cloud;
      const ang = Math.atan2(w.wind.y, w.wind.x);
      w.wind = { x: Math.cos(ang) * sky.wind, y: Math.sin(ang) * sky.wind };
      w.windTarget = { ...w.wind };
      // Hold it for about four minutes before the weather changes its mind again.
      w.nextShift = Math.round(240 / ctx.dt);
      ctx.emit({ type: 'weatherShift', rain: sky.rain, wind: sky.wind });
      tell(`${String(value)}.`);
      break;
    }
    case 'spawn': {
      const thing = typeof value === 'string' ? content.things[value] : undefined;
      if (!thing?.brain || typeof value !== 'string') return tell('no such creature.');
      const x = e.pos.x + Math.cos(e.angle) * a.distance;
      const y = e.pos.y + Math.sin(e.angle) * a.distance;
      const z = Math.max(0, tiles.ground(x, y));
      ctx.spawn(value, x, y, { z, prevZ: z, angle: e.angle + Math.PI });
      tell(`a ${thing.name.toLowerCase()} appears.`);
      break;
    }
    case 'build': {
      const def = typeof value === 'string' ? content.structures[value] : undefined;
      if (!def || typeof value !== 'string') return tell('no such building.');
      // Door toward you: the front of a building faces local -y, which a quarter-turn count carries round.
      const lookX = Math.cos(e.angle);
      const lookY = Math.sin(e.angle);
      const fronts: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      let rot = 0;
      let best = -Infinity;
      fronts.forEach(([fx, fy], r) => {
        const score = -(fx * lookX + fy * lookY);
        if (score > best) {
          best = score;
          rot = r;
        }
      });
      const ax = Math.floor(e.pos.x + lookX * a.distance);
      const ay = Math.floor(e.pos.y + lookY * a.distance);
      const r = ctx.build(def, { x: ax, y: ay, rot, anchor: 'door', ground: (x, y) => tiles.ground(x, y) });
      // Trees, boulders and bushes inside or beside it come down.
      for (let x = r.x0 - 1; x <= r.x1 + 1; x++) {
        for (let y = r.y0 - 1; y <= r.y1 + 1; y++) if (tiles.blocked(x + 0.5, y + 0.5) || tiles.info(x, y).shape === 'billboard') tiles.setKind(x, y, content.tileIds.grass ?? 0);
      }
      for (const f of r.furnishings) ctx.spawn(f.thing, f.x, f.y, { z: f.z, prevZ: f.z, angle: f.angle });
      tell(`${def.name} raised${r.storeys > 1 ? `, ${r.storeys} storeys` : ''}.`);
      break;
    }
    case 'banish': {
      let n = 0;
      for (const o of ctx.query.near(e.pos.x, e.pos.y, a.radius)) {
        if (!o.ai || o.npc || o.player || o.dead) continue;
        if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > a.radius) continue;
        o.dead = true;
        n++;
      }
      tell(n ? `${n} creature${n === 1 ? '' : 's'} banished.` : 'nothing nearby to banish.');
      break;
    }
    case 'revealPlaces': {
      let n = 0;
      for (const l of state.locations) {
        if (l.discovered) continue;
        l.discovered = true;
        n++;
        ctx.emit({ type: 'discovered', locationId: l.id, name: l.name, x: l.pos.x, y: l.pos.y });
      }
      tell(n ? `${n} place${n === 1 ? '' : 's'} revealed.` : 'every known place is already discovered.');
      break;
    }
  }
}

/** Puts a traveller down safely somewhere else (whatever they carried stays behind). */
function moveTo(ctx: SimContext, e: Entity, x: number, y: number): void {
  const a = e.actor;
  if (a?.holding != null) {
    const held = ctx.state.entities.get(a.holding);
    if (held) held.heldBy = null;
    a.holding = null;
  }
  e.pos.x = e.prev.x = x;
  e.pos.y = e.prev.y = y;
  e.z = e.prevZ = Math.max(0, ctx.tiles.ground(x, y)) + (e.player?.cheats?.fly ? 3 : 0.5);
  e.vel.x = e.vel.y = e.vz = 0;
}

/** Ongoing cheats, every tick. Runs after player control and before physics. */
export const cheatSystem: SimSystem = (ctx: SimContext) => {
  const { state } = ctx;
  for (const id of Object.values(state.players)) {
    const e = state.entities.get(id);
    const p = e?.player;
    const c = p?.cheats;
    if (!e || !p || !c || e.dead) continue;
    if (c.endless) {
      p.mana = p.maxMana;
      p.stamina = p.maxStamina;
    }
    if (c.fly && p.downed <= 0) {
      const i = p.input;
      p.gliding = false;
      const look = i.pitch * 0.9;
      const speed = FLY_SPEED * (i.sprint ? 3 : 1);
      const cos = Math.cos(i.yaw);
      const sin = Math.sin(i.yaw);
      const flat = Math.cos(look) * i.forward;
      const tx = (cos * flat - sin * i.strafe) * speed;
      const ty = (sin * flat + cos * i.strafe) * speed;
      const tz = (Math.sin(look) * i.forward + (i.jumpHeld ? 0.8 : 0)) * speed;
      e.vel.x += (tx - e.vel.x) * 0.35;
      e.vel.y += (ty - e.vel.y) * 0.35;
      e.vz += (tz - e.vz) * 0.35;
      if (e.vz < -FLY_DIVE_LIMIT) e.vz = -FLY_DIVE_LIMIT;
    }
  }
};

