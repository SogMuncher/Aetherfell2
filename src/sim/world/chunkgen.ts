import type { Chunk, TileKind } from '../../types';
import { CHUNK_AREA, CHUNK_SIZE, Tile } from '../../types';
import { CONTENT } from '../../content';
import { TILES, tileCode } from '../../content/tiles';
import { fbm, hash2 } from './noise';
import type { Terrain } from './terrain';
import { structuresIn } from './sites';
import type { SiteLayout } from './sites';
import type { WaterSpot } from './water';
import { harbourTile, harboursNear } from './crossings';

export function emptyChunk(cx: number, cy: number): Chunk {
  return {
    cx,
    cy,
    kind: new Uint8Array(CHUNK_AREA),
    wet: new Uint8Array(CHUNK_AREA),
    fire: new Uint8Array(CHUNK_AREA),
    fuel: new Uint16Array(CHUNK_AREA),
    oil: new Uint8Array(CHUNK_AREA),
    soot: new Uint8Array(CHUNK_AREA),
    door: new Uint8Array(CHUNK_AREA),
    height: new Float32Array((CHUNK_SIZE + 1) * (CHUNK_SIZE + 1)),
    level: new Float32Array(CHUNK_AREA),
    dirty: false,
    version: 0,
  };
}

/** Builds a chunk from the seed alone. Same seed, same chunk — on every machine. */
export function generateChunk(terrain: Terrain, cx: number, cy: number): Chunk {
  const c = emptyChunk(cx, cy);
  const ox = cx * CHUNK_SIZE;
  const oy = cy * CHUNK_SIZE;
  const W = CHUNK_SIZE + 1;
  for (let j = 0; j <= CHUNK_SIZE; j++) {
    for (let i = 0; i <= CHUNK_SIZE; i++) c.height[j * W + i] = terrain.ground(ox + i, oy + j);
  }
  const sites = terrain.sitesNear(ox + CHUNK_SIZE / 2, oy + CHUNK_SIZE / 2);
  const seed = terrain.seed;
  const ports = harboursNear(terrain, ox + CHUNK_SIZE / 2, oy + CHUNK_SIZE / 2);
  for (let j = 0; j < CHUNK_SIZE; j++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const x = ox + i;
      const y = oy + j;
      const h = c.height[j * W + i] ?? 0;
      const g = (h + (c.height[j * W + i + 1] ?? h) + (c.height[(j + 1) * W + i] ?? h) + (c.height[(j + 1) * W + i + 1] ?? h)) / 4;
      const k = j * CHUNK_SIZE + i;
      // Rivers and lakes first: water is water whatever stands near it (ways cross on bridges, built in the 3D layer).
      const ws = terrain.waterSpotAt(x + 0.5, y + 0.5);
      if (ws && ws.edge < 0) {
        c.level[k] = ws.level;
        c.kind[k] = Tile.Water;
        c.fuel[k] = TILES[Tile.Water].fuel;
        continue;
      }
      // Ways come next: a road clears the trees off its line, and crosses the plain ground of a place (not its walls or buildings).
      const way = wayTile(terrain, x, y, g);
      let kind = way ?? (ports.length > 0 ? harbourTile(ports, x, y) : null) ?? shoreTile(ws, seed, x, y) ?? naturalTile(terrain, seed, x, y, g);
      const stamped = stampSites(sites, seed, x, y);
      if (stamped !== null && !(way !== null && !TILES[stamped].solid && !builtOn(sites, x, y))) kind = stamped;
      c.kind[k] = kind;
      c.fuel[k] = TILES[kind].fuel;
    }
  }
  return c;
}

/** Ground at the water's edge, by the shore rules (content/world.ts `water.shore`), or null away from water. */
function shoreTile(ws: WaterSpot | null, seed: number, x: number, y: number): TileKind | null {
  if (!ws || ws.edge < 0) return null;
  const rules = CONTENT.world.water.shore;
  for (let n = 0; n < rules.length; n++) {
    const r = rules[n];
    if (r && ws.edge < r.within && (r.chance >= 1 || hash2(seed + 120 + n, x, y) < r.chance)) return tileCode(r.tile);
  }
  return null;
}

