import { CloudShadow } from './cloudShadow';
import type { Chunk, ReadonlyTiles } from '../../types';
import { CHUNK_SIZE, packKey } from '../../types';
import { TILES } from '../../content/tiles';
import type { TileInfo } from '../../types';
import { pack, rhash, vnoise } from '../color';
import type { Env, LightMap } from '../lighting';
import { surfaceTexture, texel } from '../materials';
import type { Texture } from '../materials';
import type { Viewport } from '../viewport';
import type { Projection } from './camera';
import { BLOCK, LEVEL_CELL, TOP_LEVEL, TerrainLod } from './terrainLod';
import { CANOPY_FULL, FLORA_FADE } from './tileBillboards';
import type { WorldSampler } from '../../types';

/** Live tiles are drawn in full detail out to this distance; beyond it the LOD pyramid takes over. */
export const NEAR_RANGE = 44;
/** The farthest the view can reach; `setMaxDistance` can shorten it (settings). */
const MAX_DIST = 7000;
const MAX_TERRAIN = 520;
const HW = CHUNK_SIZE + 1;
/** Stands in for a tile code nothing defines (e.g. a retired tile in an old save). */
const FALLBACK_TILE: TileInfo = { id: 'unknown', code: 0, name: 'ground', shape: 'floor', solid: false, flammability: 0, fuel: 0, burnsInto: 0, floor: 'grass', wall: 'stone', material: 'earth', sprite: null, liquid: false, level: false, height: 0 };

/**
 * First-person terrain: for each screen column, march outwards from the eye in growing steps,
 * drawing each new sliver of land that rises above what is already drawn (front to back, so no
 * overdraw). Near the eye it reads live tiles (walls, doors, fire, wet, soot); further out it reads
 * the coarse LOD pyramid, giving kilometres of view at retro resolution.
 */
export class TerrainRenderer {
  readonly lod: TerrainLod;
  /** Drops cached far ground (a realm change). */
  forgetFar(): void {
    this.lod.forgetAll();
  }
  private zs = new Float32Array(0);
  private lvl = new Uint8Array(0);
  private fogT = new Float32Array(0);
  /** Floor and wall surfaces for every tile code (a missing surface gets a neutral fallback). */
  private floorTex: Texture[] = [];
  private wallTex: Texture[] = [];
  private light = new Float32Array(3);
  // L0 sample outputs (avoid allocation in the hot loop).
  private sH = 0;
  private sInfo: TileInfo = TILES[0] ?? FALLBACK_TILE;
  private sChunk: Chunk | null = null;
  private sIdx = 0;
  private sCode = 0;
  private sGround = 0;
  private sGx = 0;
  private sGy = 0;
  private cKey = Number.NaN;
  /** Lowest unfilled row per column after terrain — sprites and sky use it. */
  colTop = new Int32Array(0);
  time = 0;
  /** Where clouds keep the sun off the land (set by the renderer each frame). */
  readonly shadow = new CloudShadow();
  private maxDist = MAX_DIST;

  constructor(sampler: WorldSampler, private readonly tiles: ReadonlyTiles) {
    this.lod = new TerrainLod(sampler, tiles);
    this.buildSteps();
    const fallback = surfaceTexture('grass');
    for (let code = 0; code < 256; code++) {
      const info = TILES[code];
      this.floorTex[code] = info ? surfaceTexture(info.floor) : fallback;
      this.wallTex[code] = info ? surfaceTexture(info.wall) : fallback;
    }
  }

  /** How far to draw, in metres (settings: view distance). Fog closes in before the edge. */
  setMaxDistance(metres: number): void {
    const d = Math.max(300, Math.min(MAX_DIST, metres));
    if (d === this.maxDist) return;
    this.maxDist = d;
    this.buildSteps();
  }

  private buildSteps(): void {
    const z: number[] = [];
    let v = 0.2;
    while (v < this.maxDist) {
      z.push(v);
      v += 0.035 + v * 0.0105;
    }
    this.zs = new Float32Array(z);
    this.lvl = new Uint8Array(z.length);
    this.fogT = new Float32Array(z.length);
    for (let k = 0; k < z.length; k++) {
      const zk = z[k] ?? 0;
      if (zk < NEAR_RANGE) {
        this.lvl[k] = 0;
        continue;
      }
      const dz = 0.035 + zk * 0.0105;
      let L = 1;
      while (L < TOP_LEVEL && (LEVEL_CELL[L] ?? 128) < dz * 0.85) L++;
      this.lvl[k] = L;
    }
  }

