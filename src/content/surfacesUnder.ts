// Underworld surfaces: tomb stone, grave slabs, hewn rock, ore, flowstone, books, iron-bound boards, great paving (merged into SURFACES)
import type { SurfaceDef } from '../types';

/** Looks for the tiles of content/tilesUnder.ts. */
export const UNDER_SURFACES: Record<string, SurfaceDef> = {
  // Dark squared blocks, soot in the joints.
  cryptStone: {
    base: [74, 70, 66],
    layers: [
      { kind: 'bricks', w: 16, h: 8, mortar: [36, 32, 30], salt: 301, vary: 16 },
      { kind: 'noise', salt: 302, cells: 8, amount: [12, 12, 10] },
      { kind: 'patches', salt: 303, cells: 4, above: 0.72, colour: [46, 54, 40], keep: 0.5 },
    ],
  },
  // Big slabs worn smooth by feet, cracked here and there.
  cryptFloor: {
    base: [82, 78, 72],
    layers: [
      { kind: 'bricks', w: 16, h: 16, mortar: [44, 40, 38], salt: 304, vary: 20 },
      { kind: 'waves', freq: 3, warp: { salt: 305, cells: 4, amount: 6 }, amount: 10, line: 0.04 },
      { kind: 'grain', salt: 306, amount: 12 },
    ],
  },
  // Rock cut by picks: rough rusty bands.
  mineRock: {
    base: [70, 58, 48],
    spin: true,
    layers: [
      { kind: 'waves', freq: 5, tilt: 0.3, warp: { salt: 307, cells: 4, amount: 5 }, amount: [16, 12, 8] },
      { kind: 'noise', salt: 308, cells: 8, amount: [20, 16, 14] },
      { kind: 'speckle', salt: 309, chance: 0.06, add: [-20, -18, -16] },
    ],
  },
  // Rock shot through with glinting metal.
  ore: {
    base: [62, 56, 54],
    spin: true,
    layers: [
      { kind: 'noise', salt: 310, cells: 4, amount: [18, 16, 16] },
      { kind: 'patches', salt: 311, cells: 8, above: 0.66, colour: [150, 110, 60], keep: 0.3 },
      { kind: 'speckle', salt: 312, chance: 0.05, add: [90, 80, 50] },
    ],
  },
  // Pale stone poured down the walls by water over ages.
  flowstone: {
    base: [120, 106, 90],
    layers: [
      { kind: 'waves', freq: 6, warp: { salt: 313, cells: 4, amount: 4 }, amount: [22, 18, 14], turn: 1 },
      { kind: 'grain', salt: 314, amount: 12 },
      { kind: 'patches', salt: 315, cells: 4, above: 0.7, colour: [150, 138, 120], keep: 0.5 },
    ],
  },
  // Rows of book spines between dark shelf boards.
  bookshelf: {
    base: [96, 40, 34],
    layers: [
      { kind: 'bricks', w: 2, h: 5, mortar: [34, 22, 14], salt: 316, vary: 60 },
      { kind: 'lines', axis: 'y', period: 6, at: [0], set: [58, 38, 24] },
      { kind: 'speckle', salt: 317, chance: 0.05, add: [70, 60, 30] },
    ],
  },
  // Thick boards with iron straps across.
  boundDoor: {
    base: [84, 56, 34],
    layers: [
      { kind: 'boards', dir: 'vertical', size: 5, seam: [40, 26, 16] },
      { kind: 'lines', axis: 'y', period: 16, at: [3, 12], set: [54, 54, 60] },
      { kind: 'grain', salt: 318, amount: [24, 16, 10] },
    ],
  },
  // The old roads below: great square slabs.
  greatPaving: {
    base: [96, 92, 86],
    layers: [
      { kind: 'bricks', w: 16, h: 16, mortar: [58, 54, 50], salt: 319, vary: 12 },
      { kind: 'noise', salt: 320, cells: 8, amount: 10 },
      { kind: 'speckle', salt: 321, chance: 0.03, add: -24 },
    ],
  },
  // Long dark kerbstones at the sides of the old roads.
  kerb: {
    base: [64, 62, 66],
    layers: [
      { kind: 'bricks', w: 16, h: 4, mortar: [36, 34, 38], salt: 322, vary: 10 },
      { kind: 'grain', salt: 323, amount: 12 },
    ],
  },
};
