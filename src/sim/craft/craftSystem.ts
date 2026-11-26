// Crafts: stations taken and fed, horn calls answered, and flight worked out from the stations' channels, wind and thin air
import type { CraftDef, Entity, SimContext, SimSystem, StationDef, ThingId } from '../../types';
import { bagOf, countItem, removeItem } from '../../types';
import { itemDef, thingDef } from '../../content';
import { aboard, craftMotion } from './craftMotion';
import { buildCraft } from './craftBuild';
import { haulIn, holdChains } from './tether';

/**
 * A craft (the airship) flies from whatever its stations say: each station writes one named channel, the craft's
 * definition says what each channel does. A manned lever follows its worker's movement keys and eases back to the
 * middle when they let go; left alone it stays where it was set. Fuel burns only while the craft flies under its own power.
 */
export const craftSystem: SimSystem = (ctx: SimContext) => {
  const { state, content, dt } = ctx;
  for (const u of state.queues.use) {
    const pl = state.entities.get(u.player);
    const p = pl?.player;
    if (!pl || !p) continue;
    if (p.station != null) {
      leaveStation(ctx, pl);
      continue;
    }
    const t = u.entity !== null ? state.entities.get(u.entity) : undefined;
    const st = t ? thingDef(content, t.def).station : undefined;
    if (!t || !st || !t.control) continue;
    if (st.feed) feed(ctx, pl, t, st);
    else if (t.control.by !== null && state.entities.get(t.control.by)?.player?.station === t.id) ctx.emit({ type: 'notice', player: pl.id, text: 'Someone is already there.' });
    else {
      t.control.by = pl.id;
      p.station = t.id;
      ctx.emit({ type: 'station', entity: pl.id, station: t.id, act: 'take' });
    }
  }
  for (const call of state.queues.calls) answer(ctx, call);
  for (const e of state.entities.values()) {
    const cd = e.craft && !e.dead ? thingDef(content, e.def).craft : undefined;
    if (cd) fly(ctx, e, cd, dt);
  }
  holdChains(ctx);
  craftMotion(ctx);
};

function leaveStation(ctx: SimContext, pl: Entity): void {
  const p = pl.player;
  if (!p || p.station == null) return;
  const t = ctx.state.entities.get(p.station);
  if (t?.control && t.control.by === pl.id) t.control.by = null;
  ctx.emit({ type: 'station', entity: pl.id, station: p.station, act: 'leave' });
  p.station = null;
}

function feed(ctx: SimContext, pl: Entity, t: Entity, st: StationDef): void {
  const f = st.feed;
  if (!f || !t.control) return;
  const name = itemDef(ctx.content, f.item)?.name.toLowerCase() ?? f.item;
  if (countItem(bagOf(pl), f.item) === 0) ctx.emit({ type: 'notice', player: pl.id, text: `It needs a ${name}, and you have none.` });
  else if (t.control.v > f.max - f.amount / 2) ctx.emit({ type: 'notice', player: pl.id, text: `The ${thingDef(ctx.content, t.def).name} is full.` });
  else {
    removeItem(bagOf(pl), f.item, 1);
    t.control.v = Math.min(f.max, t.control.v + f.amount);
    ctx.emit({ type: 'station', entity: pl.id, station: t.id, act: 'feed' });
    ctx.emit({ type: 'notice', player: pl.id, text: `The ${name} melts into the ${thingDef(ctx.content, t.def).name}.` });
  }
}

