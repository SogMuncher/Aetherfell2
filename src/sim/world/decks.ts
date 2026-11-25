import type { DeckLook, Volume } from '../../types';
import { shapeByte } from '../../types';
import { CONTENT } from '../../content';
import { shapeId } from '../../content/shapes';
import { tileCode } from '../../content/tiles';

/**
 * Decks over water: bridges where a way crosses a river or lake, piers where a port meets the water. One shape of thing
 * (`Span`) and one builder serve both; they are ordinary cells of the 3D layer (slabs, panels, posts, ramps), so fire,
 * rain, blows, light, saving and sync treat them like any other timber or stone. A span is a plain rectangle of
 * 1 m cells running along x or y, with its deck top on a whole metre, a ramp onto it from the shore, rails down both
 * sides and posts to the bed. It depends on nothing but the water: sim/world/crossings.ts decides where spans go.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Span {
  kind: 'bridge' | 'pier';
  /** Same on every machine; used to tell spans apart. */
  key: string;
  axis: 'x' | 'y';
  /** Inclusive cell range along the axis, and across it. */
  c0: number;
  c1: number;
  l0: number;
  l1: number;
  /** Top of the deck in metres, always a whole number. */
  top: number;
  look: DeckLook;
  /** Ramp onto the deck from the low (c0 - 1) and high (c1 + 1) end. */
  ramps: readonly [boolean, boolean];
  /** Close the high end with a rail (the open end of a pier). */
  capHigh: boolean;
  capLow: boolean;
}

/** What the planner needs of the land. */
export interface Wet {
  waterLevelAt(x: number, y: number): number;
  groundAt(x: number, y: number): number;
}

/** Cell (along, across) to the world cell it is in. */
export function spanCell(s: Span, c: number, l: number): [number, number] {
  return s.axis === 'x' ? [c, l] : [l, c];
}

