// Builds one far-land block a row at a time (seed samples first, then colours), so a block never stalls a frame.
import { type BiomeId, type WorldSampler } from '../../types';
import { CONTENT } from '../../content';
import { TILES } from '../../content/tiles';
import { biomeLook, farColours } from './lodLooks';
import { pack, rhash, vnoise } from '../color';
import { BLOCK, type LodBlock } from './terrainLodPaint';

const HW = BLOCK + 1;

/** Cell size (metres) per level. Level 0 is drawn straight from live tiles, so it is not cached here. */
export const LEVEL_CELL = [1, 2, 4, 8, 16, 32, 64, 128] as const;

/** One block's rows: each `next()` works one row; the last returns the block (changed chunks are painted on by the caller). */
export function* blockRows(sampler: WorldSampler, level: number, bx: number, by: number): Generator<void, LodBlock> {
  const cs = LEVEL_CELL[level] ?? 128;
  const ox = bx * BLOCK * cs;
  const oy = by * BLOCK * cs;
  const N = BLOCK * BLOCK;
  const h = new Float32Array(HW * HW);
  const col = new Uint32Array(N);
  const nrm = new Int8Array(N * 3);
  const water = new Uint8Array(N);
  const canopy = new Uint8Array(N);
  const lift = new Uint8Array(N);
  const glow = new Uint8Array(N);
  const base = { ground: new Uint32Array(N), tree: new Uint32Array(N), cover: new Uint8Array(N), canopy: new Uint8Array(N), lift: new Uint8Array(N), water: new Uint8Array(N) };
  const biomes: BiomeId[] = new Array<BiomeId>(HW * HW);
  const trees = new Float32Array(HW * HW);
  const road = new Float32Array(HW * HW);
  const built = new Uint16Array(HW * HW);
  /** How far a river's or lake's surface lies over the bed at each corner (0 = none; the sea is told by the ground sinking under 0). */
  const wdep = new Float32Array(HW * HW);
  const farW = CONTENT.world.far;
  const far = farColours();
  let maxH = -Infinity;
  for (let j = 0; j < HW; j++) {
    for (let i = 0; i < HW; i++) {
      const s = sampler.sample(ox + i * cs, oy + j * cs, cs);
      const k = j * HW + i;
      const g = s.ground;
      biomes[k] = s.biome;
      trees[k] = s.trees;
      road[k] = s.road;
      built[k] = s.built === null ? 0 : s.built + 1;
      let top = g < 0 ? 0 : g;
      if (s.water !== undefined && s.water > g) {
        top = s.water;
        wdep[k] = s.water - g;
      }
      h[k] = top;
      if (top > maxH) maxH = top;
    }
    yield;
  }
  for (let j = 0; j < BLOCK; j++) {
    for (let i = 0; i < BLOCK; i++) {
      const k = j * HW + i;
      const q = j * BLOCK + i;
      const x = ox + i * cs;
      const y = oy + j * cs;
      const hc = h[k] ?? 0;
      const gx = ((h[k + 1] ?? hc) - hc) / cs;
      const gy = ((h[k + HW] ?? hc) - hc) / cs;
      const il = 1 / Math.sqrt(1 + gx * gx + gy * gy);
      const nz = il;
      nrm[q * 3] = Math.round(-gx * il * 127);
      nrm[q * 3 + 1] = Math.round(-gy * il * 127);
      nrm[q * 3 + 2] = Math.round(nz * 127);
      const look = biomeLook(biomes[k] ?? 'meadow');
      const bfar = look.far;
      let r = bfar[0];
      let g = bfar[1];
      let b = bfar[2];
      const vary = vnoise(x * 0.013, y * 0.013, 5) * 0.5 + vnoise(x * 0.06, y * 0.06, 6) * 0.3 + rhash(x, y, 7) * 0.2;
      const m = 0.82 + vary * 0.36;
      r *= m;
      g *= m;
      b *= m;
      let cover = 0;
      let can = 0;
      const inland = (wdep[k] ?? 0) > 0;
      if ((hc <= 0 && look.water) || inland) {
        // Deeper water is darker and bluer.
        const depth = inland ? Math.min(1, (wdep[k] ?? 0) / 8) : Math.min(1, -sampler.sample(x, y, cs * 4).ground / 30);
        r = 46 - depth * 26;
        g = 104 - depth * 50;
        b = 120 - depth * 30;
        water[q] = 1;
        nrm[q * 3] = 0;
        nrm[q * 3 + 1] = 0;
        nrm[q * 3 + 2] = 127;
      } else {
        if (nz < farW.steep && look.bareSlopes) {
          // Steep slopes show bare rock.
          const t = Math.min(1, (farW.steep - nz) * 4);
          r += (farW.rock[0] - r) * t;
          g += (farW.rock[1] - g) * t;
          b += (farW.rock[2] - b) * t;
        }
        if (hc > farW.snowLine + vnoise(x * 0.01, y * 0.01, 8) * farW.snowJitter && nz > 0.7) {
          r = farW.snow[0];
          g = farW.snow[1];
          b = farW.snow[2];
        }
        const rd = road[k] ?? 0;
        if (rd > CONTENT.world.roads.above && cs <= 8) {
          r += (farW.road[0] - r) * 0.8;
          g += (farW.road[1] - g) * 0.8;
          b += (farW.road[2] - b) * 0.8;
        }
        // Buildings and walls: their tile's far colour, standing as tall as the tile is.
        const bt = built[k] ?? 0;
        if (bt > 0) {
          const code = bt - 1;
          r = far[code * 3] ?? 110;
          g = far[code * 3 + 1] ?? 100;
          b = far[code * 3 + 2] ?? 100;
          lift[q] = Math.min(255, Math.round((TILES[code]?.height ?? 2.8) * 10));
        }
        const tr = trees[k] ?? 0;
        if (tr > 0.01) {
          const clump = vnoise(x * 0.09, y * 0.09, 9);
          const raw = Math.min(1, tr * 4) * (0.6 + clump * 0.6);
          cover = Math.min(1, raw);
          can = Math.min(255, Math.round(raw * look.canopy * (0.6 + clump * 0.8)));
        }
      }
      const tree = look.tree;
      base.ground[q] = pack(r, g, b);
      base.tree[q] = pack(tree[0], tree[1], tree[2]);
      base.cover[q] = Math.round(cover * 255);
      base.canopy[q] = can;
      base.lift[q] = lift[q] ?? 0;
      base.water[q] = water[q] ?? 0;
      canopy[q] = can;
      col[q] = pack(r + (tree[0] - r) * cover, g + (tree[1] - g) * cover, b + (tree[2] - b) * cover);
      const top = hc + (lift[q] ?? 0) * 0.1;
      if (top > maxH) maxH = top;
    }
    yield;
  }
  const block: LodBlock = { level, cs, ox, oy, h, col, nrm, water, canopy, lift, glow, maxH, used: 0, base };
  return block;
}