  /** Reads one live tile at a world point; results in the s* fields. */
  private sampleTile(wx: number, wy: number): void {
    const tx = Math.floor(wx);
    const ty = Math.floor(wy);
    const cx = Math.floor(tx / CHUNK_SIZE);
    const cy = Math.floor(ty / CHUNK_SIZE);
    const ck = packKey(cx, cy);
    if (ck !== this.cKey || !this.sChunk) {
      this.sChunk = this.tiles.chunk(cx, cy);
      this.cKey = ck;
    }
    const c = this.sChunk;
    const li = tx - cx * CHUNK_SIZE;
    const lj = ty - cy * CHUNK_SIZE;
    const k = lj * CHUNK_SIZE + li;
    this.sIdx = k;
    const code = c.kind[k] ?? 0;
    const info = TILES[code] ?? FALLBACK_TILE;
    this.sInfo = info;
    this.sCode = code;
    const b = lj * HW + li;
    const H = c.height;
    const h00 = H[b] ?? 0;
    const h10 = H[b + 1] ?? 0;
    const h01 = H[b + HW] ?? 0;
    const h11 = H[b + HW + 1] ?? 0;
    const fx = wx - tx;
    const fy = wy - ty;
    const g = h00 + (h10 - h00) * fx + (h01 - h00) * fy + (h00 - h10 - h01 + h11) * fx * fy;
    this.sGround = g;
    this.sGx = (h10 - h00 + h11 - h01) * 0.5;
    this.sGy = (h01 - h00 + h11 - h10) * 0.5;
    let h = g;
    if (info.shape === 'block') h = g + info.height;
    else if (info.shape === 'door' && (c.door[k] ?? 0) < 128) h = g + info.height;
    else if (info.level && g < (c.level[k] ?? 0)) {
      // Water and ice lie flat at the water's height (sea level, or a river's or lake's), whatever the bed below does.
      h = c.level[k] ?? 0;
      this.sGx = 0;
      this.sGy = 0;
    }
    this.sH = h;
  }

