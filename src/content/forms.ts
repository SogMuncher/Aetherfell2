import { colourProblem } from './palettes';
import type { FormDef, FormId, PaletteDef, PaletteId, PieceDef } from '../types';

/**
 * How world objects grow: trees, bushes, rocks, standing stones, reeds, mushrooms, haystacks, wells.
 * Each form is a few pieces (balls, boxes and cones) with growth rules as ranges: how many copies,
 * where on the parent they sprout, how far they lean, how big they are. Every placed object is one
 * of several individuals grown from the same rules, then turned, sized and tinted a little on its
 * own, so no two trees in a wood look alike. A tile names its form in `sprite` (content/tiles.ts).
 *
 * Measurements are metres, [forward, up, side]. A piece's foot is where it attaches and its top is
 * its far end: a cone's tip, the top of a ball or box. The helpers below are shared shapes (a leafy
 * crown, a crooked trunk) that several forms reuse with their own numbers.
 */

/** A trunk that grows in a few crooked links, with roots flaring at the foot. */
function trunk(o: { radius: [number, number]; length: [number, number]; links: [number, number]; bend: [number, number]; color?: string; children: PieceDef[] }): PieceDef[] {
  return [
    {
      shape: 'cone',
      size: [o.radius, o.length, 0],
      color: o.color ?? 'bark',
      surface: 'bark',
      lift: -0.1,
      chain: { links: o.links, shrink: [0.66, 0.78], bend: o.bend },
      children: o.children,
    },
    // Root flares.
    { shape: 'cone', count: [2, 4], size: [[o.radius[0] * 0.5, o.radius[1] * 0.55], [0.3, 0.55], 0], lean: [68, 80], lift: -0.1, color: o.color ?? 'bark', surface: 'bark' },
  ];
}

/** Leaf clumps around the end of whatever it grows on. */
function clumps(count: [number, number], size: [number, number], spread: [number, number], lift: [number, number] = [-0.3, 0.2], color = 'leaf'): PieceDef {
  return { shape: 'ball', count, size: [size, [size[0] * 0.75, size[1] * 0.75], 0], spread, lift, color, surface: 'leaves', shade: 0.12 };
}

/** A pile of stones (a cairn, the stones round a well, rubble), each one tipped its own way. */
function stones(count: [number, number], size: [number, number], spread: [number, number], color = 'stone'): PieceDef {
  return { shape: 'box', count, size: [size, [size[0] * 0.6, size[1] * 0.7], [size[0] * 0.8, size[1]]], spread, lean: [0, 35], lift: -0.05, color, surface: 'stone', shade: 0.1 };
}

// Colour choices are '#rrggbb' or '@palette' (content/palettes.ts). Every placed object picks its
// own colours over its grown shape, and palette picks drift a little, so no two look alike.
const BARK_BROWN = ['@bark'];
const LEAF_GREEN = ['@leaf'];
const STONE_GREY = ['@stone'];

