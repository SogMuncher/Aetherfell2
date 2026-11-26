// Gliding as data: how a glider's cloth turns your heading and look into flight, from a gentle drift down to a soaring dive
import type { Entity, GlideDef, Vec2 } from '../../types';

/** Looking fully up or down tilts your flight path this steeply (radians). */
const MAX_TILT = 1.1;
const GRAVITY = 9.8;

/**
 * One tick of an open glider. Two ways of flying, mixed by the cloth's `soar`:
 * - drifting (soar 0): you float forward at its `speed` and sink at its `sink`, whatever you look at;
 * - soaring (soar 1): you fly where you look; diving trades height for speed, pulling up trades speed back for height,
 *   and `drag` slowly brings you back to cruising `speed`.
 * Wind carries a drifting glider more than a soaring one; rising heat (`lift`) pushes either up.
 */
export function glideStep(e: Entity, g: GlideDef, cos: number, sin: number, pitch: number, forward: number, wind: Vec2, lift: number, dt: number): void {
  const tilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.atan(pitch * 1.6)));
  const v = Math.hypot(e.vel.x, e.vel.y, e.vz);
  const soarSpeed = Math.max(0, Math.min(g.top, v + (-GRAVITY * Math.sin(tilt) - g.drag * (v - g.speed)) * dt));
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  // Too slow to fly: the nose drops and the cloth only sinks.
  const stall = Math.min(1, soarSpeed / (g.speed * 0.5));
  const drift = g.speed * Math.max(0.35, 1 + forward * 0.4);
  const blow = 0.8 * (1 - g.soar * 0.6);
  const s = g.soar;
  const tx = (cos * drift) * (1 - s) + cos * ct * soarSpeed * s + wind.x * blow;
  const ty = (sin * drift) * (1 - s) + sin * ct * soarSpeed * s + wind.y * blow;
  const tz = -g.sink * (1 - s) + (st * soarSpeed * stall - g.sink * (1 - stall * 0.6)) * s + lift;
  e.vel.x += (tx - e.vel.x) * g.grip;
  e.vel.y += (ty - e.vel.y) * g.grip;
  e.vz += (tz - e.vz) * (lift > 0 ? Math.max(g.grip, 0.15) : g.grip);
}