  draw(vp: Viewport, p: Projection, env: Env, lm: LightMap): void {
    const { W, H, F, HOR, FX, FY, RX, RY } = p;
    const CX = p.cam.x;
    const CY = p.cam.y;
    const CZ = p.cam.z;
    const px = vp.pixels;
    const depth = vp.depth;
    if (this.colTop.length !== W) this.colTop = new Int32Array(W);
    const zs = this.zs;
    const lvl = this.lvl;
    const NS = zs.length;
    const fogT = this.fogT;
    // A shortened view distance thickens the fog over its last third so the land fades, never ends.
    const fadeFrom = this.maxDist < MAX_DIST ? this.maxDist * 0.6 : Infinity;
    for (let k = 0; k < NS; k++) {
      const z = zs[k] ?? 0;
      const edge = z > fadeFrom ? Math.min(1, (z - fadeFrom) / (this.maxDist - fadeFrom)) : 0;
      fogT[k] = Math.min(0.97, Math.max(1 - Math.exp(-z / env.fogDist), edge * 0.97));
    }
    const fr = env.fog[0];
    const fg = env.fog[1];
    const fb = env.fog[2];
    const lx = env.lx;
    const ly = env.ly;
    const lz = env.lz;
    const lod = this.lod;
    lod.beginFrame(7);
    const wetG = env.rain > 0 ? 1 : 0;
    const floorTex = this.floorTex;
    const wallTex0 = this.wallTex;
    const lightOut = this.light;
    const shadow = this.shadow;
    const shadowOn = shadow.active && env.day > 0.05;
    const time = this.time;
    const shift = p.cam.shakeX;

    for (let i = 0; i < W; i++) {
      const sx = (i + 0.5 - W * 0.5 - shift) / F;
      const dx = FX + RX * sx;
      const dy = FY + RY * sx;
      let ym = H;
      let block = lod.get(TOP_LEVEL, CX, CY);
      let bL = -1;
      for (let k = 0; k < NS; k++) {
        const z = zs[k] ?? 0;
        const wx = CX + dx * z;
        const wy = CY + dy * z;
        const L = lvl[k] ?? 0;
        let h: number;
        let r: number;
        let g: number;
        let b: number;
        let isWall = false;
        let wallTex: Texture | null = null;
        if (L === 0) {
          this.sampleTile(wx, wy);
          h = this.sH;
          const top = HOR + ((CZ - h) * F) / z;
          if (top >= ym) continue;
          const inf = this.sInfo;
          const c = this.sChunk;
          const idx = this.sIdx;
          const raised = h > this.sGround + 0.5 && !inf.level;
          let t: Texture;
          let u: number;
          let v: number;
          if (raised) {
            t = wallTex0[this.sCode] ?? (floorTex[0] as Texture);
            wallTex = t;
            isWall = true;
            u = 0;
            v = 0;
          } else {
            t = floorTex[this.sCode] ?? (floorTex[0] as Texture);
            u = Math.floor(wx * 16);
            v = Math.floor(wy * 16);
            if (inf.liquid) {
              u += Math.floor(time * 6);
              v += Math.floor(Math.sin(time + wx * 0.3) * 3);
            }
          }
          const col = texel(t, u, v);
          r = col & 255;
          g = (col >>> 8) & 255;
          b = (col >>> 16) & 255;
          // Lighting: sun on the slope, plus local lights.
          let dot = raised ? 0.55 * Math.abs(lx) + 0.2 : (-this.sGx * lx - this.sGy * ly + lz) / Math.sqrt(1 + this.sGx * this.sGx + this.sGy * this.sGy);
          if (dot < 0) dot = 0;
          lm.sample(wx, wy, lightOut);
          if (shadowOn) dot *= shadow.at(wx, wy);
          let lr = env.ambR + env.sunR * dot + (lightOut[0] ?? 0);
          let lg = env.ambG + env.sunG * dot + (lightOut[1] ?? 0);
          let lb = env.ambB + env.sunB * dot + (lightOut[2] ?? 0);
          if (c) {
            const soot = (c.soot[idx] ?? 0) / 255;
            const wet = Math.min(1, (c.wet[idx] ?? 0) / 255 + (inf.liquid ? 0 : wetG * 0.5));
            const oil = (c.oil[idx] ?? 0) / 255;
            const fire = (c.fire[idx] ?? 0) / 255;
            if (soot > 0) {
              const s = 1 - soot * 0.75;
              lr *= s;
              lg *= s;
              lb *= s;
            }
            if (wet > 0 && !inf.liquid) {
              const d = 1 - wet * 0.28;
              lr *= d;
              lg *= d;
              lb *= d * 1.04;
            }
            if (oil > 0) {
              r = r * (1 - oil * 0.6) + 40 * oil;
              g = g * (1 - oil * 0.6) + 30 * oil;
              b = b * (1 - oil * 0.6) + 18 * oil;
              const sheen = rhash(Math.floor(wx * 8), Math.floor(wy * 8), 3) > 0.9 ? oil * 60 : 0;
              r += sheen;
              g += sheen * 0.6;
              b += sheen;
            }
            if (fire > 0) {
              const f = fire * (0.7 + 0.3 * Math.sin(time * 20 + wx * 3));
              lr += f * 1.4;
              lg += f * 0.6;
              lb += f * 0.15;
            }
          }
          if (inf.liquid) {
            const glint = rhash(Math.floor(wx * 4 + time * 3), Math.floor(wy * 4), 9) > 0.985 ? 1.4 * env.day + 0.3 : 0;
            r = r * 0.75 + env.horizon[0] * 0.25 + glint * 80;
            g = g * 0.75 + env.horizon[1] * 0.25 + glint * 80;
            b = b * 0.75 + env.horizon[2] * 0.25 + glint * 80;
          }
          r *= lr;
          g *= lg;
          b *= lb;
          const f = fogT[k] ?? 0;
          r += (fr - r) * f;
          g += (fg - g) * f;
          b += (fb - b) * f;
          const y0 = top <= 0 ? 0 : Math.ceil(top);
          let o = y0 * W + i;
          if (isWall && wallTex) {
            // Vertical face: texture by world height, lit like its top.
            const ffx = wx - Math.floor(wx);
            const ffy = wy - Math.floor(wy);
            const across = Math.min(ffx, 1 - ffx) < Math.min(ffy, 1 - ffy) ? wy : wx;
            const tu = Math.floor(across * 16);
            const lightR = lr * (1 - f);
            const lightG = lg * (1 - f);
            const lightB = lb * (1 - f);
            const zf = z / F;
            for (let y = y0; y < ym; y++) {
              const wz = CZ + (HOR - y) * zf - this.sGround;
              const tc = texel(wallTex, tu, Math.floor(-wz * 10));
              px[o] = pack((tc & 255) * lightR + fr * f, ((tc >>> 8) & 255) * lightG + fg * f, ((tc >>> 16) & 255) * lightB + fb * f);
              depth[o] = z;
              o += W;
            }
          } else {
            const pc = pack(r, g, b);
            for (let y = y0; y < ym; y++) {
              px[o] = pc;
              depth[o] = z;
              o += W;
            }
          }
          ym = y0;
          if (ym <= 0) break;
          continue;
        }

        // Far terrain from the LOD pyramid.
        const span = block.cs * BLOCK;
        if (bL !== L || wx < block.ox || wy < block.oy || wx >= block.ox + span || wy >= block.oy + span) {
          block = lod.get(L, wx, wy);
          bL = L;
        }
        const limit = HOR + ((CZ - Math.min(MAX_TERRAIN, block.maxH + 26)) * F) / z;
        if (ym <= limit) {
          // Nothing in this block can rise above what is drawn; if it's the global max we're done.
          if (ym <= HOR + ((CZ - MAX_TERRAIN) * F) / z) break;
          continue;
        }
        const bcs = block.cs;
        const u = (wx - block.ox) / bcs;
        const v = (wy - block.oy) / bcs;
        let iu = Math.floor(u);
        let iv = Math.floor(v);
        if (iu > BLOCK - 1) iu = BLOCK - 1;
        if (iv > BLOCK - 1) iv = BLOCK - 1;
        if (iu < 0) iu = 0;
        if (iv < 0) iv = 0;
        const fu = u - iu;
        const fv = v - iv;
        const hb = iv * (BLOCK + 1) + iu;
        const Hh = block.h;
        const a00 = Hh[hb] ?? 0;
        const a10 = Hh[hb + 1] ?? 0;
        const a01 = Hh[hb + BLOCK + 1] ?? 0;
        const a11 = Hh[hb + BLOCK + 2] ?? 0;
        h = a00 + (a10 - a00) * fu + (a01 - a00) * fv + (a00 - a10 - a01 + a11) * fu * fv;
        const q = iv * BLOCK + iu;
        h += (block.lift[q] ?? 0) * 0.1;
        const can = block.canopy[q] ?? 0;
        if (can > 0) {
          // Treetops rise in while the tree pictures fade out, so forests never pop.
          const ramp = z <= FLORA_FADE ? 0 : z < CANOPY_FULL ? (z - FLORA_FADE) / (CANOPY_FULL - FLORA_FADE) : 1;
          h += can * 0.1 * ramp;
        }
        const top = HOR + ((CZ - h) * F) / z;
        if (top < ym) {
          const ci = block.col[q] ?? 0;
          r = ci & 255;
          g = (ci >>> 8) & 255;
          b = (ci >>> 16) & 255;
          const N = block.nrm;
          const nx = (N[q * 3] ?? 0) / 127;
          const ny = (N[q * 3 + 1] ?? 0) / 127;
          const nz = (N[q * 3 + 2] ?? 127) / 127;
          let dot = nx * lx + ny * ly + nz * lz;
          if (dot < 0) dot = 0;
          if (can > 0) {
            // Canopy texture: speckled leaves that catch the light unevenly.
            const sp = vnoise(wx * 0.5, wy * 0.5, 4);
            dot *= 0.55 + sp * 0.7;
          }
          if (shadowOn) dot *= shadow.at(wx, wy);
          let lr = env.ambR + env.sunR * dot;
          let lg = env.ambG + env.sunG * dot;
          let lb = env.ambB + env.sunB * dot;
          if (block.water[q]) {
            const glint = z < 900 && rhash(Math.floor(wx * 0.5 + time * 2), Math.floor(wy * 0.5), 11) > 0.992 ? 0.8 * env.day : 0;
            r = r * 0.6 + env.horizon[0] * 0.4 + glint * 120;
            g = g * 0.6 + env.horizon[1] * 0.4 + glint * 120;
            b = b * 0.6 + env.horizon[2] * 0.4 + glint * 120;
            lr = 0.5 + env.day * 0.5;
            lg = lr;
            lb = lr;
          }
          r *= lr;
          g *= lg;
          b *= lb;
          const glow = block.glow[q] ?? 0;
          if (glow > 0) {
            // Distant fires shine orange through the dark and flicker.
            const fl = (glow / 255) * (0.75 + 0.25 * Math.sin(time * 9 + wx * 0.7 + wy * 0.3));
            r += fl * 230;
            g += fl * 96;
            b += fl * 24;
          }
          const f = fogT[k] ?? 0;
          r += (fr - r) * f;
          g += (fg - g) * f;
          b += (fb - b) * f;
          const pc = pack(r, g, b);
          const y0 = top <= 0 ? 0 : Math.ceil(top);
          let o = y0 * W + i;
          for (let y = y0; y < ym; y++) {
            px[o] = pc;
            depth[o] = z;
            o += W;
          }
          ym = y0;
          if (ym <= 0) break;
        }
      }
      this.colTop[i] = ym;
    }
  }
}
