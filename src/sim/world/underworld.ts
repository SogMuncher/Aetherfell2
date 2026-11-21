import type { Chunk, TileKind, Volume, WorldSample, WorldSampler } from '../../types';
import { CHUNK_SIZE, shapeByte } from '../../types';
import { CONTENT } from '../../content';
import { shapeId } from '../../content/shapes';
import { tileCode } from '../../content/tiles';
import { hash2 } from './noise';
import { emptyChunk } from './chunkgen';
import { landOf } from './terrain';
import { wayHit } from './roads';

/**
 * The ground of the underworld: a lattice of halls joined by corridors, laid on a 16 m grid exactly
 * beneath the land (one metre below every metre above). A pure function of (seed, x, y) like the
 * surface, so every machine grows the same rock, and the renderer can sample it from afar.
 *
 * What it makes are ordinary tiles (flagstone, living rock, pillars) and, for the roof, ordinary
 * cells in the 3D layer — so fire, rain, blows, light, saving and sync treat it like any other place.
 */

/**
 * It is not random alone: the land above shapes it. Beneath every place with an `under` (content/sites.ts) lies a
 * great hall and a denser knot of tunnels; beneath every road, path and trail (sim/world/roads.ts) runs an open
 * artery, five metres wide, on exactly the same line (the way's own route is read back, not snapped to the grid),
 * from one place's hall to the next. So the one great dungeon follows the world:
 * you can go down at a ruin and come up, by the old road, under a village a valley away.
 */

/** Distance between hall centres. */
export const PITCH = 16;
/** Nodes across one 256 m region of the land. */
const NODES = 16;
const CUBE = shapeId('cube');
/** Half-width of the artery under a way (metres). */
const ARTERY = 2.5;

export type Spot = 'rock' | 'corridor' | 'hall';

/** What the land above asks of the rock under one 256 m region (see the header). */
interface UnderPlan {
  /** Great halls: node → half-size and the kind of place above. */
  boost: Map<number, { hall: number; site: string }>;
  /** Nodes where tunnels are likelier to be open: node → chance. */
  dense: Map<number, number>;
}

const nodeKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
const plans = new Map<number, Map<number, UnderPlan>>();
let lastSeed = Number.NaN;
let lastRx = 0;
let lastRy = 0;
let lastPlan: UnderPlan | null = null;

/** The plan for the region holding node (i, j). */
function planFor(seed: number, i: number, j: number): UnderPlan {
  const rx = Math.floor(i / NODES);
  const ry = Math.floor(j / NODES);
  if (lastPlan && seed === lastSeed && rx === lastRx && ry === lastRy) return lastPlan;
  let bySeed = plans.get(seed);
  if (!bySeed) {
    if (plans.size > 4) plans.clear();
    bySeed = new Map();
    plans.set(seed, bySeed);
  }
  const k = (rx + 32768) * 65536 + (ry + 32768);
  let plan = bySeed.get(k);
  if (!plan) {
    if (bySeed.size > 256) bySeed.clear();
    plan = buildPlan(seed, rx, ry);
    bySeed.set(k, plan);
  }
  lastSeed = seed;
  lastRx = rx;
  lastRy = ry;
  lastPlan = plan;
  return plan;
}

function buildPlan(seed: number, rx: number, ry: number): UnderPlan {
  const plan: UnderPlan = { boost: new Map(), dense: new Map() };
  const land = landOf(seed);
  const i0 = rx * NODES;
  const j0 = ry * NODES;
  const mid = (NODES * PITCH) / 2;
  // Places above: a great hall under the middle, a knot of tunnels round it.
  for (const site of land.sitesNear(i0 * PITCH + mid, j0 * PITCH + mid)) {
    const u = CONTENT.sites[site.kind]?.under;
    if (!u) continue;
    const ci = Math.floor(site.cx / PITCH);
    const cj = Math.floor(site.cy / PITCH);
    if (ci >= i0 && ci < i0 + NODES && cj >= j0 && cj < j0 + NODES) plan.boost.set(nodeKey(ci, cj), { hall: u.hall, site: site.kind });
    const span = Math.ceil(u.reach / PITCH);
    for (let j = Math.max(j0, cj - span); j <= Math.min(j0 + NODES - 1, cj + span); j++) {
      for (let i = Math.max(i0, ci - span); i <= Math.min(i0 + NODES - 1, ci + span); i++) {
        if (Math.hypot(i * PITCH + 8 - site.cx, j * PITCH + 8 - site.cy) > u.reach) continue;
        const nk = nodeKey(i, j);
        plan.dense.set(nk, Math.max(plan.dense.get(nk) ?? 0, u.density));
      }
    }
  }
  return plan;
}

