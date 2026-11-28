// Brain behaviours for big things: lifting crates and pots, heaving them at enemies, and smashing loot boxes open (the player's own hands).
import type { BehaviourDef } from '../../types';
import { heaveSpeed, holdsLoot, liftable, thingDef } from '../../content';
import { type Senses, clearShot, go, isEnemy } from './senses';

type Def<K extends BehaviourDef['do']> = Extract<BehaviourDef, { do: K }>;

/** Whether it is already on its way to this spot (so it keeps going without rolling again). */
const headingTo = (s: Senses, doing: string, x: number, y: number): boolean =>
  s.me.ai.doing === doing && s.me.ai.goal !== null && Math.hypot(s.me.ai.goal.x - x, s.me.ai.goal.y - y) < 0.5;

/** Goes to a liftable thing and takes it up (actor.wantLift); carrying one, now and then sets it down. */
export function liftUp(s: Senses, b: Def<'lift'>): boolean {
  const { me, ctx } = s;
  if (me.actor.holding !== null) {
    if (ctx.rng.chance(b.setDown)) me.actor.wantHeave = { yaw: me.angle, lift: 0, power: 0 };
    return false;
  }
  const want = s.props.find((o) => o.d <= b.within && liftable(ctx.content, o.e));
  if (!want) return false;
  if (!headingTo(s, 'lift', want.e.pos.x, want.e.pos.y) && !ctx.rng.chance(b.chance)) return false;
  const reach = thingDef(ctx.content, me.def).body.radius + thingDef(ctx.content, want.e.def).body.radius + 1;
  if (Math.hypot(want.e.pos.x - me.pos.x, want.e.pos.y - me.pos.y) <= reach) {
    me.angle = Math.atan2(want.e.pos.y - me.pos.y, want.e.pos.x - me.pos.x);
    me.actor.wantLift = want.e.id;
    return go(s, 'idle', null);
  }
  return go(s, 'goto', { x: want.e.pos.x, y: want.e.pos.y });
}

/** Heaves what it carries at an enemy in range with a clear line, in the lower arc that lands on them (actor.wantHeave). */
export function heaveAt(s: Senses, b: Def<'heave'>): boolean {
  const { me, ctx } = s;
  const held = me.actor.holding !== null ? ctx.state.entities.get(me.actor.holding) : undefined;
  if (!held) return false;
  const foe = s.seen.find((o) => isEnemy(s, o) && o.d >= b.range[0] && o.d <= b.range[1] && clearShot(s, o.e));
  if (!foe || !ctx.rng.chance(b.chance)) return false;
  const dx = foe.e.pos.x - me.pos.x;
  const dy = foe.e.pos.y - me.pos.y;
  const flat = Math.hypot(dx, dy);
  const v = heaveSpeed(thingDef(ctx.content, held.def).body.mass, 5);
  const lift = 0.5 * Math.asin(Math.min(1, (ctx.content.rules.gravity * flat) / (v * v))) + Math.atan2(foe.e.z - me.z, Math.max(1, flat)) * 0.5;
  me.angle = Math.atan2(dy, dx);
  me.actor.wantHeave = { yaw: me.angle, lift, power: 1 };
  return go(s, 'idle', null, foe.e.id);
}

/** Goes to a thing that spills loot when broken and hits it (a chase whose target is the box) until it breaks. */
export function smash(s: Senses, b: Def<'smash'>): boolean {
  const { me, ctx } = s;
  if (me.actor.holding !== null) return false;
  const box = s.props.find((o) => o.d <= b.within && holdsLoot(ctx.content, o.e));
  if (!box) return false;
  const onIt = me.ai.doing === 'smash' && me.ai.target === box.e.id;
  if (!onIt && !ctx.rng.chance(b.chance)) return false;
  return go(s, 'chase', null, box.e.id);
}
