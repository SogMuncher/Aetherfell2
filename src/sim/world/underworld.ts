import type { Chunk, TileKind, Volume, WorldSample, WorldSampler } from '../../types';
import { CHUNK_SIZE, shapeByte } from '../../types';
import { CONTENT } from '../../content';
import { shapeId } from '../../content/shapes';
import { tileCode, TILES } from '../../content/tiles';
import { hash2 } from './noise';
import { emptyChunk } from './chunkgen';
import { hall, hasHall, underAt, underFloor } from './underSpot';
import type { Spot } from './underSpot';
import { nodeKey, PITCH, planFor } from './underPlan';

export { PITCH } from './underPlan';
export type { Spot } from './underSpot';

/**
 * The ground of the underworld, laid exactly beneath the land (one metre below every metre above). A pure function of
 * (seed, x, y) like the surface, so every machine grows the same rock and the renderer can sample it from afar. What it
 * is at each spot is read from the land above (underSpot.ts); here that becomes ordinary tiles (floor, living rock, water)
 * and, overhead, ordinary cells of the 3D layer, so fire, rain, blows, light, saving and sync treat it like any other place.
 */

const CUBE = shapeId('cube');
const ARCH = shapeId('archCurve');

/** What the underworld is at tile (x, y) (see underSpot.ts). */
export function latticeSpot(seed: number, x: number, y: number): Spot {
  return underAt(seed, x, y).spot;
}

/** What stands on this tile: living rock, water, bare floor, or a pillar or fallen stone in a hall. */
export function latticeTile(seed: number, x: number, y: number): TileKind {
  return latticeTileOf(seed, x, y, underAt(seed, x, y));
}

function latticeTileOf(seed: number, x: number, y: number, u: ReturnType<typeof underAt>): TileKind {
  if (u.spot === 'rock') return tileCode('caveRock');
  if (u.spot === 'water' || u.spot === 'bridge') return tileCode('water');
  if (u.tile !== null) return u.tile;
  if (u.spot === 'hall') {
    const i = Math.floor(x / PITCH);
    const j = Math.floor(y / PITCH);
    const h = hall(seed, i, j);
    const big = h.hx >= 4 && h.hy >= 4;
    const dx = x - h.cx;
    const dy = y - h.cy;
    // Great halls hold rows of pillars, but never in the way of a doorway at the middle.
    if (big && Math.abs(dx) % 3 === 0 && Math.abs(dy) % 3 === 0 && Math.abs(dx) >= 3 && Math.abs(dy) >= 3) return tileCode('ruinWall');
  }
  if (u.spot !== 'shore' && hash2(seed + 4021, x, y) < 0.02) return tileCode('rubble');
  return tileCode(u.spot === 'shore' ? 'sand' : u.spot === 'cavern' ? 'caveFloor' : 'flagstone');
}

/** A chunk of the underworld, made from the seed alone. Ground corners sit at the lowest bed they touch, so shores slope into the water. */
export function generateLatticeChunk(seed: number, cx: number, cy: number): Chunk {
  const c = emptyChunk(cx, cy);
  const floor = underFloor();
  const T = CHUNK_SIZE + 2;
  const bed = new Float32Array(T * T);
  for (let j = 0; j < T; j++) {
    for (let i = 0; i < T; i++) {
      const x = cx * CHUNK_SIZE + i - 1;
      const y = cy * CHUNK_SIZE + j - 1;
      const u = underAt(seed, x, y);
      bed[j * T + i] = u.spot === 'rock' ? floor : u.bed;
      if (i < 1 || j < 1 || i > CHUNK_SIZE || j > CHUNK_SIZE) continue;
      const k = (j - 1) * CHUNK_SIZE + i - 1;
      const kind = latticeTileOf(seed, x, y, u);
      c.kind[k] = kind;
      c.fuel[k] = TILES[kind]?.fuel ?? 0;
      if (!Number.isNaN(u.level)) c.level[k] = u.level;
    }
  }
  const W = CHUNK_SIZE + 1;
  for (let j = 0; j < W; j++) {
    for (let i = 0; i < W; i++) c.height[j * W + i] = Math.min(bed[j * T + i] ?? floor, bed[j * T + i + 1] ?? floor, bed[(j + 1) * T + i] ?? floor, bed[(j + 1) * T + i + 1] ?? floor);
  }
  return c;
}

