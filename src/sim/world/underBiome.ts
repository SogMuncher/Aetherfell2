// Which underworld biome a hall node lies in, and which room its hall is: rolled from the seed, swayed by the land above
import type { RealmDef, UnderBiomeDef, UnderRoomDef } from '../../types';
import { CONTENT } from '../../content';
import { hash2, valueNoise } from './noise';
import { landOf } from './terrain';
import { PITCH } from './underPlan';

/**
 * The underworld is split into regions about `lattice.zone` metres across (their borders warped so they do not run on
 * the grid), each one biome of `lattice.biomes`, picked by weight and three times likelier under a land biome it
 * favours. Everything about a node (its hall, its corridors, its rock) follows its region's biome, so the borders fall
 * between nodes and never cut a hall in two.
 */
type Lattice = NonNullable<RealmDef['lattice']>;

/** The plain halls, when a realm names no biomes. */
const PLAIN: UnderBiomeDef = { name: 'the halls', weight: 1, wall: 'caveRock', floor: 'flagstone', shape: 'rooms', hall: [2, 5], height: 7, corridor: { half: 1, height: 4 }, link: 0.74, rooms: [{ weight: 1 }] };

export interface NodeBiome {
  id: string;
  def: UnderBiomeDef;
}

const cache = new Map<number, NodeBiome>();
let cacheSeed = Number.NaN;

const lattice = (): Lattice | undefined => CONTENT.realms['underworld']?.lattice;

/** The biome of hall node (i, j). */
export function biomeOf(seed: number, i: number, j: number): NodeBiome {
  const L = lattice();
  const list = L?.biomes;
  if (!list) return { id: 'halls', def: PLAIN };
  const zone = L?.zone ?? 96;
  const wx = i * PITCH + 8 + (valueNoise(seed + 4301, i / 4, j / 4) - 0.5) * zone * 0.8;
  const wy = j * PITCH + 8 + (valueNoise(seed + 4302, i / 4, j / 4) - 0.5) * zone * 0.8;
  const zx = Math.floor(wx / zone);
  const zy = Math.floor(wy / zone);
  if (seed !== cacheSeed || cache.size > 8192) {
    cache.clear();
    cacheSeed = seed;
  }
  const key = (zx + 32768) * 65536 + (zy + 32768);
  const hit = cache.get(key);
  if (hit) return hit;
  // The land biome over the middle of the region sways the pick.
  const land = landOf(seed);
  const mx = (zx + 0.5) * zone;
  const my = (zy + 0.5) * zone;
  const above = land.biomeAt(mx, my, land.ground(mx, my, 3));
  const entries = Object.entries(list);
  const weight = (d: UnderBiomeDef): number => d.weight * (d.favours?.includes(above) ? 3 : 1);
  let total = 0;
  for (const [, d] of entries) total += weight(d);
  let r = hash2(seed + 4303, zx, zy) * total;
  let out: NodeBiome = { id: entries[0]?.[0] ?? 'halls', def: entries[0]?.[1] ?? PLAIN };
  for (const [id, d] of entries) {
    r -= weight(d);
    if (r < 0) {
      out = { id, def: d };
      break;
    }
  }
  cache.set(key, out);
  return out;
}

/** The room the hall of node (i, j) is, by weight among its biome's rooms. */
export function roomOf(seed: number, i: number, j: number, b: UnderBiomeDef = biomeOf(seed, i, j).def): { index: number; def: UnderRoomDef } {
  let total = 0;
  for (const r of b.rooms) total += r.weight;
  let r = hash2(seed + 4304, i, j) * total;
  for (let k = 0; k < b.rooms.length; k++) {
    const room = b.rooms[k] as UnderRoomDef;
    r -= room.weight;
    if (r < 0) return { index: k, def: room };
  }
  return { index: 0, def: b.rooms[0] ?? { weight: 1 } };
}
