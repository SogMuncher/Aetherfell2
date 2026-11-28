export { turnCell, houseGeometry, turnToward } from './structures';
export type { StructureMaterials, RoofKind, StructureDef, Furnish, Furnishing, StructureSite, StructureReport, PlannedStructure, HouseGeometry } from './structures';
/**
 * The 3D layer: a sparse grid of 1 m cells (each can be split into eight half-metre fine cells) that can hold overhangs, floors above floors, stairs,
 * roofs and bridges — everything the flat tile map cannot. A cell is a simple shape (a cube, a slab,
 * a ramp…) turned to one of four sides, made of a material (a tile kind: its surfaces paint it).
 * Cells live in 16 × 16 × 16 bricks; empty space costs nothing.
 */

export const BRICK_BITS = 4;
export const BRICK_SIZE = 1 << BRICK_BITS;
export const BRICK_CELLS = BRICK_SIZE * BRICK_SIZE * BRICK_SIZE;

/** A shape byte: the shape number in the low 6 bits, which of four sides it faces in the top 2. 0 = empty. */
export function shapeByte(shape: number, rot: number): number {
  return (shape & 63) | ((rot & 3) << 6);
}

/**
 * Fine cells: any cell can be split into 2 × 2 × 2 half-metre cells, each with its own shape and material, where a
 * structure needs the detail (a stair under a hatch, a curved hull). The split cell keeps one material of its own (the
 * most common of its halves) and one set of states (wet, fire…), so fire, frost and blows still work per whole cell,
 * exactly like a ground tile. A brick holds fine cells only once one of its cells is split.
 */
export const FINE = 2;
export const FINE_BRICK = BRICK_SIZE * FINE;
export const FINE_CELLS = FINE_BRICK * FINE_BRICK * FINE_BRICK;

/** Position of a fine cell (fine coordinates: twice the cell's, plus 0 or 1) inside its brick's fine arrays. */
export function fineIndex(fx: number, fy: number, fz: number): number {
  return ((fz & 31) << 10) | ((fy & 31) << 5) | (fx & 31);
}

export interface FineCells {
  readonly shape: Uint8Array;
  readonly mat: Uint8Array;
}

/** Lasting number of a brick, from its place in the grid. */
export function brickKey(bx: number, by: number, bz: number): number {
  return ((bx + 1048576) * 2097152 + (by + 1048576)) * 512 + (bz + 256);
}

/** Position of a cell inside its brick. */
export function cellIndex(x: number, y: number, z: number): number {
  return ((z & 15) << 8) | ((y & 15) << 4) | (x & 15);
}

/**
 * What a brick's cells carry besides shape and material: the same state a ground tile has (wet, fire,
 * oil, soot, frost) plus fuel already burnt and wear from blows. Allocated only once something happens to a
 * cell, so quiet bricks cost nothing. Indexed like the shape array.
 */
export interface BrickMatter {
  wet: Uint8Array;
  fire: Uint8Array;
  oil: Uint8Array;
  soot: Uint8Array;
  /** Ice in it (frozen wetness); it thaws back into wet. */
  frost: Uint8Array;
  /** Fuel burnt so far (the cell's fuel is its material's fuel minus this). */
  spent: Uint16Array;
  /** Damage taken from blows (mends slowly). */
  wear: Uint16Array;
}

export type BrickMatterField = 'wet' | 'fire' | 'oil' | 'soot' | 'frost' | 'spent' | 'wear';

export interface VolumeBrick {
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  readonly shape: Uint8Array;
  readonly mat: Uint8Array;
  /** State of the cells (wet, fire…), or null while nothing has happened to any of them. */
  matter: BrickMatter | null;
  /** Non-empty cells. */
  count: number;
  /** Changed since it was last saved or sent. */
  dirty: boolean;
  /** Goes up whenever a cell or its state (wet, fire, frost…) changes, so a renderer knows to re-copy just this brick. */
  rev: number;
  /** Shapes and materials of its split cells' halves, or null while none of its cells is split. */
  fine: FineCells | null;
  /** Box (in cells within the brick) that holds everything ever put here: x0,y0,z0,x1,y1,z1 (end exclusive). */
  readonly box: Uint8Array;
}