/** Does the link from node (i, j) to its east (axis 0) or south (axis 1) neighbour exist? */
function link(seed: number, i: number, j: number, axis: 0 | 1): boolean {
  const roll = hash2(seed + 4001 + axis * 17, i, j);
  if (roll < 0.74) return true;
  const a = planFor(seed, i, j).dense.get(nodeKey(i, j)) ?? 0;
  const ni = axis === 0 ? i + 1 : i;
  const nj = axis === 1 ? j + 1 : j;
  const b = planFor(seed, ni, nj).dense.get(nodeKey(ni, nj)) ?? 0;
  return roll < Math.max(a, b);
}

function hasHall(seed: number, i: number, j: number): boolean {
  return link(seed, i, j, 0) || link(seed, i, j, 1) || link(seed, i - 1, j, 0) || link(seed, i, j - 1, 1) || planFor(seed, i, j).boost.has(nodeKey(i, j));
}

/** The hall of node (i, j): where its middle is and how far it reaches either way (always inside its own cell). */
function hall(seed: number, i: number, j: number): { cx: number; cy: number; hx: number; hy: number } {
  const b = planFor(seed, i, j).boost.get(nodeKey(i, j));
  // Under a place: a great hall, dead centre in its square.
  if (b) return { cx: i * PITCH + 8, cy: j * PITCH + 8, hx: b.hall, hy: b.hall };
  const cx = i * PITCH + 8 + Math.floor(hash2(seed + 4011, i, j) * 5) - 2;
  const cy = j * PITCH + 8 + Math.floor(hash2(seed + 4012, i, j) * 5) - 2;
  const hx = 2 + Math.floor(hash2(seed + 4013, i, j) * 4);
  const hy = 2 + Math.floor(hash2(seed + 4014, i, j) * 4);
  return { cx, cy, hx, hy };
}

/** What the lattice is at tile (x, y): living rock, a corridor or a hall. */
export function latticeSpot(seed: number, x: number, y: number): Spot {
  const i = Math.floor(x / PITCH);
  const j = Math.floor(y / PITCH);
  if (hasHall(seed, i, j)) {
    const h = hall(seed, i, j);
    if (x >= h.cx - h.hx && x <= h.cx + h.hx && y >= h.cy - h.hy && y <= h.cy + h.hy) return 'hall';
  }
  // Corridors run along the middle row/column of each cell, three metres wide, to the next cell's middle.
  const mx = i * PITCH + 8;
  const my = j * PITCH + 8;
  const dy = Math.abs(y - my);
  if (dy <= 2) {
    const e = x >= mx ? i : i - 1;
    if (link(seed, e, j, 0) && dy <= 1) return 'corridor';
  }
  const dx = Math.abs(x - mx);
  if (dx <= 2) {
    const e = y >= my ? j : j - 1;
    if (link(seed, i, e, 1) && dx <= 1) return 'corridor';
  }
  // A road, path or trail above: an open artery straight beneath it, five metres wide.
  const w = wayHit(landOf(seed), x + 0.5, y + 0.5, ARTERY);
  if (w !== null && w.d <= ARTERY) return 'corridor';
  return 'rock';
}

/** What stands on this tile: living rock, bare floor, or a pillar or fallen stone in a hall. */
export function latticeTile(seed: number, x: number, y: number): TileKind {
  const spot = latticeSpot(seed, x, y);
  if (spot === 'rock') return tileCode('caveRock');
  if (spot === 'hall') {
    const i = Math.floor(x / PITCH);
    const j = Math.floor(y / PITCH);
    const h = hall(seed, i, j);
    const big = h.hx >= 4 && h.hy >= 4;
    const dx = x - h.cx;
    const dy = y - h.cy;
    // Great halls hold rows of pillars, but never in the way of a doorway at the middle.
    if (big && Math.abs(dx) % 3 === 0 && Math.abs(dy) % 3 === 0 && Math.abs(dx) >= 3 && Math.abs(dy) >= 3) return tileCode('ruinWall');
    const r = hash2(seed + 4021, x, y);
    if (r < 0.025 && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) return tileCode('rubble');
  }
  return tileCode('flagstone');
}

