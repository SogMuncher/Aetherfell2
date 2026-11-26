/**
 * Air cells: the air around the eye as ONE grid of cubic cells that every sky layer (clouds up high, mist down low, any
 * entry in content/sky.ts) writes its cloud into through `airColumn`, the one density rule that rain, cloud shade and
 * the in-cloud fog also read. Like the land's far detail it is a stack of levels, each `count` × `count` × `tall` cells
 * centred on the eye (kept inside the layers' band of heights) and twice as wide as the one below, so near air is fine
 * blocks and far air merges into wide flat clumps.
 *
 * Cells are kept in the wind's drifting frame (clouds move with the wind without a refill) and stored wrapped around
 * (a cell's slot is its grid position modulo the level size), so when the eye moves only the cells that came into reach
 * are filled; nothing else is touched. A level is also refilled whole when it is older than `air.refresh` × (level + 1)
 * seconds (the weather changed; far levels less often). At most `air.budget` cells are filled per frame (`air.rush` ×
 * that while a level the eye left behind catches up, nearest first, ahead of any weather refill); a finished job
 * bumps the level's `version` and only then moves its window, so a drawer always sees a whole, consistent level.
 * Render-side data only: the sim never sees it.
 */
import { CONTENT, airColumn, layerCover } from '../content';
import type { SkyDef, WeatherState } from '../types';

export interface AirLevel {
  k: number;
  /** Cell width and height (metres). Height stops growing once a level's `tall` cells span every layer, so far
   * cells merge sideways into wide flat clumps instead of swelling a thin sheet into a tower. */
  cell: number;
  cellZ: number;
  /** Corner of the window in whole cells of the drifting frame (z from sea level); NaN until first filled. */
  ox: number;
  oy: number;
  oz: number;
  version: number;
  builtAt: number;
  /** Each layer's cover and the rain when it was last built whole (a refresh waits until the weather really changed). */
  built: number[];
  /** Density and brightness 0..255 per cell, slot ((z mod tall) × count + (y mod count)) × count + (x mod count), 2 bytes each. */
  data: Uint8Array;
}

/** A box of cells to fill, in whole cells of the drifting frame (ends excluded). */
type Box = [number, number, number, number, number, number];

interface Job {
  lv: AirLevel;
  boxes: Box[];
  bi: number;
  /** Next column of the current box, counted from its corner. */
  col: number;
  ox: number;
  oy: number;
  oz: number;
  full: boolean;
  /** The level is empty or the eye left it behind: it goes before weather refills and gets `air.rush` × the budget. */
  urgent: boolean;
  w: WeatherState;
  covers: number[];
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Lowest and highest height any sky layer reaches (metres). */
export function airBand(sky: SkyDef): [number, number] {
  return [Math.min(...sky.layers.map((l) => l.height)), Math.max(...sky.layers.map((l) => l.height + Math.max(30, l.thickness ?? 0)))];
}

export class AirCells {
  readonly n: number;
  readonly tall: number;
  readonly levels: AirLevel[] = [];
  /** Lowest and highest height any layer reaches. */
  readonly lo: number;
  readonly hi: number;
  /** Cells filled since the start (tests and the debug readout). */
  filled = 0;
  private job: Job | null = null;
  /** A weather refill set aside while a level the eye left behind catches up. */
  private waiting: Job | null = null;
  private readonly dens: Float32Array;
  private readonly lite: Float32Array;

  constructor(readonly sky: SkyDef = CONTENT.sky) {
    const a = sky.air;
    this.n = a.count;
    this.tall = a.tall;
    this.dens = new Float32Array(a.tall);
    this.lite = new Float32Array(a.tall);
    // Enough levels that the coarsest reaches the far clouds.
    const count = Math.max(1, Math.ceil(Math.log2(sky.cloudRange / (a.lod * a.cell))) + 1);
    const band = airBand(sky);
    const capZ = Math.max(a.cell, (band[1] - band[0]) / a.tall);
    this.lo = band[0];
    this.hi = band[1];
    for (let k = 0; k < count; k++) this.levels.push({ k, cell: a.cell * 2 ** k, cellZ: Math.min(a.cell * 2 ** k, capZ), ox: NaN, oy: NaN, oz: NaN, version: 0, builtAt: -1e9, built: [], data: new Uint8Array(a.count * a.count * a.tall * 2) });
  }

