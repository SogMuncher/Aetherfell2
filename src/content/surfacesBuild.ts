// Building surfaces: brick, dressed stone, timber frame, daub, washes, roofs, floors and street paving (merged into SURFACES).
import type { SurfaceDef } from '../types';

/** Looks for the materials towns are built of; each is named by a tile's `wall`/`floor` in content/tiles.ts. */
export const BUILD_SURFACES: Record<string, SurfaceDef> = {
  // Red brick in stretcher bond, pale lime mortar.
  brick: {
    base: [150, 72, 54],
    layers: [
      { kind: 'bricks', w: 8, h: 4, mortar: [176, 166, 148], salt: 60, vary: 30 },
      { kind: 'grain', salt: 61, amount: [18, 12, 10] },
      { kind: 'speckle', salt: 62, chance: 0.04, add: [-30, -24, -20] },
    ],
  },
  // Big pale blocks, finely jointed: the stone of the rich and of temples.
  ashlar: {
    base: [196, 188, 168],
    layers: [
      { kind: 'bricks', w: 16, h: 8, mortar: [150, 144, 130], salt: 63, vary: 14 },
      { kind: 'noise', salt: 64, cells: 8, amount: [10, 10, 8] },
      { kind: 'speckle', salt: 65, chance: 0.03, add: [-24, -24, -20] },
    ],
  },
  // Warm sandstone laid in long thin courses.
  sandstone: {
    base: [196, 160, 110],
    layers: [
      { kind: 'bricks', w: 16, h: 4, mortar: [158, 124, 84], salt: 77, vary: 18 },
      { kind: 'grain', salt: 78, amount: [20, 16, 10] },
    ],
  },
  // Dark squared basalt for garrisons and keeps.
  basalt: {
    base: [66, 66, 72],
    layers: [
      { kind: 'bricks', w: 8, h: 8, mortar: [38, 38, 42], salt: 75, vary: 16 },
      { kind: 'grain', salt: 76, amount: [12, 12, 14] },
    ],
  },
  // Rough field stones, unshaped, moss in the joints.
  fieldstone: {
    base: [122, 116, 104],
    layers: [
      { kind: 'bricks', w: 4, h: 4, mortar: [70, 66, 58], salt: 70, vary: 40 },
      { kind: 'grain', salt: 71, amount: 20 },
      { kind: 'patches', salt: 72, cells: 8, above: 0.76, colour: [72, 92, 52], keep: 0.5 },
    ],
  },
  // White marble with grey veins.
  marble: {
    base: [226, 222, 214],
    shine: 0.3,
    layers: [
      { kind: 'noise', salt: 73, cells: 8, amount: [8, 8, 8] },
      { kind: 'waves', freq: 0.3, tilt: 0.6, warp: { salt: 74, cells: 4, amount: 12 }, amount: [-52, -50, -44], line: 0.08 },
    ],
  },
  // Timber frame: dark posts and rails, limewashed infill.
  halfTimber: {
    base: [214, 204, 178],
    layers: [
      { kind: 'noise', salt: 66, cells: 4, amount: [14, 12, 10] },
      { kind: 'lines', axis: 'x', period: 8, at: [0], set: [72, 50, 34] },
      { kind: 'lines', axis: 'y', period: 16, at: [0, 1], set: [72, 50, 34] },
      { kind: 'grain', salt: 67, amount: [10, 8, 6] },
    ],
  },
  // Wattle and daub: mud and straw over woven sticks, flaking off in places.
  daub: {
    base: [176, 150, 112],
    layers: [
      { kind: 'noise', salt: 68, cells: 4, amount: [18, 16, 12] },
      { kind: 'patches', salt: 69, cells: 8, above: 0.68, colour: [122, 94, 62], keep: 0.5 },
      { kind: 'speckle', salt: 70, chance: 0.06, add: [24, 20, 14] },
    ],
  },
  // Coloured lime washes.
  plasterOchre: {
    base: [208, 170, 102],
    spin: true,
    layers: [
      { kind: 'noise', salt: 79, cells: 4, amount: [16, 14, 10] },
      { kind: 'patches', salt: 80, cells: 4, above: 0.7, colour: [160, 124, 72], keep: 0.55 },
      { kind: 'speckle', salt: 81, chance: 0.05, add: [-40, -36, -30] },
    ],
  },
  plasterRose: {
    base: [206, 158, 142],
    spin: true,
    layers: [
      { kind: 'noise', salt: 82, cells: 4, amount: [16, 14, 12] },
      { kind: 'patches', salt: 83, cells: 4, above: 0.7, colour: [158, 112, 100], keep: 0.55 },
      { kind: 'speckle', salt: 84, chance: 0.05, add: [-40, -36, -34] },
    ],
  },
  // Split wooden shingles in overlapping rows.
  shingles: {
    base: [120, 86, 58],
    layers: [
      { kind: 'bricks', w: 4, h: 4, mortar: [68, 48, 32], salt: 85, vary: 30 },
      { kind: 'grain', salt: 86, amount: [16, 12, 8] },
    ],
  },
  // Copper sheets gone green, bare metal showing at the seams.
  copper: {
    base: [92, 150, 128],
    shine: 0.25,
    layers: [
      { kind: 'lines', axis: 'x', period: 4, at: [0], add: [-22, -28, -26] },
      { kind: 'noise', salt: 87, cells: 4, amount: [14, 18, 16] },
      { kind: 'patches', salt: 88, cells: 8, above: 0.74, colour: [150, 110, 70], keep: 0.6 },
    ],
  },
  // Sods of turf on a roof: grass with earth showing through.
  turf: {
    base: [72, 98, 48],
    spin: true,
    layers: [
      { kind: 'grain', salt: 89, amount: [30, 40, 18] },
      { kind: 'speckle', salt: 90, chance: 0.1, add: [-30, -34, -20] },
      { kind: 'patches', salt: 91, cells: 8, above: 0.74, colour: [98, 78, 54], keep: 0.5 },
    ],
  },
  // Square red quarry tiles.
  tiledFloor: {
    base: [168, 92, 62],
    layers: [
      { kind: 'bricks', w: 8, h: 8, mortar: [118, 100, 80], salt: 92, vary: 22 },
      { kind: 'grain', salt: 93, amount: [12, 10, 8] },
    ],
  },
  // Old dark oak boards.
  darkPlanks: {
    base: [88, 60, 40],
    layers: [
      { kind: 'boards', dir: 'horizontal', size: 4, seam: [44, 30, 20], joint: { every: 16, stagger: 7 } },
      { kind: 'grain', salt: 94, amount: [18, 12, 8] },
    ],
  },
  // Beaten earth strewn with rushes.
  rushes: {
    base: [138, 116, 74],
    spin: true,
    layers: [
      { kind: 'grain', salt: 95, amount: [28, 24, 14] },
      { kind: 'speckle', salt: 96, chance: 0.2, add: [30, 26, 10] },
      { kind: 'speckle', salt: 97, chance: 0.1, add: [-30, -26, -18] },
    ],
  },
  // Small square granite setts.
  setts: {
    base: [112, 110, 112],
    layers: [
      { kind: 'bricks', w: 4, h: 4, mortar: [64, 62, 60], salt: 98, vary: 24 },
      { kind: 'grain', salt: 99, amount: [10, 10, 10] },
    ],
  },
  // Loose grey gravel.
  gravel: {
    base: [140, 134, 122],
    spin: true,
    layers: [
      { kind: 'grain', salt: 100, amount: 26 },
      { kind: 'speckle', salt: 101, chance: 0.25, add: -30 },
      { kind: 'speckle', salt: 102, chance: 0.15, add: 30 },
    ],
  },
  // Trodden mud with puddles.
  mud: {
    base: [88, 70, 50],
    spin: true,
    shine: 0.15,
    layers: [
      { kind: 'grain', salt: 103, amount: [22, 18, 12] },
      { kind: 'patches', salt: 104, cells: 8, above: 0.7, colour: [58, 50, 42], keep: 0.4 },
      { kind: 'speckle', salt: 105, chance: 0.05, add: [20, 16, 10] },
    ],
  },
};
