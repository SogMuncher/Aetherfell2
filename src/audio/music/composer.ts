/**
 * The composer writes sections: a key, a tempo, a meter, a chord progression, a melody motif
 * and drum patterns, all drawn from a style's data with fresh randomness each time. Pure logic.
 */
import type { MeterId, StyleDef, StyleId } from './styles';
import { METERS } from './styles';
import type { Meter } from './styles';
import type { Chord, ChordColor, ModeId } from './theory';
import { MODES, MusicRng, chordDegrees, euclid } from './theory';

export type SectionKind = 'intro' | 'main' | 'lift' | 'break' | 'rest';

export interface MotifNote {
  /** Step within the two-bar phrase. */
  step: number;
  len: number;
  /** Scale degree relative to the tonic. */
  deg: number;
}

export interface Section {
  style: StyleId;
  def: StyleDef;
  kind: SectionKind;
  /** Tonic as a pitch class 0..11. */
  key: number;
  modeId: ModeId;
  mode: readonly number[];
  tempo: number;
  meterId: MeterId;
  meter: Meter;
  bars: number;
  /** Chord for each bar. */
  chordAt: Chord[];
  /** True on bars where a new chord starts. */
  chordStarts: boolean[];
  /** Two-bar melody phrase. */
  motif: MotifNote[];
  /** Drum hit maps per layer index. */
  drums: Map<number, boolean[]>;
}

/** A world's own short anthem, derived from its seed so friends in the same world share it. */
export function worldTheme(seed: number): { deg: number; len: number }[] {
  const r = new MusicRng(seed ^ 0x5eed);
  const shapes = [
    [4, 4, 8, 4, 4, 8],
    [4, 2, 2, 8, 4, 4, 4, 4],
    [8, 4, 4, 8, 8],
    [6, 2, 4, 4, 6, 2, 8],
    [4, 4, 4, 4, 8, 8],
  ];
  const lens = r.pick(shapes);
  const out: { deg: number; len: number }[] = [];
  let deg = r.pick([0, 2, 4]);
  for (let i = 0; i < lens.length; i++) {
    out.push({ deg, len: lens[i] ?? 4 });
    // Heroic contour: rise in the first half, fall home in the second.
    const up = i < lens.length / 2;
    deg += up ? r.pick([1, 2, 2, 3, 4, -1]) : r.pick([-1, -1, -2, 1, -3]);
    deg = Math.max(-2, Math.min(9, deg));
  }
  const last = out[out.length - 1];
  if (last) last.deg = r.pick([0, 4, 7]);
  return out;
}

function pickColor(r: MusicRng, colors: Partial<Record<ChordColor, number>>): ChordColor {
  const keys = Object.keys(colors) as ChordColor[];
  if (keys.length === 0) return 'triad';
  return r.weighted(keys, (k) => colors[k] ?? 0);
}

/** Spreads a progression over the section, with occasional substitutions so repeats differ. */
function buildChords(r: MusicRng, def: StyleDef, bars: number): { chordAt: Chord[]; starts: boolean[] } {
  const chordAt: Chord[] = [];
  const starts: boolean[] = [];
  const prog = r.pick(def.progressions);
  const per = r.pick(def.chordBars);
  let i = 0;
  let pass = 0;
  while (chordAt.length < bars) {
    let degree = prog[i % prog.length] ?? 0;
    // Second time round, sometimes swap a chord for its relative (a third below/above).
    if (pass > 0 && i % prog.length !== 0 && r.chance(0.25)) degree = (degree + r.pick([2, 5])) % 7;
    const color = pickColor(r, def.colors);
    const ch: Chord = { degree, color, bars: per };
    for (let b = 0; b < per && chordAt.length < bars; b++) {
      chordAt.push(ch);
      starts.push(b === 0);
    }
    i++;
    if (i % prog.length === 0) pass++;
  }
  // End sections on something that leads home: the dominant or the tonic.
  if (bars >= 4 && r.chance(0.5)) {
    const last = bars - 1;
    const prev = chordAt[last];
    const ch: Chord = { degree: r.pick([4, 0, 3]), color: 'triad', bars: 1 };
    if (prev && prev.degree !== ch.degree) {
      chordAt[last] = ch;
      starts[last] = true;
    }
  }
  return { chordAt, starts };
}

function buildMotif(r: MusicRng, def: StyleDef, meter: Meter, theme: { deg: number; len: number }[] | null): MotifNote[] {
  const span = meter.steps * 2;
  const scale = meter.steps / 16;
  const notes: MotifNote[] = [];
  if (theme) {
    let step = 0;
    for (const n of theme) {
      const len = Math.max(1, Math.round(n.len * scale));
      if (step >= span) break;
      notes.push({ step, len: Math.min(len, span - step), deg: n.deg });
      step += len;
    }
    return notes;
  }
  let step = r.chance(0.3) ? r.pick([2, 4]) : 0;
  let deg = r.pick([0, 2, 4, 4, 7]);
  while (step < span) {
    const cell = r.pick(def.melody.cells);
    for (const raw of cell) {
      if (step >= span) break;
      const len = Math.max(1, Math.round(raw * scale));
      notes.push({ step, len: Math.min(len, span - step), deg });
      step += len;
      const leap = def.melody.leap;
      let move = r.int(leap * 2 + 1) - leap;
      if (move === 0 && r.chance(0.6)) move = r.chance(0.5) ? 1 : -1;
      deg = Math.max(-3, Math.min(11, deg + move));
    }
    // Breathe between cells now and then.
    if (r.chance(def.melody.space * 0.6)) step += r.pick([2, 4]);
  }
  const last = notes[notes.length - 1];
  if (last) last.deg = r.pick([0, 2, 4, 7]);
  return notes;
}

