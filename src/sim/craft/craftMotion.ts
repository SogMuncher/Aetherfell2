// Moves every craft by its own speed and turn, carrying whoever stands on it, and keeps its frame in the 3D layer in step
import type { CraftDef, Entity, SimContext, VolumeFrame } from '../../types';
import { thingDef } from '../../content';

/** The craft's cells as a moving frame, put where the craft is now. */
export function frameOf(e: Entity, cd: CraftDef): VolumeFrame | null {
  const c = e.craft;
  if (!c) return null;
  const a = c.anchor;
  return { id: e.id, x0: a.x, y0: a.y, z0: a.z, x1: a.x + cd.size[0], y1: a.y + cd.size[1], z1: a.z + cd.size[2], px: a.x + cd.pivot[0], py: a.y + cd.pivot[1], wx: e.pos.x, wy: e.pos.y, wz: e.z, yaw: e.angle };
}

/** A point in craft metres (x forward, y across from the box corner) -> the world. */
export function aboard(e: Entity, cd: CraftDef, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const dx = x - cd.pivot[0];
  const dy = y - cd.pivot[1];
  return { x: e.pos.x + dx * c - dy * s, y: e.pos.y + dx * s + dy * c };
}

/**
 * One tick of flight for every craft, the same on the host and in a guest's own foresight: the craft moves by the
 * speed, climb and turn its own system gave it; bodies standing on it (found before it moves) ride along, turned with
 * it; fittings and whoever works a station are set in their places aboard.
 */
export function craftMotion(ctx: SimContext): void {
  const { state, dt, content } = ctx;
  const vol = state.volume;
  for (const e of state.entities.values()) {
    const c = e.craft;
    const cd = c ? thingDef(content, e.def).craft : undefined;
    const f0 = cd ? frameOf(e, cd) : null;
    if (!c || !cd || !f0) continue;
    if (e.dead) {
      vol.dropFrame(e.id);
      continue;
    }
    vol.setFrame(f0);
    const reach = Math.hypot(cd.size[0], cd.size[1]) / 2 + 2;
    const riders: Entity[] = [];
    for (const o of state.entities.values()) {
      if (o === e || o.dead || o.ride || o.craft || o.heldBy !== null || o.player?.station != null) continue;
      if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > reach || o.vz > 0.5) continue;
      if (vol.floorOn(e.id, o.pos.x, o.pos.y, o.z + 0.3) > o.z - 0.3) riders.push(o);
    }
    c.prevYaw = e.angle;
    const ox = e.pos.x;
    const oy = e.pos.y;
    e.vel.x = 0;
    e.vel.y = 0;
    e.vz = 0;
    e.pos.x += c.vel.x * dt;
    e.pos.y += c.vel.y * dt;
    e.z += c.vz * dt;
    e.angle += c.spin * dt;
    const cs = Math.cos(c.spin * dt);
    const sn = Math.sin(c.spin * dt);
    for (const o of riders) {
      const rx = o.pos.x - ox;
      const ry = o.pos.y - oy;
      o.pos.x = e.pos.x + rx * cs - ry * sn;
      o.pos.y = e.pos.y + rx * sn + ry * cs;
      o.z += c.vz * dt;
    }
    const f1 = frameOf(e, cd);
    if (f1) vol.setFrame(f1);
    for (const o of state.entities.values()) {
      if (!o.ride || o.ride.craft !== e.id) continue;
      const at = aboard(e, cd, o.ride.x, o.ride.y);
      o.pos.x = at.x;
      o.pos.y = at.y;
      o.z = e.z + o.ride.z;
      o.angle = e.angle + o.ride.face;
      o.vel.x = 0;
      o.vel.y = 0;
      o.vz = 0;
      const by = o.control?.by;
      const pl = by != null ? state.entities.get(by) : undefined;
      if (!pl || pl.player?.station !== o.id) continue;
      // Whoever works it stands at its seat.
      const seat = thingDef(content, o.def).station?.seat ?? [0.9, 0];
      pl.pos.x = o.pos.x - Math.cos(o.angle) * seat[0] - Math.sin(o.angle) * seat[1];
      pl.pos.y = o.pos.y - Math.sin(o.angle) * seat[0] + Math.cos(o.angle) * seat[1];
      pl.z = o.z;
      pl.vel.x = 0;
      pl.vel.y = 0;
      pl.vz = 0;
    }
  }
}
