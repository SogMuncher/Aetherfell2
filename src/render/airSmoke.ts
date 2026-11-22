/**
 * Smoke: the live level of the air cells. A box of `smoke.count` × `smoke.count` × `smoke.tall` cells round the eye, in
 * the wind's drifting frame like every air cell (so the wind carries the smoke without moving a cell), stored wrapped
 * (moving clears only the cells that came into reach). Anything burning puts smoke into the cell above it (matter state
 * look `smoke`: fire on the ground and in the 3D layer); every `smoke.step` seconds smoke rises, spreads to its four
 * sides and thins, and only the box that holds smoke is worked on, so no fire costs nothing. Render-side only: the
 * sim's fire is the source of truth, every friend sees smoke from the same fires.
 */
import { CONTENT } from '../content';
import type { ReadonlyTiles, ReadonlyVolume, WeatherState } from '../types';
import { unpackKey, unpackSpot } from '../types';

const mod = (a: number, n: number): number => ((a % n) + n) % n;

export class AirSmoke {
  readonly n: number;
  readonly tall: number;
  readonly cell: number;
  /** Window corner in whole cells of the drifting frame; NaN until placed. */
  ox = NaN;
  oy = NaN;
  oz = NaN;
  /** Smoke 0..1 per cell, slot ((z mod tall) × n + (y mod n)) × n + (x mod n). */
  readonly s: Float32Array;
  /** The same as bytes for the drawer; `version` goes up when they change. */
  readonly bytes: Uint8Array;
  version = 0;
  /** Cells that hold smoke, as a box in whole cells (empty when lo > hi). */
  private box = [1, 0, 1, 0, 1, 0];
  private acc = 0;
  private readonly tmp: Float32Array;

  constructor() {
    const S = CONTENT.sky.smoke;
    this.n = S.count;
    this.tall = S.tall;
    this.cell = S.cell;
    this.s = new Float32Array(S.count * S.count * S.tall);
    this.bytes = new Uint8Array(this.s.length);
    this.tmp = new Float32Array(this.s.length);
  }

  get active(): boolean {
    return this.box[0]! <= this.box[1]!;
  }

  private slot(x: number, y: number, z: number): number {
    return (mod(z, this.tall) * this.n + mod(y, this.n)) * this.n + mod(x, this.n);
  }

  private inside(x: number, y: number, z: number): boolean {
    return x >= this.ox && y >= this.oy && z >= this.oz && x < this.ox + this.n && y < this.oy + this.n && z < this.oz + this.tall;
  }

  /** Smoke (0..1) at a world point, 0 outside the box. */
  at(w: WeatherState, x: number, y: number, z: number): number {
    const gx = Math.floor((x - (w.drift?.x ?? 0)) / this.cell);
    const gy = Math.floor((y - (w.drift?.y ?? 0)) / this.cell);
    const gz = Math.floor(z / this.cell);
    return this.inside(gx, gy, gz) ? this.s[this.slot(gx, gy, gz)] ?? 0 : 0;
  }

  /** Keeps the box round the eye, adds smoke from what burns, and moves the smoke on by whole steps. */
  update(dt: number, w: WeatherState, ex: number, ey: number, ez: number, tiles: ReadonlyTiles, burning: ReadonlySet<number>, volume: ReadonlyVolume): void {
    const S = CONTENT.sky.smoke;
    const dx = w.drift?.x ?? 0;
    const dy = w.drift?.y ?? 0;
    const n = this.n;
    // More room above the eye than below: smoke rises.
    const tx = Math.floor((ex - dx) / this.cell) - n / 2;
    const ty = Math.floor((ey - dy) / this.cell) - n / 2;
    const tz = Math.floor(ez / this.cell) - this.tall / 4;
    if (!(Math.abs(tx - this.ox) < n / 8 && Math.abs(ty - this.oy) < n / 8 && Math.abs(tz - this.oz) < this.tall / 8)) this.move(tx, ty, tz);
    this.acc = Math.min(this.acc + dt, S.step * 4);
    let changed = false;
    while (this.acc >= S.step) {
      this.acc -= S.step;
      changed = this.feed(S.step, w, tiles, burning, volume) || changed;
      if (this.active) {
        this.spread(S.step);
        changed = true;
      }
    }
    if (changed) {
      for (let i = 0; i < this.s.length; i++) this.bytes[i] = Math.min(255, Math.round((this.s[i] ?? 0) * 255));
      this.version++;
    }
  }

