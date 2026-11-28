// Underworld halls and corridors on the 16 m grid: which links are open, each hall's size and shape, and what is in its floor plan
import type { TileKind, UnderBiomeDef, UnderRoomDef } from '../../types';
import { tileCode } from '../../content/tiles';
import { hash2, valueNoise } from './noise';
import { nodeKey, PITCH, planFor } from './underPlan';
import { biomeOf, roomOf } from './underBiome';

/**
 * The hall lattice, dug by each node's biome (underBiome.ts): squared halls and straight corridors ('rooms') or rounded
 * hollows and winding passages ('caves'); and each hall's room plan (pillars, shelves lining the walls, a gallery with
 * its stair, a sunken floor). Read by underSpot.ts; all of it a pure function of the seed.
 */

/** Does the link from node (i, j) to its east (axis 0) or south (axis 1) neighbour exist? */
export function link(seed: number, i: number, j: number, axis: 0 | 1): boolean {
  const roll = hash2(seed + 4001 + axis * 17, i, j);
  const ni = axis === 0 ? i + 1 : i;
  const nj = axis === 1 ? j + 1 : j;
  if (roll < Math.min(biomeOf(seed, i, j).def.link, biomeOf(seed, ni, nj).def.link)) return true;
  const a = planFor(seed, i, j).dense.get(nodeKey(i, j)) ?? 0;
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
  const [lo, hi] = biomeOf(seed, i, j).def.hall;
  const hx = Math.min(7, lo + Math.floor(hash2(seed + 4013, i, j) * (hi - lo + 1)));
  const hy = Math.min(7, lo + Math.floor(hash2(seed + 4014, i, j) * (hi - lo + 1)));
  // Its middle wanders a little, as far as it can while the hall stays inside its cell.
  const ox = Math.min(2, 7 - hx);
  const oy = Math.min(2, 7 - hy);
  const cx = i * PITCH + 8 + Math.floor(hash2(seed + 4011, i, j) * (ox * 2 + 1)) - ox;
  const cy = j * PITCH + 8 + Math.floor(hash2(seed + 4012, i, j) * (oy * 2 + 1)) - oy;
  return { cx, cy, hx, hy };
}

export type Hall = ReturnType<typeof hall>;

export interface InHall {
  i: number;
  j: number;
  h: Hall;
  dx: number;
  dy: number;
  /** Tiles in from the hall's edge (0 on the edge row). */
  inset: number;
  biome: UnderBiomeDef;
  room: UnderRoomDef;
}

/** The hall tile (x, y) lies in, if any: squared, or a rounded hollow with a worn rim in caves. */
export function inHall(seed: number, x: number, y: number): InHall | null {
  const i = Math.floor(x / PITCH);
  const j = Math.floor(y / PITCH);
  if (!hasHall(seed, i, j)) return null;
  const h = hall(seed, i, j);
  const dx = x - h.cx;
  const dy = y - h.cy;
  if (Math.abs(dx) > h.hx || Math.abs(dy) > h.hy) return null;
  const biome = biomeOf(seed, i, j).def;
  let inset = Math.min(h.hx - Math.abs(dx), h.hy - Math.abs(dy));
  // A great hall under a place stays squared, whatever the biome.
  if (biome.shape === 'caves' && !planFor(seed, i, j).boost.has(nodeKey(i, j))) {
    const r = Math.hypot(dx / (h.hx + 0.5), dy / (h.hy + 0.5));
    const rim = 0.86 + 0.28 * valueNoise(seed + 4111, x / 3, y / 3);
    if (r >= rim) return null;
    inset = Math.floor((1 - r / rim) * Math.min(h.hx, h.hy));
  }
  return { i, j, h, dx, dy, inset, biome, room: roomOf(seed, i, j, biome).def };
}