/** A horn: the nearest craft of that kind flies to the caller (one is made far off if there is none yet). */
function answer(ctx: SimContext, call: { thing: ThingId; x: number; y: number; by: number }): void {
  const { state } = ctx;
  if (state.realm && ctx.content.realms[state.realm]?.sky === false) {
    ctx.emit({ type: 'notice', player: call.by, text: 'The call dies against the stone overhead.' });
    return;
  }
  let best: Entity | null = null;
  let bd = Infinity;
  for (const e of state.entities.values()) {
    if (e.dead || e.def !== call.thing || !e.craft) continue;
    const d = Math.hypot(e.pos.x - call.x, e.pos.y - call.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  if (!best) {
    const caller = state.entities.get(call.by);
    const a = (caller?.angle ?? 0) + Math.PI;
    const x = call.x + Math.cos(a) * 140;
    const y = call.y + Math.sin(a) * 140;
    const cd = thingDef(ctx.content, call.thing).craft;
    const z = Math.max(ctx.tiles.ground(x, y), ctx.tiles.ground(call.x, call.y)) + (cd?.called.cruise ?? 30);
    best = buildCraft(ctx, call.thing, x, y, z, a + Math.PI);
  }
  if (best?.craft) {
    best.craft.goal = { x: call.x, y: call.y };
    // Called away, it weighs anchor.
    const cd = thingDef(ctx.content, best.def).craft;
    if (cd) haulIn(ctx, best, cd);
    ctx.emit({ type: 'answer', entity: best.id, x: best.pos.x, y: best.pos.y });
    ctx.emit({ type: 'notice', player: call.by, text: `Far off, the ${thingDef(ctx.content, best.def).name} turns toward the call.` });
  }
}

/** Speed, climb and turn for one tick, from the stations (or the call it is answering), the wind and the thin air. */
function fly(ctx: SimContext, e: Entity, cd: CraftDef, dt: number): void {
  const { state, content } = ctx;
  const c = e.craft;
  if (!c) return;
  const channel = new Map<string, number>();
  const tanks: Entity[] = [];
  for (const o of state.entities.values()) {
    if (o.ride?.craft !== e.id || !o.control) continue;
    const st = thingDef(content, o.def).station;
    if (!st) continue;
    if (st.channel === cd.fuel) tanks.push(o);
    if (st.axis) work(state.entities.get(o.control.by ?? -1), o, st, dt, c);
    channel.set(st.channel, (channel.get(st.channel) ?? 0) + o.control.v);
  }
  const get = (name: string): number => Math.max(-1, Math.min(1, channel.get(name) ?? 0));
  const fuel = tanks.reduce((s, t) => s + (t.control?.v ?? 0), 0);
  const powered = fuel > 0;
  let thrust = get(cd.thrust.channel);
  let turn = get(cd.turn.channel);
  let climb = get(cd.climb.channel);

  // The highest ground anywhere under it, while anyone is near enough for it to be loaded.
  const near = Object.values(state.players).some((id) => {
    const p = state.entities.get(id);
    return !!p && Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y) < content.rules.awake;
  });
  const ground = near ? groundUnder(ctx, e, cd, e.pos.x, e.pos.y, e.angle) : -Infinity;
  const rest = ground + cd.clearance;

  if (c.goal && powered) {
    const dx = c.goal.x - e.pos.x;
    const dy = c.goal.y - e.pos.y;
    const dist = Math.hypot(dx, dy);
    const off = Math.atan2(Math.sin(Math.atan2(dy, dx) - e.angle), Math.cos(Math.atan2(dy, dx) - e.angle));
    const arrived = dist < cd.called.near;
    turn = arrived ? 0 : Math.max(-1, Math.min(1, off * 2));
    thrust = arrived ? 0 : Math.max(0, Math.cos(off)) * Math.max(0.2, Math.min(1, (dist - cd.called.near) / 30));
    const want = !Number.isFinite(ground) ? e.z : dist > cd.called.near * 3 ? ground + cd.called.cruise : rest;
    climb = Math.max(-1, Math.min(1, (want - e.z) / 4));
    if (arrived && Math.hypot(c.vel.x, c.vel.y) < 0.6 && e.z - rest < 0.3) c.goal = null;
  }
  if (!powered) {
    thrust = 0;
    turn = 0;
    climb = 0;
  }
  const moored = e.z <= rest + 0.05;
  const thin = Math.max(0, Math.min(1, (e.z - cd.air.base) / cd.air.span));
  const speed = cd.thrust.speed * (1 + thin * cd.air.speed);
  // Answering a call it flies straight in, the wind ignored, until it touches down. Low over the ground (landing, landed) the wind leaves it be.
  const low = Math.max(0, Math.min(1, (e.z - rest - cd.still) / cd.still));
  const drift = moored || c.goal ? 0 : cd.wind * (1 - thin * cd.air.calm) * low;
  const w = state.weather.wind;
  // Resting on the ground it drags to a stop.
  const k = Math.min(1, (moored ? 4 : 1) * cd.thrust.accel * dt);
  c.vel.x += (Math.cos(e.angle) * thrust * speed + w.x * drift - c.vel.x) * k;
  c.vel.y += (Math.sin(e.angle) * thrust * speed + w.y * drift - c.vel.y) * k;
  c.spin = turn * cd.turn.rate;
  c.vz = powered ? climb * cd.climb.rate : -cd.sink;
  // Never into the ground, never above the top of the air: rising ground it cannot climb over in time stops it like a wall.
  if (near && Number.isFinite(ground)) {
    const ahead = groundUnder(ctx, e, cd, e.pos.x + c.vel.x * dt, e.pos.y + c.vel.y * dt, e.angle + c.spin * dt) + cd.clearance;
    if (ahead > Math.max(rest, e.z) + cd.climb.rate * dt) {
      c.vel.x = 0;
      c.vel.y = 0;
      c.spin = 0;
    }
  }
  if (e.z + c.vz * dt < rest) c.vz = (rest - e.z) / dt;
  if (e.z + c.vz * dt > cd.air.top) c.vz = (cd.air.top - e.z) / dt;

  // Fuel burns while it flies under its own power.
  if (powered && (Math.abs(thrust) > 0.02 || Math.abs(turn) > 0.02 || Math.abs(climb) > 0.02)) {
    let left = dt;
    for (const t of tanks) {
      if (!t.control || left <= 0) continue;
      const take = Math.min(t.control.v, left);
      t.control.v -= take;
      left -= take;
    }
  }
}

/** The highest ground under the craft's whole box (every 2 m across it), were it at (x, y) turned to `yaw`. */
function groundUnder(ctx: SimContext, e: Entity, cd: CraftDef, x: number, y: number, yaw: number): number {
  const at = { ...e, pos: { x, y }, angle: yaw };
  const [x0, y0] = cd.low ?? [0, 0];
  const nx = Math.ceil((cd.size[0] - x0) / 2);
  const ny = Math.ceil((cd.size[1] - y0) / 2);
  let g = -Infinity;
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= ny; j++) {
      const p = aboard(at, cd, x0 + ((cd.size[0] - x0) * i) / nx, y0 + ((cd.size[1] - y0) * j) / ny);
      g = Math.max(g, ctx.tiles.ground(p.x, p.y));
    }
  }
  return g;
}

/** A manned lever follows its worker's keys and eases back to the middle when they let go; taking it over ends a call. */
function work(pl: Entity | undefined, o: Entity, st: StationDef, dt: number, c: { goal: unknown }): void {
  const ctl = o.control;
  if (!ctl) return;
  if (!pl || pl.dead || pl.player?.station !== o.id) {
    ctl.by = null;
    return;
  }
  const input = pl.player.input;
  const push = st.axis === 'forward' ? input.forward : input.strafe;
  if (Math.abs(push) > 0.1) {
    ctl.v += push * (st.rate ?? 1) * dt;
    c.goal = null;
  } else ctl.v -= Math.sign(ctl.v) * Math.min(Math.abs(ctl.v), (st.decay ?? 1) * dt);
  ctl.v = Math.max(-1, Math.min(1, ctl.v));
}