/** A chunk of the underworld, made from the seed alone. */
export function generateLatticeChunk(seed: number, cx: number, cy: number): Chunk {
  const c = emptyChunk(cx, cy);
  const floor = CONTENT.realms['underworld']?.floor ?? 2;
  c.height.fill(floor);
  for (let j = 0; j < CHUNK_SIZE; j++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const k = latticeTile(seed, cx * CHUNK_SIZE + i, cy * CHUNK_SIZE + j);
      c.kind[j * CHUNK_SIZE + i] = k;
    }
  }
  return c;
}

/** Lays the roof over a chunk's open floor as cells of the 3D layer (so it is rock overhead for everything). */
export function roofLatticeChunk(volume: Volume, seed: number, cx: number, cy: number): void {
  const r = CONTENT.realms['underworld'];
  const floor = r?.floor ?? 2;
  const mat = tileCode(r?.ceiling?.tile ?? 'ruinWall');
  const solid = shapeByte(CUBE, 0);
  const c = r?.ceiling ?? { hall: 7, corridor: 4 };
  for (let j = 0; j < CHUNK_SIZE; j++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const x = cx * CHUNK_SIZE + i;
      const y = cy * CHUNK_SIZE + j;
      const spot = latticeSpot(seed, x, y);
      if (spot === 'rock') continue;
      volume.set(x, y, floor + (spot === 'hall' ? c.hall : c.corridor), solid, mat);
    }
  }
}

/** Cell sizes (metres) above this are drawn as plain rock: the fog has closed in long before. */
const NEAR_DETAIL = 4;

/** What the renderer asks for far away: the same lattice, as a sample. */
export class LatticeSampler implements WorldSampler {
  constructor(private readonly seed: number) {}

  sample(x: number, y: number, detail: number): WorldSample {
    const floor = CONTENT.realms['underworld']?.floor ?? 2;
    // Beyond a few metres of detail it is all far past the fog: solid rock, and no need to work out the lattice
    // (doing so for the huge coarse blocks used to stall the renderer for a long while after the descent).
    if (detail > NEAR_DETAIL) return { ground: floor, biome: 'meadow', trees: 0, road: 0, built: tileCode('caveRock') };
    const spot = latticeSpot(this.seed, Math.floor(x), Math.floor(y));
    return { ground: floor, biome: 'meadow', trees: 0, road: 0, built: spot === 'rock' ? tileCode('caveRock') : null };
  }

  naturalKinds(cx: number, cy: number): Uint8Array {
    return generateLatticeChunk(this.seed, cx, cy).kind;
  }
}

export interface HallSpot {
  /** Middle of the hall and how far it reaches either way (tiles). */
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  /** A number 0..1 fixed by the seed, to roll the hall's contents. */
  roll: number;
  /** The kind of place above, if this is the great hall beneath one (content/sites.ts `under`). */
  site?: string;
}

/** The halls whose middle lies inside chunk (cx, cy). */
export function hallsInChunk(seed: number, cx: number, cy: number): HallSpot[] {
  const out: HallSpot[] = [];
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  for (let j = Math.floor(y0 / PITCH); j <= Math.floor((y0 + CHUNK_SIZE - 1) / PITCH); j++) {
    for (let i = Math.floor(x0 / PITCH); i <= Math.floor((x0 + CHUNK_SIZE - 1) / PITCH); i++) {
      if (!hasHall(seed, i, j)) continue;
      const h = hall(seed, i, j);
      if (h.cx < x0 || h.cx >= x0 + CHUNK_SIZE || h.cy < y0 || h.cy >= y0 + CHUNK_SIZE) continue;
      const site = planFor(seed, i, j).boost.get(nodeKey(i, j))?.site;
      out.push({ ...h, roll: hash2(seed + 4031, i, j), ...(site !== undefined ? { site } : {}) });
    }
  }
  return out;
}
