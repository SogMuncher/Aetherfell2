// Fine cells of the 3D layer: splitting a whole cell into eight half-metre cells and writing one of them
import type { FineCells, VolumeBrick } from '../../types';
import { FINE_CELLS, brickKey, cellIndex, fineIndex, shapeByte } from '../../types';
import { SHAPE_CUBE, SHAPE_FINE, splitShape } from '../../content/shapes';

const FINE_BYTE = shapeByte(SHAPE_FINE, 0);

interface FineStore {
  readonly bricks: ReadonlyMap<number, VolumeBrick>;
  version: number;
  shapeAt(x: number, y: number, z: number): number;
  matAt(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, shape: number, mat: number): boolean;
  touch(b: VolumeBrick): void;
}

const half = (x: number, y: number, z: number, o: number): number => fineIndex(x * 2 + (o & 1), y * 2 + ((o >> 1) & 1), z * 2 + (o >> 2));

/** Puts a fine cell in (fine coordinates). A whole cell is split first: its shape becomes its eight best-matching halves. */
export function setFineCell(v: FineStore, fx: number, fy: number, fz: number, shape: number, mat: number): boolean {
  fx = Math.floor(fx);
  fy = Math.floor(fy);
  fz = Math.floor(fz);
  const x = fx >> 1;
  const y = fy >> 1;
  const z = fz >> 1;
  const cur = v.shapeAt(x, y, z);
  if ((cur & 63) !== SHAPE_FINE) {
    if (cur === 0 && shape === 0) return false;
    const m0 = cur === 0 ? mat : v.matAt(x, y, z);
    const halves = cur === 0 ? new Uint8Array(8) : splitShape(cur);
    v.set(x, y, z, FINE_BYTE, m0);
    const b = v.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
    if (!b) return false;
    const f = (b.fine ??= { shape: new Uint8Array(FINE_CELLS), mat: new Uint8Array(FINE_CELLS) });
    for (let o = 0; o < 8; o++) {
      const i = half(x, y, z, o);
      f.shape[i] = halves[o] ?? 0;
      f.mat[i] = (halves[o] ?? 0) === 0 ? 0 : m0;
    }
  }
  const b = v.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
  const f = b?.fine;
  if (!b || !f) return false;
  const i = fineIndex(fx, fy, fz);
  if (f.shape[i] === shape && (shape === 0 || f.mat[i] === mat)) return false;
  f.shape[i] = shape;
  f.mat[i] = shape === 0 ? 0 : mat;
  // The whole cell is made of the most common stuff among its halves; with none left it is empty.
  const tally = new Map<number, number>();
  for (let o = 0; o < 8; o++) {
    const k = half(x, y, z, o);
    if ((f.shape[k] ?? 0) !== 0) tally.set(f.mat[k] ?? 0, (tally.get(f.mat[k] ?? 0) ?? 0) + 1);
  }
  if (tally.size === 0) return v.set(x, y, z, 0, 0);
  // Eight blocks of one stuff are just a whole block again.
  if (tally.size === 1 && [0, 1, 2, 3, 4, 5, 6, 7].every((o) => ((f.shape[half(x, y, z, o)] ?? 0) & 63) === SHAPE_CUBE)) return v.set(x, y, z, SHAPE_CUBE, mat);
  let main = mat;
  let most = 0;
  for (const [m, n] of tally) if (n > most) [main, most] = [m, n];
  b.mat[cellIndex(x, y, z)] = main;
  v.touch(b);
  v.version++;
  return true;
}

/** A split cell set again: as fine cells it changes stuff (burnt, frozen…) from `from` to `to`; as a whole shape its halves go. */
export function refineCell(f: FineCells, x: number, y: number, z: number, shape: number, from: number, to: number): void {
  for (let o = 0; o < 8; o++) {
    const k = half(x, y, z, o);
    if ((shape & 63) !== SHAPE_FINE) {
      f.shape[k] = 0;
      f.mat[k] = 0;
    } else if (f.mat[k] === from) f.mat[k] = to;
  }
}
