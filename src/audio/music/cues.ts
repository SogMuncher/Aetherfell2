// Cues as data: stingers, style changes and on-beat reactions, each a few notes in the current key and band.
import type { InstrumentId } from './instruments';
import type { LayerRole } from './styleTypes';
import type { SignalName } from './signals';

/** Where on the music's grid a cue lands: right away, next sixteenth, eighth, beat or bar. */
export type GridUnit = 'now' | 'step' | 'eighth' | 'beat' | 'bar';

/**
 * An instrument, `@role` = whatever the current style plays in that role (so cues sound like the place), or
 * `@lead` = one of the style's lead voices (StyleDef.leads), picked fresh for each reaction.
 */
export type Voice = InstrumentId | `@${LayerRole}` | '@lead';

export interface CueNote {
  voice: Voice;
  /** Used when the style has no layer for `@role`. */
  or?: InstrumentId;
  /** Scale degree above the current chord root (or the key's tonic with `key`). */
  deg?: number;
  key?: boolean;
  /** Raw semitones above the key's tonic, ignoring the mode (a bright major chord after a fight). */
  semi?: number;
  /** Register centre as a MIDI note (drums: the pitch). Default 60. */
  oct?: number;
  /** Sixteenth steps after the grid point (fractions are fine). */
  at?: number;
  /** Held length in sixteenth steps. Default 2. */
  len?: number;
  vel?: number;
  bright?: number;
  /** Play the whole current chord in this register. */
  chord?: boolean;
}

/**
 * The reaction language: the band itself answers you, pitched, in key and on the grid, in the current style's own
 * roles plus one bell family. Never drums, noise or booms: those belong to the sound effects, so the two never clash.
 * Stingers (style changes, big moments) may use any voice.
 */
export const REACTION_KIT: readonly Voice[] = ['@lead', '@melody', '@stab', '@bass', '@counter', '@arp', 'bell', 'celesta', 'lyre', 'harp', 'glass'];

export interface CueDef {
  grid: GridUnit;
  /** A stinger, free of the reaction language (style changes, discoveries, your death). */
  stinger?: boolean;
  notes: readonly CueNote[];
  /** Other ways to say the same thing; each playing picks one of `notes` or these. */
  forms?: readonly (readonly CueNote[])[];
  /** Seconds before this cue may sound again. */
  cooldown?: number;
  /** Opens by quoting the world's own theme. */
  theme?: { voice: Voice; or?: InstrumentId; oct: number; count: number; vel: number };
  /** Nudges the mood afterwards. */
  feed?: { signal: SignalName; value: number; secs: number };
  /** Play another cue instead when a mood signal is at least `min`. */
  alt?: { when: SignalName; min: number; cue: string };
}

const run = (voice: Voice, n: number, oct: number, gap: number, vel: number, key = false): CueNote[] =>
  Array.from({ length: n }, (_, k) => ({ voice, deg: k, oct, at: k * gap, len: 2, vel, key }));

const chordOf = (voice: Voice, semis: readonly number[], vel: number): CueNote[] => semis.map((semi) => ({ voice, semi, oct: 54, len: 16, vel }));

