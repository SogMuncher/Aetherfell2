// Is a swept hull tight? Fills its fine cells' real shapes at an eighth of a metre and floods the outside air: none may reach its hollows
import { sweep, type Sweep } from '../src/content/hullSweep';
import { SHAPE_COUNT, SHAPE_PIECES, SHAPE_START, shapeId } from '../src/content/shapes';
import { shapeByte } from '../src/types';

const PF = 23;
const R = 4;

function inPiece(pc: number, x: number, y: number, z: number): boolean {
  const o = pc * PF;
  const p = (k: number): number => SHAPE_PIECES[o + k] ?? 0;
  if (x < p(0) || y < p(1) || z < p(2) || x > p(3) || y > p(4) || z > p(5)) return false;
  for (let c = 0; c < p(6); c++) {
    const b = 7 + c * 4;
    if (p(b) * x + p(b + 1) * y + p(b + 2) * z > p(b + 3) + 1e-6) return false;
  }
  return true;
}

/** Sub-voxels of open air reachable from outside the sweep's box that lie in a hollow (inside the solid, not kept). */
export function leaks(s: Sweep): { count: number; at: string } {
  const cells = sweep(s);
  const [fx, fy, fz] = s.from;
  const nx = Math.round((s.to[0] - fx) * 2 * R) + 2;
  const ny = Math.round((s.to[1] - fy) * 2 * R) + 2;
  const nz = Math.round((s.to[2] - fz) * 2 * R) + 2;
  const byte = new Map<string, number>();
  for (const c of cells) byte.set(`${c.from[0]},${c.from[1]},${c.from[2]}`, shapeByte(shapeId(c.shape ?? 'cube'), c.rot ?? 0));
  const idx = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  const solid = new Uint8Array(nx * ny * nz);
  const world = (i: number, f: number): number => f + (i - 1 + 0.5) / (2 * R);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = world(i, fx);
    const y = world(j, fy);
    const z = world(k, fz);
    const cx = Math.floor(x * 2) / 2;
    const cy = Math.floor(y * 2) / 2;
    const cz = Math.floor(z * 2) / 2;
    const b = byte.get(`${cx},${cy},${cz}`);
    if (b === undefined) continue;
    const st = SHAPE_START[b] ?? 0;
    for (let q = 0; q < (SHAPE_COUNT[b] ?? 0); q++) if (inPiece(st + q, (x - cx) * 2, (y - cy) * 2, (z - cz) * 2)) solid[idx(i, j, k)] = 1;
  }
  const seen = new Uint8Array(nx * ny * nz);
  const stack: number[] = [0];
  seen[0] = 1;
  let count = 0;
  let at = '';
  while (stack.length) {
    const n = stack.pop() as number;
    const i = n % nx;
    const j = Math.floor(n / nx) % ny;
    const k = Math.floor(n / (nx * ny));
    const x = world(i, fx);
    const y = world(j, fy);
    const z = world(k, fz);
    if (s.solid(Math.floor(x * 2) / 2 + 0.25, Math.floor(y * 2) / 2 + 0.25, Math.floor(z * 2) / 2 + 0.25) && !byte.has(`${Math.floor(x * 2) / 2},${Math.floor(y * 2) / 2},${Math.floor(z * 2) / 2}`)) {
      count++;
      if (!at) at = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
      continue;
    }
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const a = i + di;
      const b = j + dj;
      const c = k + dk;
      if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
      const m = idx(a, b, c);
      if (seen[m] || solid[m]) continue;
      seen[m] = 1;
      stack.push(m);
    }
  }
  return { count, at };
}
