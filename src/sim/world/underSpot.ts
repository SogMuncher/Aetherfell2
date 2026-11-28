import type { RealmDef, TileKind, UnderBiomeDef } from '../../types';
import { CONTENT } from '../../content';
import { tileCode, TILES } from '../../content/tiles';
import { hash2, valueNoise } from './noise';
import { landOf } from './terrain';
import { wayHit } from './roads';
import { nodeKey, PITCH, planFor } from './underPlan';
import { biomeOf } from './underBiome';
import { bend, doorOf, hall, inHall, link, roomTile } from './underRooms';

export { hall, hasHall } from './underRooms';

/**
 * What the underworld is at one tile, read from the land above by one generic transform (data: `RealmDef.lattice`,
 * `SiteDef.under`), so whatever improves the land improves what lies under it:
 * - rivers and lakes run on below, with open shores; where a way crosses them it goes over on a deck (the way's own bridge deck);
 * - every place with a cavern has an open cave round it, tall in the middle; a ruined place's own buildings stand in it;
 * - rivers of the dark alone wind through the rock (`lattice.streams`), bridged where a corridor or way crosses;
 * - every road, path and trail is an artery on its exact line, paved by its rank, with kerbs: the old roads;
 * - the rest is a lattice of halls and corridors on a 16 m grid, dug by each region's biome (underBiome.ts, underRooms.ts).
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
  /** Tile the spot is laid with, when it is not plain floor (pillars, doors, paving, a place's own streets, ore in rock). */
  tile: TileKind | null;
  /** A deck over water: the tile it is made of. */
  deck: TileKind | null;
  /** The rock of the roof and walls here (its biome's). */
  wall: TileKind;
  /** -1, or a level above: 0..2 a stair tile from its foot, 3 a gallery walkway (underRooms.ts). */
  upper: number;
  /** What that level is made of. */
  upperTile: TileKind;
}

type Lattice = NonNullable<RealmDef['lattice']>;
const FALLBACK: Lattice = { tile: 'caveRock', shell: 2, corridor: 4, hall: 7, way: { widen: 1, height: [4, 6, 9] }, water: { bank: 3, height: 6, rise: 0.4, max: 18, sink: 0.35, depth: 2.4 } };
const lattice = (): Lattice => CONTENT.realms['underworld']?.lattice ?? FALLBACK;
export const underFloor = (): number => CONTENT.realms['underworld']?.floor ?? 2;

const make = (spot: Spot, ceil: number, wall: TileKind, tile: TileKind | null = null): UnderSpot => ({ spot, ceil, bed: underFloor(), level: Number.NaN, tile, deck: null, wall, upper: -1, upperTile: wall });

/** The deck tile of the way of this rank (its bridge deck on the surface). */
function deckOf(rank: number): TileKind {
  const g = Object.values(CONTENT.world.roads.grades).find((d) => d.rank === rank);
  return tileCode(g?.bridge?.deck ?? 'flagstone');
}

/** Water `out` metres in from its bank (negative = on the bank): the bed sinks the further out. */
function wet(s: UnderSpot, L: Lattice, edge: number): void {
  const out = Math.max(0, -edge);
  s.ceil = Math.max(s.ceil, Math.min(L.water.max, L.water.height + out * L.water.rise));
  if (edge >= 0) return;
  s.level = underFloor() - L.water.sink;
  s.bed = s.level - Math.min(L.water.depth, 0.4 + out * 0.5);
}