export const CUES = {
  // --- Fight reactions (spells, traps and breakage already have strong sound effects, so the music leaves them be) ---
  strike: {
    grid: 'eighth', cooldown: 0.12,
    notes: [
      { voice: '@lead', or: 'strings', deg: 0, oct: 67, len: 1, vel: 0.55 },
      { voice: '@lead', or: 'strings', deg: 4, oct: 67, len: 2, vel: 0.5, at: 1 },
    ],
    forms: [
      [{ voice: '@lead', or: 'strings', deg: 2, oct: 67, len: 3, vel: 0.55 }],
      [{ voice: '@lead', or: 'strings', deg: 4, oct: 69, len: 1, vel: 0.5 }, { voice: '@lead', or: 'strings', deg: 3, oct: 69, len: 2, vel: 0.45, at: 1 }],
      [{ voice: '@stab', or: 'warHorn', chord: true, oct: 60, len: 1.5, vel: 0.45 }, { voice: '@lead', or: 'strings', deg: 4, oct: 69, len: 2, vel: 0.5, at: 1.5 }],
      [{ voice: '@lead', or: 'strings', deg: 0, oct: 64, len: 0.5, vel: 0.45 }, { voice: '@lead', or: 'strings', deg: 1, oct: 64, len: 0.5, vel: 0.45, at: 0.5 }, { voice: '@lead', or: 'strings', deg: 2, oct: 64, len: 2, vel: 0.55, at: 1 }],
    ],
  },
  strikeHeavy: {
    grid: 'beat', cooldown: 0.4,
    notes: [
      { voice: '@bass', or: 'bowedBass', deg: 0, oct: 40, len: 3, vel: 0.75 },
      { voice: '@lead', or: 'warHorn', deg: 0, oct: 60, len: 4, vel: 0.7 },
      { voice: '@lead', or: 'warHorn', deg: 4, oct: 60, len: 3, vel: 0.6, at: 2 },
    ],
    forms: [
      [{ voice: '@stab', or: 'warHorn', chord: true, oct: 58, len: 4, vel: 0.65 }, { voice: '@lead', or: 'warHorn', deg: 7, oct: 67, len: 3, vel: 0.55, at: 2 }],
      [{ voice: '@bass', or: 'bowedBass', deg: 0, oct: 38, len: 6, vel: 0.8 }, { voice: '@lead', or: 'warHorn', deg: 1, oct: 62, len: 2, vel: 0.6 }, { voice: '@lead', or: 'warHorn', deg: 0, oct: 62, len: 4, vel: 0.6, at: 2 }],
    ],
  },
  kill: {
    grid: 'beat', cooldown: 0.5,
    notes: [
      { voice: '@stab', or: 'warHorn', chord: true, oct: 60, len: 6, vel: 0.6 },
      { voice: '@lead', or: 'warHorn', deg: 4, oct: 67, len: 2, vel: 0.6, at: 0 },
      { voice: '@lead', or: 'warHorn', deg: 7, oct: 67, at: 2, len: 6, vel: 0.65 },
    ],
    forms: [
      [...run('@lead', 3, 67, 1, 0.55), { voice: '@lead', or: 'warHorn', deg: 4, oct: 67, at: 3, len: 6, vel: 0.6 }, { voice: 'bell', deg: 0, oct: 72, at: 3, len: 8, vel: 0.35 }],
      [{ voice: '@bass', or: 'bowedBass', deg: 0, oct: 40, len: 8, vel: 0.7 }, { voice: '@lead', or: 'warHorn', deg: 0, oct: 64, len: 8, vel: 0.6 }, { voice: '@lead', or: 'warHorn', deg: 4, oct: 64, len: 6, vel: 0.5, at: 2 }],
    ],
  },
  hurt: {
    grid: 'step', cooldown: 0.35,
    notes: [
      { voice: '@bass', or: 'bowedBass', deg: 0, oct: 40, len: 3, vel: 0.8 },
      { voice: '@lead', or: 'strings', deg: 1, oct: 64, len: 1, vel: 0.5, at: 1 },
      { voice: '@lead', or: 'strings', deg: 0, oct: 64, len: 3, vel: 0.45, at: 2 },
    ],
    forms: [
      [{ voice: '@lead', or: 'strings', deg: 4, oct: 67, len: 2, vel: 0.5 }, { voice: '@lead', or: 'strings', deg: 3, oct: 67, len: 4, vel: 0.45, at: 2 }],
      [{ voice: '@bass', or: 'bowedBass', deg: -1, oct: 38, len: 4, vel: 0.75 }, { voice: 'glass', deg: 1, oct: 76, len: 4, vel: 0.35, at: 1 }],
    ],
  },
  block: {
    grid: 'step', cooldown: 0.15,
    notes: [
      { voice: 'lyre', deg: 0, oct: 72, len: 1, vel: 0.5 },
      { voice: 'lyre', deg: 4, oct: 72, len: 2, vel: 0.45, at: 1 },
    ],
    forms: [
      [{ voice: '@lead', or: 'strings', deg: 4, oct: 69, len: 1, vel: 0.45 }, { voice: '@lead', or: 'strings', deg: 4, oct: 69, len: 1, vel: 0.4, at: 1.5 }],
      [{ voice: 'harp', deg: 0, oct: 67, len: 1, vel: 0.45 }, { voice: 'harp', deg: 2, oct: 67, len: 1, vel: 0.45, at: 0.5 }, { voice: 'harp', deg: 4, oct: 67, len: 2, vel: 0.45, at: 1 }],
    ],
  },
  parry: {
    grid: 'step', cooldown: 0.25,
    notes: [
      { voice: 'bell', deg: 4, oct: 79, len: 6, vel: 0.6 },
      { voice: '@lead', or: 'warHorn', deg: 0, oct: 67, len: 1, vel: 0.65, at: 0.5 },
      { voice: '@lead', or: 'warHorn', deg: 4, oct: 67, len: 4, vel: 0.75, at: 1.5 },
    ],
    forms: [
      [{ voice: 'glass', deg: 0, oct: 84, len: 8, vel: 0.5 }, { voice: '@lead', or: 'warHorn', deg: 4, oct: 69, len: 6, vel: 0.7 }],
      [{ voice: '@lead', or: 'warHorn', deg: 2, oct: 67, len: 1, vel: 0.6 }, { voice: '@lead', or: 'warHorn', deg: 4, oct: 67, len: 1, vel: 0.65, at: 1 }, { voice: '@lead', or: 'warHorn', deg: 7, oct: 67, len: 4, vel: 0.7, at: 2 }],
    ],
  },
  charged: { grid: 'step', cooldown: 0.5, notes: [{ voice: 'glass', deg: 4, oct: 84, len: 4, vel: 0.5 }, { voice: 'celesta', deg: 7, oct: 84, len: 2, vel: 0.4, at: 1 }], forms: [[{ voice: '@lead', or: 'strings', deg: 4, oct: 72, len: 6, vel: 0.45 }]] },
  fallen: {
    grid: 'now', cooldown: 5, stinger: true,
    notes: [{ voice: 'gong', vel: 0.8 }, { voice: 'choir', chord: true, oct: 55, len: 24, vel: 0.5 }, { voice: 'cello', key: true, oct: 36, len: 24, vel: 0.7 }],
  },
  // --- Moving and doing ------------------------------------------------------------------------
  landHard: { grid: 'step', cooldown: 0.6, notes: [{ voice: '@bass', or: 'cello', deg: 0, oct: 40, len: 2, vel: 0.7 }, { voice: '@bass', or: 'cello', deg: -3, oct: 40, len: 2, vel: 0.55, at: 1 }] },
  glide: { grid: 'eighth', cooldown: 2, notes: run('harp', 6, 72, 0.5, 0.4) },
  pickup: { grid: 'eighth', cooldown: 0.2, notes: [{ voice: 'lyre', deg: 4, oct: 67, len: 1, vel: 0.55 }, { voice: 'lyre', deg: 7, oct: 67, len: 3, vel: 0.5, at: 1 }] },
  open: { grid: 'eighth', cooldown: 1, notes: run('harp', 5, 67, 0.5, 0.45) },
  unlock: { grid: 'beat', cooldown: 1, notes: [{ voice: 'bell', deg: 0, oct: 72, len: 4, vel: 0.5 }, { voice: 'bell', deg: 4, oct: 72, len: 6, vel: 0.5, at: 2 }] },
  jammed: { grid: 'eighth', cooldown: 0.8, notes: [{ voice: 'lyre', deg: 1, oct: 64, len: 1, vel: 0.5 }, { voice: 'lyre', deg: 0, oct: 64, len: 2, vel: 0.45, at: 1 }] },
  // --- The world -------------------------------------------------------------------------------
  friend: { grid: 'bar', cooldown: 5, notes: [{ voice: '@melody', or: 'horn', deg: 0, key: true, oct: 64, len: 3, vel: 0.6 }, { voice: '@melody', or: 'horn', deg: 4, key: true, oct: 64, len: 3, vel: 0.6, at: 4 }, { voice: '@melody', or: 'horn', deg: 7, key: true, oct: 64, len: 8, vel: 0.65, at: 8 }] },
  realm: { grid: 'beat', cooldown: 5, stinger: true, notes: [{ voice: 'gong', vel: 0.7 }, { voice: '@drone', or: 'drone', key: true, oct: 36, len: 32, vel: 0.6 }, { voice: 'bowl', key: true, oct: 72, len: 16, vel: 0.5 }] },
  // --- Stingers --------------------------------------------------------------------------------
  discover: {
    grid: 'beat', cooldown: 3, stinger: true,
    theme: { voice: 'horn', oct: 66, count: 4, vel: 0.8 },
    feed: { signal: 'wonder', value: 1, secs: 20 },
    notes: [
      ...run('harp', 12, 66, 0.25, 0.5, true),
      { voice: 'timpani', vel: 0.7 },
      { voice: 'choir', chord: true, key: true, oct: 62, at: 8, len: 20, vel: 0.6 },
      { voice: 'horn', key: true, oct: 64, at: 8, len: 16, vel: 0.8 },
      { voice: 'timpani', vel: 0.9, at: 8 },
      { voice: 'crash', vel: 0.5, at: 8 },
    ],
  },
  rune: { grid: 'eighth', cooldown: 2, notes: [...run('celesta', 7, 79, 1, 0.7, true), { voice: 'glass', key: true, oct: 64, len: 16, vel: 0.7 }, { voice: 'glass', deg: 4, key: true, oct: 64, len: 16, vel: 0.6 }, { voice: 'bell', key: true, oct: 76, at: 7, len: 12, vel: 0.6 }] },
  skill: { grid: 'eighth', cooldown: 2, notes: [...run('harp', 3, 72, 1, 0.7, true), { voice: 'celesta', deg: 7, key: true, oct: 79, at: 3, len: 8, vel: 0.6 }] },
  // --- Style changes (styles name these as `enter` / `leave`) ----------------------------------
  clash: { grid: 'now', stinger: true, notes: [{ voice: 'boom', oct: 36, vel: 0.9 }, { voice: 'crash', vel: 0.7 }, { voice: 'taiko', vel: 1 }] },
  relief: {
    grid: 'now', stinger: true, alt: { when: 'triumph', min: 0.15, cue: 'victory' },
    notes: [...chordOf('strings', [0, 7, 12, 15, 19], 0.6), { voice: 'timpani', vel: 0.8 }],
  },
  victory: {
    grid: 'now', stinger: true,
    notes: [...chordOf('horn', [0, 7, 12, 14, 19], 0.6), { voice: 'timpani', vel: 0.8 }, { voice: 'crash', vel: 0.4 }],
  },
  depths: { grid: 'now', stinger: true, notes: [{ voice: 'boom', oct: 36, vel: 0.5 }, { voice: 'bell', key: true, oct: 36, at: 1, len: 24, vel: 0.8 }] },
  sweep: { grid: 'now', stinger: true, notes: [{ voice: 'swell', vel: 0.6 }, ...run('harp', 10, 62, 0.4, 0.55, true)] },
  mourn: { grid: 'now', stinger: true, notes: [{ voice: 'cello', key: true, oct: 36, len: 20, vel: 0.7 }] },
  rise: { grid: 'now', stinger: true, notes: [{ voice: 'rise', key: true, oct: 54, len: 8, vel: 0.6 }] },
} satisfies Record<string, CueDef>;

export type CueId = keyof typeof CUES;
export const CUE_TABLE: Readonly<Record<string, CueDef>> = CUES;