/** What the renderer, physics and weather may ask of the 3D layer. */
export interface ReadonlyVolume {
  /** Goes up whenever anything changes, so caches know to rebuild. */
  readonly version: number;
  readonly bricks: ReadonlyMap<number, VolumeBrick>;
  shapeAt(x: number, y: number, z: number): number;
  matAt(x: number, y: number, z: number): number;
  /** Shape byte / material of one fine cell (fine coordinates); 0 unless its cell is split. */
  fineAt(fx: number, fy: number, fz: number): number;
  fineMatAt(fx: number, fy: number, fz: number): number;
  /** Top of the highest solid thing in this column (metres), or -Infinity. */
  topAt(x: number, y: number): number;
  /** The same, of the world's own cells only (buildings, ruins), never a moving frame's. */
  worldTop(x: number, y: number): number;
  /** Highest solid top at or below `zMax` (and not below `zMin`) at this point, or -Infinity. */
  floorBelow(x: number, y: number, zMax: number, zMin?: number): number;
  /** Lowest solid underside at or above `z` at this point, or Infinity. */
  ceilingAbove(x: number, y: number, z: number): number;
  /** Is there anything solid at this point between heights z0 and z1? */
  solidBetween(x: number, y: number, z0: number, z1: number): boolean;
  /** Is open sky overhead at this point and height (nothing solid above)? */
  openSky(x: number, y: number, z: number): boolean;
  /** State of one cell (0 where nothing has happened to it). */
  cellGet(field: BrickMatterField, x: number, y: number, z: number): number;
  /** Cells with fire in them / local dampness, as spot keys (see types/matter.ts). Always in step with the bricks, also on guests. */
  readonly burningCells: ReadonlySet<number>;
  readonly dampCells: ReadonlySet<number>;
  /** Cells carrying wear from blows. */
  readonly wornCells: ReadonlySet<number>;
  /** Moving frames (an airship): boxes of cells kept at a quiet spot of the store but standing somewhere else in the world, turned. Every question above that takes a world point also asks them. */
  readonly frames: ReadonlyMap<number, VolumeFrame>;
  /** The cell (store coordinates) solid at a world point, on a frame if one holds it. */
  cellOf(x: number, y: number, z: number): { x: number; y: number; z: number };
  /** Highest solid top at or below `zMax` on one frame only, at a world point, or -Infinity. */
  floorOn(frame: number, x: number, y: number, zMax: number): number;
  /** Where a cell's middle is in the world (moved and turned with its frame, if it is on one). */
  placeOf(x: number, y: number, z: number): { x: number; y: number; z: number };
  /** A world point in the store coordinates of each frame within `pad` m of it, so a blast reaches a ship's own cells. */
  framePoints(x: number, y: number, z: number, pad: number): { x: number; y: number; z: number }[];
}

/**
 * A box of the store's cells that stands elsewhere in the world: store box x0..x1 (end exclusive), pivot (px, py)
 * inside it, put at world (wx, wy) turned by `yaw`; store height z0 stands at world height wz. Set every tick by its owner.
 */
export interface VolumeFrame {
  id: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  px: number;
  py: number;
  wx: number;
  wy: number;
  wz: number;
  yaw: number;
}

export interface Volume extends ReadonlyVolume {
  set(x: number, y: number, z: number, shape: number, mat: number): boolean;
  /** Puts a fine cell in (fine coordinates; shape 0 clears it). Its whole cell is split first, keeping its shape as halves. */
  setFine(fx: number, fy: number, fz: number, shape: number, mat: number): boolean;
  /** Writes one cell's state (clamped to its range); the brick is marked changed so friends hear of it. */
  cellSet(field: BrickMatterField, x: number, y: number, z: number, v: number): void;
  clearAll(): void;
  setFrame(f: VolumeFrame): void;
  dropFrame(id: number): void;
  /** Bricks changed since the last call (their `dirty` flag is cleared). */
  takeDirty(): VolumeBrick[];
  /** Bricks as lists, for saving and for sending to friends. */
  exportBrick(b: VolumeBrick): VolumeBrickData;
  importBrick(d: VolumeBrickData): void;
  /** Every brick that holds anything, for saving. */
  allBricks(): VolumeBrickData[];
}

/** A brick packed as runs of equal cells: [count, value, count, value…] — compact to save and send. */
export interface VolumeBrickData {
  bx: number;
  by: number;
  bz: number;
  shape: number[];
  mat: number[];
  /** Packed fine cells, present only when one of its cells is split. */
  fine?: { shape: number[]; mat: number[] };
  /** Packed cell state, present only when something has happened to the brick's cells. */
  state?: { wet: number[]; fire: number[]; oil: number[]; soot: number[]; frost?: number[]; spent: number[]; wear: number[] };
}

/** What something sees and bumps into where the ray hit. */
export interface VolumeHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  x: number;
  y: number;
  z: number;
  mat: number;
}

/** Writes cells; the structure builder only ever needs this. */
export interface CellWriter {
  set(x: number, y: number, z: number, shape: number, mat: number): void;
  /** Writes a half-metre fine cell (fine coordinates are twice cell coordinates). */
  setFine(fx: number, fy: number, fz: number, shape: number, mat: number): void;
  /** What is already there, so builders can avoid overwriting. */
  shapeAt(x: number, y: number, z: number): number;
}
