import type { BurstDef, ParticleKind } from '../../types';
import { CONTENT } from '../../content';


export const FX = CONTENT.effects;
export const NO_FX: BurstDef = { kind: 'dust', count: 0, speed: 0, colour: 0, life: 1, size: 0.1 };
/** A burst by its content/effects.ts name (a missing name shows nothing rather than failing). */
export const fx = (id: string): BurstDef => FX[id] ?? NO_FX;

/**
 * One mote. Every mote carries its own little physics (pull, drag, curl, flutter, growth) and a
 * colour it fades from and to, so the update and draw loops never ask what kind of thing it is.
 */
export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  /** Size change rate per second (exponential). */
  grow: number;
  /** Colour at birth… */
  r: number;
  g: number;
  b: number;
  /** …and at death. */
  r2: number;
  g2: number;
  b2: number;
  /** 0..1: how much it adds light rather than covering what is behind. */
  glow: number;
  /** 0..1: hard fleck to soft puff. */
  soft: number;
  /** Vertical pull, m/s² (negative falls). */
  lift: number;
  /** Speed loss rate per second. */
  drag: number;
  /** Turns per second around the vertical. */
  swirl: number;
  /** Random flutter, m/s. */
  jitter: number;
  /** Blaze motes: hard square pixels stepping through this palette (hot to cool) instead of a smooth fade. */
  pal: readonly number[] | null;
}

/** How the old fixed kinds move. Spells never use these: their motes come from their look. */
export interface KindPhysics {
  lift: number;
  drag: number;
  grow: number;
  soft: number;
  /** Multiplies the birth colour to get the fade colour. */
  fade: readonly [number, number, number];
}

export const KINDS: Record<ParticleKind, KindPhysics> = {
  flame: { lift: 0, drag: 0, grow: -1.2, soft: 0.2, fade: [1, 0.6, 0] },
  smoke: { lift: 0, drag: 0, grow: 0.45, soft: 1, fade: [0.9, 0.9, 0.9] },
  spark: { lift: -9, drag: 0, grow: 0, soft: 0, fade: [1, 0.7, 0.3] },
  water: { lift: -9, drag: 0, grow: 0, soft: 0, fade: [1, 1, 1] },
  magic: { lift: 0, drag: 0.5, grow: -0.3, soft: 0.3, fade: [1, 1, 1] },
  blood: { lift: -9, drag: 0, grow: 0, soft: 0, fade: [0.8, 0.8, 0.8] },
  dust: { lift: -9, drag: 0, grow: 0, soft: 0, fade: [0.9, 0.9, 0.9] },
  leaf: { lift: -1, drag: 1, grow: 0, soft: 0, fade: [1, 1, 1] },
  frost: { lift: -2, drag: 0, grow: 0, soft: 0, fade: [0.85, 0.95, 1] },
};

export const MAX = 2600;
export const TAU = Math.PI * 2;

/** Optional extra parameters for a world-kind mote (ones not given come from its kind). */
export interface KindMote {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  size: number;
  r: number;
  g: number;
  b: number;
  glow: boolean;
}
