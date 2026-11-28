// Plans the air cells round the eye: LOD levels (each twice as wide), where each sits and which to rebuild this frame.
/**
 * The air is a stack of levels, each `count` × `count` × `tall` cubic cells centred on the eye (kept inside the band of
 * heights the sky layers use) and twice as wide as the one below, so near air is fine blocks and far air wide flat
 * clumps. The graphics card fills a level whole in one go (gpu/gpuAirFill.ts) from the same density rule as rain, shade
 * and in-cloud fog (content/skyField.ts), so this only decides which levels to rebuild: an empty one first, then one the
 * eye has walked away from (finest first), then the oldest once the weather has had time to change. Cells live in the
 * wind's drifting frame, so clouds drift without a rebuild and a rebuilt level matches its old self wherever both
 * reach: nothing pops. Render-side data only: the sim never sees it.
 */
import { CONTENT } from '../content';
import type { SkyDef, WeatherState } from '../types';

export interface AirLevel {
  k: number;
  /** Cell width and height (metres). Height stops growing once a level's `tall` cells span every layer. */
  cell: number;
  cellZ: number;
  /** Corner of the window in whole cells of the drifting frame (z from sea level); NaN until first built. */
  ox: number;
  oy: number;
  oz: number;
  builtAt: number;
  /** The wind's drift when it was built (its cells sit in that frame; moisture is read at world spots). */
  dx: number;
  dy: number;
}

/** Lowest and highest height any sky layer reaches (metres). */
export function airBand(sky: SkyDef): [number, number] {
  return [Math.min(...sky.layers.map((l) => l.height)), Math.max(...sky.layers.map((l) => l.height + Math.max(30, l.thickness ?? 0)))];
}

/** The drifting frame: a world point minus this is where its air sits in the grid. */
export function airFrame(w: WeatherState): [number, number] {
  return [w.drift?.x ?? 0, w.drift?.y ?? 0];
}

export class AirLevels {
  readonly n: number;
  readonly tall: number;
  readonly levels: AirLevel[] = [];
  readonly lo: number;
  readonly hi: number;
  /** Levels rebuilt since the start (tests and the debug readout). */
  built = 0;

  constructor(readonly sky: SkyDef = CONTENT.sky) {
    const a = sky.air;
    this.n = a.count;
    this.tall = a.tall;
    // Enough levels that the coarsest reaches the far clouds.
    const count = Math.max(1, Math.ceil(Math.log2(sky.cloudRange / (a.lod * a.cell))) + 1);
    [this.lo, this.hi] = airBand(sky);
    const capZ = Math.max(a.cell, (this.hi - this.lo) / a.tall);
    for (let k = 0; k < count; k++) this.levels.push({ k, cell: a.cell * 2 ** k, cellZ: Math.min(a.cell * 2 ** k, capZ), ox: NaN, oy: NaN, oz: NaN, builtAt: -1e9, dx: 0, dy: 0 });
  }

  /** Where a level's window should sit now: the eye in the drifting frame, in whole cells, at the window's middle. */
  target(lv: AirLevel, w: WeatherState, ex: number, ey: number, ez: number): [number, number, number] {
    const [dx, dy] = airFrame(w);
    const zlo = Math.floor(this.lo / lv.cellZ);
    const zhi = Math.max(zlo, Math.ceil(this.hi / lv.cellZ) - this.tall);
    const oz = Math.max(zlo, Math.min(zhi, Math.floor(ez / lv.cellZ) - this.tall / 2));
    return [Math.floor((ex - dx) / lv.cell) - this.n / 2, Math.floor((ey - dy) / lv.cell) - this.n / 2, oz];
  }

  /** The levels to rebuild this frame (at most `air.perFrame`), already moved to their new windows. */
  plan(w: WeatherState, ex: number, ey: number, ez: number, time: number): AirLevel[] {
    const n = this.n;
    const scored = this.levels.map((lv) => {
      const [tx, ty, tz] = this.target(lv, w, ex, ey, ez);
      const moved = !(Math.abs(tx - lv.ox) < n / 8 && Math.abs(ty - lv.oy) < n / 8 && Math.abs(tz - lv.oz) < this.tall / 8);
      const age = time - lv.builtAt;
      // Empty first (coarse before fine: the far sky shows at once), then left behind (fine first), then old.
      const s = Number.isNaN(lv.ox) ? 3000 + lv.k : moved ? 2000 - lv.k : age >= this.sky.air.refresh * (lv.k + 1) ? 1000 + age / 1e6 : 0;
      return { lv, s, t: [tx, ty, tz] as const };
    });
    const out: AirLevel[] = [];
    for (const { lv, t } of scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, this.sky.air.perFrame)) {
      [lv.ox, lv.oy, lv.oz] = t;
      [lv.dx, lv.dy] = airFrame(w);
      lv.builtAt = time;
      this.built++;
      out.push(lv);
    }
    return out;
  }
}
