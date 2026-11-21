/**
 * Music theory helpers: scales and modes, chords stacked inside a mode, voice leading, Euclidean
 * rhythms and a small seeded random source. Pure functions, no WebAudio.
 */

export type ModeId =
  | 'ionian'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'aeolian'
  | 'locrian'
  | 'harmonicMinor'
  | 'phrygianDominant'
  | 'melodicMinor';

/** Seven-note scales as semitone offsets from the root. Chords are stacked in thirds inside these. */
export const MODES: Readonly<Record<ModeId, readonly number[]>> = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
};

export function mtof(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Semitone offset of a scale degree (any integer, wraps into higher/lower octaves). */
export function degreeToSemis(mode: readonly number[], degree: number): number {
  const n = mode.length;
  const oct = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return (mode[idx] ?? 0) + oct * 12;
}

export type ChordColor = 'triad' | 'seventh' | 'sus2' | 'sus4' | 'add9' | 'power';

export interface Chord {
  /** Scale degree of the root, 0-based (0 = tonic). */
  degree: number;
  color: ChordColor;
  /** Bars this chord lasts. */
  bars: number;
}

/** Scale degrees (relative to the tonic) that make up a chord. */
export function chordDegrees(c: Chord): number[] {
  const d = c.degree;
  switch (c.color) {
    case 'seventh':
      return [d, d + 2, d + 4, d + 6];
    case 'sus2':
      return [d, d + 1, d + 4];
    case 'sus4':
      return [d, d + 3, d + 4];
    case 'add9':
      return [d, d + 2, d + 4, d + 8];
    case 'power':
      return [d, d + 4, d + 7];
    default:
      return [d, d + 2, d + 4];
  }
}

/** Pitch classes (0..11, relative to C) of a chord in a key. */
export function chordPitchClasses(root: number, mode: readonly number[], c: Chord): number[] {
  return chordDegrees(c).map((d) => (((root + degreeToSemis(mode, d)) % 12) + 12) % 12);
}

/**
 * Picks a voicing (MIDI notes) of the chord within [lo, hi] that moves the least from the previous
 * voicing — smooth, singing pads instead of chords jumping around.
 */
export function voiceLead(pcs: readonly number[], prev: readonly number[] | null, lo: number, hi: number, voices: number): number[] {
  const centre = prev && prev.length > 0 ? prev.reduce((a, b) => a + b, 0) / prev.length : (lo + hi) / 2;
  let best: number[] = [];
  let bestCost = Infinity;
  for (let inv = 0; inv < pcs.length; inv++) {
    for (let base = lo; base < lo + 12; base++) {
      if (((base % 12) + 12) % 12 !== pcs[inv]) continue;
      const notes: number[] = [];
      let last = base - 1;
      for (let v = 0; v < voices; v++) {
        const pc = pcs[(inv + v) % pcs.length] ?? 0;
        let n = last + 1;
        while (((n % 12) + 12) % 12 !== pc) n++;
        notes.push(n);
        last = n;
      }
      for (let shift = -12; shift <= 24; shift += 12) {
        const cand = notes.map((n) => n + shift);
        const first = cand[0] ?? 0;
        const top = cand[cand.length - 1] ?? 0;
        if (first < lo || top > hi) continue;
        let cost = 0;
        if (prev && prev.length > 0) {
          for (let i = 0; i < cand.length; i++) cost += Math.abs((cand[i] ?? 0) - (prev[Math.min(i, prev.length - 1)] ?? 0));
        } else {
          cost = Math.abs(cand.reduce((a, b) => a + b, 0) / cand.length - centre);
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = cand;
        }
      }
    }
  }
  if (best.length === 0) {
    // Range too narrow for the chord: stack upwards from lo.
    best = pcs.slice(0, voices).map((pc) => {
      let n = lo;
      while (((n % 12) + 12) % 12 !== pc) n++;
      return n;
    });
  }
  return best;
}

/** Euclidean rhythm: k hits spread as evenly as possible over n steps, rotated by r. */
export function euclid(k: number, n: number, r = 0): boolean[] {
  const out: boolean[] = [];
  const kk = Math.max(0, Math.min(n, Math.round(k)));
  for (let i = 0; i < n; i++) {
    const j = (((i + r) % n) + n) % n;
    out.push(kk > 0 && Math.floor((j * kk) / n) !== Math.floor(((j + 1) * kk) / n));
  }
  // Rotate so the first hit falls on step 0 when r = 0 (classic tresillo shapes).
  if (r === 0 && kk > 0 && !out[0]) {
    const first = out.indexOf(true);
    return out.slice(first).concat(out.slice(0, first));
  }
  return out;
}

/** Small seeded random source (mulberry32). Music uses its own so a world can have its own theme. */
export class MusicRng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    const v = arr[Math.floor(this.next() * arr.length)];
    if (v === undefined) throw new Error('pick from empty list');
    return v;
  }
  /** Picks by weight; weights may be zero. */
  weighted<T>(items: readonly T[], weight: (t: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weight(it));
      if (r <= 0) return it;
    }
    return this.pick(items);
  }
}