/** What grows on untouched land, as the biome's data says: water, road, trees, patches, scatter, plain ground. */
function naturalTile(terrain: Terrain, seed: number, x: number, y: number, g: number): TileKind {
  const id = terrain.biomeAt(x, y, g);
  const b = terrain.biome(id);
  if (g < 0) return b && TILES[tileCode(b.ground)]?.liquid ? tileCode(b.ground) : Tile.Water;
  if (!b) return Tile.Grass;
  if (b.trees) {
    const r = hash2(seed + 77, x, y);
    if (r < terrain.treeDensity(x, y, id)) {
      // Some of the trees are another kind (birches among the oaks).
      const m = hash2(seed + 79, x, y);
      let upto = 0;
      for (const mix of b.trees.mix ?? []) {
        upto += mix.share;
        if (m < upto) return tileCode(mix.tile);
      }
      return tileCode(b.trees.tile);
    }
  }
  if (b.patches) {
    for (const p of b.patches) if (fbm(seed + p.salt, x / p.scale, y / p.scale, 3) > p.above) return tileCode(p.tile);
  }
  if (b.scatter) {
    const r2 = hash2(seed + 78, x, y);
    let upto = 0;
    for (const s of b.scatter) {
      upto += s.chance;
      if (r2 < upto) return tileCode(s.tile);
    }
  }
  return tileCode(b.ground);
}

/** The tile of the way under this tile, if one runs there and the land allows (not over water, not in a biome that forbids roads). */
function wayTile(terrain: Terrain, x: number, y: number, g: number): TileKind | null {
  if (g < CONTENT.world.roads.lowest) return null;
  const hit = terrain.wayAt(x + 0.5, y + 0.5);
  if (!hit) return null;
  if (terrain.biome(terrain.biomeAt(x, y, g))?.roads === false) return null;
  return tileCode(hit.tile);
}

/** Is a building (or the plot kept clear for one) here? Ways go round those. */
function builtOn(sites: SiteLayout[], x: number, y: number): boolean {
  for (const s of sites) {
    if (Math.abs(x - s.cx) > s.radius + 2 || Math.abs(y - s.cy) > s.radius + 2) continue;
    for (const h of s.houses) {
      const b = h.bounds;
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return true;
    }
    if (structuresIn(s, x, y, x, y).length > 0) return true;
  }
  return false;
}

/** Lays each site's shape onto the ground, using the tiles and sizes its definition gives. */
function stampSites(sites: SiteLayout[], seed: number, x: number, y: number): TileKind | null {
  for (const s of sites) {
    const dx = x - s.cx;
    const dy = y - s.cy;
    const d = Math.hypot(dx, dy);
    if (d > s.radius + 2) continue;
    const l = s.layout;
    switch (l.shape) {
      case 'city': {
        const t = s.paint ? s.paint(x, y) : null;
        if (t !== null) return t;
        break;
      }
      case 'village': {
        // Buildings are raised in the 3D layer; their plots are cleared and levelled here.
        for (const h of s.houses) {
          const b = h.bounds;
          if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return l.ground;
        }
        if (l.centre !== undefined && x === s.cx && y === s.cy) return tileCode(l.centre);
        if (d < l.square) return l.path;
        // Paths from the square out to each door.
        for (const h of s.houses) {
          if (distToSegment(x, y, s.cx, s.cy, h.doorX, h.doorY) < 0.9) return l.path;
        }
        return d < s.radius ? l.ground : null;
      }
      case 'rings': {
        for (const ring of l.rings) {
          if (Math.abs(d - ring) < 0.6) {
            const ang = Math.atan2(dy, dx);
            const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24);
            // Crumbled gaps make the ring passable in a few places.
            const gap = hash2(seed + 90 + ring, seg, s.rx * 31 + s.ry) < l.gap;
            return gap ? l.floor : l.wall;
          }
        }
        if (d < s.radius) return hash2(seed + 91, x, y) < l.scatter.chance ? l.scatter.tile : l.floor;
        return null;
      }
      case 'circle': {
        if (Math.abs(d - l.ring) < 0.5) {
          const ang = Math.atan2(dy, dx);
          const slot = ((ang + Math.PI) / (Math.PI * 2)) * l.count;
          if (Math.abs(slot - Math.round(slot)) < 0.07) return l.stone;
        }
        if (d < l.clear) return l.floor;
        return null;
      }
      case 'clearing': {
        if (d < l.inner) return l.innerTile;
        if (d < l.clear) return l.floor;
        break;
      }
    }
  }
  return null;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
