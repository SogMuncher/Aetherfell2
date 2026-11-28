// Lifting and heaving big things (crates, pots, barrels) in both hands: one way for players and creatures (actor.wantLift / wantHeave).
import type { Entity, SimContext } from '../../types';
import { heaveSpeed, liftable, thingDef } from '../../content';

/** Takes thing `id` up in both hands, if it is liftable, in reach and the hands are free. */
export function lift(ctx: SimContext, e: Entity, id: number): void {
  const a = e.actor;
  const o = ctx.state.entities.get(id);
  if (!a || a.holding !== null || !o || o === e || !liftable(ctx.content, o)) return;
  if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > 2.8 || Math.abs(o.z - e.z) > 2) return;
  o.heldBy = e.id;
  a.holding = o.id;
}

/** Lets go of what is carried: thrown along `yaw` at `lift` radians up with `power` of a full heave (0 = set down). */
export function heave(ctx: SimContext, e: Entity, aim: { yaw: number; lift: number; power: number }): void {
  const a = e.actor;
  const held = a?.holding != null ? ctx.state.entities.get(a.holding) : undefined;
  if (!a || !held) return;
  a.holding = null;
  held.heldBy = null;
  if (aim.power <= 0) return;
  const v = heaveSpeed(thingDef(ctx.content, held.def).body.mass, e.player?.stats.might ?? 5) * aim.power;
  held.thrownBy = e.id;
  held.vel.x = Math.cos(aim.yaw) * v * Math.cos(aim.lift) + e.vel.x;
  held.vel.y = Math.sin(aim.yaw) * v * Math.cos(aim.lift) + e.vel.y;
  held.vz = 2.5 + Math.sin(aim.lift) * v;
  ctx.emit({ type: 'thrown', entity: held.id, x: held.pos.x, y: held.pos.y });
}
