/**
 * Where the clouds are. One pure function of the sky data, the weather (cover, storminess, how far
 * the wind has carried them) and a spot on the map, so the simulation (does it rain here?), the
 * renderer (what does the sky look like?) and every friend's game all agree. Each layer's shapes come
 * from a small tileable pattern made once from its seed.
 */
import type { CloudLayerDef, SkyDef, WeatherState } from '../types';

const N = 256;
const patterns = new Map<CloudLayerDef, Float32Array>();

function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise on an N×N grid with `octaves` layers: 0..1. */
function makePattern(layer: CloudLayerDef): Float32Array {
  const out = new Float32Array(N * N);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < layer.detail; o++) {
    const cells = 4 << o;
    const step = N / cells;
    for (let y = 0; y < N; y++) {
      const gy = y / step;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < N; x++) {
        const gx = x / step;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const s = layer.seed * 31 + o;
        const a = hash(x0 % cells, y0 % cells, s);
        const b = hash((x0 + 1) % cells, y0 % cells, s);
        const c = hash(x0 % cells, (y0 + 1) % cells, s);
        const d = hash((x0 + 1) % cells, (y0 + 1) % cells, s);
        const v = a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy;
        out[y * N + x] = (out[y * N + x] ?? 0) + v * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / total;
  // Spread the values out so cover means roughly "share of sky".
  const sorted = Float32Array.from(out).sort();
  const lo = sorted[Math.floor(N * N * 0.02)] ?? 0;
  const hi = sorted[Math.floor(N * N * 0.98)] ?? 1;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, ((out[i] ?? 0) - lo) / (hi - lo || 1)));
  return out;
}

export function cloudPattern(layer: CloudLayerDef): Float32Array {
  let p = patterns.get(layer);
  if (!p) {
    p = makePattern(layer);
    patterns.set(layer, p);
  }
  return p;
}

/** How much a fully wet or dry spot moves a layer's cloud edge (pattern units), at `wet` 1. */
const MOIST_SHIFT = 0.5;
/** Size of one cell of the coarse moisture map clouds read (metres). */
export const MOIST_CELL = 600;
let moistureFn: ((x: number, y: number) => number) | null = null;
const moistCells = new Map<number, number>();

/** The world's moisture (0..1 at a point) for clouds and fog to follow; `null` = neutral. Set by whoever owns the world. */
export function setAirMoisture(fn: ((x: number, y: number) => number) | null): void {
  moistureFn = fn;
  moistCells.clear();
}

/** Moisture of one coarse cell (cached). */
export function moistCell(ix: number, iy: number): number {
  if (!moistureFn) return 0.5;
  const k = ix * 65536 + iy;
  let v = moistCells.get(k);
  if (v === undefined) {
    if (moistCells.size > 30000) moistCells.clear();
    v = moistureFn((ix + 0.5) * MOIST_CELL, (iy + 0.5) * MOIST_CELL);
    moistCells.set(k, v);
  }
  return v;
}

