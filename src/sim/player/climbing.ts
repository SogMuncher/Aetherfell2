// Holding on to a chain (an anchor's): touch one off the ground and you hold it; forward climbs the way you look, jump lets go
import type { Entity, InputSnapshot, SimContext } from '../../types';

/** Metres a second up or down a chain. */
const CLIMB = 2.6;
/** How near the middle of your body a chain must pass to be caught. */
const REACH = 0.7;

/**
 * Chains are any thing's `tether` (its `top` is set by the craft system each tick) down to the thing itself. Holding one
 * you do not fall (the physics leaves a climber's height to this): forward climbs up, or down while you look down;
 * back the other way. At the top, forward steps off onto a floor ahead. Jump lets go, pushing off backward. On the
 * ground you only take hold by pushing forward. Returns true while climbing (normal walking is skipped).
 */
export function climbChain(ctx: SimContext, e: Entity, input: InputSnapshot, onGround: boolean, speed: number): boolean {
  const p = e.player;
  if (!p) return false;
  const mid = { x: e.pos.x, y: e.pos.y, z: e.z + 0.9 };
  let chain: { top: { x: number; y: number; z: number }; bot: { x: number; y: number; z: number } } | null = null;
  for (const o of ctx.state.entities.values()) {
    const top = o.tether?.top;
    if (!top || o.dead || o.heldBy === e.id) continue;
    const bot = { x: o.pos.x, y: o.pos.y, z: o.z + 0.5 };
    // Only a chain that hangs (not one lying across a deck).
    if (top.z - bot.z < 2) continue;
    if (Math.min(top.x, bot.x) > mid.x + REACH || Math.max(top.x, bot.x) < mid.x - REACH || Math.min(top.y, bot.y) > mid.y + REACH || Math.max(top.y, bot.y) < mid.y - REACH) continue;
    const vx = bot.x - top.x;
    const vy = bot.y - top.y;
    const vz = bot.z - top.z;
    const l2 = vx * vx + vy * vy + vz * vz;
    const s = l2 > 0 ? Math.max(0, Math.min(1, ((mid.x - top.x) * vx + (mid.y - top.y) * vy + (mid.z - top.z) * vz) / l2)) : 0;
    if (Math.hypot(top.x + vx * s - mid.x, top.y + vy * s - mid.y, top.z + vz * s - mid.z) < REACH) {
      chain = { top, bot };
      break;
    }
  }
  if (!chain || (onGround && !p.climbing && input.forward <= 0.1)) {
    p.climbing = false;
    return false;
  }
  const cos = Math.cos(input.yaw);
  const sin = Math.sin(input.yaw);
  if (input.jump && p.climbing) {
    p.climbing = false;
    e.vel.x = -cos * 3;
    e.vel.y = -sin * 3;
    e.vz = 3;
    return false;
  }
  p.climbing = true;
  p.gliding = false;
  const { top, bot } = chain;
  // Along the chain (however steep it hangs) toward its top, or its bottom while you look down.
  const lx = top.x - bot.x;
  const ly = top.y - bot.y;
  const lz = top.z - bot.z;
  const len = Math.hypot(lx, ly, lz) || 1;
  const go = input.forward * (input.pitch < -0.35 ? -1 : 1) * CLIMB;
  // Held to the chain where it passes nearest the middle of the body.
  const k = Math.max(0, Math.min(1, ((mid.x - bot.x) * lx + (mid.y - bot.y) * ly + (mid.z - bot.z) * lz) / (len * len)));
  const pull = (d: number): number => Math.max(-5, Math.min(5, (d / ctx.dt) * 0.3));
  e.vel.x = (lx / len) * go + pull(bot.x + lx * k - mid.x);
  e.vel.y = (ly / len) * go + pull(bot.y + ly * k - mid.y);
  e.vz = (lz / len) * go + pull(bot.z + lz * k - mid.z);
  // Feet never above the tie. Down on the ground, climbing down lets go.
  if (e.z + e.vz * ctx.dt > top.z) e.vz = Math.max(0, (top.z - e.z) / ctx.dt);
  if (onGround && e.vz <= 0) {
    p.climbing = false;
    return false;
  }
  // At the top, forward steps onto a floor ahead (the deck, or the beam the chain hangs from).
  const fx = e.pos.x + cos * 0.6;
  const fy = e.pos.y + sin * 0.6;
  const floor = Math.max(ctx.tiles.ground(fx, fy), ctx.state.volume.floorBelow(fx, fy, top.z + 0.6));
  if (input.forward > 0.1 && e.z >= top.z - 0.6 && floor > top.z - 1.2 && floor <= e.z + 0.6) {
    e.vel.x = cos * speed;
    e.vel.y = sin * speed;
    e.vz = Math.max(e.vz, (floor - e.z) / ctx.dt);
    return true;
  }
  return true;
}
