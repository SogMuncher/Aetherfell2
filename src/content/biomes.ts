import type { BiomeDef } from '../types';

/**
 * Kinds of landscape. Each point of land takes the first biome (in this order) whose `when` fits
 * its height and moisture. A biome says what its ground is, which trees grow and how thickly, what
 * is scattered about, and how it looks from far away. A new landscape is a new entry here.
 */
export const BIOMES: Record<string, BiomeDef> = {
  ocean: { name: 'sea', when: { below: 0 }, ground: 'water', roads: false, far: [30, 70, 100], map: [34, 70, 104] },
  beach: { name: 'beach', when: { below: 2.2 }, ground: 'sand', roads: false, bareSlopes: false, far: [198, 184, 138], map: [196, 182, 136] },
  snow: {
    name: 'snowfields',
    air: { count: 260, colour: [235, 240, 250], alpha: 0.7, drift: [0.8, 0.3, -0.5], box: 22, size: 1 },
    when: { above: 165 },
    ground: 'snow',
    trees: { tile: 'pine', density: 0.02 },
    scatter: [
      { tile: 'rock', chance: 0.004 },
      { tile: 'crystals', chance: 0.0008 },
    ],
    far: [226, 232, 242],
    map: [226, 232, 240],
  },
  highland: {
    name: 'highlands',
    when: { above: 85 },
    ground: 'grass',
    trees: { tile: 'pine', density: 0.028, mix: [{ tile: 'deadTree', share: 0.08 }] },
    scatter: [
      { tile: 'rock', chance: 0.012 },
      { tile: 'cairn', chance: 0.0015 },
      { tile: 'crystals', chance: 0.0005 },
      { tile: 'stump', chance: 0.002 },
    ],
    far: [104, 116, 82],
    map: [112, 118, 92],
  },
  // Low, wet ground near the sea: sedge with sunken pools of peat and a few bushes.
  marsh: {
    name: 'marsh',
    air: { count: 120, colour: [190, 210, 170], alpha: 0.4, drift: [0.1, 0.05, 0.15], box: 20, size: 1 },
    when: { below: 14, wetter: 0.6 },
    ground: 'sedge',
    trees: { tile: 'willow', density: 0.01, mix: [{ tile: 'oak', share: 0.25 }] },
    patches: [{ tile: 'peat', salt: 500, scale: 40, above: 0.6 }],
    scatter: [
      { tile: 'bush', chance: 0.03 },
      { tile: 'reeds', chance: 0.07 },
      { tile: 'mushrooms', chance: 0.008 },
      { tile: 'log', chance: 0.003 },
    ],
    far: [74, 100, 60],
    map: [70, 98, 74],
  },
  forest: {
    name: 'forest',
    air: { count: 160, colour: [236, 222, 150], alpha: 0.55, drift: [0.15, 0.1, 0.12], box: 24, size: 1 },
    when: { wetter: 0.56 },
    ground: 'grass',
    // Thin enough to walk between and to draw: a woodland patch peaks near one tile in ten.
    trees: { tile: 'oak', density: 0.06, mix: [{ tile: 'birch', share: 0.25 }] },
    scatter: [
      { tile: 'bush', chance: 0.05 },
      { tile: 'fern', chance: 0.06 },
      { tile: 'mushrooms', chance: 0.008 },
      { tile: 'log', chance: 0.006 },
      { tile: 'stump', chance: 0.004 },
    ],
    far: [56, 90, 42],
    map: [48, 86, 42],
    canopy: 90,
  },
  steppe: {
    name: 'steppe',
    air: { count: 200, colour: [214, 190, 146], alpha: 0.5, drift: [1.1, 0.4, 0.05], box: 28, size: 1 },
    when: { drier: 0.42 },
    ground: 'brush',
    trees: { tile: 'oak', density: 0.006, mix: [{ tile: 'deadTree', share: 0.45 }] },
    scatter: [
      { tile: 'bush', chance: 0.02 },
      { tile: 'rock', chance: 0.005 },
      { tile: 'cairn', chance: 0.0006 },
    ],
    far: [150, 136, 82],
    map: [160, 144, 90],
  },
  meadow: {
    name: 'meadow',
    air: { count: 140, colour: [250, 236, 170], alpha: 0.5, drift: [0.3, 0.2, 0.1], box: 26, size: 1 },
    when: {},
    ground: 'grass',
    trees: { tile: 'oak', density: 0.025, mix: [{ tile: 'birch', share: 0.3 }] },
    scatter: [
      { tile: 'bush', chance: 0.006 },
      { tile: 'rock', chance: 0.002 },
      { tile: 'flowers', chance: 0.035 },
      { tile: 'stump', chance: 0.001 },
    ],
    far: [82, 124, 54],
    map: [92, 132, 62],
  },
};