export const FORMS: Record<FormId, FormDef> = {
  /** Broad oak: a crooked trunk, a few big limbs with clumps of leaves, sometimes apples. */
  oak: {
    ppm: 8,
    colors: { bark: BARK_BROWN, leaf: LEAF_GREEN, fruit: ['#b03a2a', '#c8962a'] },
    features: { fruit: 0.2 },
    vary: 0.15,
    variants: 8,
    pieces: trunk({
      radius: [0.3, 0.42],
      length: [2.0, 2.6],
      links: [2, 3],
      bend: [4, 14],
      children: [
        {
          shape: 'cone',
          on: 'along',
          along: [0.45, 1],
          count: [4, 6],
          size: [[0.1, 0.15], [1.7, 2.5], 0],
          lean: [38, 66],
          color: 'bark',
          surface: 'bark',
          children: [
            clumps([2, 3], [1.1, 1.5], [0.2, 0.8], [-0.7, 0]),
            { shape: 'ball', feature: 'fruit', count: [1, 3], size: [0.12, 0.12, 0.12], spread: [0.6, 1.1], lift: [-0.5, 0.2], color: 'fruit', surface: 'smooth' },
          ],
        },
        clumps([3, 5], [1.4, 1.9], [0.5, 1.4], [-1.3, -0.5]),
      ],
    }),
  },
  /** Fir: a short bare trunk under a stack of shrinking needle tiers. */
  pine: {
    ppm: 8,
    colors: { bark: ['#4a3524', '#56402a'], needle: ['#2f5a3e', '#2a5238', '#355f44', '#2c4f3a', '#3a6046'] },
    features: { snowy: 0.25 },
    vary: 0.15,
    variants: 8,
    pieces: [
      { shape: 'cone', size: [[0.18, 0.26], [2.2, 2.8], 0], color: 'bark', surface: 'bark', lift: -0.1 },
      {
        shape: 'cone',
        raise: [1.0, 1.4],
        size: [[1.8, 2.4], [3.9, 4.6], 0],
        color: 'needle',
        surface: 'leaves',
        shade: 0.08,
        chain: { links: [5, 7], shrink: [0.78, 0.85], bend: [0, 4], step: 0.42 },
        children: [{ shape: 'cone', feature: 'snowy', size: [[0.5, 0.7], [0.8, 1.1], 0], lift: -0.8, color: '#e6ecf2', surface: 'smooth' }],
      },
    ],
  },
  /** Birch: a slender pale trunk with dark marks and small, light leaf clumps up high. */
  birch: {
    ppm: 8,
    colors: { bark: ['#ddd8cc', '#e8e4da', '#cfc9bc'], leaf: ['#7aa040', '#86a84a', '#6e9a3e', '#a8a83a'] },
    vary: 0.15,
    variants: 8,
    pieces: trunk({
      radius: [0.14, 0.2],
      length: [3.1, 3.7],
      links: [2, 3],
      bend: [2, 9],
      children: [
        {
          shape: 'cone',
          on: 'along',
          along: [0.3, 1],
          count: [5, 8],
          size: [[0.05, 0.08], [1.0, 1.6], 0],
          lean: [28, 50],
          color: 'bark',
          surface: 'bark',
          children: [clumps([2, 3], [0.6, 0.95], [0.1, 0.5], [-0.6, 0])],
        },
        clumps([2, 4], [0.9, 1.2], [0.2, 0.7], [-0.9, -0.2]),
      ],
    }),
  },
  /** Willow: a thick, short trunk under a wide crown whose long strands hang down to the water. */
  willow: {
    ppm: 8,
    colors: { bark: ['#5a4a36', '#4e4232'], leaf: ['#6e9a48', '#7aa452', '#648e44'] },
    vary: 0.12,
    variants: 6,
    pieces: trunk({
      radius: [0.34, 0.46],
      length: [1.8, 2.4],
      links: [2, 2],
      bend: [8, 18],
      children: [
        clumps([4, 6], [1.4, 1.9], [0.5, 1.6], [-0.6, 0]),
        { shape: 'cone', count: [14, 20], size: [[0.18, 0.3], [2.4, 3.6], 0], spread: [0.8, 2.3], lean: [170, 178], raise: [0.6, 1.0], color: 'leaf', surface: 'leaves', shade: 0.1 },
      ],
    }),
  },
  /** What fire leaves of a tree: a blackened trunk and a few stubby limbs. */
  charredTrunk: {
    ppm: 8,
    colors: { bark: ['#2a2422', '#332a26', '#241f1e'] },
    variants: 5,
    vary: 0.1,
    pieces: trunk({
      radius: [0.22, 0.32],
      length: [2.6, 3.2],
      links: [2, 3],
      bend: [4, 14],
      children: [{ shape: 'cone', on: 'along', along: [0.3, 1], count: [2, 4], size: [[0.06, 0.1], [0.6, 1.2], 0], lean: [35, 70], color: 'bark', surface: 'bark' }],
    }),
  },
  /** A dead, silvered tree with bare forking branches. */
  deadTree: {
    ppm: 8,
    colors: { bark: ['#8a8278', '#7a7268', '#958c80'] },
    variants: 6,
    vary: 0.15,
    pieces: trunk({
      radius: [0.22, 0.3],
      length: [2.4, 2.9],
      links: [2, 3],
      bend: [6, 20],
      children: [
        {
          shape: 'cone',
          on: 'along',
          along: [0.35, 1],
          count: [2, 4],
          size: [[0.07, 0.1], [1.2, 2], 0],
          lean: [30, 60],
          color: 'bark',
          surface: 'bark',
          children: [{ shape: 'cone', on: 'along', along: [0.5, 0.9], count: [1, 2], size: [[0.03, 0.05], [0.6, 1], 0], lean: [25, 50], color: 'bark', surface: 'bark' }],
        },
      ],
    }),
  },
  /** A rounded shrub of leaf clumps, some with berries. */
  bush: {
    ppm: 14,
    colors: { leaf: LEAF_GREEN, berry: ['#a02a3a', '#3a3a8a', '#c04020'] },
    features: { berries: 0.3 },
    views: 1,
    vary: 0.2,
    variants: 6,
    pieces: [
      {
        shape: 'ball',
        count: [3, 6],
        size: [[0.35, 0.55], [0.3, 0.45], 0],
        spread: [0.15, 0.5],
        lift: -0.12,
        color: 'leaf',
        surface: 'leaves',
        shade: 0.12,
        children: [{ shape: 'ball', feature: 'berries', count: [1, 3], size: [0.05, 0.05, 0.05], spread: [0.2, 0.4], lift: -0.25, color: 'berry' }],
      },
    ],
  },
  /** A boulder: a big rounded stone with a few broken chunks against it, maybe mossy on top. */
  boulder: {
    ppm: 12,
    colors: { stone: STONE_GREY, moss: ['@moss'] },
    features: { moss: 0.4 },
    vary: 0.2,
    variants: 8,
    pieces: [
      {
        shape: 'ball',
        size: [[0.7, 1.0], [0.55, 0.75], [0.6, 0.9]],
        lean: [0, 12],
        lift: -0.2,
        color: 'stone',
        surface: 'stone',
        children: [{ shape: 'ball', feature: 'moss', size: [[0.45, 0.6], [0.12, 0.18], [0.4, 0.55]], on: 'top', lift: -0.3, color: 'moss', surface: 'leaves' }],
      },
      stones([1, 3], [0.25, 0.45], [0.6, 1.0]),
    ],
  },
  /** A tall standing stone, leaning a little, its runes glowing faintly. */
  standingStone: {
    ppm: 12,
    colors: { stone: ['#6e7078', '#787a80', '#666870'], rune: ['#6edcd2', '#8ab4f0'] },
    variants: 5,
    vary: 0.08,
    pieces: [
      {
        shape: 'box',
        size: [[0.38, 0.5], [1.5, 1.7], [0.22, 0.3]],
        lean: [0, 6],
        lift: -0.1,
        color: 'stone',
        surface: 'stone',
        children: [{ shape: 'box', on: 'along', along: [0.45, 0.85], count: [2, 3], size: [0.16, 0.03, 0.02], raise: 0, offset: [0, 0, [0.24, 0.3]], around: false, color: 'rune', surface: 'glow' }],
      },
      stones([0, 2], [0.15, 0.25], [0.5, 0.8]),
    ],
  },
  /** A fallen log in the grass, with a stub of a branch and a ring of moss. */
  log: {
    ppm: 12,
    colors: { bark: BARK_BROWN, moss: ['@moss'] },
    features: { moss: 0.5 },
    variants: 6,
    vary: 0.15,
    pieces: [
      {
        shape: 'ball',
        size: [[0.26, 0.34], [1.1, 1.6], 0],
        around: false,
        raise: [0.2, 0.28],
        lean: [86, 92],
        lift: -1.3,
        color: 'bark',
        surface: 'bark',
        children: [
          { shape: 'cone', on: 'along', along: [0.3, 0.7], size: [0.06, [0.4, 0.7], 0], lean: [50, 80], color: 'bark', surface: 'bark' },
          { shape: 'ball', feature: 'moss', on: 'along', along: [0.4, 0.6], size: [[0.25, 0.32], 0.3, [0.25, 0.32]], lean: 90, lift: -0.3, color: 'moss', surface: 'leaves' },
        ],
      },
    ],
  },
  /** An old stump, sawn or snapped. */
  stump: {
    ppm: 14,
    colors: { bark: BARK_BROWN },
    views: 1,
    variants: 5,
    vary: 0.2,
    pieces: [
      { shape: 'cone', size: [[0.3, 0.42], [0.9, 1.3], 0], lift: -0.45, color: 'bark', surface: 'bark' },
      { shape: 'cone', count: [3, 5], size: [[0.12, 0.18], [0.5, 0.7], 0], lean: [64, 76], lift: -0.1, color: 'bark', surface: 'bark' },
    ],
  },
  /** Fronds of fern arching out of the forest floor. */
  fern: {
    ppm: 16,
    colors: { leaf: ['#4a7a34', '#568838', '#3e6e30', '#6a8a3a'] },
    views: 1,
    variants: 6,
    vary: 0.25,
    pieces: [{ shape: 'cone', count: [5, 9], size: [[0.07, 0.11], [0.6, 0.95], [0.02, 0.03]], lean: [35, 70], lift: -0.05, color: 'leaf', surface: 'leaves', shade: 0.12 }],
  },
  /** A clump of mushrooms: pale stems under round caps; a few glow in the dark. */
  mushrooms: {
    ppm: 18,
    colors: { cap: ['#a8402e', '#8a5a36', '#d8cbb0', '#b0884a'], stem: ['#e0d6c0', '#d2c6aa'] },
    features: { glowing: 0.15 },
    views: 1,
    variants: 6,
    vary: 0.25,
    pieces: [
      {
        shape: 'cone',
        count: [2, 5],
        size: [[0.03, 0.05], [0.12, 0.3], 0],
        spread: [0.05, 0.35],
        lean: [0, 15],
        color: 'stem',
        children: [
          { shape: 'ball', feature: '!glowing', size: [[0.07, 0.14], [0.04, 0.07], 0], lift: -0.05, color: 'cap', shade: 0.1 },
          { shape: 'ball', feature: 'glowing', size: [[0.07, 0.14], [0.04, 0.07], 0], lift: -0.05, color: '#6ad0e8', surface: 'glow' },
        ],
      },
    ],
  },
  /** Wild flowers: thin stems with bright heads, all one kind per patch. */
  flowers: {
    ppm: 18,
    colors: { stem: ['#4e7a34', '#5a8438'], bloom: ['#e8d040', '#d84a5a', '#f0f0f0', '#8a6ad8', '#e88a3a', '#e0a0c8'] },
    views: 1,
    variants: 8,
    vary: 0.2,
    pieces: [
      {
        shape: 'cone',
        count: [6, 11],
        size: [0.012, [0.22, 0.45], 0],
        spread: [0, 0.45],
        lean: [0, 20],
        color: 'stem',
        children: [{ shape: 'ball', size: [[0.035, 0.055], [0.03, 0.045], 0], lift: -0.02, color: 'bloom', shade: 0.1 }],
      },
    ],
  },
  /** Reeds and bulrushes standing in the wet. */
  reeds: {
    ppm: 14,
    colors: { reed: ['#7a8a4a', '#8a9a52', '#6a7e44'], head: ['#5a3a24', '#66442a'] },
    features: { rushes: 0.6 },
    views: 1,
    variants: 6,
    vary: 0.2,
    pieces: [
      { shape: 'cone', count: [8, 14], size: [[0.02, 0.035], [1.0, 1.7], 0], spread: [0, 0.4], lean: [0, 14], color: 'reed', surface: 'leaves', shade: 0.1 },
      {
        shape: 'cone',
        feature: 'rushes',
        count: [2, 4],
        size: [0.015, [1.1, 1.5], 0],
        spread: [0, 0.3],
        lean: [0, 10],
        color: 'reed',
        children: [{ shape: 'ball', size: [0.04, [0.12, 0.16], 0], lift: -0.35, color: 'head' }],
      },
    ],
  },
  /** A cairn: flat stones stacked into a crooked pillar by travellers marking the way. */
  cairn: {
    ppm: 14,
    colors: { stone: STONE_GREY },
    variants: 6,
    vary: 0.12,
    pieces: [
      { shape: 'box', size: [[0.42, 0.52], [0.13, 0.18], [0.38, 0.48]], lift: -0.04, color: 'stone', surface: 'stone', shade: 0.12, chain: { links: [4, 6], shrink: [0.8, 0.9], bend: [4, 12], step: 1 } },
      stones([2, 4], [0.12, 0.2], [0.45, 0.7]),
    ],
  },
  /** A cluster of crystals pushing out of the rock, catching the light. */
  crystals: {
    ppm: 14,
    colors: { gem: ['#9a6ad8', '#5ac8d8', '#d86ab0', '#7ad8a0'], stone: STONE_GREY },
    variants: 6,
    vary: 0.2,
    pieces: [
      { shape: 'ball', size: [[0.4, 0.55], [0.18, 0.26], [0.35, 0.5]], lift: -0.12, color: 'stone', surface: 'stone' },
      { shape: 'cone', count: [3, 6], size: [[0.08, 0.16], [0.5, 1.3], 0], spread: [0, 0.3], lean: [0, 38], lift: -0.05, color: 'gem', surface: 'metal', shade: 0.15 },
    ],
  },
  /** A haystack, round and thatched, with a peaked top. */
  haystack: {
    ppm: 12,
    colors: { hay: ['@hay'] },
    views: 1,
    variants: 4,
    vary: 0.12,
    pieces: [
      { shape: 'ball', size: [[0.9, 1.05], [0.75, 0.9], 0], lift: -0.3, color: 'hay', surface: 'thatch', children: [{ shape: 'cone', size: [[0.5, 0.65], [0.7, 0.9], 0], lift: -0.45, color: 'hay', surface: 'thatch' }] },
    ],
  },
  /** Split logs stacked side by side. */
  woodpile: {
    ppm: 14,
    colors: { bark: BARK_BROWN },
    variants: 5,
    vary: 0.1,
    pieces: [
      {
        shape: 'ball',
        count: [7, 11],
        around: false,
        size: [[0.1, 0.14], [0.55, 0.7], 0],
        offset: [0, [0.1, 0.75], [-0.55, 0.55]],
        lean: 90,
        turn: [-6, 6],
        lift: -0.62,
        color: 'bark',
        surface: 'wood',
        shade: 0.1,
      },
    ],
  },
  /** A village well: a ring of stones, two posts and a little peaked roof, with a bucket. */
  well: {
    ppm: 12,
    colors: { stone: STONE_GREY, wood: ['#6a4a30', '#5c4028'], roof: ['#7a5034', '#8a3e2e', '#6a6058'] },
    variants: 4,
    vary: 0.05,
    pieces: [
      { shape: 'ball', size: [0.62, 0.04, 0.62], raise: 0.42, color: '#22323e', surface: 'glow' },
      { shape: 'box', count: [9, 11], size: [[0.16, 0.2], [0.28, 0.34], [0.2, 0.26]], spread: 0.7, color: 'stone', surface: 'stone', shade: 0.12 },
      { shape: 'box', count: 2, size: [0.07, [0.95, 1.0], 0.07], spread: 0.72, color: 'wood', surface: 'wood' },
      { shape: 'cone', size: [1.0, 0.6, 0.75], raise: 1.85, around: false, color: 'roof', surface: 'thatch' },
      { shape: 'box', size: [0.12, 0.13, 0.12], raise: 1.0, around: false, offset: [0.15, 0, 0.1], color: 'wood', surface: 'wood' },
    ],
  },
  /** Tumbled stones where a wall came down. */
  rubble: {
    ppm: 12,
    colors: { stone: ['#7a7a80', '#6c6c72', '#86847e'] },
    variants: 6,
    vary: 0.15,
    pieces: [stones([4, 8], [0.18, 0.34], [0, 0.55])],
  },
};

/** Problems in the forms: unknown colour slots and features, bad colours, empty growth. */
export function formProblems(forms: Readonly<Record<FormId, FormDef>>, palettes?: Readonly<Record<PaletteId, PaletteDef>>): string[] {
  const out: string[] = [];
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const [id, f] of Object.entries(forms)) {
    const w = `form '${id}'`;
    for (const [slot, list] of Object.entries(f.colors)) {
      if (!list.length) out.push(`${w}: colour slot '${slot}' has no choices`);
      for (const c of list) {
        const why = colourProblem(c, palettes);
        if (why) out.push(`${w}: in '${slot}', ${why}`);
      }
    }
    if (!f.pieces.length) out.push(`${w}: has no pieces`);
    const walk = (p: PieceDef): void => {
      if (!hex.test(p.color) && !(p.color in f.colors)) out.push(`${w}: unknown colour slot '${p.color}'`);
      const feat = p.feature?.replace(/^!/, '');
      if (feat && !(feat in (f.features ?? {}))) out.push(`${w}: unknown feature '${feat}'`);
      for (const c of p.children ?? []) walk(c);
    };
    for (const p of f.pieces) walk(p);
  }
  return out;
}
