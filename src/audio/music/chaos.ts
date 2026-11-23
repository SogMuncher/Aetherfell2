// A little chaos in the music, as data: nothing ever plays for sure, and now and then a bar strays.
import type { InstrumentId } from './instruments';

export const CHAOS = {
  /** No chance in the music is ever higher than this (every note, layer and reaction can go missing). */
  maxChance: 0.985,
  /** Per bar, per layer: the layer sits that bar out. */
  layerRests: 0.03,
  /** Per bar: a stray instrument from outside the style breaks in for a few notes. */
  rogue: 0.06,
  /** Per bar: the tempo lurches by up to this much, then glides back. */
  tempo: 0.05,
  tempoBy: 0.12,
  /** Per bar: the bar comes up a sixteenth or two short (the time signature stumbles). */
  shortBar: 0.04,
  /** A reaction answers this often (high, never certain). */
  reaction: 0.94,
  /** A reaction waiting for the band to finish the last one gives up after this many bars. */
  reactionWait: 1,
} as const;

/** How a reaction changes each time it sounds, so spaced-out repeats never sound the same. */
export const VARIETY = {
  /** Scale steps the whole answer may shift by (0 = as written). */
  shifts: [0, 0, 2, 4, -3, 5, -2] as readonly number[],
  /** Chance it jumps an octave up or down. */
  octave: 0.2,
  /** Chance its rhythm is stretched or squeezed. */
  rhythm: 0.35,
  stretch: [0.5, 1.5, 2] as readonly number[],
  /** Chance a fixed reaction voice swaps for another of the reaction kit. */
  swap: 0.3,
  /** Loudness wobble, plus or minus. */
  vel: 0.15,
};

/** Stray instruments that may break into any style for a moment. */
export const ROGUES: readonly InstrumentId[] = ['ocarina', 'fiddle', 'reed', 'dulcimer', 'marimba', 'panpipe', 'lute', 'flute', 'pizzicato'];
