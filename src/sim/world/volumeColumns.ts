// Standing, head room and solidity down one column of the 3D layer, whole cells and fine half-metre cells alike
import { SHAPE_BOTTOM, SHAPE_FINE, SHAPE_SAMPLES, SHAPE_TOP, sampleAt } from '../../content/shapes';

const SC = SHAPE_SAMPLES * SHAPE_SAMPLES;
const SPAN = new Float64Array(4);

export interface ColumnCells {
  shapeAt(x: number, y: number, z: number): number;
  fineAt(fx: number, fy: number, fz: number): number;
}

/** Solid spans of cell (cx, cy, z) at the point (fx, fy) inside it: how many, written low first into SPAN as bottom, top pairs. */
function cellSpans(v: ColumnCells, cx: number, cy: number, z: number, fx: number, fy: number): number {
  const b = v.shapeAt(cx, cy, z);
  if (b === 0) return 0;
  if ((b & 63) !== SHAPE_FINE) {
    const s = b * SC + sampleAt(fx, fy);
    const t = SHAPE_TOP[s] ?? Number.NaN;
    if (Number.isNaN(t)) return 0;
    SPAN[0] = z + (SHAPE_BOTTOM[s] ?? 0);
    SPAN[1] = z + t;
    return 1;
  }
  const i = fx >= 0.5 ? 1 : 0;
  const j = fy >= 0.5 ? 1 : 0;
  const s = sampleAt(fx * 2 - i, fy * 2 - j);
  let n = 0;
  for (let k = 0; k < 2; k++) {
    const fb = v.fineAt(cx * 2 + i, cy * 2 + j, z * 2 + k);
    if (fb === 0) continue;
    const t = SHAPE_TOP[fb * SC + s] ?? Number.NaN;
    if (Number.isNaN(t)) continue;
    SPAN[n * 2] = z + (k + (SHAPE_BOTTOM[fb * SC + s] ?? 0)) / 2;
    SPAN[n * 2 + 1] = z + (k + t) / 2;
    n++;
  }
  return n;
}

/** Highest solid top at or below zMax (not below cell zMin) at this point; `top` is the column's top cell height. */
export function columnFloor(v: ColumnCells, top: number, x: number, y: number, zMax: number, zMin: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let z = Math.min(Math.floor(zMax), top - 1); z >= zMin; z--) {
    const n = cellSpans(v, cx, cy, z, x - cx, y - cy);
    for (let k = n - 1; k >= 0; k--) {
      const t = SPAN[k * 2 + 1] ?? 0;
      if (t <= zMax + 1e-4) return t;
    }
  }
  return -Infinity;
}

/** Lowest solid underside at or above z at this point. */
export function columnCeiling(v: ColumnCells, top: number, x: number, y: number, z: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let zc = Math.floor(z); zc < top; zc++) {
    const n = cellSpans(v, cx, cy, zc, x - cx, y - cy);
    for (let k = 0; k < n; k++) {
      const bot = SPAN[k * 2] ?? 0;
      if (bot >= z - 1e-3) return bot;
    }
  }
  return Infinity;
}

/** Is anything solid at this point between heights z0 and z1? */
export function columnSolid(v: ColumnCells, top: number, x: number, y: number, z0: number, z1: number): boolean {
  if (z0 >= top) return false;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const last = Math.min(Math.floor(z1 - 1e-6), top - 1);
  for (let z = Math.floor(z0); z <= last; z++) {
    const n = cellSpans(v, cx, cy, z, x - cx, y - cy);
    for (let k = 0; k < n; k++) if ((SPAN[k * 2] ?? 0) < z1 && (SPAN[k * 2 + 1] ?? 0) > z0) return true;
  }
  return false;
}
