import type { DamageKind, SoundClass } from '../../types';
import type { AudioEngine } from '../engine';
import { clamp, jit, rint, rnd } from './vary';

/**
 * What stuff sounds like when it is struck, dropped, broken or walked on, as one small recipe per
 * material sound class. Every tile and thing made of a material sounds the same way, and heavier
 * things sound lower and longer. A new material picks a sound class and is done.
 */
interface StrikeRecipe {
  /** Body thump in Hz (0 = none). */
  thud: number;
  /** Resonant partials as ratios of `ring` Hz; empty = it does not ring. */
  partials: readonly number[];
  ring: number;
  /** Seconds the ring lasts. */
  ringDecay: number;
  /** The noisy part of the strike. */
  noise: { type: BiquadFilterType; freq: number; q: number; to?: number };
  /** Little bits rattling loose (splinters, grit, glass). */
  debris: number;
  debrisBand: [number, number];
  /** Underfoot: how long and how soft a step is. */
  step: { dur: number; attack: number; level: number };
}

const RECIPES: Readonly<Record<SoundClass, StrikeRecipe>> = {
  soft: { thud: 90, partials: [], ring: 0, ringDecay: 0, noise: { type: 'bandpass', freq: 1100, q: 0.7 }, debris: 0, debrisBand: [800, 1500], step: { dur: 0.1, attack: 0.01, level: 1 } },
  wood: { thud: 160, partials: [1, 2.3], ring: 380, ringDecay: 0.12, noise: { type: 'bandpass', freq: 900, q: 2 }, debris: 3, debrisBand: [600, 1800], step: { dur: 0.07, attack: 0.003, level: 1.2 } },
  stone: { thud: 110, partials: [1, 3.1], ring: 1300, ringDecay: 0.05, noise: { type: 'highpass', freq: 1900, q: 0.8 }, debris: 4, debrisBand: [1500, 4000], step: { dur: 0.05, attack: 0.002, level: 1.1 } },
  metal: { thud: 140, partials: [1, 2.76, 5.4, 8.9], ring: 620, ringDecay: 0.9, noise: { type: 'highpass', freq: 3000, q: 0.8 }, debris: 1, debrisBand: [2500, 5000], step: { dur: 0.05, attack: 0.002, level: 1.1 } },
  flesh: { thud: 80, partials: [], ring: 0, ringDecay: 0, noise: { type: 'lowpass', freq: 500, q: 0.7 }, debris: 0, debrisBand: [500, 900], step: { dur: 0.09, attack: 0.01, level: 0.9 } },
  water: { thud: 70, partials: [], ring: 0, ringDecay: 0, noise: { type: 'bandpass', freq: 900, q: 1.2, to: 300 }, debris: 4, debrisBand: [600, 1400], step: { dur: 0.18, attack: 0.01, level: 1.6 } },
  glass: { thud: 0, partials: [1, 2.4, 4.2, 6.8], ring: 2200, ringDecay: 0.25, noise: { type: 'highpass', freq: 4000, q: 1 }, debris: 6, debrisBand: [2500, 5500], step: { dur: 0.04, attack: 0.002, level: 0.9 } },
  snow: { thud: 60, partials: [], ring: 0, ringDecay: 0, noise: { type: 'bandpass', freq: 1700, q: 0.6 }, debris: 0, debrisBand: [1200, 2200], step: { dur: 0.16, attack: 0.03, level: 1.2 } },
  ice: { thud: 120, partials: [1, 2.9], ring: 1100, ringDecay: 0.08, noise: { type: 'highpass', freq: 3600, q: 1.5 }, debris: 3, debrisBand: [3000, 5000], step: { dur: 0.05, attack: 0.002, level: 0.9 } },
  sand: { thud: 70, partials: [], ring: 0, ringDecay: 0, noise: { type: 'bandpass', freq: 2800, q: 0.6 }, debris: 0, debrisBand: [2000, 3500], step: { dur: 0.12, attack: 0.02, level: 1 } },
};

function recipe(cls: string): StrikeRecipe {
  return RECIPES[cls as SoundClass] ?? RECIPES.soft;
}

/** Heavier things sound lower: 40 kg is ×1, a 300 kg campfire stone ×0.6, a 2 kg torch ×1.9. */
function massPitch(mass: number): number {
  return clamp(Math.pow(Math.max(0.2, mass) / 40, -0.22), 0.55, 2);
}

export interface StrikeOpts {
  /** 0..1 how hard. */
  strength: number;
  mass: number;
  /** What did the striking, if anything: edges ring and swish, points click, clubs thump. */
  weapon?: DamageKind;
  /** Breaking apart: lots more debris. */
  breaks?: boolean;
}

