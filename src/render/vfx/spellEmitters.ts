// Spell motes: the bloom of a bolt bursting, cones, novas, wards, the casting hand and a bolt's trail, all from the spell's blended look
import type { MoteLook, SpellLook } from '../../types';
import { TAU } from './particleKinds';

/** Where spell motes go (the particle system) and its running clock in seconds. */
export interface SpellSink {
  mote(m: MoteLook, x: number, y: number, z: number, vx: number, vy: number, vz: number, sizeMul?: number, lifeMul?: number): void;
  readonly clock: number;
}

/**
 * Motes thrown out from a point. `upward` in the look decides the bloom: a fountain (flames,
 * splashes), a ball (frost shards) or a flat ring along the ground (dust, wind).
 */
function bloom(out: SpellSink, m: MoteLook, x: number, y: number, z: number, count: number, speed: number): void {
  const up = Math.max(-1, Math.min(1, m.upward));
  for (let i = 0; i < count; i++) {
    // Random direction on a sphere, then bent by `upward`.
    const a = Math.random() * TAU;
    let dz = Math.random() * 2 - 1;
    let h = Math.sqrt(1 - dz * dz);
    if (up > 0) {
      dz = dz * (1 - up) + up * (0.5 + Math.random() * 0.5);
      h *= 1 - up * 0.55;
    } else if (up < 0) {
      dz *= 1 + up;
      h = h * (1 + up) - up;
    }
    const s = speed * (0.35 + Math.random() * 0.65);
    out.mote(m, x, y, z, Math.cos(a) * h * s, Math.sin(a) * h * s, dz * s);
  }
}

/** Initial speed that carries a mote `dist` metres in `secs` against its own drag. */
function reach(m: MoteLook, dist: number, secs: number): number {
  const k = m.drag;
  if (k < 0.05) return dist / secs;
  return (dist * k) / (1 - Math.exp(-k * secs));
}

/** Where a bolt bursts. Bigger bursts throw more motes further. */
export function spellBurst(out: SpellSink, look: SpellLook, x: number, y: number, z: number, radius: number): void {
  const m = look.motes;
  const scale = Math.min(2.5, 0.6 + radius * 0.4);
  bloom(out, m, x, y, z, Math.round(m.density * scale), m.spread * (0.6 + radius * 0.3));
  if (look.wake) bloom(out, look.wake, x, y, z, Math.round(look.wake.density * scale), look.wake.spread * (0.6 + radius * 0.3));
  // A brief bright heart where it struck.
  out.mote(m, x, y, z, 0, 0, 0, 2.6, 0.35);
}

/** A sweep of motes filling a cone in front of the caster, timed to reach its far edge. */
export function spellCone(out: SpellSink, look: SpellLook, x: number, y: number, z: number, angle: number, range: number, width: number): void {
  const m = look.motes;
  const half = Math.acos(Math.max(-1, Math.min(1, width)));
  const n = Math.round(m.density * 1.4 * Math.min(2, range / 6));
  const t = m.life * 0.8;
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() * 2 - 1) * half;
    const s = reach(m, range * (0.5 + Math.random() * 0.5), t);
    out.mote(m, x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.5, z + (Math.random() - 0.5) * 0.6, Math.cos(a) * s, Math.sin(a) * s, m.upward * 1.5 + (Math.random() - 0.5));
  }
  const w = look.wake;
  if (!w) return;
  // The wake settles along the ground the cone swept.
  const nw = Math.round(w.density * 1.5 * Math.min(2, range / 6));
  for (let i = 0; i < nw; i++) {
    const a = angle + (Math.random() * 2 - 1) * half;
    const d = 1 + Math.random() * range;
    const s = w.spread * 0.4;
    out.mote(w, x + Math.cos(a) * d, y + Math.sin(a) * d, z - 1.2 + Math.random() * 0.3, Math.cos(a) * s, Math.sin(a) * s, w.upward > 0 ? w.upward : 0.1, 1, 0.6 + (d / range) * 0.6);
  }
}