  /** The drifting frame: a world point minus this is where its air sits in the grid. */
  static frame(w: WeatherState): [number, number] {
    return [w.drift?.x ?? 0, w.drift?.y ?? 0];
  }

  /** Spends up to `budget` cells (`air.rush` × that while a level catches up with the eye) on the level that needs it
   * most. A weather refill never holds up a level the eye left behind: it waits, or is dropped if it is that level. */
  update(weather: WeatherState, ex: number, ey: number, ez: number, time: number, budget = this.sky.air.budget): void {
    if (this.job && !this.job.urgent) {
      const m = this.pick(weather, ex, ey, ez, time);
      if (m?.urgent) {
        this.waiting = m.lv === this.job.lv ? null : this.job;
        this.job = m;
      }
    }
    let spent = 0;
    while (spent < (this.job?.urgent ? budget * this.sky.air.rush : budget)) {
      this.job ??= this.next(weather, ex, ey, ez, time);
      const j = this.job;
      if (!j) return;
      spent += this.fillColumn(j);
      if (j.bi >= j.boxes.length) {
        const lv = j.lv;
        lv.ox = j.ox;
        lv.oy = j.oy;
        lv.oz = j.oz;
        if (j.full) {
          lv.builtAt = time;
          lv.built = [...j.covers, j.w.rain];
        }
        lv.version++;
        this.job = null;
      }
    }
  }

  /** The next job: an urgent one first, else the refill that was set aside, else whatever is due. */
  private next(w: WeatherState, ex: number, ey: number, ez: number, time: number): Job | null {
    const j = this.pick(w, ex, ey, ez, time);
    const wait = this.waiting;
    if (j?.urgent || !wait) {
      if (j && wait?.lv === j.lv) this.waiting = null;
      return j;
    }
    this.waiting = null;
    return wait;
  }

  /** Fills every level now (tests, first frame of a headless shot). */
  fillAll(weather: WeatherState, ex: number, ey: number, ez: number, time = 0): void {
    for (let i = 0; i < this.levels.length * 2 && (this.job || this.levels.some((l) => l.version === 0)); i++) this.update(weather, ex, ey, ez, time, 1e9);
  }

  /** Density (0..1) of the finest level holding a world point, or -1 when no level holds it. */
  sample(weather: WeatherState, x: number, y: number, z: number): number {
    const [dx, dy] = AirCells.frame(weather);
    for (const lv of this.levels) {
      if (lv.version === 0) continue;
      const gx = Math.floor((x - dx) / lv.cell);
      const gy = Math.floor((y - dy) / lv.cell);
      const gz = Math.floor(z / lv.cellZ);
      if (gx < lv.ox || gy < lv.oy || gz < lv.oz || gx >= lv.ox + this.n || gy >= lv.oy + this.n || gz >= lv.oz + this.tall) continue;
      return (lv.data[this.slot(gx, gy, gz) * 2] ?? 0) / 255;
    }
    return -1;
  }

  private slot(gx: number, gy: number, gz: number): number {
    return (mod(gz, this.tall) * this.n + mod(gy, this.n)) * this.n + mod(gx, this.n);
  }

  /** Where a level's window should sit now: the eye in the drifting frame, in whole cells, at the window's middle. */
  private target(lv: AirLevel, w: WeatherState, ex: number, ey: number, ez: number): [number, number, number] {
    const [dx, dy] = AirCells.frame(w);
    // Vertically the window stays inside the band of heights the layers use (no cells spent on empty air).
    const zlo = Math.floor(this.lo / lv.cellZ);
    const zhi = Math.max(zlo, Math.ceil(this.hi / lv.cellZ) - this.tall);
    const oz = Math.max(zlo, Math.min(zhi, Math.floor(ez / lv.cellZ) - this.tall / 2));
    return [Math.floor((ex - dx) / lv.cell) - this.n / 2, Math.floor((ey - dy) / lv.cell) - this.n / 2, oz];
  }

  /** Has the weather moved any layer's cover (or the rain) by more than `air.change` since the level was built? */
  private changed(lv: AirLevel, w: WeatherState): boolean {
    const now = [...this.sky.layers.map((l) => layerCover(l, w)), w.rain];
    return now.some((v, i) => Math.abs(v - (lv.built[i] ?? -1)) > this.sky.air.change);
  }