function buildDrums(r: MusicRng, def: StyleDef, meter: Meter): Map<number, boolean[]> {
  const out = new Map<number, boolean[]>();
  def.layers.forEach((l, i) => {
    if (l.role !== 'perc') return;
    const n = meter.steps;
    const map = new Array<boolean>(n).fill(false);
    switch (l.on ?? 'euclid') {
      case 'beats':
        for (const b of meter.beats) map[b] = true;
        break;
      case 'down':
        map[0] = true;
        break;
      case 'accents':
        for (const b of meter.accents) map[b] = true;
        break;
      case 'offbeats':
        for (const b of meter.beats) map[(b + 2) % n] = true;
        break;
      default: {
        const k = Math.max(1, Math.round((l.hits ?? 4) * (n / 16)));
        const rot = r.chance(0.5) ? 0 : r.int(n / 2) * 2;
        const e = euclid(k, n, rot);
        for (let s = 0; s < n; s++) map[s] = e[s] ?? false;
      }
    }
    out.set(i, map);
  });
  return out;
}

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

function fifthsDistance(a: number, b: number): number {
  const ia = FIFTHS.indexOf(((a % 12) + 12) % 12);
  const ib = FIFTHS.indexOf(((b % 12) + 12) % 12);
  const d = Math.abs(ia - ib);
  return Math.min(d, 12 - d);
}

export interface ComposeOpts {
  style: StyleId;
  def: StyleDef;
  kind: SectionKind;
  /** Previous section, for key and tempo continuity. */
  prev: Section | null;
  theme: { deg: number; len: number }[];
  /** Force the meter (previews). */
  meter?: MeterId;
}

export function compose(r: MusicRng, o: ComposeOpts): Section {
  const { def, prev } = o;
  const sameStyle = prev !== null && prev.style === o.style;
  // Key: within a style drift gently (stay, a fifth, or a lift); across styles land close by.
  let key: number;
  let modeId: ModeId;
  if (sameStyle && prev) {
    const move = o.kind === 'lift' ? r.pick([2, 5, 7]) : r.chance(0.55) ? 0 : r.pick([5, 7, -2, 2]);
    key = (((prev.key + move) % 12) + 12) % 12;
    modeId = r.chance(0.7) ? prev.modeId : r.pick(def.modes);
  } else {
    const roots = def.roots.map((m) => ((m % 12) + 12) % 12);
    key = prev ? r.weighted(roots, (k) => 4 - fifthsDistance(k, prev.key) + 0.5) : r.pick(roots);
    modeId = r.pick(def.modes);
  }
  const mode = MODES[modeId];
  let tempo = r.range(def.tempo[0], def.tempo[1]);
  if (sameStyle && prev) tempo = Math.max(def.tempo[0], Math.min(def.tempo[1], prev.tempo + r.range(-5, 5)));
  if (o.kind === 'lift') tempo = Math.min(def.tempo[1] + 6, tempo + 4);
  const meterId = o.meter ?? (sameStyle && prev && r.chance(0.6) ? prev.meterId : r.pick(def.meters));
  const meter = METERS[meterId];
  const bars = o.kind === 'intro' ? (tempo < 72 || meter.steps > 16 ? 2 : 4) : o.kind === 'rest' ? r.pick([4, 6, 8]) : r.pick(def.sectionBars);
  const { chordAt, starts } = buildChords(r, def, bars);
  const useTheme = def.melody.theme && r.chance(o.kind === 'lift' ? 0.7 : 0.35);
  const motif = buildMotif(r, def, meter, useTheme ? o.theme : null);
  return { style: o.style, def, kind: o.kind, key, modeId, mode, tempo, meterId, meter, bars, chordAt, chordStarts: starts, motif, drums: buildDrums(r, def, meter) };
}

/** Next section kind inside the same style. */
export function nextKind(r: MusicRng, def: StyleDef, prev: SectionKind, count: number): SectionKind {
  if (prev === 'rest') return r.chance(0.5) ? 'intro' : 'main';
  if (count >= 2 && r.chance(def.rest)) return 'rest';
  if (prev === 'break') return 'lift';
  return r.weighted<SectionKind>(['main', 'lift', 'break'], (k) => (k === 'main' ? 3 : k === 'lift' ? 1.2 : 1));
}

/** Scale degrees of a chord, wrapped to 0..6. */
export function chordDegreeSet(c: Chord): number[] {
  return chordDegrees(c).map((d) => ((d % 7) + 7) % 7);
}
