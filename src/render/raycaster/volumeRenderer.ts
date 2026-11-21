import type { ReadonlyVolume, TileInfo, VolumeBrick } from '../../types';
import { TILES } from '../../content/tiles';
import { SHAPE_CUBE, SHAPE_HIT, rayShape } from '../../content/shapes';
import { pack, rhash } from '../color';
import type { Env, LightMap } from '../lighting';
import { surfaceTexture, texel } from '../materials';
import type { Texture } from '../materials';
import type { Viewport } from '../viewport';
import type { Projection } from './camera';

/** How far the 3D layer is drawn, in metres. */
export const VOLUME_RANGE = 170;
/** Bricks considered around the viewer: this many each way sideways, and the stack of floors in height. */
const WIN = 11;
const GW = WIN * 2 + 1;
const GZ_LOW = 2;
const GZ = 14;
const NEAR = 0.1;
/** Fog table resolution and the size of the per-frame face-light cache. */
const FOG_PER_M = 6;
const FOG_STEPS = Math.ceil(VOLUME_RANGE * FOG_PER_M) + 2;
const CACHE = 8192;

/**
 * Draws the 3D layer over the terrain. For each screen pixel in the neighbourhood of a structure it
 * follows the ray through the brick grid (skipping empty bricks in one hop, then stepping cell by
 * cell), meets the first shape, paints it from the material's procedural surface, and keeps it only
 * if it is nearer than what the terrain already drew. Pixels away from every structure cost nothing.
 */
export class VolumeRenderer {
  private floorTex: Texture[] = [];
  private wallTex: Texture[] = [];
  private grid = new Int32Array(GW * GW * GZ);
  private list: VolumeBrick[] = [];
  private colLo = new Int32Array(0);
  private colHi = new Int32Array(0);
  private gx0 = 0;
  private gy0 = 0;
  private readonly light = new Float32Array(3);
  private readonly fogT = new Float32Array(FOG_STEPS);
  private frame = 0;
  private readonly cacheKey = new Float64Array(CACHE);
  private readonly cacheStamp = new Int32Array(CACHE);
  private readonly cacheLight = new Float32Array(CACHE * 3);
  private readonly cFwd = new Float32Array(8);
  private readonly cRight = new Float32Array(8);
  private readonly cUp = new Float32Array(8);
  // Hit results.
  private hT = 0;
  private hNx = 0;
  private hNy = 0;
  private hNz = 1;
  private hMat = 0;
  private hIx = 0;
  private hIy = 0;
  private hIz = 0;
  /** Pixels traced in the last frame (a rough cost measure). */
  traced = 0;
  bricksDrawn = 0;

  constructor() {
    const fallback = surfaceTexture('grass');
    for (let code = 0; code < 256; code++) {
      const info: TileInfo | undefined = TILES[code];
      this.floorTex[code] = info ? surfaceTexture(info.floor) : fallback;
      this.wallTex[code] = info ? surfaceTexture(info.wall) : fallback;
    }
  }

