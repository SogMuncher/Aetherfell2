/**
 * Variation helpers for procedural sound effects. Audio lives outside the simulation, so it may use
 * Math.random(): nothing here ever feeds back into the game.
 *
 * Three layers of variety make a sound feel alive instead of canned:
 * - identity: a stable seed from a definition id ("wolf"), so every wolf sounds like a wolf;
 * - individual: a stable seed from an entity id, so this wolf sounds a little unlike that one;
 * - performance: fresh randomness on every play, so the same wolf never howls twice the same way.
 */

/** FNV-1a hash of a string: a stable 32-bit seed for a definition id. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Small seeded generator (mulberry32): the same seed always gives the same sequence. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable value in [-1, 1] for a seed and a slot (different slots are independent). */
export function stable(seed: number, slot: number): number {
  return seeded((seed ^ Math.imul(slot + 1, 0x9e3779b1)) >>> 0)() * 2 - 1;
}

/** Uniform random number in [a, b). */
export function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** `v` nudged by up to ±`amount` as a fraction (0.05 = ±5%). */
export function jit(v: number, amount: number): number {
  return v * (1 + (Math.random() * 2 - 1) * amount);
}

/** Random integer in [a, b]. */
export function rint(a: number, b: number): number {
  return Math.floor(a + Math.random() * (b - a + 1));
}

export function pick<T>(list: readonly T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)];
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Remembers how often a sound has just played. Rapid repeats (a flurry of blows, a pack all
 * growling at once) get slightly softer and drift in pitch, the way real repeated sounds do, instead
 * of stacking into one loud identical machine-gun note.
 */
export class Recent {
  private last = new Map<string, { t: number; n: number }>();

  /** Call when a sound plays. Returns how many times it played in the last `window` seconds. */
  hit(key: string, now: number, window = 0.6): number {
    const r = this.last.get(key);
    const n = r && now - r.t < window ? r.n + 1 : 0;
    this.last.set(key, { t: now, n });
    if (this.last.size > 256) this.last.clear();
    return n;
  }
}

/** Level multiplier for the n-th rapid repeat: 1, 0.85, 0.74 … never below 0.45. */
export function fatigue(n: number): number {
  return Math.max(0.45, Math.pow(0.86, n));
}
