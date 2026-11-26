// Chains from a loose thing to a point aboard a craft (the anchor's): never longer than the chain; lying still on the ground it holds the craft; a call hauls it in
import type { CraftDef, Entity, SimContext } from '../../types';
import { thingDef } from '../../content';
import { aboard } from './craftMotion';

/**
 * Each tick, after the crafts have worked out their speed and before they move: every chained thing learns where its
 * tie is in the world (`top`, for climbing and drawing). If the chain is pulled taut, a thing lying still (an anchor on
 * the ground) holds the craft: it cannot move further off, is drawn back and swings its bow toward the anchor. Anything else swings in on the chain: a
 * falling or dangling anchor, or whoever carries it, is held at the chain's length.
 */
export function holdChains(ctx: SimContext): void {
  const { state, content } = ctx;
  for (const o of state.entities.values()) {
    const t = o.tether;
    if (!t) continue;
    const e = state.entities.get(t.craft);
    const c = e?.craft;
    const cd = e && c && !e.dead ? thingDef(content, e.def).craft : undefined;
    if (!e || !c || !cd || o.dead) {
      delete o.tether;
      continue;
    }
    const at = aboard(e, cd, t.x, t.y);
    const top = { x: at.x, y: at.y, z: e.z + t.z };
    t.top = top;
    // A fixed fitting's line (a rope ladder) only hangs there: it never holds the craft.
    if (o.ride) continue;
    const dx = o.pos.x - top.x;
    const dy = o.pos.y - top.y;
    const dz = o.z - top.z;
    const d = Math.hypot(dx, dy, dz);
    const holder = o.heldBy !== null ? state.entities.get(o.heldBy) : undefined;
    const lying = !holder && o.vz === 0 && Math.hypot(o.vel.x, o.vel.y) < 0.05;
    const h = Math.hypot(dx, dy);
    if (lying && d > t.len - 1 && h > 0.01) {
      // A taut chain swings the bow round toward the anchor, so it leads ahead and not under the hull.
      const off = Math.atan2(o.pos.y - e.pos.y, o.pos.x - e.pos.x) - e.angle;
      c.spin += Math.max(-0.25, Math.min(0.25, Math.atan2(Math.sin(off), Math.cos(off)) * 0.5));
    }
    if (d <= t.len) continue;
    const ux = dx / d;
    const uy = dy / d;
    const uz = dz / d;
    const over = d - t.len;
    if (lying) {
      // Held: no speed away from the anchor, and a pull back toward it along the ground.
      const away = -(c.vel.x * ux + c.vel.y * uy + c.vz * uz);
      if (away > 0) {
        c.vel.x += ux * away;
        c.vel.y += uy * away;
        c.vz += uz * away;
      }
      if (h > 0.01) {
        const pull = Math.min(3, over * 2);
        c.vel.x += (dx / h) * pull;
        c.vel.y += (dy / h) * pull;
      }
      continue;
    }
    // Swinging in: the thing itself, or the one carrying it (held back along the ground).
    const b = holder ?? o;
    b.pos.x -= ux * over;
    b.pos.y -= uy * over;
    if (!holder) b.z -= uz * over;
    const out = b.vel.x * ux + b.vel.y * uy + (holder ? 0 : b.vz * uz);
    if (out > 0) {
      b.vel.x -= ux * out;
      b.vel.y -= uy * out;
      if (!holder) b.vz -= uz * out;
    }
  }
}

/** Hauls every loose chained thing of a craft (the anchor) back aboard to where it was fitted, out of anyone's hands. */
export function haulIn(ctx: SimContext, e: Entity, cd: CraftDef): void {
  for (const o of ctx.state.entities.values()) {
    if (o.dead || o.tether?.craft !== e.id || o.ride) continue;
    const f = cd.fittings.find((g) => g.thing === o.def && g.tie);
    if (!f) continue;
    const holder = o.heldBy !== null ? ctx.state.entities.get(o.heldBy) : undefined;
    if (holder?.player?.holding === o.id) holder.player.holding = null;
    o.heldBy = null;
    const at = aboard(e, cd, f.at[0], f.at[1]);
    o.pos.x = o.prev.x = at.x;
    o.pos.y = o.prev.y = at.y;
    o.z = o.prevZ = e.z + f.at[2];
    o.vel.x = o.vel.y = o.vz = 0;
    o.aboard = e.id;
    o.angle = e.angle + (f.face ?? 0);
  }
}