/** Smooth moisture of the air over a map spot (0..1; 0.5 where the world gives none). */
export function airMoisture(x: number, y: number): number {
  if (!moistureFn) return 0.5;
  const gx = x / MOIST_CELL - 0.5;
  const gy = y / MOIST_CELL - 0.5;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  const a = moistCell(ix, iy);
  const b = moistCell(ix + 1, iy);
  const c = moistCell(ix, iy + 1);
  const d = moistCell(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

/** Share of the sky this layer covers right now (0..1). */
export function layerCover(layer: CloudLayerDef, w: WeatherState): number {
  const c = layer.cover;
  return Math.max(0, Math.min(1, c.base + c.perCloud * w.cloud + c.perRain * w.rain));
}

/** Cloud thickness of one layer over a map spot, 0 (clear) .. 1 (thick). `cover` from layerCover. */
export function layerDensity(layer: CloudLayerDef, w: WeatherState, cover: number, x: number, y: number): number {
  if (cover <= 0) return 0;
  return colDens(layer, w, edgeAt(layer, cover, x, y), x, y);
}

/** Where a layer's cloud edge sits over a spot (pattern units): set by the cover, shifted by the land's moisture for wet-loving layers. */
function edgeAt(layer: CloudLayerDef, cover: number, x: number, y: number): number {
  // Threshold from the measured spread of the mixed value, so `cover` really is the share of sky.
  // Centred on the soft edge: half-thick cloud covers `cover` of the sky.
  const wet = layer.wet ?? 0;
  return levelFor(layer, 1 - cover) - Math.max(0.01, layer.softness) / 2 - (wet > 0 ? wet * (airMoisture(x, y) - 0.5) * MOIST_SHIFT : 0);
}

/** Column density for a known edge `t`. */
function colDens(layer: CloudLayerDef, w: WeatherState, t: number, x: number, y: number): number {
  const p = cloudPattern(layer);
  const s = layer.stretch ?? 1;
  // Stretch along the wind: turn into the wind's frame (fixed direction east-west is fine for wisps).
  const u = ((x - (w.drift?.x ?? 0) * layer.speed) / (layer.scale * s)) * (N / 4);
  const v = ((y - (w.drift?.y ?? 0) * layer.speed) / layer.scale) * (N / 4);
  // Two looks at the pattern at unrelated sizes, so its repeat never shows across the sky.
  const k = (mixed(p, u, v) - t) / Math.max(0.01, layer.softness);
  return k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
}

function mixed(p: Float32Array, u: number, v: number): number {
  return sample(p, u, v) * 0.62 + sample(p, u * 0.577 + 17.3, v * 0.577 + 5.1) * 0.38;
}

const levels = new WeakMap<CloudLayerDef, Float32Array>();

/** The mixed value below which share `q` of the sky lies (q 0..1), measured once per layer. */
function levelFor(layer: CloudLayerDef, q: number): number {
  let l = levels.get(layer);
  if (!l) {
    const p = cloudPattern(layer);
    const M = 160;
    const vals = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) vals[j * M + i] = mixed(p, i * 1.37 + 0.31, j * 1.37 + 0.73);
    vals.sort();
    l = new Float32Array(101);
    for (let k = 0; k <= 100; k++) l[k] = vals[Math.min(vals.length - 1, Math.floor((k / 100) * vals.length))] ?? 0;
    levels.set(layer, l);
  }
  const f = Math.max(0, Math.min(1, q)) * 100;
  const k = Math.min(99, Math.floor(f));
  const a = l[k] ?? 0;
  const b = l[k + 1] ?? 1;
  // Fully covered: drop the threshold below the lowest value so softness still reads as solid.
  return q >= 1 ? a - 1 : a + (b - a) * (f - k);
}

function sample(p: Float32Array, u: number, v: number): number {
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const ix = x0 & (N - 1);
  const iy = y0 & (N - 1);
  const ix1 = (ix + 1) & (N - 1);
  const iy1 = (iy + 1) & (N - 1);
  const a = p[iy * N + ix] ?? 0;
  const b = p[iy * N + ix1] ?? 0;
  const c = p[iy1 * N + ix] ?? 0;
  const d = p[iy1 * N + ix1] ?? 0;
  return a + (b - a) * fx + (c - a + (d - c - b + a) * fx) * fy;
}

/**
 * Density of cloud at a point INSIDE a layer's slab: `hf` is the height through it, 0 (flat base) .. 1 (top).
 * The column density (layerDensity) says how much cloud there is over the spot; the tower and billow
 * of the layer shape it into heaps with flat bottoms, lumpy sides and bright tops. Flat layers
 * (no thickness) are just the column density. Only the sky is drawn from this — rain and shade stay on
 * the column, so what you see overhead and what falls on you agree.
 */
export function cloudDensity3(layer: CloudLayerDef, w: WeatherState, cover: number, x: number, y: number, hf: number): number {
  if (cover <= 0) return 0;
  const t = edgeAt(layer, cover, x, y);
  const th = layer.thickness ?? 0;
  return th <= 0 ? colDens(layer, w, t, x, y) : shape(layer, w, t, x, y, hf);
}

/**
 * The air over a spot as a column of `nz` cells `cell` tall (and `wide` across), the lowest starting at height `z0`: every layer that
 * passes through a cell adds its cloud (cloudDensity3 × opacity × the share of the cell the layer fills), so all layers
 * live in one grid of air cells (render/airCells.ts) and draw in one pass, nearest first. A cell wider than a quarter of
 * a layer's shapes averages 2 × 2 spots, so far clouds thin out instead of flickering. Writes into `dens` the density
 * (0..1+) and into `lite` the density × brightness (tint, storm bellies). `covers` = layerCover of each layer.
 */
export function airColumn(sky: SkyDef, w: WeatherState, covers: readonly number[], x: number, y: number, z0: number, cell: number, nz: number, dens: Float32Array, lite: Float32Array, wide = cell): void {
  dens.fill(0, 0, nz);
  lite.fill(0, 0, nz);
  const z1 = z0 + nz * cell;
  sky.layers.forEach((L, li) => {
    const cover = covers[li] ?? 0;
    const flat = (L.thickness ?? 0) <= 0;
    const th = flat ? FLAT : L.thickness ?? 0;
    const lo = L.height;
    const hi = lo + th;
    if (cover <= 0 || hi <= z0 || lo >= z1) return;
    const sub = wide * 4 > L.scale ? 2 : 1;
    const k0 = Math.max(0, Math.floor((lo - z0) / cell));
    const k1 = Math.min(nz, Math.ceil((hi - z0) / cell));
    const bright = (L.tint[0] + L.tint[1] + L.tint[2]) / 765;
    const storm = L.belly * (0.55 + 0.45 * w.rain);
    for (let sy = 0; sy < sub; sy++) {
      for (let sx = 0; sx < sub; sx++) {
        const px = x + ((sx + 0.5) / sub - 0.5) * wide;
        const py = y + ((sy + 0.5) / sub - 0.5) * wide;
        const t = edgeAt(L, cover, px, py);
        const col = flat ? colDens(L, w, t, px, py) : 0;
        for (let k = k0; k < k1; k++) {
          const a = Math.max(lo, z0 + k * cell);
          const b = Math.min(hi, z0 + (k + 1) * cell);
          if (b <= a) continue;
          const hf = ((a + b) / 2 - lo) / th;
          const d = (flat ? col : shape(L, w, t, px, py, hf)) * L.opacity * ((b - a) / cell) / (sub * sub);
          if (d <= 0) continue;
          dens[k] = (dens[k] ?? 0) + d;
          lite[k] = (lite[k] ?? 0) + d * bright * (1 - storm * (1 - hf));
        }
      }
    }
  });
}

/** Cloud density of the air at one point (0..1+) and its brightness: the same rule as the air cells, for a single spot. */
export function airAt(sky: SkyDef, w: WeatherState, x: number, y: number, z: number): { dens: number; lite: number } {
  airColumn(sky, w, sky.layers.map((l) => layerCover(l, w)), x, y, z - 0.5, 1, 1, ONE_D, ONE_L);
  const d = ONE_D[0] ?? 0;
  return { dens: d, lite: d > 0 ? (ONE_L[0] ?? 0) / d : 1 };
}
const ONE_D = new Float32Array(1);
const ONE_L = new Float32Array(1);
/** A flat sheet (no thickness) is kept as a slab this tall (metres). */
const FLAT = 30;

function shape(layer: CloudLayerDef, w: WeatherState, t: number, x: number, y: number, hf: number): number {
  // Tops lean a little with height, so heaps are not straight pillars.
  const d = colDens(layer, w, t, x + hf * layer.scale * 0.05, y);
  if (d <= 0) return 0;
  const tower = layer.tower ?? 0;
  const p = cloudPattern(layer);
  const s = layer.stretch ?? 1;
  const u = ((x - (w.drift?.x ?? 0) * layer.speed) / (layer.scale * s)) * (N / 4) * 2.7 + hf * 31;
  const v = ((y - (w.drift?.y ?? 0) * layer.speed) / layer.scale) * (N / 4) * 2.7 - hf * 17;
  const bump = (sample(p, u, v) - 0.5) * (layer.billow ?? 0.6);
  // The height this spot rises to: all the way where the cloud is thick, only a little at its edge.
  const top = 1 - tower + tower * d;
  const edge = (top - hf) / 0.22 + bump;
  if (edge <= 0) return 0;
  const body = edge >= 1 ? 1 : edge * edge * (3 - 2 * edge);
  const base = Math.min(1, hf / 0.05);
  return Math.min(1, d * 1.15) * body * base;
}

/** How hard it is raining on this spot (0..1): the weather's storminess, but only under storm cells. */
export function rainAt(sky: SkyDef, w: WeatherState, x: number, y: number): number {
  if (w.rain <= 0.01) return 0;
  let under = 0;
  let any = false;
  for (const l of sky.layers) {
    if (!l.rain) continue;
    any = true;
    under = Math.max(under, layerDensity(l, w, layerCover(l, w), x, y));
  }
  return any ? w.rain * Math.min(1, under * 1.6) : w.rain;
}

/** Share of sunlight reaching this spot through every layer (1 = clear sky, lower under clouds). */
export function sunThrough(sky: SkyDef, w: WeatherState, x: number, y: number): number {
  let light = 1;
  for (const l of sky.layers) {
    if (l.shadow <= 0) continue;
    const d = layerDensity(l, w, layerCover(l, w), x, y);
    if (d > 0) light *= 1 - d * l.shadow;
  }
  return light;
}
