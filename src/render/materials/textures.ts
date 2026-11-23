import type { RGB, SurfaceDef, TextureId } from '../../types';
import { CONTENT } from '../../content';
import { pack, rhash, vnoise } from '../color';

/** Every surface is TEX x TEX texels, 16 to the metre on ground, walls and 3D cells alike. */
export const TEX = 16;
const MASK = TEX - 1;

export interface Texture {
  /** RGB, and in alpha the component (region) that painted the texel: 0 the base, else 1 + its layer index. */
  px: Uint32Array;
  /** Average colour, used where texels would shimmer. */
  avg: number;
}

type Painter = (x: number, y: number) => [number, number, number, number];

function make(paint: Painter): Texture {
  const px = new Uint32Array(TEX * TEX);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const c = paint(x, y);
      px[y * TEX + x] = ((pack(c[0], c[1], c[2]) & 0xffffff) | (c[3] << 24)) >>> 0;
      r += c[0];
      g += c[1];
      b += c[2];
    }
  }
  const n = TEX * TEX;
  return { px, avg: pack(r / n, g / n, b / n) };
}

/** Tileable value noise on the TEX-texel torus. */
function tn(x: number, y: number, f: number, s: number): number {
  const p = TEX / f;
  const fx = x / p;
  const fy = y / p;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const wrap = (v: number): number => ((v % f) + f) % f;
  const tx = fx - ix;
  const ty = fy - iy;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = rhash(wrap(ix), wrap(iy), s);
  const b = rhash(wrap(ix + 1), wrap(iy), s);
  const c = rhash(wrap(ix), wrap(iy + 1), s);
  const d = rhash(wrap(ix + 1), wrap(iy + 1), s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function grain(x: number, y: number, s: number): number {
  return tn(x, y, TEX / 8, s) * 0.5 + tn(x, y, TEX / 4, s + 1) * 0.3 + tn(x, y, TEX / 2, s + 2) * 0.2;
}

function bricks(x: number, y: number, bw: number, bh: number): { mortar: boolean; id: number } {
  const row = Math.floor(y / bh);
  const off = row % 2 ? bw / 2 : 0;
  const bx = Math.floor((x + off) / bw);
  const mortar = y % bh === 0 || (x + off) % bw === 0;
  return { mortar, id: row * 17 + bx };
}

type Amount = number | RGB;

/** Texel (x, y) of a layer painted `turn` quarter turns round the tile (it stays tileable). */
function turned(x: number, y: number, turn: number): [number, number] {
  const m = TEX - 1;
  return turn === 1 ? [y, m - x] : turn === 2 ? [m - x, m - y] : turn === 3 ? [m - y, x] : [x, y];
}

/** A wave frequency (radians per texel) snapped to whole waves per tile, so waves meet across tile edges. */
function whole(freq: number): number {
  const step = (2 * Math.PI) / TEX;
  return Math.round(freq / step) * step;
}

function amt(a: Amount, ch: number): number {
  return typeof a === 'number' ? a : (a[ch] ?? 0);
}

/**
 * Paints one texel of a surface from its layers (see SurfaceLayer in types/tiles.ts), and which component it belongs
 * to: a layer that covers only some texels (speckle, lines, mortar, seams, patches) makes them its own region, so the
 * renderer can drift each component's colour on its own per placed cell.
 */
function paintSurface(def: SurfaceDef, px: number, py: number): [number, number, number, number] {
  const base = def.base;
  const c: [number, number, number, number] = [base[0], base[1], base[2], 0];
  const add = (a: Amount, k: number): void => {
    c[0] += amt(a, 0) * k;
    c[1] += amt(a, 1) * k;
    c[2] += amt(a, 2) * k;
  };
  let x = px;
  let y = py;
  for (const [i, l] of def.layers.entries()) {
    const own = (k: RGB): [number, number, number, number] => [k[0], k[1], k[2], i + 1];
    [x, y] = turned(px, py, l.turn ?? 0);
    switch (l.kind) {
      case 'grain':
        add(l.amount, grain(x, y, l.salt));
        break;
      case 'noise':
        add(l.amount, tn(x, y, l.cells, l.salt));
        break;
      case 'speckle':
        if (rhash(x, y, l.salt) > 1 - l.chance) { add(l.add, 1); c[3] = i + 1; }
        break;
      case 'waves': {
        const warp = l.warp ? tn(x, y, l.warp.cells, l.warp.salt) * l.warp.amount : 0;
        const s = Math.sin((x + warp) * whole(l.freq) + y * whole(l.tilt ?? 0));
        if (l.line !== undefined) {
          if (Math.abs(s) < l.line) { add(l.amount, 1); c[3] = i + 1; }
        } else add(l.amount, s * 0.5 + 0.5);
        break;
      }
      case 'lines': {
        const v = l.axis === 'x' ? x : y;
        const m = ((v % l.period) + l.period) % l.period;
        const hit = l.at ? l.at.includes(m) : m === 0;
        if (!hit) break;
        if (l.set) return own(l.set);
        if (l.add !== undefined) add(l.add, 1);
        c[3] = i + 1;
        break;
      }
      case 'bricks': {
        const b = bricks(x, y, l.w, l.h);
        if (b.mortar) return own(l.mortar);
        add(1, rhash(b.id, 0, l.salt) * l.vary);
        break;
      }
      case 'boards': {
        let seam: boolean;
        if (l.dir === 'vertical') seam = x % l.size === 0;
        else {
          const row = Math.floor(y / l.size);
          seam = y % l.size === 0 || (l.joint !== undefined && (x + row * l.joint.stagger) % l.joint.every === 0);
        }
        if (seam) return own(l.seam);
        break;
      }
      case 'rings': {
        const board = Math.floor(x / l.board);
        const ring = Math.sin((y + rhash(board, 0, l.salt) * 30) * whole(l.freq) + tn(x, y, l.warp.cells, l.warp.salt) * l.warp.amount) * 0.5 + 0.5;
        add(l.amount, ring);
        break;
      }
      case 'patches': {
        if (tn(x, y, l.cells, l.salt) <= l.above) break;
        const keep = l.keep ?? 0;
        for (let ch = 0; ch < 3; ch++) c[ch] = (l.colour[ch] ?? 0) + ((c[ch] ?? 0) - (base[ch] ?? 0)) * amt(keep, ch);
        c[3] = i + 1;
        break;
      }
    }
  }
  return c;
}

/** What a surface name nothing defines looks like: a neutral grey grain. */
const MISSING: SurfaceDef = { base: [110, 104, 96], layers: [{ kind: 'grain', salt: 99, amount: 30 }] };

let cache: Record<TextureId, Texture> | null = null;

/** Every surface in content, painted once. */
export function textures(): Record<TextureId, Texture> {
  if (cache) return cache;
  const out: Record<TextureId, Texture> = {};
  for (const [id, def] of Object.entries(CONTENT.surfaces)) out[id] = make((x, y) => paintSurface(def, x, y));
  cache = out;
  return out;
}

const missingTex: { t: Texture | null } = { t: null };

/** A surface by id, or a neutral fallback so a typo never crashes the renderer. */
export function surfaceTexture(id: TextureId): Texture {
  const t = textures()[id];
  if (t) return t;
  if (!missingTex.t) missingTex.t = make((x, y) => paintSurface(MISSING, x, y));
  return missingTex.t;
}

export function texel(t: Texture, u: number, v: number): number {
  return t.px[(v & MASK) * TEX + (u & MASK)] ?? 0;
}

/** Smooth world noise for large-scale colour variation (patches of lighter/darker ground). */
export function patch(x: number, y: number): number {
  return vnoise(x * 0.11, y * 0.11, 31) * 0.6 + vnoise(x * 0.37, y * 0.37, 32) * 0.4;
}
