// Held-item motion: poses as a hand position + blade direction, swing paths along arcs, and smooth settling between them.
import type { ArcKey, HandPose, SwingArcDef } from '../../types';

/** A pose in 3D: hand position (m from the eye), the way the blade points (unit), the twist of its flat, its size. */
export interface Pose3 {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  roll: number;
  reach: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * A HandPose's `lean` is the blade's angle ON SCREEN, as the eye sees it from where the hand is (perspective). A blade
 * pointing straight ahead from a hand below the eye leans up toward the middle of the view, so a level sweep turns
 * the picture through "up", never through "down" (reading only the blade's own sideways and up parts flipped it
 * round halfway through every left/right swing).
 */
export function fromHand(p: HandPose): Pose3 {
  const c = Math.cos(p.pitch);
  const dz = Math.sin(p.pitch);
  const hz = Math.max(0.15, p.z);
  // Find the blade's sideways/up parts (length c) whose screen direction (d·hz − h·dz) points along the lean.
  const s = Math.sin(p.lean);
  const co = Math.cos(p.lean);
  const a = p.x * dz;
  const b = p.y * dz;
  const q = a * s + b * co;
  const t = -q + Math.sqrt(Math.max(0, q * q - (a * a + b * b - c * c * hz * hz)));
  let dx = (a + t * s) / hz;
  let dy = (b + t * co) / hz;
  const l = Math.hypot(dx, dy);
  if (l > 1e-6) {
    dx *= c / l;
    dy *= c / l;
  }
  return { x: p.x, y: p.y, z: p.z, dx, dy, dz, roll: p.roll, reach: p.reach };
}

/** Back to the flat picture's terms: lean on screen (seen from the eye), pitch away from you. */
export function toHand(p: Pose3): HandPose {
  const hz = Math.max(0.15, p.z);
  return { x: p.x, y: p.y, z: p.z, lean: Math.atan2(p.dx * hz - p.x * p.dz, p.dy * hz - p.y * p.dz), pitch: Math.atan2(p.dz, Math.hypot(p.dx, p.dy)), roll: p.roll, reach: p.reach };
}

function norm(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

/** Turns from unit `a` toward unit `b` by share `t` of the angle between them (t may go below 0 or past 1). */
function slerp(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  const a0 = a[0] ?? 0, a1 = a[1] ?? 0, a2 = a[2] ?? 0;
  const b0 = b[0] ?? 0, b1 = b[1] ?? 0, b2 = b[2] ?? 0;
  const dot = Math.max(-1, Math.min(1, a0 * b0 + a1 * b1 + a2 * b2));
  const om = Math.acos(dot);
  if (om < 1e-4) return norm([lerp(a0, b0, t), lerp(a1, b1, t), lerp(a2, b2, t)]);
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s;
  const kb = Math.sin(t * om) / s;
  return norm([a0 * ka + b0 * kb, a1 * ka + b1 * kb, a2 * ka + b2 * kb]);
}

/** The pose `s` along a swing: 0 = drawn back, 1 = the hit, 2 = end of the follow-through (below 0 = drawn back further). Blade at `sb` (it may lag the hand). */
export function arcAt(a: SwingArcDef, s: number, sb = s): Pose3 {
  const seg = (k: number): [ArcKey, ArcKey, number] => (k <= 1 ? [a.from, a.hit, k] : [a.hit, a.to, k - 1]);
  const [h0, h1, ht] = seg(s);
  // The hand curves about the pivot: its direction from it turns, its distance from it blends.
  const pv = a.pivot;
  const r0: [number, number, number] = [h0.at[0] - pv[0], h0.at[1] - pv[1], h0.at[2] - pv[2]];
  const r1: [number, number, number] = [h1.at[0] - pv[0], h1.at[1] - pv[1], h1.at[2] - pv[2]];
  const hd = slerp(norm(r0), norm(r1), ht);
  const arm = lerp(Math.hypot(...r0), Math.hypot(...r1), ht);
  const [b0, b1, bt] = seg(sb);
  const bd = slerp(norm([...b0.d]), norm([...b1.d]), bt);
  return {
    x: pv[0] + hd[0] * arm,
    y: pv[1] + hd[1] * arm,
    z: pv[2] + hd[2] * arm,
    dx: bd[0],
    dy: bd[1],
    dz: bd[2],
    roll: lerp(h0.roll, h1.roll, ht),
    reach: 1,
  };
}

/** a + (b - a) * t, the blade turned the short way. */
export function mix(a: Pose3, b: Pose3, t: number, out: Pose3 = { ...a }): Pose3 {
  const d = slerp([a.dx, a.dy, a.dz], [b.dx, b.dy, b.dz], t);
  out.x = lerp(a.x, b.x, t);
  out.y = lerp(a.y, b.y, t);
  out.z = lerp(a.z, b.z, t);
  out.dx = d[0];
  out.dy = d[1];
  out.dz = d[2];
  out.roll = lerp(a.roll, b.roll, t);
  out.reach = lerp(a.reach, b.reach, t);
  return out;
}

/** Settles `cur` toward `to` at `rate` per second without overshoot, frame-rate independent. */
export function settle(cur: Pose3, to: Pose3, rate: number, dt: number): void {
  mix(cur, to, 1 - Math.exp(-rate * dt), cur);
}

/** Where a swing starts: the pose you were holding, how far along the arc it was aiming (s0) and how drawn back it was (0..1). */
export interface SwingStart {
  pose: Pose3;
  s0: number;
  drawn: number;
}

/**
 * The swing's pose `u` (0..1) of the way to the hit: a tap first draws back, then the blade accelerates
 * into the blow with the tip trailing the hand; whatever the pose was at the start blends into the arc.
 */
export function swingIn(a: SwingArcDef, st: SwingStart, u: number, tapWind: number, lag: number): Pose3 {
  const ws = tapWind * (1 - st.drawn);
  const x = ws > 0 && u < ws ? 0 : clamp01((u - ws) / Math.max(1e-3, 1 - ws));
  const e = Math.pow(x, 1.7);
  const s = st.s0 + (1 - st.s0) * e;
  const sb = s - lag * (s - st.s0) * (1 - x);
  const p = arcAt(a, s, sb);
  // The pose held when the swing began fades into the arc (fully by the end of the draw-back).
  const k = 1 - smooth(u / Math.max(0.25, ws));
  const o = arcAt(a, st.s0);
  if (k > 0) {
    p.x += (st.pose.x - o.x) * k;
    p.y += (st.pose.y - o.y) * k;
    p.z += (st.pose.z - o.z) * k;
    const d = slerp([p.dx, p.dy, p.dz], [st.pose.dx, st.pose.dy, st.pose.dz], k);
    p.dx = d[0];
    p.dy = d[1];
    p.dz = d[2];
    p.roll = lerp(p.roll, st.pose.roll, k);
  }
  return p;
}

/** After the hit: the follow-through, `f` (0..1) of it, slowing down, the tip whipping a little ahead of the hand. */
export function swingOut(a: SwingArcDef, f: number, lag: number): Pose3 {
  const e = 1 - Math.pow(1 - clamp01(f), 2.2);
  return arcAt(a, 1 + e, 1 + Math.min(1, e + lag * e * (1 - e)));
}