  draw(vp: Viewport, p: Projection, env: Env, lm: LightMap, vol: ReadonlyVolume): void {
    this.traced = 0;
    this.bricksDrawn = 0;
    if (vol.bricks.size === 0) return;
    const { W, H, F, HOR, FX, FY, RX, RY } = p;
    const CX = p.cam.x;
    const CY = p.cam.y;
    const CZ = p.cam.z;
    const shift = p.cam.shakeX;
    if (this.colLo.length !== W) {
      this.colLo = new Int32Array(W);
      this.colHi = new Int32Array(W);
    }
    const colLo = this.colLo;
    const colHi = this.colHi;
    colLo.fill(H);
    colHi.fill(-1);
    this.grid.fill(0);
    const list = this.list;
    list.length = 0;
    const gx0 = (Math.floor(CX) >> 4) - WIN;
    const gy0 = (Math.floor(CY) >> 4) - WIN;
    this.gx0 = gx0;
    this.gy0 = gy0;
    // Which bricks matter, and which pixels each could touch.
    for (const b of vol.bricks.values()) {
      const gx = b.bx - gx0;
      const gy = b.by - gy0;
      const gz = b.bz + GZ_LOW;
      if (gx < 0 || gx >= GW || gy < 0 || gy >= GW || gz < 0 || gz >= GZ) continue;
      const box = b.box;
      const x0 = b.bx * 16 + (box[0] ?? 0);
      const y0 = b.by * 16 + (box[1] ?? 0);
      const z0 = b.bz * 16 + (box[2] ?? 0);
      const x1 = b.bx * 16 + (box[3] ?? 16);
      const y1 = b.by * 16 + (box[4] ?? 16);
      const z1 = b.bz * 16 + (box[5] ?? 16);
      // Nearest point of the box on the ground plane, for the range check.
      const nx = Math.max(x0 - CX, 0, CX - x1);
      const ny = Math.max(y0 - CY, 0, CY - y1);
      if (nx * nx + ny * ny > VOLUME_RANGE * VOLUME_RANGE) continue;
      list.push(b);
      this.grid[(gz * GW + gy) * GW + gx] = list.length;
      // Screen rectangle of the box: project its corners, and where an edge crosses the near plane, that crossing.
      let sxMin = Infinity;
      let sxMax = -Infinity;
      let syMin = Infinity;
      let syMax = -Infinity;
      let anyFront = false;
      for (let c = 0; c < 8; c++) {
        const x = c & 1 ? x1 : x0;
        const y = c & 2 ? y1 : y0;
        this.cFwd[c] = (x - CX) * FX + (y - CY) * FY;
        this.cRight[c] = (x - CX) * RX + (y - CY) * RY;
        this.cUp[c] = (c & 4 ? z1 : z0) - CZ;
      }
      for (let c = 0; c < 8; c++) {
        for (let bit = 1; bit <= 4; bit <<= 1) {
          if (c & bit) continue;
          const d = c | bit;
          let fa = this.cFwd[c] ?? 0;
          let ra = this.cRight[c] ?? 0;
          let ua = this.cUp[c] ?? 0;
          let fb = this.cFwd[d] ?? 0;
          let rb = this.cRight[d] ?? 0;
          let ub = this.cUp[d] ?? 0;
          if (fa < NEAR && fb < NEAR) continue;
          if (fa < NEAR) {
            const t = (NEAR - fa) / (fb - fa);
            ra += (rb - ra) * t;
            ua += (ub - ua) * t;
            fa = NEAR;
          } else if (fb < NEAR) {
            const t = (NEAR - fb) / (fa - fb);
            rb += (ra - rb) * t;
            ub += (ua - ub) * t;
            fb = NEAR;
          }
          anyFront = true;
          const sxa = W * 0.5 + shift + (F * ra) / fa;
          const sya = HOR - (F * ua) / fa;
          const sxb = W * 0.5 + shift + (F * rb) / fb;
          const syb = HOR - (F * ub) / fb;
          if (sxa < sxMin) sxMin = sxa;
          if (sxa > sxMax) sxMax = sxa;
          if (sya < syMin) syMin = sya;
          if (sya > syMax) syMax = sya;
          if (sxb < sxMin) sxMin = sxb;
          if (sxb > sxMax) sxMax = sxb;
          if (syb < syMin) syMin = syb;
          if (syb > syMax) syMax = syb;
        }
      }
      if (!anyFront) continue;
      const ia = Math.max(0, Math.floor(sxMin));
      const ib = Math.min(W - 1, Math.ceil(sxMax));
      const ya = Math.max(0, Math.floor(syMin));
      const yb = Math.min(H - 1, Math.ceil(syMax));
      if (ia > ib || ya > yb) continue;
      for (let i = ia; i <= ib; i++) {
        if (ya < (colLo[i] ?? H)) colLo[i] = ya;
        if (yb > (colHi[i] ?? -1)) colHi[i] = yb;
      }
    }
    this.bricksDrawn = list.length;
    if (list.length === 0) return;

    const px = vp.pixels;
    const depth = vp.depth;
    const lx = env.lx;
    const ly = env.ly;
    const lz = env.lz;
    const fr = env.fog[0];
    const fg = env.fog[1];
    const fb = env.fog[2];
    const floorTex = this.floorTex;
    const wallTex = this.wallTex;
    const wet = env.rain > 0 ? 0.88 : 1;
    // Fog by distance, worked out once a frame.
    const fogT = this.fogT;
    for (let k = 0; k < FOG_STEPS; k++) fogT[k] = Math.min(0.97, 1 - Math.exp(-(k / FOG_PER_M) / env.fogDist));
    // Light on a cell face, worked out once per face per frame.
    this.frame++;
    const frame = this.frame;
    const cacheKey = this.cacheKey;
    const cacheStamp = this.cacheStamp;
    const cacheLight = this.cacheLight;
    const lightOut = this.light;
    const baseX = gx0 << 4;
    const baseY = gy0 << 4;
    let traced = 0;
    for (let i = 0; i < W; i++) {
      const lo = colLo[i] ?? H;
      const hi = colHi[i] ?? -1;
      if (hi < lo) continue;
      const sx = (i + 0.5 - W * 0.5 - shift) / F;
      let dx = FX + RX * sx;
      let dy = FY + RY * sx;
      if (dx > -1e-9 && dx < 1e-9) dx = 1e-9;
      if (dy > -1e-9 && dy < 1e-9) dy = 1e-9;
      const idx = 1 / dx;
      const idy = 1 / dy;
      for (let y = lo; y <= hi; y++) {
        const o = y * W + i;
        const tFar = Math.min(depth[o] ?? 1e9, VOLUME_RANGE);
        let dz = (HOR - (y + 0.5)) / F;
        if (dz > -1e-9 && dz < 1e-9) dz = 1e-9;
        traced++;
        if (!this.cast(CX, CY, CZ, dx, dy, dz, idx, idy, 1 / dz, tFar)) continue;
        const t = this.hT;
        const wx = CX + dx * t;
        const wy = CY + dy * t;
        const wz = CZ + dz * t;
        const nx = this.hNx;
        const ny = this.hNy;
        const nz = this.hNz;
        const mat = this.hMat;
        // Material look: the tile's floor surface on level faces, its wall surface on upright ones.
        let tc: number;
        if (nz > 0.6 || nz < -0.6) {
          tc = texel(floorTex[mat] ?? (floorTex[0] as Texture), Math.floor(wx * 16), Math.floor(wy * 16));
        } else {
          const across = Math.abs(nx) > Math.abs(ny) ? wy : wx;
          const nh = nz > 0.05 || nz < -0.05 ? Math.max(0.35, Math.sqrt(1 - nz * nz)) : 1;
          tc = texel(wallTex[mat] ?? (wallTex[0] as Texture), Math.floor(across * 16), Math.floor((-wz * 10) / nh));
        }
        // Light on this face of this cell: sun where open sky is overhead, else ambient and local lights.
        const ix = this.hIx;
        const iy = this.hIy;
        const iz = this.hIz;
        const nIdx = (Math.round(nx * 2) + 2) * 25 + (Math.round(ny * 2) + 2) * 5 + Math.round(nz * 2) + 2;
        const key = ((((ix - baseX + 512) * 1024 + (iy - baseY + 512)) * 512 + (iz + 128)) * 128) + nIdx;
        const slot = ((ix * 73 + iy * 151 + iz * 311 + nIdx * 17) & 0x7fffffff) % CACHE;
        let lr: number;
        let lg: number;
        let lb: number;
        if (cacheStamp[slot] === frame && cacheKey[slot] === key) {
          lr = cacheLight[slot * 3] ?? 1;
          lg = cacheLight[slot * 3 + 1] ?? 1;
          lb = cacheLight[slot * 3 + 2] ?? 1;
        } else {
          const open = vol.openSky(ix + 0.5 + nx * 0.7, iy + 0.5 + ny * 0.7, iz + 0.5 + nz * 0.7);
          let dot = nx * lx + ny * ly + nz * lz;
          if (dot < 0 || !open) dot = 0;
          lm.sample(ix + 0.5 + nx * 0.6, iy + 0.5 + ny * 0.6, lightOut);
          // Every block is a touch different, so walls never look printed.
          const tint = (0.93 + 0.14 * rhash(ix + iz * 57, iy, 5)) * (open ? wet : 1);
          const amb = open ? 1 : 0.9;
          // Rooms are never pitch dark: a little light finds its way in.
          const glow = open ? 0 : 0.09;
          // What has happened to this cell shows, as it does on the ground: soot darkens it, wet
          // darkens and shines, oil sheens, and fire makes it glow (the same cell state the sim's rules use).
          const soot = vol.cellGet('soot', ix, iy, iz) / 255;
          const wetC = vol.cellGet('wet', ix, iy, iz) / 255;
          const oilC = vol.cellGet('oil', ix, iy, iz) / 255;
          const fireC = vol.cellGet('fire', ix, iy, iz) / 255;
          const dirt = (1 - 0.65 * soot) * (1 - 0.25 * wetC) * (1 - 0.18 * oilC);
          const flick = fireC > 0 ? Math.min(1, fireC * 1.4) * (0.75 + 0.25 * Math.sin(frame * 0.7 + ix * 1.7 + iy * 2.3 + iz)) : 0;
          lr = (env.ambR * amb + env.sunR * dot + (lightOut[0] ?? 0) + glow) * tint * dirt + 1.1 * flick;
          lg = (env.ambG * amb + env.sunG * dot + (lightOut[1] ?? 0) + glow) * tint * dirt + 0.55 * flick;
          lb = (env.ambB * amb + env.sunB * dot + (lightOut[2] ?? 0) + glow) * tint * dirt + 0.15 * flick;
          cacheStamp[slot] = frame;
          cacheKey[slot] = key;
          cacheLight[slot * 3] = lr;
          cacheLight[slot * 3 + 1] = lg;
          cacheLight[slot * 3 + 2] = lb;
        }
        const f = fogT[Math.min(FOG_STEPS - 1, (t * FOG_PER_M) | 0)] ?? 0.97;
        const r = (tc & 255) * lr;
        const g = ((tc >>> 8) & 255) * lg;
        const b = ((tc >>> 16) & 255) * lb;
        px[o] = pack(r + (fr - r) * f, g + (fg - g) * f, b + (fb - b) * f);
        depth[o] = t;
      }
    }
    this.traced = traced;
  }