/** What the underworld is at tile (x, y). */
export function underAt(seed: number, x: number, y: number): UnderSpot {
  const L = lattice();
  const land = landOf(seed);
  const px = x + 0.5;
  const py = y + 0.5;
  const nb = biomeOf(seed, Math.floor(x / PITCH), Math.floor(y / PITCH)).def;
  const wall = tileCode(nb.wall);
  const way = wayHit(land, px, py, L.way.widen);
  // Rivers and lakes run on below the land, with a shore to walk; a way crosses on a deck.
  const ws = land.waterSpotAt(px, py);
  if (ws && ws.edge < L.water.bank) {
    const s = make('shore', 0, wall);
    wet(s, L, ws.edge);
    if (ws.edge < 0) {
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
    const s = make('cavern', Math.round(c.hi - (c.hi - c.lo) * t * t * t), wall);
    if (c.ruin > 0) {
      const k = c.site.paint?.(x, y) ?? null;
      // Its paved streets and squares, not its gardens: nothing green grows down here.
      if (k !== null && !TILES[k]?.solid && TILES[k]?.material !== 'grass') s.tile = k;
    } else if (d > 6 && t < 0.9) {
      const gx = Math.floor(x / 7);
      const gy = Math.floor(y / 7);
      const h = hash2(seed + 4103, gx, gy);
      const r = h < 0.08 ? 1 : 0;
      if (h < 0.2 && Math.abs(x - (gx * 7 + 3)) <= r && Math.abs(y - (gy * 7 + 3)) <= r) s.tile = wall;
    }
    return s;
  }
  const s = dryAt(seed, x, y, L, nb, wall, way);
  // Rivers of the dark alone: a winding band where the noise crosses its middle, in the parts of the land that have them.
  const st = L.streams;
  const great = s.spot === 'hall' && planFor(seed, Math.floor(x / PITCH), Math.floor(y / PITCH)).boost.has(nodeKey(Math.floor(x / PITCH), Math.floor(y / PITCH)));
  if (st && !great && valueNoise(seed + 4202, x / (st.scale * 4), y / (st.scale * 4)) < st.share) {
    const edge = (Math.abs(valueNoise(seed + 4201, x / st.scale, y / st.scale) - 0.5) - st.width) * st.scale * 2;
    if (edge < L.water.bank) {
      const crossing = s.spot === 'corridor' || s.spot === 'way';
      if (s.spot === 'rock') Object.assign(s, make('shore', 0, wall));
      if (s.spot === 'shore' || edge < 0) {
        wet(s, L, edge);
        if (edge < 0) {
          s.deck = crossing ? (way ? deckOf(way.rank) : tileCode('woodFloor')) : null;
          s.spot = crossing ? 'bridge' : 'water';
          s.tile = null;
          s.upper = -1;
        }
      }
    }
  }
  return s;
}

/** The halls, corridors and old roads, as dug by the biome of the tile's node. */
function dryAt(seed: number, x: number, y: number, L: Lattice, nb: UnderBiomeDef, wall: TileKind, way: ReturnType<typeof wayHit>): UnderSpot {
  const g = inHall(seed, x, y);
  if (g) {
    const rt = roomTile(seed, x, y, g);
    const great = planFor(seed, g.i, g.j).boost.has(nodeKey(g.i, g.j));
    const lift = nb.shape === 'caves' ? Math.round((valueNoise(seed + 4113, x / 6, y / 6) - 0.5) * 4) : 0;
    const s = make('hall', (great ? Math.max(nb.height, L.hall) : nb.height) + lift, wall, rt.tile ?? floorOf(seed, x, y, nb, g.room.floor ?? nb.floor));
    s.upper = rt.upper;
    if (g.room.gallery !== undefined) s.upperTile = tileCode(g.room.gallery);
    if (rt.sink > 0) {
      s.bed -= rt.sink;
      s.ceil += Math.round(rt.sink);
      // A flooded pit: water stands in it wherever it is deeper than the rivers' level.
      if (g.room.pool && rt.sink > L.water.sink + 0.15) {
        s.level = underFloor() - L.water.sink;
        s.tile = null;
      }
    }
    return s;
  }
  const i = Math.floor(x / PITCH);
  const j = Math.floor(y / PITCH);
  const mx = i * PITCH + 8;
  const my = j * PITCH + 8;
  const cfloor = nb.corridorFloor ?? nb.floor;
  const cceil = nb.corridor.height + (nb.shape === 'caves' ? Math.round(valueNoise(seed + 4115, x / 5, y / 5) * 2) : 0);
  // East-west: the corridor from hall a to hall a + 1 along row j.
  const a = x >= mx ? i : i - 1;
  const ex = bend(seed, nb, x, j, Math.min(x - (a * PITCH + 8), (a + 1) * PITCH + 8 - x));
  if (Math.abs(y - (my + ex.off)) <= ex.half && link(seed, a, j, 0)) {
    const door = Math.abs(x - mx) > 1 ? (x === hall(seed, a, j).cx + hall(seed, a, j).hx + 1 ? doorOf(seed, a, j, 1) : x === hall(seed, a + 1, j).cx - hall(seed, a + 1, j).hx - 1 ? doorOf(seed, a + 1, j, 0) : undefined) : undefined;
    if (door !== undefined) return y === my ? make('corridor', 3, wall, door) : make('rock', 0, wall, wall);
    return make('corridor', cceil, wall, floorOf(seed, x, y, nb, cfloor));
  }
  // North-south: from hall b to hall b + 1 along column i.
  const b = y >= my ? j : j - 1;
  const ey = bend(seed, nb, y, i + 7919, Math.min(y - (b * PITCH + 8), (b + 1) * PITCH + 8 - y));
  if (Math.abs(x - (mx + ey.off)) <= ey.half && link(seed, i, b, 1)) {
    const door = Math.abs(y - my) > 1 ? (y === hall(seed, i, b).cy + hall(seed, i, b).hy + 1 ? doorOf(seed, i, b, 3) : y === hall(seed, i, b + 1).cy - hall(seed, i, b + 1).hy - 1 ? doorOf(seed, i, b + 1, 2) : undefined) : undefined;
    if (door !== undefined) return x === mx ? make('corridor', 3, wall, door) : make('rock', 0, wall, wall);
    return make('corridor', cceil, wall, floorOf(seed, x, y, nb, cfloor));
  }
  // A road, path or trail above: an artery on its exact line, paved by its rank, kerbed, taller for greater ways.
  if (way) {
    const kerb = L.way.kerb !== undefined && way.d > way.half + L.way.widen - 1;
    const pave = kerb ? L.way.kerb : L.way.floor?.[way.rank - 1];
    return make('way', L.way.height[way.rank - 1] ?? L.corridor, wall, pave !== undefined ? tileCode(pave) : null);
  }
  // Living rock, here and there a vein of something else.
  const v = nb.vein;
  return make('rock', 0, wall, v && hash2(seed + 4120, Math.floor(x / 3), Math.floor(y / 3)) < v.share ? tileCode(v.tile) : wall);
}

/** A floor tile, now and then strewn with the biome's rubble. */
function floorOf(seed: number, x: number, y: number, b: UnderBiomeDef, id: string): TileKind {
  return tileCode(b.rubble && hash2(seed + 4021, x, y) < b.rubble.chance ? b.rubble.tile : id);
}