  /** Moves the window; cells that came into reach start clear. */
  private move(tx: number, ty: number, tz: number): void {
    const n = this.n;
    const T = this.tall;
    if (!Number.isFinite(this.ox) || !(Math.abs(tx - this.ox) < n && Math.abs(ty - this.oy) < n && Math.abs(tz - this.oz) < T)) {
      this.s.fill(0);
      this.box = [1, 0, 1, 0, 1, 0];
    } else {
      for (let z = tz; z < tz + T; z++) for (let y = ty; y < ty + n; y++) for (let x = tx; x < tx + n; x++) if (!this.inside(x, y, z)) this.s[this.slot(x, y, z)] = 0;
    }
    this.ox = tx;
    this.oy = ty;
    this.oz = tz;
    const b = this.box;
    this.box = [Math.max(b[0]!, tx), Math.min(b[1]!, tx + n - 1), Math.max(b[2]!, ty), Math.min(b[3]!, ty + n - 1), Math.max(b[4]!, tz), Math.min(b[5]!, tz + T - 1)];
    this.version++;
  }

  private add(w: WeatherState, x: number, y: number, z: number, amount: number): boolean {
    const gx = Math.floor((x - (w.drift?.x ?? 0)) / this.cell);
    const gy = Math.floor((y - (w.drift?.y ?? 0)) / this.cell);
    const gz = Math.floor(z / this.cell);
    if (!this.inside(gx, gy, gz)) return false;
    const i = this.slot(gx, gy, gz);
    this.s[i] = Math.min(1, (this.s[i] ?? 0) + amount);
    const b = this.box;
    if (b[0]! > b[1]!) this.box = [gx, gx, gy, gy, gz, gz];
    else this.box = [Math.min(b[0]!, gx), Math.max(b[1]!, gx), Math.min(b[2]!, gy), Math.max(b[3]!, gy), Math.min(b[4]!, gz), Math.max(b[5]!, gz)];
    return true;
  }

  /** Smoke from every burning spot in reach: the fire's strength × its look's `smoke` × the step. */
  private feed(dt: number, w: WeatherState, tiles: ReadonlyTiles, burning: ReadonlySet<number>, volume: ReadonlyVolume): boolean {
    const per = (CONTENT.matterStates.fire.smoke ?? 0) * dt;
    if (per <= 0) return false;
    let any = false;
    for (const key of burning) {
      const { x, y } = unpackKey(key);
      any = this.add(w, x + 0.5, y + 0.5, tiles.ground(x + 0.5, y + 0.5) + 0.5, (tiles.fire(x, y) / 255) * per) || any;
    }
    for (const key of volume.burningCells) {
      const { x, y, z } = unpackSpot(key);
      any = this.add(w, x + 0.5, y + 0.5, z + 1.5, (volume.cellGet('fire', x, y, z) / 255) * per) || any;
    }
    return any;
  }

  /** One step: each cell keeps what does not rise or spread, gives `rise` up and `spread` to each side, then thins. */
  private spread(dt: number): void {
    const S = CONTENT.sky.smoke;
    const up = Math.min(0.9, (S.rise * dt) / this.cell);
    const side = S.spread;
    const keep = Math.max(0, 1 - up - side * 4);
    const thin = Math.max(0, 1 - S.fade * dt);
    const b = this.box;
    // Work on the box grown by one cell (where smoke can go), inside the window.
    const x0 = Math.max(this.ox, b[0]! - 1);
    const x1 = Math.min(this.ox + this.n - 1, b[1]! + 1);
    const y0 = Math.max(this.oy, b[2]! - 1);
    const y1 = Math.min(this.oy + this.n - 1, b[3]! + 1);
    const z0 = Math.max(this.oz, b[4]!);
    const z1 = Math.min(this.oz + this.tall - 1, b[5]! + 1);
    const s = this.s;
    const t = this.tmp;
    const get = (x: number, y: number, z: number): number => (this.inside(x, y, z) ? s[this.slot(x, y, z)] ?? 0 : 0);
    let nb: number[] = [1, 0, 1, 0, 1, 0];
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const v = (get(x, y, z) * keep + get(x, y, z - 1) * up + (get(x - 1, y, z) + get(x + 1, y, z) + get(x, y - 1, z) + get(x, y + 1, z)) * side) * thin;
          const c = v < 0.001 ? 0 : v;
          t[this.slot(x, y, z)] = c;
          if (c > 0) nb = nb[0]! > nb[1]! ? [x, x, y, y, z, z] : [Math.min(nb[0]!, x), Math.max(nb[1]!, x), Math.min(nb[2]!, y), Math.max(nb[3]!, y), Math.min(nb[4]!, z), Math.max(nb[5]!, z)];
        }
      }
    }
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = this.slot(x, y, z); s[i] = t[i] ?? 0; }
    this.box = nb;
  }
}
