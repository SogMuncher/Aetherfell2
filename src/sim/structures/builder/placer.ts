import { type Rng, type StructureSite, shapeByte, turnCell } from '../../../types';
import { shapeId } from '../../../content/shapes';
import { tileCode } from '../../../content/tiles';


export const CUBE = shapeId('cube');
export const SLAB = shapeId('slabHigh');
export const RAMP = shapeId('ramp');
export const RIDGE = shapeId('ridge');
export const STAIR = shapeId('stair');
export const HIP = shapeId('hip');
export const CAP = shapeId('cap');
export const BRACKET = shapeId('bracket');

export interface Cell {
  x: number;
  y: number;
  z: number;
  /** Position in the structure's own frame, for decay. */
  lx: number;
  ly: number;
  lz: number;
  shape: number;
  mat: number;
}

/** Snaps cells into a structure's own grid, then turns and moves the lot into the world. */
/** A site with every choice made. */
export type Site = Omit<StructureSite, 'z' | 'anchor'> & { z: number };

/** Local cell → offset from the corner, after the quarter turns. */
export const turn = turnCell;

export class Placer {
  readonly cells = new Map<number, Cell>();
  constructor(
    readonly site: Site,
    readonly W: number,
    readonly D: number,
  ) {}

  /** Local position → world cell for the quarter turn in use. */
  world(lx: number, ly: number): [number, number] {
    const [rx, ry] = turn(lx, ly, this.W, this.D, this.site.rot);
    return [this.site.x + rx, this.site.y + ry];
  }

  put(lx: number, ly: number, lz: number, shape: number, turns: number, mat: number): void {
    const [x, y] = this.world(lx, ly);
    const z = this.site.z + lz;
    this.cells.set(key(lx, ly, lz), { x, y, z, lx, ly, lz, shape: shapeByte(shape, turns + this.site.rot), mat });
  }

  cube(lx: number, ly: number, lz: number, mat: number): void {
    this.put(lx, ly, lz, CUBE, 0, mat);
  }

  has(lx: number, ly: number, lz: number): boolean {
    return this.cells.has(key(lx, ly, lz));
  }

  remove(lx: number, ly: number, lz: number): void {
    this.cells.delete(key(lx, ly, lz));
  }
}

export function key(x: number, y: number, z: number): number {
  return (x + 64) * 65536 + (y + 64) * 256 + (z + 64);
}

export function pick(rng: Rng, list: readonly string[] | undefined, fallback: readonly string[]): number {
  const l = list && list.length > 0 ? list : fallback;
  return tileCode(rng.pick(l));
}

export function between(rng: Rng, r: readonly [number, number]): number {
  return r[0] + rng.int(r[1] - r[0] + 1);
}

/** Cheap repeatable noise for ruin decay, so a ruin is the same on every machine. */
export function hash2(a: number, b: number, s: number): number {
  let h = (a * 374761393 + b * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export interface Mats {
  wall: number;
  trim: number;
  floor: number;
  roof: number;
  base: number;
}

export interface Info {
  storeys: number;
  doorX: number;
  stairs: { x: number; y: number; z: number } | null;
  /** Tallest point above the ground floor. */
  height: number;
  /** Rows the staircase uses (local y), or null when there is none. */
  stairRows: readonly [number, number] | null;
  /** Floors you can stand on: 0 = ground. */
  floors: number;
}

/** Fill from the plinth down to the ground under one footprint cell. */
export function plinth(p: Placer, lx: number, ly: number, top: number, mat: number): void {
  const [wx, wy] = p.world(lx, ly);
  const g = p.site.ground ? Math.floor(p.site.ground(wx, wy)) : p.site.z - 2;
  const bottom = Math.max(Math.min(g - 1, p.site.z - 2) - p.site.z, top - 14);
  for (let lz = top; lz >= bottom; lz--) p.cube(lx, ly, lz, mat);
}
