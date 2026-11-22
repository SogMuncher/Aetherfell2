import type { RealmDef, TileKind } from '../../types';
import { CONTENT } from '../../content';
import { tileCode, TILES } from '../../content/tiles';
import { hash2, valueNoise } from './noise';
import { landOf } from './terrain';
import { wayHit } from './roads';
import { nodeKey, PITCH, planFor } from './underPlan';

/**
 * What the underworld is at one tile, read from the land above by one generic transform (data: `RealmDef.lattice`,
 * `SiteDef.under`), so whatever improves the land improves what lies under it:
 * - rivers and lakes run on below, with open shores; where a way crosses them it goes over on a deck (the way's own bridge deck);
 * - every place with a cavern has an open cave round it, tall in the middle; a ruined place's own buildings stand in it;
 * - every road, path and trail is an artery on its exact line, wider and taller for greater ways;
 * - the rest is a lattice of small halls and narrow corridors on a 16 m grid, denser near places: the tight, creepy part.
 * The answer is the floor kind and the clear height over it; underworld.ts turns that into tiles and rock overhead.
 */
export type Spot = 'rock' | 'corridor' | 'hall' | 'way' | 'cavern' | 'shore' | 'water' | 'bridge';

export interface UnderSpot {
  spot: Spot;
  /** Clear height over the floor (metres), 0 in rock. */
  ceil: number;
  /** Height of the ground here (below the floor under water). */
  bed: number;
  /** Water surface, NaN where dry. */
  level: number;
  /** Tile the spot is laid with, when it is not plain floor (pillars, a place's own streets). */
  tile: TileKind | null;
  /** A deck over water: the tile it is made of. */
  deck: TileKind | null;
}

type Lattice = NonNullable<RealmDef['lattice']>;
const FALLBACK: Lattice = { tile: 'caveRock', shell: 2, corridor: 4, hall: 7, way: { widen: 1, height: [4, 6, 9] }, water: { bank: 3, height: 6, rise: 0.4, max: 18, sink: 0.35, depth: 2.4 } };
const lattice = (): Lattice => CONTENT.realms['underworld']?.lattice ?? FALLBACK;
export const underFloor = (): number => CONTENT.realms['underworld']?.floor ?? 2;

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

export function hasHall(seed: number, i: number, j: number): boolean {
  return link(seed, i, j, 0) || link(seed, i, j, 1) || link(seed, i - 1, j, 0) || link(seed, i, j - 1, 1) || planFor(seed, i, j).boost.has(nodeKey(i, j));
}

/** The hall of node (i, j): where its middle is and how far it reaches either way (always inside its own cell). */
export function hall(seed: number, i: number, j: number): { cx: number; cy: number; hx: number; hy: number } {
  const b = planFor(seed, i, j).boost.get(nodeKey(i, j));
  // Under a place: a great hall, dead centre in its square.
  if (b) return { cx: i * PITCH + 8, cy: j * PITCH + 8, hx: b.hall, hy: b.hall };
  const cx = i * PITCH + 8 + Math.floor(hash2(seed + 4011, i, j) * 5) - 2;
  const cy = j * PITCH + 8 + Math.floor(hash2(seed + 4012, i, j) * 5) - 2;
  const hx = 2 + Math.floor(hash2(seed + 4013, i, j) * 4);
  const hy = 2 + Math.floor(hash2(seed + 4014, i, j) * 4);
  return { cx, cy, hx, hy };
}

const make = (spot: Spot, ceil: number, tile: TileKind | null = null): UnderSpot => ({ spot, ceil, bed: underFloor(), level: Number.NaN, tile, deck: null });
const ROCK: Readonly<UnderSpot> = { spot: 'rock', ceil: 0, bed: 0, level: Number.NaN, tile: null, deck: null };

/** The deck tile of the way of this rank (its bridge deck on the surface). */
function deckOf(rank: number): TileKind {
  const g = Object.values(CONTENT.world.roads.grades).find((d) => d.rank === rank);
  return tileCode(g?.bridge?.deck ?? 'flagstone');
}

/** What the underworld is at tile (x, y). */
export function underAt(seed: number, x: number, y: number): UnderSpot {
  const L = lattice();
  const land = landOf(seed);
  const px = x + 0.5;
  const py = y + 0.5;
  const way = wayHit(land, px, py, L.way.widen);
  // Rivers and lakes run on below the land, with a shore to walk; a way crosses on a deck.
  const ws = land.waterSpotAt(px, py);
  if (ws && ws.edge < L.water.bank) {
    const out = Math.max(0, -ws.edge);
    const s = make('shore', Math.min(L.water.max, L.water.height + out * L.water.rise));
    if (ws.edge < 0) {
      s.level = underFloor() - L.water.sink;
      s.bed = s.level - Math.min(L.water.depth, 0.4 + out * 0.5);
      s.spot = way ? 'bridge' : 'water';
      if (way) s.deck = deckOf(way.rank);
    }
    return s;
  }
  // Under a place: a cave, its rim worn by noise, its roof highest in the middle; natural pillars, or the place's own streets.
  for (const c of planFor(seed, Math.floor(x / PITCH), Math.floor(y / PITCH)).caverns) {
    const d = Math.hypot(px - c.cx, py - c.cy);
    if (d > c.r * 1.2) continue;
    const rim = c.r * (0.8 + 0.4 * valueNoise(seed + 4101, x / 23, y / 23));
    if (d >= rim) continue;
    const t = d / rim;
    const s = make('cavern', Math.round(c.hi - (c.hi - c.lo) * t * t * t));
    if (c.ruin > 0) {
      const k = c.site.paint?.(x, y) ?? null;
      // Its paved streets and squares, not its gardens: nothing green grows down here.
      if (k !== null && !TILES[k]?.solid && TILES[k]?.material !== 'grass') s.tile = k;
    } else if (d > 6 && t < 0.9) {
      const gx = Math.floor(x / 7);
      const gy = Math.floor(y / 7);
      const h = hash2(seed + 4103, gx, gy);
      const r = h < 0.08 ? 1 : 0;
      if (h < 0.2 && Math.abs(x - (gx * 7 + 3)) <= r && Math.abs(y - (gy * 7 + 3)) <= r) s.tile = tileCode(L.tile);
    }
    return s;
  }
  // The lattice: halls in their cells, corridors three metres wide along the middle row/column to the next cell.
  const i = Math.floor(x / PITCH);
  const j = Math.floor(y / PITCH);
  if (hasHall(seed, i, j)) {
    const h = hall(seed, i, j);
    if (x >= h.cx - h.hx && x <= h.cx + h.hx && y >= h.cy - h.hy && y <= h.cy + h.hy) return make('hall', L.hall);
  }
  const mx = i * PITCH + 8;
  const my = j * PITCH + 8;
  const dy = Math.abs(y - my);
  if (dy <= 1 && link(seed, x >= mx ? i : i - 1, j, 0)) return make('corridor', L.corridor);
  const dx = Math.abs(x - mx);
  if (dx <= 1 && link(seed, i, y >= my ? j : j - 1, 1)) return make('corridor', L.corridor);
  // A road, path or trail above: an artery on its exact line, as wide as the way and a little more, taller for greater ways.
  if (way) return make('way', L.way.height[way.rank - 1] ?? L.corridor);
  return ROCK;
}
