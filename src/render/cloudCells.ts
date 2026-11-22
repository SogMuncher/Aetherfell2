/**
 * Cloud cells: the sky's cloud layers kept as 3D cells around the eye, the way structures are cells. Each layer (any
 * entry in content/sky.ts) gets a stack of levels: a square of `count` × `count` columns, `slices` cells through the
 * layer's thickness, every level twice the cell size of the one below it, until the coarsest reaches `cloudRange`. Near
 * clouds keep their billows, far ones cost almost nothing, and all of them come from the one density rule
 * (`cloudColumn` in content/skyField.ts), so rain, shade and what you see agree.
 *
 * Cells sit in each layer's own drifting frame (clouds move with the wind without refilling). A level is refilled a few
 * rows per frame (`cells.budget`) when the eye has moved an eighth of its width, when it is older than `cells.refresh`
 * seconds (weather changes), or first of all when it is empty (coarse first, so the sky fills in quickly). A finished
 * level is swapped in whole; `version` tells the drawer to upload it. Render-side data only: the sim never sees it.
 */
import { CONTENT, cloudColumn, layerCover } from '../content';
import type { CloudLayerDef, SkyDef, WeatherState } from '../types';

/** A flat sheet (no thickness) is kept as a thin slab this tall (metres). */
const FLAT = 30;
/** Share of a level's half width that is always inside it (it may lag an eighth behind the eye). */
export const CLOUD_REACH = 0.35;

export interface CloudLevel {
  layer: number;
  level: number;
  /** Cell width (metres) and how many cells through the thickness. */
  cell: number;
  slices: number;
  /** Corner of the square in the layer's drifting frame (metres); NaN until first filled. */
  ox: number;
  oy: number;
  version: number;
  builtAt: number;
  /** Density 0..255, index (slice × count + row) × count + column. */
  data: Uint8Array;
}

export interface CloudLayerCells {
  def: CloudLayerDef;
  /** Index of its finest level in `levels`, how many it has, cells through it, finest cell width. */
  first: number;
  count: number;
  slices: number;
  cell0: number;
  base: number;
  thick: number;
}

interface Job {
  lv: CloudLevel;
  ox: number;
  oy: number;
  row: number;
  w: WeatherState;
  cover: number;
  buf: Uint8Array;
}

export class CloudCells {
  readonly n: number;
  readonly layers: CloudLayerCells[] = [];
  readonly levels: CloudLevel[] = [];
  private job: Job | null = null;

  constructor(readonly sky: SkyDef = CONTENT.sky) {
    const c = sky.cells;
    this.n = c.count;
    // High to low, so a drawer can lay nearer (lower) layers over farther ones.
    const defs = [...sky.layers].sort((a, b) => b.height - a.height);
    for (const def of defs) {
      const thick = Math.max(FLAT, def.thickness ?? 0);
      const cell0 = def.scale / c.perShape;
      const slices = Math.max(2, Math.min(c.slices, Math.ceil((thick / cell0) * 2)));
      const count = Math.max(1, Math.ceil(Math.log2(sky.cloudRange / (CLOUD_REACH * c.count * cell0))) + 1);
      const li = this.layers.length;
      this.layers.push({ def, first: this.levels.length, count, slices, cell0, base: def.height, thick });
      for (let k = 0; k < count; k++) {
        this.levels.push({ layer: li, level: k, cell: cell0 * 2 ** k, slices, ox: NaN, oy: NaN, version: 0, builtAt: -1e9, data: new Uint8Array(c.count * c.count * slices) });
      }
    }
  }

  /** Spends up to `budget` cells refilling the level that needs it most. `time` in seconds. */
  update(weather: WeatherState, ex: number, ey: number, time: number, budget = this.sky.cells.budget): void {
    let left = budget;
    while (left > 0) {
      this.job ??= this.pick(weather, ex, ey, time);
      const j = this.job;
      if (!j) return;
      left -= this.fillRow(j);
      if (j.row >= this.n) {
        j.lv.data.set(j.buf);
        j.lv.ox = j.ox;
        j.lv.oy = j.oy;
        j.lv.builtAt = time;
        j.lv.version++;
        this.job = null;
      }
    }
  }

  /** Fills every level now (tests, first frame of a headless shot). */
  fillAll(weather: WeatherState, ex: number, ey: number, time = 0): void {
    for (let i = 0; i < this.levels.length * 2 && this.levels.some((l) => l.version === 0); i++) this.update(weather, ex, ey, time, 1e9);
  }

