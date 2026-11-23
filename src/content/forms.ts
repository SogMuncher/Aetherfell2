// Trees grown from parts (art data), plus the growth helpers (trunk, leaf clumps, stones) smallForms.ts shares
import type { ArtDef, ArtId, ArtPart } from '../types';

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
export function trunk(o: { radius: [number, number]; length: [number, number]; links: [number, number]; bend: [number, number]; color?: string; children: ArtPart[] }): ArtPart[] {
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
export function clumps(count: [number, number], size: [number, number], spread: [number, number], lift: [number, number] = [-0.3, 0.2], color = 'leaf'): ArtPart {
  return { shape: 'ball', count, size: [size, [size[0] * 0.75, size[1] * 0.75], 0], spread, lift, color, surface: 'leaves', shade: 0.12 };
}

/** A pile of stones (a cairn, the stones round a well, rubble), each one tipped its own way. */
export function stones(count: [number, number], size: [number, number], spread: [number, number], color = 'stone'): ArtPart {
  return { shape: 'box', count, size: [size, [size[0] * 0.6, size[1] * 0.7], [size[0] * 0.8, size[1]]], spread, lean: [0, 35], lift: -0.05, color, surface: 'stone', shade: 0.1 };
}

// Colour choices are '#rrggbb' or '@palette' (content/palettes.ts). Every placed object picks its
// own colours over its grown shape, and palette picks drift a little, so no two look alike.
export const BARK_BROWN = ['@bark'];
export const LEAF_GREEN = ['@leaf'];
export const STONE_GREY = ['@stone'];

export const FORMS: Record<ArtId, ArtDef> = {
  /** Broad oak: a crooked trunk, a few big limbs with clumps of leaves, sometimes apples. */
  oak: {
    ppm: 8,
    colors: { bark: BARK_BROWN, leaf: LEAF_GREEN, fruit: ['#b03a2a', '#c8962a'] },
    features: { fruit: 0.2 },
    vary: 0.15,
    variants: 8,
    parts: trunk({
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
    parts: [
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
    parts: trunk({
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
    parts: trunk({
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
    parts: trunk({
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
    parts: trunk({
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
};
