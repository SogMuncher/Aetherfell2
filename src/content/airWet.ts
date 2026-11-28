// How damp the air is over a map spot: the land's moisture (coarse) and open water close by (fine), which clouds and mist follow.
/**
 * Both are set by whoever owns the world (the simulation wires its terrain in) and cached per cell, so the sky
 * (render), the rain (sim) and every friend's game read the same values. Each is smooth between its cell centres.
 */
import { SKY } from './sky';

/** Size of one cell of the coarse moisture map clouds read (metres). */
export const MOIST_CELL = 600;
let moistureFn: ((x: number, y: number) => number) | null = null;
const moistCells = new Map<number, number>();
let waterFn: ((x: number, y: number) => number) | null = null;
const waterCells = new Map<number, number>();

/** The world's moisture (0..1 at a point) for clouds and fog to follow; `null` = neutral. */
export function setAirMoisture(fn: ((x: number, y: number) => number) | null): void {
  moistureFn = fn;
  moistCells.clear();
}

/** How far a point is from the edge of open water (metres, below 0 on the water; Infinity when none is near); `null` = no water anywhere. */
export function setAirWater(fn: ((x: number, y: number) => number) | null): void {
  waterFn = fn;
  waterCells.clear();
}

function cached(m: Map<number, number>, ix: number, iy: number, make: () => number): number {
  const k = ix * 65536 + iy;
  let v = m.get(k);
  if (v === undefined) {
    if (m.size > 30000) m.clear();
    v = make();
    m.set(k, v);
  }
  return v;
}

/** Moisture of one coarse cell (cached; 0.5 where the world gives none). */
export function moistCell(ix: number, iy: number): number {
  const fn = moistureFn;
  return fn ? cached(moistCells, ix, iy, () => fn((ix + 0.5) * MOIST_CELL, (iy + 0.5) * MOIST_CELL)) : 0.5;
}

/** Closeness of open water for one cell of `SkyDef.damp` (cached): 1 on the water, 0 beyond its reach. */
export function waterCell(ix: number, iy: number): number {
  const fn = waterFn;
  if (!fn) return 0;
  const d = SKY.damp;
  return cached(waterCells, ix, iy, () => {
    const e = fn((ix + 0.5) * d.cell, (iy + 0.5) * d.cell);
    return Number.isFinite(e) ? Math.max(0, Math.min(1, 1 - e / d.reach)) : 0;
  });
}

function smooth(cell: (ix: number, iy: number) => number, size: number, x: number, y: number): number {
  const gx = x / size - 0.5;
  const gy = y / size - 0.5;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const a = cell(ix, iy);
  const b = cell(ix + 1, iy);
  const c = cell(ix, iy + 1);
  const d = cell(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

/** Smooth moisture of the air over a map spot (0..1; 0.5 where the world gives none). */
export function airMoisture(x: number, y: number): number {
  return moistureFn ? smooth(moistCell, MOIST_CELL, x, y) : 0.5;
}

/** Smooth closeness of open water at a map spot (0..1). */
export function airWater(x: number, y: number): number {
  return waterFn ? smooth(waterCell, SKY.damp.cell, x, y) : 0;
}