  /** Density 0..1 of a layer at a world point and height through it (0..1), from the finest level that holds it. */
  sample(li: number, weather: WeatherState, x: number, y: number, hf: number): number {
    const L = this.layers[li];
    if (!L) return 0;
    const sp = L.def.speed;
    const u = x - (weather.drift?.x ?? 0) * sp;
    const v = y - (weather.drift?.y ?? 0) * sp;
    const n = this.n;
    for (let k = 0; k < L.count; k++) {
      const lv = this.levels[L.first + k];
      if (!lv || lv.version === 0) continue;
      const gx = (u - lv.ox) / lv.cell - 0.5;
      const gy = (v - lv.oy) / lv.cell - 0.5;
      if (gx < 0.5 || gy < 0.5 || gx > n - 1.5 || gy > n - 1.5) continue;
      const gz = Math.max(0, Math.min(lv.slices - 1, hf * lv.slices - 0.5));
      const i = Math.floor(gx);
      const j = Math.floor(gy);
      const kz = Math.min(lv.slices - 2, Math.floor(gz));
      const fx = gx - i;
      const fy = gy - j;
      const fz = gz - kz;
      const at = (a: number, b: number, c: number): number => lv.data[((kz + c) * n + j + b) * n + i + a] ?? 0;
      const lerp2 = (c: number): number => {
        const p = at(0, 0, c) + (at(1, 0, c) - at(0, 0, c)) * fx;
        const q = at(0, 1, c) + (at(1, 1, c) - at(0, 1, c)) * fx;
        return p + (q - p) * fy;
      };
      const z0 = lerp2(0);
      return (z0 + (lerp2(1) - z0) * fz) / 255;
    }
    return 0;
  }

  private pick(w: WeatherState, ex: number, ey: number, time: number): Job | null {
    const n = this.n;
    let best: CloudLevel | null = null;
    let score = 0;
    for (const lv of this.levels) {
      const L = this.layers[lv.layer];
      if (!L) continue;
      const c = this.centre(L, lv, w, ex, ey);
      const off = Math.max(Math.abs(c[0] - lv.ox), Math.abs(c[1] - lv.oy)) / lv.cell;
      // Empty first (coarse before fine), then left behind by the eye (fine before coarse), then old.
      const s = lv.version === 0 ? 3000 + lv.level : off >= n / 8 ? 2000 - lv.level : time - lv.builtAt >= this.sky.cells.refresh ? 1000 + (time - lv.builtAt) / 1e6 : 0;
      if (s > score) {
        score = s;
        best = lv;
      }
    }
    if (!best) return null;
    const L = this.layers[best.layer];
    if (!L) return null;
    const [ox, oy] = this.centre(L, best, w, ex, ey);
    return { lv: best, ox, oy, row: 0, w: { ...w, drift: { x: w.drift?.x ?? 0, y: w.drift?.y ?? 0 } }, cover: layerCover(L.def, w), buf: new Uint8Array(best.data.length) };
  }

  /** Where a level's corner should sit now: the eye in the layer's drifting frame, snapped to whole cells. */
  private centre(L: CloudLayerCells, lv: CloudLevel, w: WeatherState, ex: number, ey: number): [number, number] {
    const sp = L.def.speed;
    const half = this.n / 2;
    return [(Math.floor((ex - (w.drift?.x ?? 0) * sp) / lv.cell) - half) * lv.cell, (Math.floor((ey - (w.drift?.y ?? 0) * sp) / lv.cell) - half) * lv.cell];
  }

  private fillRow(j: Job): number {
    const n = this.n;
    const lv = j.lv;
    const L = this.layers[lv.layer];
    if (!L) {
      j.row = n;
      return 1;
    }
    const sp = L.def.speed;
    const dx = (j.w.drift?.x ?? 0) * sp;
    const dy = (j.w.drift?.y ?? 0) * sp;
    const y = j.oy + (j.row + 0.5) * lv.cell + dy;
    for (let i = 0; i < n; i++) cloudColumn(L.def, j.w, j.cover, j.ox + (i + 0.5) * lv.cell + dx, y, lv.slices, j.buf, j.row * n + i, n * n);
    j.row++;
    return n * lv.slices;
  }
}