/**
 * The rock overhead, as cells of the 3D layer over every open tile: `shell` cells from its clear height, and down the side
 * of a lower roof up to the next tile's roof, so where a tall cave meets a low corridor the step is closed and nothing can
 * get above the rock. Decks over water are laid here too. Living rock itself is a tile wall far taller than any roof.
 */
export function roofLatticeChunk(volume: Volume, seed: number, cx: number, cy: number): void {
  const L = CONTENT.realms['underworld']?.lattice;
  const floor = underFloor();
  const mat = tileCode(L?.tile ?? 'caveRock');
  const solid = shapeByte(CUBE, 0);
  const W = CHUNK_SIZE + 2;
  const ceil = new Int16Array(W * W);
  const x0 = cx * CHUNK_SIZE - 1;
  const y0 = cy * CHUNK_SIZE - 1;
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) ceil[j * W + i] = Math.round(underAt(seed, x0 + i, y0 + j).ceil);
  for (let j = 1; j <= CHUNK_SIZE; j++) {
    for (let i = 1; i <= CHUNK_SIZE; i++) {
      const c = ceil[j * W + i] ?? 0;
      if (c <= 0) continue;
      let top = c;
      for (const n of [ceil[j * W + i - 1], ceil[j * W + i + 1], ceil[(j - 1) * W + i], ceil[(j + 1) * W + i]]) top = Math.max(top, n ?? 0);
      const x = x0 + i;
      const y = y0 + j;
      for (let z = floor + c; z < floor + top + (L?.shell ?? 2); z++) volume.set(x, y, z, solid, mat);
      // Vaulting: under a roof three metres up or more, the rock curves down into a wall beside it (a round arch
      // half springing from the wall: -x, +x, -y, +y walls take turns 0, 2, 1, 3).
      if (c >= 3) {
        const side = [ceil[j * W + i - 1], ceil[j * W + i + 1], ceil[(j - 1) * W + i], ceil[(j + 1) * W + i]].findIndex((n) => (n ?? 0) <= 0);
        if (side >= 0) volume.set(x, y, floor + c - 1, shapeByte(ARCH, [0, 2, 1, 3][side] ?? 0), mat);
      }
      const u = underAt(seed, x, y);
      if (u.deck !== null) volume.set(x, y, floor - 1, solid, u.deck);
    }
  }
}

/** Cell sizes (metres) above this are drawn as plain rock: the fog has closed in long before. */
const NEAR_DETAIL = 4;

/** What the renderer asks for far away: the same lattice, as a sample. */
export class LatticeSampler implements WorldSampler {
  constructor(private readonly seed: number) {}

  sample(x: number, y: number, detail: number): WorldSample {
    const floor = underFloor();
    // Beyond a few metres of detail it is all far past the fog: solid rock, and no need to work out the lattice
    // (doing so for the huge coarse blocks used to stall the renderer for a long while after the descent).
    if (detail > NEAR_DETAIL) return { ground: floor, biome: 'meadow', trees: 0, road: 0, built: tileCode('caveRock') };
    const u = underAt(this.seed, Math.floor(x), Math.floor(y));
    const s: WorldSample = { ground: u.spot === 'rock' ? floor : u.bed, biome: 'meadow', trees: 0, road: 0, built: u.spot === 'rock' ? tileCode('caveRock') : null };
    if (!Number.isNaN(u.level)) s.water = u.level;
    return s;
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
  /** False when it opens into a cave or onto water: nothing hangs on walls that are not there. */
  walled: boolean;
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
      const walled = underAt(seed, h.cx, h.cy).spot === 'hall';
      // A small hall swallowed by a cave or a river is no hall; the great hall under a place keeps its hoard even in a cave.
      if (!walled && site === undefined) continue;
      out.push({ ...h, roll: hash2(seed + 4031, i, j), walled, ...(site !== undefined ? { site } : {}) });
    }
  }
  return out;
}