export function strike(e: AudioEngine, out: AudioNode, t: number, cls: string, o: StrikeOpts): void {
  const r = recipe(cls);
  const s = clamp(o.strength, 0.05, 1);
  const mp = massPitch(o.mass) * jit(1, 0.07);
  const L = 0.1 + s * 0.2;
  if (r.thud > 0) e.tone(out, 'sine', r.thud * mp, t, 0.12 + s * 0.12, L * 0.7, { from: r.thud * mp * rnd(1.6, 1.9), glide: 0.05 });
  e.burst(out, t, 0.06 + s * 0.12, L, r.noise.type, r.noise.freq * mp * jit(1, 0.1), { q: r.noise.q, to: r.noise.to });
  if (r.partials.length) {
    const base = r.ring * mp * jit(1, 0.05);
    for (const m of r.partials) {
      const decay = r.ringDecay * (0.6 + s * 0.6) * jit(1, 0.15);
      e.tone(out, 'sine', base * m * jit(1, 0.015), t, decay / Math.sqrt(m) + 0.03, (L * 0.35) / m, { attack: 0.001 });
    }
  }
  if (o.weapon === 'cut') e.burst(out, t, 0.08, L * 0.4, 'highpass', rnd(3500, 5000), { to: 7000 });
  else if (o.weapon === 'pierce') e.burst(out, t, 0.025, L * 0.5, 'bandpass', rnd(2200, 3200), { q: 4 });
  else if (o.weapon === 'blunt') e.tone(out, 'sine', 70 * mp, t, 0.15, L * 0.5, { from: 140 * mp, glide: 0.04 });
  const bits = r.debris === 0 ? 0 : o.breaks ? rint(r.debris * 2, r.debris * 3) : s > 0.5 ? rint(0, r.debris) : 0;
  for (let i = 0; i < bits; i++) {
    const tt = t + rnd(0.01, o.breaks ? 0.35 : 0.15);
    const f = rnd(r.debrisBand[0], r.debrisBand[1]);
    if (r.partials.length && r.ringDecay > 0.1) e.tone(out, 'triangle', f, tt, rnd(0.05, 0.14), L * 0.12, { attack: 0.001 });
    else e.burst(out, tt, rnd(0.02, 0.06), L * 0.4, 'bandpass', f, { q: 3 });
  }
  if (o.breaks) e.burst(out, t, 0.3, L * 0.6, 'lowpass', 300 * mp);
}

export interface StepOpts {
  level: number;
  mass: number;
  /** 0..1 how wet the ground is: soft ground squelches, hard ground slaps. */
  wet: number;
  /** Alternates for left and right feet. */
  foot: 0 | 1;
}

/** One footstep on a material, by something of this weight. */
export function step(e: AudioEngine, out: AudioNode, t: number, cls: string, o: StepOpts): void {
  const r = recipe(cls);
  const mp = massPitch(o.mass) * (o.foot ? 1.03 : 0.97) * jit(1, 0.05);
  const v = o.level * r.step.level * clamp(Math.sqrt(o.mass / 70), 0.5, 1.6) * jit(1, 0.12);
  const dur = r.step.dur * jit(1, 0.15) / Math.sqrt(mp);
  e.burst(out, t, dur, v, r.noise.type === 'highpass' ? 'bandpass' : r.noise.type, r.noise.freq * mp * jit(1, 0.12), { q: r.noise.q, to: r.noise.to, attack: r.step.attack });
  if (r.thud > 0) e.tone(out, 'sine', r.thud * mp * jit(1, 0.08), t, dur * 0.9, v * 0.45, { from: r.thud * mp * 1.5, glide: 0.03 });
  if (r.partials.length && Math.random() < 0.5) e.tone(out, 'sine', r.ring * mp * jit(1, 0.06), t, Math.min(0.08, r.ringDecay), v * 0.15, { attack: 0.001 });
  if (cls === 'water') {
    for (let i = rint(0, 2); i > 0; i--) {
      const f = rnd(600, 1300);
      e.tone(out, 'sine', f, t + rnd(0.03, 0.15), 0.05, v * 0.25, { to: f * 1.6 });
    }
  } else if (o.wet > 0.3) {
    // Rain-soaked ground: a wet slap or squelch on top of the dry step.
    e.burst(out, t + 0.01, dur * 1.3, v * o.wet * 0.9, 'bandpass', rnd(600, 900), { q: 1.4, to: 300 });
  }
}

export interface SwingOpts {
  /** Metres of reach: longer weapons swish longer. */
  reach: number;
  /** Weapon speed multiplier: heavy weapons are slow and deep. */
  speed: number;
  level: number;
}

/** The whoosh of a blow through the air, shaped by the weapon. */
export function swing(e: AudioEngine, out: AudioNode, t: number, o: SwingOpts): void {
  const dur = clamp((0.1 + o.reach * 0.07) / Math.max(0.4, o.speed), 0.1, 0.45) * jit(1, 0.12);
  const f = 450 * clamp(o.speed, 0.5, 1.6) * jit(1, 0.12);
  e.burst(out, t, dur, o.level * jit(1, 0.1), 'bandpass', f, { q: rnd(2, 3.2), to: f * rnd(3.5, 5.5), attack: dur * 0.3 });
}