/** True when a hall of this room can hold its gallery and stair clear of every doorway. */
export function galleryFits(g: InHall): boolean {
  const { h, room, biome } = g;
  if (!room.gallery || biome.height < 7 || h.hx < 4 || h.hy < 4) return false;
  const mx = g.i * PITCH + 8;
  const my = g.j * PITCH + 8;
  return Math.abs(h.cy - h.hy + 2 - my) > 1 && h.cx - h.hx + 2 < mx - 1;
}

export interface RoomTile {
  /** A tile standing here (a pillar, a shelf) or null for plain floor. */
  tile: TileKind | null;
  /** How far the floor is sunk here (metres). */
  sink: number;
  /** -1, or what of an upper level is over this tile: 0..2 the stair's tiles from its foot, 3 the gallery. */
  upper: number;
}

/** The room plan at one hall tile. */
export function roomTile(seed: number, x: number, y: number, g: InHall): RoomTile {
  const { h, dx, dy, room } = g;
  const out: RoomTile = { tile: null, sink: 0, upper: -1 };
  const gallery = galleryFits(g);
  const stair = gallery && dy === -h.hy + 2 && dx >= -h.hx && dx <= -h.hx + 2;
  if (gallery) {
    if (Math.abs(dy) >= h.hy - 1) out.upper = 3;
    else if (stair) out.upper = dx + h.hx;
  }
  if (room.sink) {
    const ramp = Math.max(1, Math.ceil(room.sink * 2));
    out.sink = room.sink * Math.min(1, g.inset / ramp);
  }
  if (stair) return out;
  const mx = g.i * PITCH + 8;
  const my = g.j * PITCH + 8;
  const edge = Math.abs(dx) === h.hx ? Math.abs(y - my) > 1 : Math.abs(dy) === h.hy ? Math.abs(x - mx) > 1 : false;
  if (room.lining && edge && hash2(seed + 4121, x, y) < room.lining.share) out.tile = tileCode(room.lining.tile);
  const p = room.pillars;
  const big = g.biome.shape === 'caves' ? g.inset >= 1 : h.hx >= 4 && h.hy >= 4;
  if (p && big && out.upper < 0 && Math.abs(dx) % p.every === 0 && Math.abs(dy) % p.every === 0 && Math.abs(dx) >= p.every && Math.abs(dy) >= p.every && Math.abs(dx) < h.hx && Math.abs(dy) < h.hy) {
    // Never in the line of a doorway at the middle.
    if (Math.abs(y - my) > 1 && Math.abs(x - mx) > 1) out.tile = tileCode(p.tile);
  }
  return out;
}

/**
 * A corridor tile's offset from its straight line and its half-width: straight in 'rooms', winding in 'caves' (back to
 * the middle near both halls, so it always meets them). `along` = metres from the nearer end.
 */
export function bend(seed: number, b: UnderBiomeDef, t: number, row: number, along: number): { off: number; half: number } {
  if (b.shape !== 'caves') return { off: 0, half: b.corridor.half };
  const off = Math.round((valueNoise(seed + 4112, t / 7, row * 3.1) - 0.5) * 6 * Math.min(1, along / 6));
  const half = b.corridor.half + (valueNoise(seed + 4114, t / 5, row * 1.7) > 0.62 ? 1 : 0);
  return { off, half };
}

/**
 * A door where a corridor meets a hall's side: on the corridor's middle row the door tile (or its locked kind), on the
 * rows either side solid frame (null = rock). `side` 0..3 = the hall's -x, +x, -y, +y side. Undefined = no door here.
 */
export function doorOf(seed: number, i: number, j: number, side: number): TileKind | undefined {
  const d = biomeOf(seed, i, j).def.doors;
  if (!d || planFor(seed, i, j).boost.has(nodeKey(i, j))) return undefined;
  if (!(hash2(seed + 4401 + side, i, j) < d.chance)) return undefined;
  return tileCode(hash2(seed + 4402 + side, i, j) < d.locked ? d.lockedTile : d.tile);
}
