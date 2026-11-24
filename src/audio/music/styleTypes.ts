/**
 * Musical styles as data. Each style says when it wants to play (affinity), how intense it should
 * be (energy), and how it sounds: tempo, meters, modes, chord progressions, melody rhythm and an
 * ensemble of layers that join as the energy rises.
 *
 * Adding a mood = adding one entry here. The conductor blends between them by itself.
 */
import type { MoodSignals } from './signals';
import type { ChordColor, ModeId } from './theory';
import type { InstrumentId } from './instruments';

export interface Meter {
  /** Sixteenth-note steps per bar. */
  steps: number;
  /** Steps that feel like beats (bass and chords lean on these). */
  beats: readonly number[];
  /** Strongest pulses (drums accent these). */
  accents: readonly number[];
}

export const METERS = {
  four: { steps: 16, beats: [0, 4, 8, 12], accents: [0, 8] },
  three: { steps: 12, beats: [0, 4, 8], accents: [0] },
  sixEight: { steps: 12, beats: [0, 6], accents: [0, 6] },
  five: { steps: 20, beats: [0, 4, 8, 12, 16], accents: [0, 12] },
  seven: { steps: 14, beats: [0, 4, 8, 11], accents: [0, 8] },
  two: { steps: 8, beats: [0, 4], accents: [0] },
  nine: { steps: 18, beats: [0, 6, 12], accents: [0] },
  eleven: { steps: 22, beats: [0, 4, 8, 14, 18], accents: [0, 8] },
  twelve: { steps: 24, beats: [0, 6, 12, 18], accents: [0, 12] },
} satisfies Record<string, Meter>;

export type MeterId = keyof typeof METERS;

export type LayerRole =
  /** Sustained chords, voice-led. */
  | 'pad'
  /** Root movement on the beats. */
  | 'bass'
  /** The lead line, built from a motif. */
  | 'melody'
  /** Answers the melody in its gaps. */
  | 'counter'
  /** Broken chords. */
  | 'arp'
  /** Driving repeated notes on the chord root/fifth. */
  | 'ostinato'
  /** Rhythmic chord hits on accents. */
  | 'stab'
  /** Drums. */
  | 'perc'
  /** A long low tone under everything. */
  | 'drone'
  /** Sparse atmospheric events (bells, drips, whispers). */
  | 'texture';

export interface LayerDef {
  role: LayerRole;
  instrument: InstrumentId;
  /** MIDI register. */
  lo: number;
  hi: number;
  /** Channel level. */
  level: number;
  pan?: number;
  /** Joins when the style's energy reaches this. */
  enter: number;
  /** Leaves again above this energy (calm-only layers). */
  leave?: number;
  /** Echo send 0..1. */
  echo?: number;
  /** Drums: hits per bar spread evenly (Euclidean), or fixed placement. */
  hits?: number;
  on?: 'euclid' | 'beats' | 'down' | 'offbeats' | 'accents';
  /** Steps per note for arps/ostinatos (1 = sixteenths, 2 = eighths…). */
  rate?: number;
  shape?: 'up' | 'down' | 'updown' | 'random' | 'pedal';
  /** Fixed drum pitch in Hz (tuned drums use the chord root when absent). */
  pitch?: number;
  bright?: number;
  vel?: number;
  /** Chance each scheduled note actually plays. */
  chance?: number;
  /** Pad voices. */
  voices?: number;
}

export interface StyleDef {
  name: string;
  /** Beats per minute (quarter notes), picked per section. */
  tempo: readonly [number, number];
  meters: readonly MeterId[];
  modes: readonly ModeId[];
  /** Tonic choices as MIDI notes in the bass octave. */
  roots: readonly number[];
  /** Chord progressions as scale degrees (0 = tonic). */
  progressions: readonly (readonly number[])[];
  /** Bars per chord options. */
  chordBars: readonly number[];
  colors: Partial<Record<ChordColor, number>>;
  /** 0..0.5 shuffle on off-beat sixteenths. */
  swing: number;
  /** Chance a section is a breathing rest (near-silence). */
  rest: number;
  /** Chance a rest falls fully silent for a long stretch (only ambience), instead of a soft pad. */
  silence: number;
  sectionBars: readonly number[];
  melody: {
    /** Rhythm cells: note lengths in sixteenths. */
    cells: readonly (readonly number[])[];
    /** Largest step between notes, in scale degrees. */
    leap: number;
    /** Chance a melody bar breathes (rests). */
    space: number;
    /** May quote the world's own theme. */
    theme: boolean;
  };
  layers: readonly LayerDef[];
  mix: {
    /** Overall level of this style. */
    level: number;
    /** Hall reverb send. */
    hall: number;
    /** Cavern reverb send. */
    cave: number;
    /** Master echo send scale. */
    echo: number;
    /** Lowpass on the whole style in Hz (dark styles are muffled). */
    tone: number;
  };
  /** Voices reactions answer in (`@lead` in cues.ts), one picked per reaction; they cut through the band. */
  leads?: readonly InstrumentId[];
  /** Cue played when the music changes into this style (cues.ts); wins over the old style's `leave`. */
  enter?: string;
  /** Cue played when the music leaves this style for one without an `enter` cue. */
  leave?: string;
  /** Can cut in on the next beat instead of waiting for a phrase to end. */
  urgent?: boolean;
  /** Minimum bars before the conductor may leave this style. */
  minBars: number;
  affinity(s: MoodSignals, extra: ReadonlyMap<string, number>): number;
  energy(s: MoodSignals): number;
}

export const CALM_CELLS = [[4, 4, 8], [8, 4, 4], [6, 2, 8], [4, 2, 2, 8], [12, 4], [8, 8], [2, 2, 4, 8], [16]] as const;
export const FLOW_CELLS = [[4, 4, 4, 4], [6, 2, 4, 4], [4, 2, 2, 4, 4], [8, 4, 4], [2, 2, 4, 8], [4, 4, 8]] as const;
export const DANCE_CELLS = [[2, 2, 2, 2, 4], [4, 2, 2, 4], [6, 2, 4], [2, 2, 2, 6], [4, 4, 4]] as const;
export const BATTLE_CELLS = [[2, 2, 4, 8], [4, 2, 2, 8], [3, 3, 2, 8], [2, 2, 2, 2, 8], [6, 2, 8], [4, 4, 8]] as const;
export const SLOW_CELLS = [[8, 8], [12, 4], [16], [6, 10], [4, 12]] as const;
/** Long held notes with wide gaps: sparse wandering lines. */
export const SPARSE_CELLS = [[16], [12, 4], [8, 8], [24], [4, 20], [16, 8]] as const;

export const c = (v: number): number => (v > 1 ? 1 : v > 0 ? v : 0);
