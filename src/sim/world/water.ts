import type { WaterGenDef } from '../../types';
import { CONTENT } from '../../content';
import { fbm, hash2 } from './noise';
import { landOf } from './terrain';

/**
 * Rivers and lakes: a pure function of the seed that reads no places (cities and roads read it, never the other way).
 *
 * A river follows one contour of a smooth noise field, so it is a single unbroken line that bends and loops like a real
 * one. Its surface at any point is the smoothed land at the river's middle, minus a little, which makes the water run
 * level across the river and lean down the slope along it, with no steps. A lake sits in a basin: a jittered blob whose
 * surface lies just under its lowest rim. Both cut their beds out of the land and lift a small bank at the edge, so any
 * ground height passes through `carveGround` and the rest of the game (tiles, renderer, physics) sees ordinary terrain
 * with a water surface at some height. Everything numeric is in content/world.ts `water`.
 */

/** The little the water needs to know of the land. */
export interface LandShape {
  readonly seed: number;
  rawGround(x: number, y: number, octaves?: number): number;
}

/** A point near water. `edge` is metres past the waterline (negative = in the water). */
export interface WaterSpot {
  level: number;
  edge: number;
  /** Metres in from the waterline at which the bed reaches full depth. */
  span: number;
  depth: number;
  bank: number;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

const W = (): WaterGenDef => CONTENT.world.water;

function dampness(land: LandShape, x: number, y: number): number {
  const m = CONTENT.world.moisture;
  return fbm(land.seed + m.salt, x / m.scale, y / m.scale, m.octaves);
}

function riverSpot(land: LandShape, x: number, y: number, spread: number): WaterSpot | null {
  const R = W().rivers;
  const s = land.seed + R.salt;
  const n0 = fbm(s, x / R.scale, y / R.scale, R.octaves);
  const dn = n0 - 0.5;
  if (Math.abs(dn) > R.reject) return null;
  const h = 6;
  const gx = (fbm(s, (x + h) / R.scale, y / R.scale, R.octaves) - n0) / h;
  const gy = (fbm(s, x / R.scale, (y + h) / R.scale, R.octaves) - n0) / h;
  const g2 = gx * gx + gy * gy;
  if (g2 < 1e-12) return null;
  const dist = Math.abs(dn) / Math.sqrt(g2);
  if (dist > R.width[1] + R.bank + spread + 2) return null;
  // The middle of the river nearest this point (one step along the field's slope).
  const cx = x - (gx * dn) / g2;
  const cy = y - (gy * dn) / g2;
  const damp = smoothstep(R.wet.from, R.wet.to, dampness(land, cx, cy));
  if (damp <= 0) return null;
  // The land the river finds its way through: the lowest of the middle and a ring round it, so valleys never end up under a dam.
  let land2 = land.rawGround(cx, cy, 4);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    land2 = Math.min(land2, land.rawGround(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26, 4));
  }
  if (land2 > R.highest) return null;
  // Near the coast the river's surface settles at the lowest it may stand and the bed runs out under the sea.
  const level = Math.max(R.lowest, land2 - R.below);
  // Wider in damp land, thinning to a spring high up.
  const wn = fbm(s + 97, cx / R.widthScale, cy / R.widthScale, 2);
  const spring = 1 - smoothstep(R.highest * 0.55, R.highest, land2);
  const half = ((R.width[0] + (R.width[1] - R.width[0]) * wn) * (0.4 + 0.6 * damp) * (0.25 + 0.75 * spring)) / 2;
  if (half < 0.7) return null;
  return { level, edge: dist - half - spread, span: half, depth: R.depth * (0.5 + 0.5 * damp), bank: R.bank };
}

interface Lake {
  cx: number;
  cy: number;
  r: number;
  level: number;
  depth: number;
  p1: number;
  p2: number;
  p3: number;
}

const lakes = new Map<number, Map<number, Lake | null>>();

function lakeOf(land: LandShape, i: number, j: number): Lake | null {
  let byCell = lakes.get(land.seed);
  if (!byCell) {
    if (lakes.size > 6) lakes.clear();
    byCell = new Map();
    lakes.set(land.seed, byCell);
  }
  const key = (i + 32768) * 65536 + (j + 32768);
  const hit = byCell.get(key);
  if (hit !== undefined) return hit;
  const L = W().lakes;
  let lake: Lake | null = null;
  const s = land.seed + L.salt;
  if (hash2(s, i, j) < L.chance) {
    const cx = (i + 0.2 + 0.6 * hash2(s + 1, i, j)) * L.cell;
    const cy = (j + 0.2 + 0.6 * hash2(s + 2, i, j)) * L.cell;
    const r = L.radius[0] + (L.radius[1] - L.radius[0]) * hash2(s + 3, i, j);
    if (dampness(land, cx, cy) >= L.wetter) {
      // The surface lies just under the lowest rim; a basin whose rim drops too much holds no lake.
      let low = Infinity;
      let high = -Infinity;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        for (const f of [1, 1.35]) {
          const g = land.rawGround(cx + Math.cos(a) * r * f, cy + Math.sin(a) * r * f, 3);
          low = Math.min(low, g);
          high = Math.max(high, g);
        }
      }
      const level = low - 1;
      if (level >= L.lowest && level <= L.highest && high - low <= L.rimDrop) {
        lake = {
          cx,
          cy,
          r,
          level,
          depth: L.depth[0] + (L.depth[1] - L.depth[0]) * hash2(s + 4, i, j),
          p1: hash2(s + 5, i, j) * 6.28,
          p2: hash2(s + 6, i, j) * 6.28,
          p3: hash2(s + 7, i, j) * 6.28,
        };
      }
    }
  }
  byCell.set(key, lake);
  return lake;
}