  /**
   * Follows one ray (direction with a forward part of 1, so distance = depth) until it meets a shape.
   * `idx`, `idy`, `idz` are the reciprocals of the direction, worked out once for the column or row.
   */
  private cast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, idx: number, idy: number, idz: number, tFar: number): boolean {
    const grid = this.grid;
    const list = this.list;
    const gx0 = this.gx0;
    const gy0 = this.gy0;
    const sx = dx > 0 ? 1 : -1;
    const sy = dy > 0 ? 1 : -1;
    const sz = dz > 0 ? 1 : -1;
    const tDX = idx * sx;
    const tDY = idy * sy;
    const tDZ = idz * sz;
    const offX = dx > 0 ? 1 : 0;
    const offY = dy > 0 ? 1 : 0;
    const offZ = dz > 0 ? 1 : 0;
    let t = 0.02;
    let axis = -1;
    for (let guard = 0; guard < 300 && t < tFar; guard++) {
      const ix = Math.floor(ox + dx * t);
      const iy = Math.floor(oy + dy * t);
      const iz = Math.floor(oz + dz * t);
      const bx = ix >> 4;
      const by = iy >> 4;
      const bz = iz >> 4;
      const gx = bx - gx0;
      const gy = by - gy0;
      const gz = bz + GZ_LOW;
      if (gx < 0 || gx >= GW || gy < 0 || gy >= GW || gz < 0 || gz >= GZ) return false;
      const slot = grid[(gz * GW + gy) * GW + gx] ?? 0;
      if (slot === 0) {
        // Nothing in this brick: hop to where the ray leaves it.
        const tx = (((bx << 4) + offX * 16) - ox) * idx;
        const ty = (((by << 4) + offY * 16) - oy) * idy;
        const tz = (((bz << 4) + offZ * 16) - oz) * idz;
        if (tx <= ty && tx <= tz) axis = 0;
        else if (ty <= tz) axis = 1;
        else axis = 2;
        t = Math.min(tx, ty, tz) + 1e-4;
        continue;
      }
      const brick = list[slot - 1];
      if (!brick) return false;
      const shapes = brick.shape;
      let cx = ix;
      let cy = iy;
      let cz = iz;
      let nextX = (cx + offX - ox) * idx;
      let nextY = (cy + offY - oy) * idy;
      let nextZ = (cz + offZ - oz) * idz;
      let tc = t;
      for (;;) {
        const idxCell = ((cz & 15) << 8) | ((cy & 15) << 4) | (cx & 15);
        const sb = shapes[idxCell] ?? 0;
        if (sb !== 0) {
          if ((sb & 63) === SHAPE_CUBE) {
            this.hT = tc;
            this.hNx = axis === 0 ? -sx : 0;
            this.hNy = axis === 1 ? -sy : 0;
            this.hNz = axis === 2 ? -sz : axis < 0 ? 1 : 0;
            this.hMat = brick.mat[idxCell] ?? 0;
            this.hIx = cx;
            this.hIy = cy;
            this.hIz = cz;
            return true;
          }
          const lx = Math.min(1, Math.max(0, ox + dx * tc - cx));
          const ly = Math.min(1, Math.max(0, oy + dy * tc - cy));
          const lz = Math.min(1, Math.max(0, oz + dz * tc - cz));
          if (rayShape(sb, lx, ly, lz, dx, dy, dz)) {
            const th = tc + SHAPE_HIT.t;
            if (th >= tFar) return false;
            this.hT = th;
            let nx = SHAPE_HIT.nx;
            let ny = SHAPE_HIT.ny;
            let nz = SHAPE_HIT.nz;
            if (nx === 0 && ny === 0 && nz === 0) {
              // Started inside the piece: use the face the ray came through.
              nx = axis === 0 ? -sx : 0;
              ny = axis === 1 ? -sy : 0;
              nz = axis === 2 ? -sz : 1;
            }
            this.hNx = nx;
            this.hNy = ny;
            this.hNz = nz;
            this.hMat = brick.mat[idxCell] ?? 0;
            this.hIx = cx;
            this.hIy = cy;
            this.hIz = cz;
            return true;
          }
        }
        if (nextX < nextY && nextX < nextZ) {
          tc = nextX;
          cx += sx;
          nextX += tDX;
          axis = 0;
        } else if (nextY < nextZ) {
          tc = nextY;
          cy += sy;
          nextY += tDY;
          axis = 1;
        } else {
          tc = nextZ;
          cz += sz;
          nextZ += tDZ;
          axis = 2;
        }
        if (tc >= tFar) return false;
        if (cx >> 4 !== bx || cy >> 4 !== by || cz >> 4 !== bz) {
          t = tc + 1e-4;
          break;
        }
      }
    }
    return false;
  }
}
