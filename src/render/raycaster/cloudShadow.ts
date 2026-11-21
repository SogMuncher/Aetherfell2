import type { WeatherState } from '../../types';
import { CONTENT, sunThrough } from '../../content';

const SIZE = 128;
const CELL = 48;

/**
 * Shadows of the clouds on the land: a coarse grid of "how much sun gets through" around the eye,
 * made from the same cloud field the sky is drawn from, so the shadow sits under its cloud and
 * drifts with it. Rebuilt every few frames (clouds move slowly); beyond the grid the land gets the
 * average. Read in the terrain's hot loop, so `at` is a plain array lookup.
 */
export class CloudShadow {
  private grid = new Float32Array(SIZE * SIZE).fill(1);
  private ox = 0;
  private oy = 0;
  private mean = 1;
  private frame = 0;
  /** The grid being filled in, and its origin and totals so far. */
  private next = new Float32Array(SIZE * SIZE).fill(1);
  private nx = 0;
  private ny = 0;
  private sum = 0;
  private lowest = 1;
  /** Off when nothing casts a shadow (clear sky), so the terrain can skip the lookup. */
  active = false;

  /** A quarter of the grid per frame, so no frame pays for all of it. */
  update(w: WeatherState, camX: number, camY: number): void {
    const part = this.frame++ % 4;
    if (part === 0) {
      this.nx = Math.floor(camX / CELL) - SIZE / 2;
      this.ny = Math.floor(camY / CELL) - SIZE / 2;
      this.sum = 0;
      this.lowest = 1;
    }
    const rows = SIZE / 4;
    for (let j = part * rows; j < (part + 1) * rows; j++) {
      for (let i = 0; i < SIZE; i++) {
        const v = sunThrough(CONTENT.sky, w, (this.nx + i + 0.5) * CELL, (this.ny + j + 0.5) * CELL);
        this.next[j * SIZE + i] = v;
        this.sum += v;
        if (v < this.lowest) this.lowest = v;
      }
    }
    if (part === 3) {
      const t = this.grid;
      this.grid = this.next;
      this.next = t;
      this.ox = this.nx;
      this.oy = this.ny;
      this.mean = this.sum / (SIZE * SIZE);
      this.active = this.lowest < 0.99;
    }
  }

  /** The grid as it stands (for a drawer that reads it as a texture): values, origin in grid cells, cell and grid size, average. */
  get state(): { grid: Float32Array; ox: number; oy: number; cell: number; size: number; mean: number } {
    return { grid: this.grid, ox: this.ox, oy: this.oy, cell: CELL, size: SIZE, mean: this.mean };
  }

  /** Share of sunlight reaching (x, y): 1 in the open, lower in a cloud's shadow. */
  at(x: number, y: number): number {
    const gx = x / CELL - this.ox - 0.5;
    const gy = y / CELL - this.oy - 0.5;
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    if (i < 0 || j < 0 || i >= SIZE - 1 || j >= SIZE - 1) return this.mean;
    const fx = gx - i;
    const fy = gy - j;
    const k = j * SIZE + i;
    const a = this.grid[k] ?? 1;
    const b = this.grid[k + 1] ?? 1;
    const c = this.grid[k + SIZE] ?? 1;
    const d = this.grid[k + SIZE + 1] ?? 1;
    return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
  }
}