export function spanBox(s: Span): { x0: number; y0: number; x1: number; y1: number } {
  const [ax, ay] = spanCell(s, s.c0 - 1, s.l0);
  const [bx, by] = spanCell(s, s.c1 + 1, s.l1);
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

function isWet(land: Wet, s: { axis: 'x' | 'y' }, c: number, l: number): boolean {
  const x = s.axis === 'x' ? c + 0.5 : l + 0.5;
  const y = s.axis === 'x' ? l + 0.5 : c + 0.5;
  return !Number.isNaN(land.waterLevelAt(x, y));
}

/** Whole-metre deck top that sits just over the highest water along a row of cells. */
export function deckTop(land: Wet, axis: 'x' | 'y', c0: number, c1: number, l: number): number {
  let level = 0;
  for (let c = c0; c <= c1; c++) {
    const x = axis === 'x' ? c + 0.5 : l + 0.5;
    const y = axis === 'x' ? l + 0.5 : c + 0.5;
    const w = land.waterLevelAt(x, y);
    if (!Number.isNaN(w)) level = Math.max(level, w);
  }
  return Math.ceil(level + CONTENT.world.water.lip);
}

/**
 * Plans a bridge over the run of water a way makes between samples `a` and `b` of its route: straight along the nearer
 * axis through the middle of the run, two metres onto the land at either end. Null if it would be longer than allowed.
 */
export function planBridge(land: Wet, key: string, mid: Pt, dir: Pt, width: number, look: DeckLook): Span | null {
  const axis: 'x' | 'y' = Math.abs(dir.x) >= Math.abs(dir.y) ? 'x' : 'y';
  const m = axis === 'x' ? mid.x : mid.y;
  const lat = axis === 'x' ? mid.y : mid.x;
  const W = Math.max(3, Math.ceil(width));
  const l0 = Math.floor(lat) - Math.floor((W - 1) / 2);
  const l1 = l0 + W - 1;
  const lc = Math.floor(lat);
  const c = Math.floor(m);
  const probe = { axis };
  const max = CONTENT.world.water.span + 8;
  // Walk out from the middle each way to the first dry cell of the centre row.
  let lo = c;
  while (c - lo < max && isWet(land, probe, lo, lc)) lo--;
  let hi = c;
  while (hi - c < max && isWet(land, probe, hi, lc)) hi++;
  if (isWet(land, probe, lo, lc) || isWet(land, probe, hi, lc)) return null;
  const c0 = lo - 1;
  const c1 = hi + 1;
  if (c1 - c0 + 1 > CONTENT.world.water.span) return null;
  // A crossing, not a stretch along a slope: the water under the deck must be near level.
  let lowest = Infinity;
  let highest = -Infinity;
  for (let q = lo + 1; q < hi; q++) {
    const w = land.waterLevelAt(axis === 'x' ? q + 0.5 : lc + 0.5, axis === 'x' ? lc + 0.5 : q + 0.5);
    if (Number.isNaN(w)) continue;
    lowest = Math.min(lowest, w);
    highest = Math.max(highest, w);
  }
  if (highest - lowest > 2.5) return null;
  // The deck meets the ground at both ends: along each ramp (and the metre before it) the ground and the ramp surface stay within a step of each other.
  const gAt = (q: number): number => land.groundAt(axis === 'x' ? q : lc + 0.5, axis === 'x' ? lc + 0.5 : q);
  // u runs along the ramp cell (-1..0) onto the first deck cell (0..): the ramp starts within a step of the bank, and no bank stands higher than a step over the ramp or deck.
  const surface = (deck: number, u: number): number => (u < 0 ? deck + u : deck);
  const fits = (deck: number): boolean => {
    for (let u = -1; u <= 0.75; u += 0.25) {
      const lo = surface(deck, u) - gAt(c0 + u);
      const hi = surface(deck, u) - gAt(c1 + 1 - u);
      if (lo < -0.5 || hi < -0.5 || (u === -1 && (lo > 0.35 || hi > 0.35))) return false;
    }
    return true;
  };
  const base = deckTop(land, axis, c0, c1, lc);
  let top = -1;
  for (let d = base; d <= base + 5; d++) {
    if (fits(d)) {
      top = d;
      break;
    }
  }
  if (top < 0) return null;
  return { kind: 'bridge', key, axis, c0, c1, l0, l1, top, look, ramps: [true, true], capHigh: false, capLow: false };
}

/** The cells the deck stands over are the bed's problem: this puts the span into the 3D layer, only the cells inside the given box. */
export function buildSpan(volume: Volume, land: Wet, s: Span, box: { x0: number; y0: number; x1: number; y1: number }): void {
  const slab = shapeByte(shapeId('slabHigh'), 0);
  const ramp = (rot: number): number => shapeByte(shapeId('ramp'), rot);
  const panel = (rot: number): number => shapeByte(shapeId('rail'), rot);
  const post = shapeByte(shapeId('column'), 0);
  const deck = tileCode(s.look.deck);
  const rail = tileCode(s.look.rail);
  const pole = tileCode(s.look.post);
  const inBox = (x: number, y: number): boolean => x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  const put = (c: number, l: number, z: number, shape: number, mat: number): void => {
    const [x, y] = spanCell(s, c, l);
    if (inBox(x, y)) volume.set(x, y, z, shape, mat);
  };
  // A rail on the outer edge of the cell: rotation 0 is the -y side; each quarter turn goes round (+x, +y, -x).
  const edgeRot = s.axis === 'x' ? { low: 0, high: 2, lowEnd: 3, highEnd: 1 } : { low: 3, high: 1, lowEnd: 0, highEnd: 2 };
  for (let c = s.c0; c <= s.c1; c++) {
    for (let l = s.l0; l <= s.l1; l++) {
      put(c, l, s.top - 1, slab, deck);
      if (l === s.l0) put(c, l, s.top, panel(edgeRot.low), rail);
      if (l === s.l1) put(c, l, s.top, panel(edgeRot.high), rail);
      if (c === s.c0 && s.capLow) put(c, l, s.top, panel(edgeRot.lowEnd), rail);
      if (c === s.c1 && s.capHigh) put(c, l, s.top, panel(edgeRot.highEnd), rail);
    }
  }
  // Ramps from the shore, rising toward the deck.
  const up = s.axis === 'x' ? [0, 2] : [1, 3];
  for (let l = s.l0; l <= s.l1; l++) {
    if (s.ramps[0]) put(s.c0 - 1, l, s.top - 1, ramp(up[0] ?? 0), deck);
    if (s.ramps[1]) put(s.c1 + 1, l, s.top - 1, ramp(up[1] ?? 2), deck);
  }
  // Posts down to the bed under both edges, every third cell.
  for (let c = s.c0; c <= s.c1; c++) {
    if ((c - s.c0) % 3 !== 0) continue;
    for (const l of [s.l0, s.l1]) {
      const [x, y] = spanCell(s, c, l);
      if (!inBox(x, y)) continue;
      const bed = land.groundAt(x + 0.5, y + 0.5);
      for (let z = s.top - 2; z >= s.top - 9 && z + 1 > bed + 0.05; z--) volume.set(x, y, z, post, pole);
    }
  }
}