/** A ring rolling out around the caster to the nova's edge. */
export function spellNova(out: SpellSink, look: SpellLook, x: number, y: number, z: number, radius: number): void {
  const m = look.motes;
  const n = Math.round(m.density * 1.6 + radius * 8);
  const t = m.life * 0.7;
  const twist = (look.seed - 0.5) * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.random() * 0.08;
    const s = reach(m, radius, t) * (0.85 + Math.random() * 0.3);
    // Each nova has its own little twist so the ring spins one way or the other.
    const tx = -Math.sin(a) * s * twist * 0.25;
    const ty = Math.cos(a) * s * twist * 0.25;
    out.mote(m, x + Math.cos(a) * 0.4, y + Math.sin(a) * 0.4, z + 0.6 + (Math.random() - 0.5) * 0.4, Math.cos(a) * s + tx, Math.sin(a) * s + ty, m.upward * 2);
  }
  const w = look.wake;
  if (!w) return;
  const nw = Math.round(w.density * 2 + radius * 4);
  for (let i = 0; i < nw; i++) {
    const a = Math.random() * TAU;
    const s = reach(w, radius * (0.4 + Math.random() * 0.6), w.life);
    out.mote(w, x, y, z + 0.1, Math.cos(a) * s, Math.sin(a) * s, Math.max(0, w.upward));
  }
}

/** A shimmer spiralling around and into the caster's body. */
export function spellWard(out: SpellSink, look: SpellLook, x: number, y: number, z: number): void {
  const m = look.motes;
  const n = Math.round(m.density * 1.2);
  const dir = look.seed < 0.5 ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const r = 0.9 + Math.random() * 0.3;
    const s = 1.2 + m.spread * 0.3;
    // Tangential plus a pull inwards: they wind around you as they close in.
    const vx = -Math.sin(a) * s * dir - Math.cos(a) * 1.2;
    const vy = Math.cos(a) * s * dir - Math.sin(a) * 1.2;
    out.mote(m, x + Math.cos(a) * r, y + Math.sin(a) * r, z + Math.random() * 1.8, vx, vy, 0.3 + Math.max(0, m.upward) * 0.6, 0.8, 0.8);
  }
}

/** A puff at the caster's hand as the spell leaves it. */
export function spellHand(out: SpellSink, look: SpellLook, x: number, y: number, z: number, angle: number): void {
  const m = look.motes;
  const hx = x + Math.cos(angle) * 0.55;
  const hy = y + Math.sin(angle) * 0.55;
  const n = Math.max(3, Math.round(m.density * 0.2));
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() - 0.5) * 1.6;
    const s = 0.5 + Math.random() * 1.5;
    out.mote(m, hx, hy, z + 1.35, Math.cos(a) * s, Math.sin(a) * s, (Math.random() - 0.3) * 1.2, 0.6, 0.4);
  }
}

/**
 * A bolt in flight: a bright body, strands twisting around its path (count, speed and turn
 * direction come from the look and its seed), loose motes shed behind and the wake trailing.
 */
export function spellTrail(out: SpellSink, look: SpellLook, id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, dt: number): void {
  const m = look.motes;
  // The body: a short-lived mote right on the bolt every frame.
  out.mote(m, x, y, z, 0, 0, 0, 2.2, 0.15);
  const sp = Math.hypot(vx, vy, vz) || 1;
  // A frame perpendicular to the flight path for the strands.
  const hl = Math.hypot(vx, vy) || 1;
  const sx = -vy / hl;
  const sy = vx / hl;
  const n = look.strands;
  if (n > 0) {
    const turn = (look.seed < 0.5 ? -1 : 1) * (7 + look.seed * 8 + m.swirl * 4);
    const rad = 0.1 + m.size * 0.6;
    for (let k = 0; k < n; k++) {
      const ph = out.clock * turn + (k / n) * TAU + id * 0.7;
      const c = Math.cos(ph) * rad;
      const s = Math.sin(ph) * rad;
      out.mote(m, x + sx * c, y + sy * c, z + s, -vx * 0.05, -vy * 0.05, -vz * 0.05, 0.6, 0.45);
    }
  }
  // Loose motes shed behind, more for dense looks and faster bolts.
  let shed = m.density * dt * (2 + sp * 0.08);
  while (shed > 0) {
    if (shed < 1 && Math.random() > shed) break;
    shed -= 1;
    const j = m.spread * 0.25;
    out.mote(m, x - vx * dt * Math.random(), y - vy * dt * Math.random(), z - vz * dt * Math.random(), -vx * 0.08 + (Math.random() - 0.5) * j, -vy * 0.08 + (Math.random() - 0.5) * j, (Math.random() - 0.5) * j, 0.8, 0.6);
  }
  const w = look.wake;
  if (w && Math.random() < w.density * dt * 1.5) out.mote(w, x, y, z, -vx * 0.03, -vy * 0.03, 0, 0.6, 0.6);
}
