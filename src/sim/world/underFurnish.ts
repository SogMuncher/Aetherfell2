// Furnishes underworld halls, corridors and old roads near the party, once per chunk: realm, biome and room scatter, wall mounts, road lamps
import { CHUNK_SIZE, type Entity, type ScatterDef, type SimContext, packKey } from '../../types';
import { thingDef } from '../../content';
import { hash2 } from './noise';
import { hallsInChunk, latticeSpot, PITCH, type HallSpot } from './underworld';

/**
 * What lies in each hall is the realm's `scatter`, then its biome's, then its room's (content/underBiomes.ts), each
 * entry rolled from the hall's own number so every machine furnishes alike. Things that `mount` are hung on a real wall
 * face found by feeling outward from the hall (never in a doorway or the air); 'path' things (traps) wait out in a
 * corridor leading off. Old roads get a lamp on their walls now and then. Done chunks live in `state.regions` (the realm's).
 */
export function furnishHalls(ctx: SimContext, players: Entity[]): void {
  const { state } = ctx;
  const realm = ctx.content.realms[state.realm];
  if (!realm) return;
  for (const p of players) {
    const pcx = Math.floor(p.pos.x / CHUNK_SIZE);
    const pcy = Math.floor(p.pos.y / CHUNK_SIZE);
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        const key = packKey(pcx + i, pcy + j);
        if (state.regions.has(key)) continue;
        state.regions.add(key);
        for (const h of hallsInChunk(state.seed, pcx + i, pcy + j)) {
          const biome = realm.lattice?.biomes?.[h.biome];
          const lists: (readonly ScatterDef[])[] = [realm.scatter ?? [], biome?.scatter ?? [], biome?.rooms[h.room]?.scatter ?? []];
          lists.forEach((list, k) => list.forEach((s, n) => put(ctx, h, s, n + k * 64)));
        }
        roadLamps(ctx, pcx + i, pcy + j);
      }
    }
  }
}

const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/** Nothing solid here at standing height, no water: a thing can be set down. */
function free(ctx: SimContext, x: number, y: number): boolean {
  const g = ctx.tiles.ground(x, y);
  return !ctx.tiles.blocked(x, y) && !ctx.tiles.info(x, y).liquid && !ctx.state.volume.solidBetween(x, y, g + 0.1, g + 1.2);
}

function put(ctx: SimContext, h: HallSpot, s: ScatterDef, n: number): void {
  if (s.under && !(h.site !== undefined && s.under.includes(h.site))) return;
  if (s.at === 'wall' && !h.walled) return;
  const roll = (h.roll * 9973 + n * 0.6180339) % 1;
  if (!(roll < s.chance)) return;
  const seed = ctx.state.seed;
  const rx = hash2(seed + 4501 + n, h.cx, h.cy);
  const ry = hash2(seed + 4502 + n, h.cx, h.cy);
  let x = h.cx + 0.5;
  let y = h.cy + 0.5;
  if (s.at === 'corner') {
    x += (n % 2 === 0 ? -1 : 1) * (h.hx - 1);
    y += (n % 4 < 2 ? -1 : 1) * (h.hy - 1);
  } else if (s.at === 'any') {
    x += Math.round((rx * 2 - 1) * (h.hx - 1));
    y += Math.round((ry * 2 - 1) * (h.hy - 1));
  } else if (s.at === 'wall') {
    const side = SIDES[(n * 7 + Math.floor(h.roll * 8)) % 4] ?? SIDES[0];
    const along = Math.round((rx - 0.5) * 2 * ((side[0] !== 0 ? h.hy : h.hx) - 1));
    onWall(ctx, s.thing, x + (side[0] === 0 ? along : 0), y + (side[1] === 0 ? along : 0), side[0], side[1], Math.max(h.hx, h.hy) + 2);
    return;
  } else if (s.at === 'path') {
    // Out along one of the hall's corridors, a few steps past its mouth, on the corridor's middle line.
    const side = SIDES[Math.floor(rx * 4)] ?? SIDES[0];
    const mx = Math.floor(h.cx / PITCH) * PITCH + 8;
    const my = Math.floor(h.cy / PITCH) * PITCH + 8;
    const out = 2 + Math.floor(ry * 3);
    x = side[0] !== 0 ? h.cx + side[0] * (h.hx + out) + 0.5 : mx + 0.5;
    y = side[1] !== 0 ? h.cy + side[1] * (h.hy + out) + 0.5 : my + 0.5;
    if (latticeSpot(seed, Math.floor(x), Math.floor(y)) !== 'corridor') return;
  }
  if (!free(ctx, x, y)) return;
  const z = ctx.tiles.ground(x, y);
  ctx.spawn(s.thing, x, y, { z, prevZ: z });
}

/**
 * Feels from (x, y) along (ux, uy) for a wall within `reach` m and sets the thing against it: hung on the face at its
 * `mount` height when it mounts (only on a wall taller than that, never a door), else standing just in front of it.
 */
export function onWall(ctx: SimContext, thing: string, x: number, y: number, ux: number, uy: number, reach: number): boolean {
  const m = thingDef(ctx.content, thing).mount;
  for (let t = 0; t <= reach; t += 0.25) {
    const px = x + ux * t;
    const py = y + uy * t;
    if (!ctx.tiles.blocked(px, py)) continue;
    const info = ctx.tiles.info(px, py);
    if (info.shape === 'door' || (m && info.height < m.height + 0.3)) return false;
    // The face of the wall tile on the side we came from.
    const fx = ux > 0 ? Math.floor(px) : ux < 0 ? Math.floor(px) + 1 : x;
    const fy = uy > 0 ? Math.floor(py) : uy < 0 ? Math.floor(py) + 1 : y;
    const back = m ? m.flush : 0.6;
    const ax = fx - ux * back;
    const ay = fy - uy * back;
    if (!m && !free(ctx, ax, ay)) return false;
    const z = ctx.tiles.ground(ax, ay) + (m?.height ?? 0);
    // Facing back into the room.
    ctx.spawn(thing, ax, ay, { z, prevZ: z, angle: Math.atan2(-uy, -ux) });
    return true;
  }
  return false;
}

/** A lamp on the wall of an old road now and then (realm `lattice.way.lamp`). */
function roadLamps(ctx: SimContext, cx: number, cy: number): void {
  const lamp = ctx.content.realms[ctx.state.realm]?.lattice?.way.lamp;
  if (!lamp) return;
  const seed = ctx.state.seed;
  for (let y = cy * CHUNK_SIZE; y < (cy + 1) * CHUNK_SIZE; y++) {
    for (let x = cx * CHUNK_SIZE; x < (cx + 1) * CHUNK_SIZE; x++) {
      if (hash2(seed + 4601, x, y) * lamp.every >= 1 || latticeSpot(seed, x, y) !== 'way') continue;
      const side = SIDES.find(([dx, dy]) => latticeSpot(seed, x + dx, y + dy) === 'rock');
      if (side) onWall(ctx, lamp.thing, x + 0.5, y + 0.5, side[0], side[1], 1);
    }
  }
}
