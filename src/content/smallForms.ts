// Bushes, rocks, plants and small heaps (haystacks, woodpiles, wells, rubble) grown from parts, like trees (forms.ts)
import type { ArtDef, ArtId } from '../types';
import { stones, BARK_BROWN, LEAF_GREEN, STONE_GREY } from './forms';

/** Smaller world objects: same growth rules and helpers as the trees in forms.ts. A tile names one in `sprite`. */
export const SMALL_FORMS: Record<ArtId, ArtDef> = {
  bush: {
    ppm: 14,
    colors: { leaf: LEAF_GREEN, berry: ['#a02a3a', '#3a3a8a', '#c04020'] },
    features: { berries: 0.3 },
    views: 1,
    vary: 0.2,
    variants: 6,
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [{ shape: 'cone', count: [5, 9], size: [[0.07, 0.11], [0.6, 0.95], [0.02, 0.03]], lean: [35, 70], lift: -0.05, color: 'leaf', surface: 'leaves', shade: 0.12 }],
  },
  /** A clump of mushrooms: pale stems under round caps; a few glow in the dark. */
  mushrooms: {
    ppm: 18,
    colors: { cap: ['#a8402e', '#8a5a36', '#d8cbb0', '#b0884a'], stem: ['#e0d6c0', '#d2c6aa'] },
    features: { glowing: 0.15 },
    views: 1,
    variants: 6,
    vary: 0.25,
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [
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
    parts: [
      { shape: 'ball', size: [[0.9, 1.05], [0.75, 0.9], 0], lift: -0.3, color: 'hay', surface: 'thatch', children: [{ shape: 'cone', size: [[0.5, 0.65], [0.7, 0.9], 0], lift: -0.45, color: 'hay', surface: 'thatch' }] },
    ],
  },
  /** Split logs stacked side by side. */
  woodpile: {
    ppm: 14,
    colors: { bark: BARK_BROWN },
    variants: 5,
    vary: 0.1,
    parts: [
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
    parts: [
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
    parts: [stones([4, 8], [0.18, 0.34], [0, 0.55])],
  },
};