  private pick(w: WeatherState, ex: number, ey: number, ez: number, time: number): Job | null {
    const n = this.n;
    const T = this.tall;
    let best: AirLevel | null = null;
    let score = 0;
    for (const lv of this.levels) {
      const [tx, ty, tz] = this.target(lv, w, ex, ey, ez);
      const moved = Math.abs(tx - lv.ox) >= n / 8 || Math.abs(ty - lv.oy) >= n / 8 || Math.abs(tz - lv.oz) >= T / 8;
      // Empty first (coarse before fine), then left behind by the eye (fine before coarse), then old.
      const age = time - lv.builtAt;
      const stale = age >= this.sky.air.refresh * (lv.k + 1) && this.changed(lv, w);
      const s = lv.version === 0 ? 3000 + lv.k : moved ? 2000 - lv.k : stale ? 1000 + age / 1e6 : 0;
      if (s > score) {
        score = s;
        best = lv;
      }
    }
    if (!best) return null;
    const lv = best;
    const [tx, ty, tz] = this.target(lv, w, ex, ey, ez);
    const covers = this.sky.layers.map((l) => layerCover(l, w));
    const job: Job = { lv, boxes: [], bi: 0, col: 0, ox: tx, oy: ty, oz: tz, full: false, urgent: score >= 2000, w: { ...w, drift: { x: w.drift?.x ?? 0, y: w.drift?.y ?? 0 } }, covers };
    const whole: Box = [tx, tx + n, ty, ty + n, tz, tz + T];
    const far = !(Math.abs(tx - lv.ox) < n && Math.abs(ty - lv.oy) < n && Math.abs(tz - lv.oz) < T);
    if (score < 2000 || score >= 3000 || far) {
      job.full = true;
      job.boxes.push(whole);
      return job;
    }
    // Only the cells that came into reach: a slab for each axis the window moved along.
    const x0 = Math.max(tx, lv.ox);
    const x1 = Math.min(tx, lv.ox) + n;
    const y0 = Math.max(ty, lv.oy);
    const y1 = Math.min(ty, lv.oy) + n;
    if (tx !== lv.ox) job.boxes.push(tx > lv.ox ? [lv.ox + n, tx + n, ty, ty + n, tz, tz + T] : [tx, lv.ox, ty, ty + n, tz, tz + T]);
    if (ty !== lv.oy) job.boxes.push(ty > lv.oy ? [x0, x1, lv.oy + n, ty + n, tz, tz + T] : [x0, x1, ty, lv.oy, tz, tz + T]);
    if (tz !== lv.oz) job.boxes.push(tz > lv.oz ? [x0, x1, y0, y1, lv.oz + T, tz + T] : [x0, x1, y0, y1, tz, lv.oz]);
    return job;
  }

  /** Fills one column of the current box; returns how many cells that was. */
  private fillColumn(j: Job): number {
    const b = j.boxes[j.bi];
    if (!b) {
      j.bi = j.boxes.length;
      return 1;
    }
    const wx = b[1] - b[0];
    const wy = b[3] - b[2];
    const nz = b[5] - b[4];
    if (wx <= 0 || wy <= 0 || nz <= 0) {
      j.bi++;
      j.col = 0;
      return 1;
    }
    const gx = b[0] + (j.col % wx);
    const gy = b[2] + Math.floor(j.col / wx);
    const lv = j.lv;
    const [dx, dy] = AirCells.frame(j.w);
    airColumn(this.sky, j.w, j.covers, (gx + 0.5) * lv.cell + dx, (gy + 0.5) * lv.cell + dy, b[4] * lv.cellZ, lv.cellZ, nz, this.dens, this.lite, lv.cell);
    for (let k = 0; k < nz; k++) {
      const d = this.dens[k] ?? 0;
      const o = this.slot(gx, gy, b[4] + k) * 2;
      lv.data[o] = Math.round(Math.min(1, d) * 255);
      lv.data[o + 1] = d > 0 ? Math.round(Math.min(1, (this.lite[k] ?? 0) / d) * 255) : 255;
    }
    this.filled += nz;
    if (++j.col >= wx * wy) {
      j.bi++;
      j.col = 0;
    }
    return nz;
  }
}
