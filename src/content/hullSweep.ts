// Curved hulls as fine cells: every half-metre cell inside a solid is kept where it shows, shaped by which sides face the air
import type { HullBox } from '../types';

/** Is this point (metres, in the craft's own box) inside the solid? */
export type Inside = (x: number, y: number, z: number) => boolean;

export interface Sweep {
  /** The whole solid, filled. Shapes are picked from it, so inner hollows (a hold) keep flat walls. */
  solid: Inside;
  /** Which cells to keep, given the cell's centre and whether it touches the open air (the shell always shows). */
  keep: (x: number, y: number, z: number, edge: boolean) => boolean;
  mat: string;
  /** The box to sweep (metres, on the half-metre grid). */
  from: readonly [number, number, number];
  to: readonly [number, number, number];
}

const H = 0.5;

/**
 * One fine cell for every half-metre cell of the solid that is kept. Its shape follows the surface: a side open below
 * and to one side is a bilge (curving in underneath), open above and to one side a rounded slope, open on two sides
 * seen from above a rounded corner, anything else a block. Quarter turns put the solid side toward the inside.
 */
export function sweep(s: Sweep): HullBox[] {
  const out: HullBox[] = [];
  for (let x = s.from[0]; x < s.to[0]; x += H) {
    for (let y = s.from[1]; y < s.to[1]; y += H) {
      for (let z = s.from[2]; z < s.to[2]; z += H) {
        const cx = x + H / 2;
        const cy = y + H / 2;
        const cz = z + H / 2;
        if (!s.solid(cx, cy, cz)) continue;
        const air = (dx: number, dy: number, dz: number): boolean => !s.solid(cx + dx * H, cy + dy * H, cz + dz * H);
        const sx = air(1, 0, 0) === air(-1, 0, 0) ? 0 : air(1, 0, 0) ? 1 : -1;
        const sy = air(0, 1, 0) === air(0, -1, 0) ? 0 : air(0, 1, 0) ? 1 : -1;
        const up = air(0, 0, 1);
        const down = air(0, 0, -1);
        const edge = up || down || air(1, 0, 0) || air(-1, 0, 0) || air(0, 1, 0) || air(0, -1, 0);
        if (!s.keep(cx, cy, cz, edge)) continue;
        const [shape, rot] = pick(sx, sy, up, down);
        out.push({ from: [x, y, z], to: [x + H, y + H, z + H], shape, rot, mat: s.mat, fine: true });
      }
    }
  }
  return out;
}

/** Quarter turns that point a shape's +x side (its solid, high side) inward, away from the air at (sx, sy). */
function inward(sx: number, sy: number): number {
  if (sy !== 0) return sy < 0 ? 1 : 3;
  return sx < 0 ? 0 : 2;
}

function pick(sx: number, sy: number, up: boolean, down: boolean): [string, number] {
  if (down !== up && (sx !== 0 || sy !== 0)) return [down ? 'bilge' : 'roundRamp', inward(sx, sy)];
  // Seen from above, open on two sides: a rounded corner, its round side toward the air.
  if (sx !== 0 && sy !== 0) return ['roundCorner', sx > 0 ? (sy > 0 ? 0 : 3) : sy > 0 ? 1 : 2];
  return ['cube', 0];
}
