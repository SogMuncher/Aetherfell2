import type { SurfaceDef } from '../types';

/**
 * Procedural surfaces: every ground, wall and floor look, as a base colour plus layers of noise,
 * speckles, waves, bricks, boards and patches (render/materials/textures.ts paints them once).
 * A new look is a new entry here; a tile names it as its `floor` or `wall`. Salts just pick
 * different random patterns, so two surfaces with the same layers still look different.
 */
/** How far each component of a placed surface may drift in colour when the surface sets no `drift` of its own. */
export const SURFACE_DRIFT = { hue: 6, sat: 0.12, light: 0.09 } as const;

export const SURFACES: Record<string, SurfaceDef> = {
  grass: {
    base: [58, 102, 40],
    spin: true,
    layers: [
      { kind: 'grain', salt: 1, amount: [34, 46, 18] },
      { kind: 'speckle', salt: 9, chance: 0.14, add: [18, 18, 0] },
    ],
  },
  brush: {
    base: [148, 128, 70],
    spin: true,
    layers: [
      { kind: 'grain', salt: 2, amount: [40, 34, 20] },
      { kind: 'speckle', salt: 3, chance: 0.2, add: [-22, -22, 0] },
    ],
  },
  water: {
    base: [34, 82, 112],
    layers: [{ kind: 'waves', freq: 0.39, warp: { salt: 5, cells: 2, amount: 10 }, amount: [18, 24, 26] }],
  },
  sedge: {
    base: [70, 96, 52],
    layers: [
      { kind: 'grain', salt: 26, amount: [22, 30, 16] },
      { kind: 'lines', axis: 'x', period: 4, add: [-8, -6, -4] },
      { kind: 'speckle', salt: 27, chance: 0.1, add: [30, 28, 6] },
      { kind: 'patches', salt: 28, cells: 4, above: 0.74, colour: [52, 70, 64], keep: 0.5 },
    ],
  },
  sand: {
    base: [196, 178, 128],
    spin: true,
    layers: [{ kind: 'grain', salt: 4, amount: [30, 26, 20] }],
  },
  trail: {
    base: [112, 98, 64],
    spin: true,
    layers: [
      { kind: 'grain', salt: 41, amount: [30, 30, 18] },
      { kind: 'speckle', salt: 42, chance: 0.16, add: [-18, -16, -8] },
      { kind: 'speckle', salt: 43, chance: 0.08, add: [20, 22, 10] },
    ],
  },
  cobble: {
    base: [128, 122, 110],
    layers: [
      { kind: 'bricks', w: 8, h: 4, mortar: [76, 72, 64], salt: 44, vary: 26 },
      { kind: 'speckle', salt: 45, chance: 0.1, add: 16 },
    ],
  },
  road: {
    base: [124, 104, 74],
    layers: [
      { kind: 'noise', salt: 6, cells: 4, amount: [30, 26, 18] },
      { kind: 'speckle', salt: 7, chance: 0.1, add: 22 },
      { kind: 'lines', axis: 'x', period: 16, at: [4], add: [-14, -14, 0] },
    ],
  },
  stone: {
    base: [118, 114, 108],
    layers: [
      { kind: 'bricks', w: 8, h: 4, mortar: [70, 68, 66], salt: 8, vary: 30 },
      { kind: 'grain', salt: 9, amount: 24 },
    ],
  },
  ruin: {
    base: [104, 104, 112],
    layers: [
      { kind: 'bricks', w: 16, h: 8, mortar: [52, 58, 52], salt: 10, vary: 26 },
      { kind: 'grain', salt: 11, amount: 22 },
      { kind: 'patches', salt: 12, cells: 4, above: 0.62, colour: [70, 96, 58], keep: [0.5, 0.6, 0] },
    ],
  },
  wood: {
    base: [116, 78, 46],
    layers: [
      { kind: 'boards', dir: 'vertical', size: 8, seam: [52, 34, 22] },
      { kind: 'rings', board: 8, salt: 13, freq: 0.6, warp: { salt: 14, cells: 2, amount: 4 }, amount: [26, 18, 10] },
    ],
  },
  door: {
    base: [100, 64, 36],
    layers: [
      { kind: 'lines', axis: 'y', period: 16, at: [6], set: [60, 60, 66] },
      { kind: 'boards', dir: 'vertical', size: 8, seam: [48, 30, 18] },
      { kind: 'grain', salt: 15, amount: [30, 20, 12] },
    ],
  },
  planks: {
    base: [134, 96, 60],
    layers: [
      { kind: 'boards', dir: 'horizontal', size: 4, seam: [58, 40, 26], joint: { every: 16, stagger: 5 } },
      { kind: 'grain', salt: 16, amount: [26, 20, 12] },
    ],
  },
  rock: {
    base: [58, 52, 58],
    spin: true,
    layers: [
      { kind: 'noise', salt: 61, cells: 4, amount: [26, 22, 26] },
      { kind: 'grain', salt: 62, amount: 16 },
      { kind: 'speckle', salt: 63, chance: 0.07, add: [22, 22, 26] },
      { kind: 'patches', salt: 64, cells: 4, above: 0.7, colour: [44, 50, 44], keep: 0.6 },
    ],
  },
  flagstone: {
    base: [112, 110, 104],
    layers: [
      { kind: 'bricks', w: 8, h: 8, mortar: [60, 62, 58], salt: 17, vary: 28 },
      { kind: 'grain', salt: 18, amount: 20 },
    ],
  },
  ash: {
    base: [46, 42, 40],
    spin: true,
    layers: [
      { kind: 'grain', salt: 19, amount: [26, 22, 20] },
      { kind: 'speckle', salt: 20, chance: 0.015, add: [60, 18, 0] },
    ],
  },
  snow: {
    base: [222, 228, 238],
    spin: true,
    layers: [{ kind: 'grain', salt: 21, amount: [26, 22, 16] }],
  },
  frost: {
    base: [196, 214, 226],
    spin: true,
    layers: [
      { kind: 'grain', salt: 26, amount: [30, 26, 20] },
      { kind: 'speckle', salt: 27, chance: 0.05, add: [40, 40, 30] },
    ],
  },
  ice: {
    base: [150, 196, 222],
    layers: [
      { kind: 'grain', salt: 23, amount: [26, 22, 16] },
      { kind: 'waves', freq: 0.45, tilt: 0.12, warp: { salt: 24, cells: 3, amount: 14 }, amount: [50, 50, 25], line: 0.06 },
      { kind: 'speckle', salt: 25, chance: 0.015, add: [30, 30, 0] },
    ],
  },
  // A woven fence of upright stakes with a rail.
  fence: {
    base: [120, 86, 54],
    layers: [
      { kind: 'boards', dir: 'vertical', size: 4, seam: [40, 30, 20] },
      { kind: 'lines', axis: 'y', period: 16, at: [8, 9], set: [92, 64, 40] },
      { kind: 'grain', salt: 30, amount: [24, 18, 10] },
    ],
  },
  // Clipped hedge: dense leaves with darker hollows.
  hedge: {
    base: [56, 92, 42],
    spin: true,
    layers: [
      { kind: 'grain', salt: 31, amount: [30, 40, 20] },
      { kind: 'speckle', salt: 32, chance: 0.18, add: [-24, -30, -14] },
      { kind: 'speckle', salt: 33, chance: 0.08, add: [26, 30, 10] },
    ],
  },
  // Stacked round logs, seen from the side (corner posts, log cabins).
  logs: {
    base: [104, 72, 44],
    layers: [
      { kind: 'boards', dir: 'horizontal', size: 4, seam: [50, 34, 22] },
      { kind: 'grain', salt: 34, amount: [28, 20, 12] },
    ],
  },
  roof: {
    base: [140, 70, 50],
    layers: [
      { kind: 'lines', axis: 'y', period: 8, set: [70, 40, 30] },
      { kind: 'grain', salt: 22, amount: [30, 20, 10] },
    ],
  },
  // Bundled reed or straw, laid in rows.
  thatch: {
    base: [168, 140, 78],
    layers: [
      { kind: 'lines', axis: 'y', period: 4, add: [-26, -24, -18] },
      { kind: 'grain', salt: 40, amount: [34, 30, 18] },
      { kind: 'speckle', salt: 41, chance: 0.12, add: [22, 20, 8] },
    ],
  },
  // Lime-washed plaster with stains and the odd chip.
  plaster: {
    base: [200, 190, 162],
    spin: true,
    layers: [
      { kind: 'noise', salt: 42, cells: 4, amount: [16, 14, 12] },
      { kind: 'patches', salt: 43, cells: 4, above: 0.7, colour: [150, 136, 110], keep: 0.55 },
      { kind: 'speckle', salt: 44, chance: 0.05, add: [-40, -38, -34] },
    ],
  },
  // Dressed slate roofing: overlapping rows.
  slate: {
    base: [78, 86, 98],
    layers: [
      { kind: 'bricks', w: 8, h: 4, mortar: [40, 44, 52], salt: 45, vary: 22 },
      { kind: 'grain', salt: 46, amount: [16, 16, 20] },
    ],
  },
  peat: {
    base: [74, 56, 38],
    spin: true,
    layers: [
      { kind: 'grain', salt: 13, amount: [26, 20, 14] },
      { kind: 'patches', salt: 14, cells: 4, above: 0.7, colour: [40, 48, 40], keep: [0.46, 0.7, 0.71] },
    ],
  },
};
