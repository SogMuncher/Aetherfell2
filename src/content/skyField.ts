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

/** Share of the sky this layer covers right now (0..1). */
export function layerCover(layer: CloudLayerDef, w: WeatherState): number {
  const c = layer.cover;
  return Math.max(0, Math.min(1, c.base + c.perCloud * w.cloud + c.perRain * w.rain));
}

/** Cloud thickness of one layer over a map spot, 0 (clear) .. 1 (thick). `cover` from layerCover. */
export function layerDensity(layer: CloudLayerDef, w: WeatherState, cover: number, x: number, y: number): number {
  if (cover <= 0) return 0;
  const p = cloudPattern(layer);
  const dx = w.drift?.x ?? 0;
  const dy = w.drift?.y ?? 0;
  const s = layer.stretch ?? 1;
  // Stretch along the wind: turn into the wind's frame (fixed direction east-west is fine for wisps).
  const u = ((x - dx * layer.speed) / (layer.scale * s)) * (N / 4);
  const v = ((y - dy * layer.speed) / layer.scale) * (N / 4);
  // Two looks at the pattern at unrelated sizes, so its repeat never shows across the sky.
  const n = mixed(p, u, v);
  // Threshold from the measured spread of the mixed value, so `cover` really is the share of sky.
  // Centred on the soft edge: half-thick cloud covers `cover` of the sky.
  const soft = Math.max(0.01, layer.softness);
  const t = levelFor(layer, 1 - cover) - soft / 2;
  const k = (n - t) / soft;
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
  const th = layer.thickness ?? 0;
  if (th <= 0) return layerDensity(layer, w, cover, x, y);
  // Tops lean a little with height, so heaps are not straight pillars.
  const d = layerDensity(layer, w, cover, x + hf * th * 0.12, y);
  if (d <= 0) return 0;
  const tower = layer.tower ?? 0;
  const p = cloudPattern(layer);
  const dx = w.drift?.x ?? 0;
  const dy = w.drift?.y ?? 0;
  const s = layer.stretch ?? 1;
  const u = ((x - dx * layer.speed) / (layer.scale * s)) * (N / 4) * 2.7 + hf * 31;
  const v = ((y - dy * layer.speed) / layer.scale) * (N / 4) * 2.7 - hf * 17;
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