function lakeSpot(land: LandShape, x: number, y: number, spread: number): WaterSpot | null {
  const L = W().lakes;
  const i0 = Math.floor(x / L.cell);
  const j0 = Math.floor(y / L.cell);
  let best: WaterSpot | null = null;
  for (let j = j0 - 1; j <= j0 + 1; j++) {
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      const lake = lakeOf(land, i, j);
      if (!lake) continue;
      const dx = x - lake.cx;
      const dy = y - lake.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > lake.r * 1.5 + L.bank + spread) continue;
      const a = Math.atan2(dy, dx);
      const rad = lake.r * (1 + 0.26 * Math.sin(3 * a + lake.p1) + 0.16 * Math.sin(5 * a + lake.p2) + 0.09 * Math.sin(8 * a + lake.p3));
      const edge = dist - rad - spread;
      if (edge >= L.bank) continue;
      if (best === null || edge < best.edge) best = { level: lake.level, edge, span: Math.max(8, rad * 0.55), depth: lake.depth, bank: L.bank };
    }
  }
  return best;
}

/** The water at a point, or just beside it (the deeper of a river and a lake); null when none is near. `spread` widens it for coarse samples. */
export function waterSpot(land: LandShape, x: number, y: number, spread = 0): WaterSpot | null {
  const r = riverSpot(land, x, y, spread);
  const l = lakeSpot(land, x, y, spread);
  if (r && l) {
    // A river never runs over a lake: inside the lake it is the lake; near it, the river's surface settles to the lake's, so it ends in (or flows from) the water.
    const m = W().rivers.width[1] + W().lakes.bank + 8;
    if (l.edge < 0) return l;
    const t = smoothstep(0, m, l.edge);
    r.level = l.level + (r.level - l.level) * t;
    return r.edge < l.edge ? r : l;
  }
  return r ?? l;
}

/** Ground height after water has cut its bed and lifted its bank. */
export function carve(g: number, s: WaterSpot): number {
  if (s.edge < 0) {
    const u = Math.min(1, -s.edge / s.span);
    return Math.min(g, s.level - s.depth * u * (2 - u));
  }
  const t = smoothstep(0, s.bank, s.edge);
  const base = s.level + W().lip * smoothstep(0, 2, s.edge);
  return base + (g - base) * t;
}

export function carveGround(land: LandShape, x: number, y: number, g: number, spread = 0): number {
  const s = waterSpot(land, x, y, spread);
  return s ? carve(g, s) : g;
}

/** Height of the water surface over this point, or NaN where the point is dry. */
export function waterLevelAt(land: LandShape, x: number, y: number, spread = 0): number {
  const s = waterSpot(land, x, y, spread);
  return s && s.edge < 0 ? s.level : Number.NaN;
}

/** Is there river or lake water at this world point? Pure function of the seed; reads no places (cities may ask it freely). */
export function isWater(seed: number, x: number, y: number): boolean {
  const s = waterSpot(landOf(seed), x, y);
  return s !== null && s.edge < 0;
}

/** Is there any water within `margin` metres of this point? */
export function waterNear(seed: number, x: number, y: number, margin: number): boolean {
  const s = waterSpot(landOf(seed), x, y);
  return s !== null && s.edge < margin;
}

/** Centres and radii of the lakes in a box (for maps and checks). */
export function lakesIn(land: LandShape, x0: number, y0: number, x1: number, y1: number): { x: number; y: number; r: number; level: number }[] {
  const L = W().lakes;
  const out: { x: number; y: number; r: number; level: number }[] = [];
  for (let j = Math.floor(y0 / L.cell); j <= Math.floor(y1 / L.cell); j++) {
    for (let i = Math.floor(x0 / L.cell); i <= Math.floor(x1 / L.cell); i++) {
      const k = lakeOf(land, i, j);
      if (k) out.push({ x: k.cx, y: k.cy, r: k.r, level: k.level });
    }
  }
  return out;
}
