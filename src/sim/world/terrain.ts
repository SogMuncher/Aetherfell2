import type { BiomeDef, BiomeId, TileKind, WorldSample, WorldSampler } from '../../types';
import { TILES } from '../../content/tiles';
import { CONTENT } from '../../content';
import { fbm, ridge } from './noise';
import { REGION_SIZE, siteInRegion, structuresIn } from './sites';
import type { SiteLayout } from './sites';
import { generateChunk } from './chunkgen';
import { wayHit } from './roads';
import { landsBySeed } from './wayParts';
import type { WayHit } from './roads';
import { carve, waterSpot } from './water';
import type { WaterSpot } from './water';

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function octavesFor(detail: number): number {
  if (detail <= 1) return 6;
  if (detail <= 4) return 5;
  if (detail <= 16) return 4;
  if (detail <= 64) return 3;
  return 2;
}

/**
 * The shape of the land: continents, rolling hills, ridged mountains, a moisture field for biomes,
 * winding old roads, and flattened plateaus where settlements sit. Pure function of the seed.
 */
export class Terrain implements WorldSampler {
  constructor(readonly seed: number) {
    landsBySeed.set(seed, this);
  }

  /** The bare shape of the land: the sum of content's land layers (continents, hills, mountains, bumps). */
  rawGround(x: number, y: number, octaves = 6): number {
    const s = this.seed;
    let g = 0;
    for (const l of CONTENT.world.land) {
      if (l.nearOnly !== undefined && octaves < l.nearOnly) continue;
      let m = 1;
      if (l.mask) {
        const k = l.mask;
        m = smoothstep(k.from, k.to, fbm(s + k.salt, x / k.scale, y / k.scale, k.octaves));
        if (!(m > 0)) continue;
      }
      const o = Math.min(octaves, l.octaves);
      const n = l.noise === 'ridge' ? ridge(s + l.salt, x / l.scale, y / l.scale, o) : fbm(s + l.salt, x / l.scale, y / l.scale, o);
      g += l.mask ? (n - l.centre) * l.amount * m : (n - l.centre) * l.amount;
    }
    return g;
  }

  /** Sites near (x, y) — at most the 3×3 regions around the point. */
  sitesNear(x: number, y: number): SiteLayout[] {
    const rx = Math.floor(x / REGION_SIZE);
    const ry = Math.floor(y / REGION_SIZE);
    const out: SiteLayout[] = [];
    const probe = (px: number, py: number): number => this.rawGround(px, py, 3);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const s = siteInRegion(this.seed, rx + i, ry + j, probe);
        if (s) out.push(s);
      }
    }
    return out;
  }

  /** Ground height with rivers and lakes cut in and settlements levelled into gentle plateaus. */
  ground(x: number, y: number, octaves = 6): number {
    return this.groundWith(x, y, octaves, 0);
  }

  /** As `ground`, with water widened by `spread` metres (distant samples, so rivers still show). */
  groundWith(x: number, y: number, octaves: number, spread: number): number {
    let g = this.rawGround(x, y, octaves);
    const sites = this.sitesNear(x, y);
    for (const s of sites) {
      const d = Math.hypot(x - s.cx, y - s.cy);
      const inner = s.radius;
      const outer = s.radius + 40;
      if (d >= outer) continue;
      // Whole metres, so floors raised on the plateau sit flush with the ground.
      const flat = Math.max(2, Math.round(this.rawGround(s.cx, s.cy, 3)));
      const t = 1 - smoothstep(inner, outer, d);
      g = g + (flat - g) * t;
    }
    // Water cuts its bed after the places have levelled the ground, but never inside a place.
    const ws = this.waterSpotAt(x, y, spread);
    if (ws) g = carve(g, ws);
    return g;
  }

  /** The water at or beside a point (sim/world/water.ts), or null. */
  waterSpotAt(x: number, y: number, spread = 0): WaterSpot | null {
    const s = waterSpot(this, x, y, spread);
    if (!s) return null;
    for (const p of this.sitesNear(x, y)) if (Math.hypot(x - p.cx, y - p.cy) < p.radius) return null;
    return s;
  }

  /** Height of the river or lake water over this point, NaN where dry (ways plan their bridges with it). */
  streamLevelAt(x: number, y: number): number {
    const s = this.waterSpotAt(x, y);
    return s !== null && s.edge < 0 ? s.level : Number.NaN;
  }

  /** Height of the river, lake or sea water over this point, NaN where dry (ports plan their quays and piers with it). */
  waterLevelAt(x: number, y: number): number {
    const r = this.streamLevelAt(x, y);
    if (!Number.isNaN(r)) return r;
    return this.ground(x, y) < 0 ? 0 : Number.NaN;
  }

  /** Moisture 0..1 at a point: wet land grows forests and marshes, dry land steppe. */
  moisture(x: number, y: number): number {
    const m = CONTENT.world.moisture;
    return fbm(this.seed + m.salt, x / m.scale, y / m.scale, m.octaves);
  }

  /** The first biome (in content order) whose height and moisture bounds fit this point. */
  biomeAt(x: number, y: number, g: number): BiomeId {
    let m = Number.NaN;
    let last: BiomeId = 'meadow';
    for (const [id, b] of Object.entries(CONTENT.biomes)) {
      last = id;
      const w = b.when;
      if (w.below !== undefined && !(g < w.below)) continue;
      if (w.above !== undefined && !(g > w.above)) continue;
      if (w.wetter !== undefined || w.drier !== undefined) {
        if (Number.isNaN(m)) m = this.moisture(x, y);
        if (w.wetter !== undefined && !(m > w.wetter)) continue;
        if (w.drier !== undefined && !(m < w.drier)) continue;
      }
      return id;
    }
    return last;
  }

  biome(id: BiomeId): BiomeDef | undefined {
    return CONTENT.biomes[id];
  }

  /** Share of tiles that are trees here: the biome's density, made patchy by woodland clumps. */
  treeDensity(x: number, y: number, biome: BiomeId): number {
    const base = CONTENT.biomes[biome]?.trees?.density ?? 0;
    const w = CONTENT.world.woods;
    const patch = smoothstep(w.from, w.to, fbm(this.seed + w.salt, x / w.scale, y / w.scale, 2));
    return base * (w.min + patch * w.gain);
  }

  /** The way (road, path or trail) under a point, if any: the places of the world are joined by them (sim/world/roads.ts). */
  wayAt(x: number, y: number, spread = 0): WayHit | null {
    return wayHit(this, x, y, spread);
  }

  /** 0..1 how close to the middle of a way (0 where none runs); `spread` widens it for coarse samples. */
  roadAt(x: number, y: number, g: number, spread = 0): number {
    if (g < CONTENT.world.roads.lowest || g > CONTENT.world.roads.highest) return 0;
    const h = this.wayAt(x, y, spread);
    if (!h) return 0;
    return Math.max(0, 1 - h.d / (h.half + spread + 0.001));
  }

  naturalKinds(cx: number, cy: number): Uint8Array {
    return generateChunk(this, cx, cy).kind;
  }

  sample(x: number, y: number, detail: number): WorldSample {
    const o = octavesFor(detail);
    const spread = detail > 2 ? detail * 0.6 : 0;
    const g = detail > 32 ? this.rawGround(x, y, o) : this.groundWith(x, y, o, spread);
    let water: number | undefined;
    if (detail <= 32) {
      const ws = this.waterSpotAt(x, y, spread);
      if (ws && ws.edge < 0) water = ws.level;
    }
    const biome = this.biomeAt(x, y, g);
    let built: TileKind | null = null;
    let cleared = false;
    if (detail <= 16) {
      for (const s of this.sitesNear(x, y)) {
        if (Math.abs(x - s.cx) > s.radius + 30 || Math.abs(y - s.cy) > s.radius + 30) continue;
        const l = s.layout;
        if (l.shape === 'village' || l.shape === 'city') {
          if (Math.hypot(x - s.cx, y - s.cy) < s.radius) cleared = true;
          // A far cell shows the tallest building it touches, in that building's wall.
          for (const p of structuresIn(s, x - detail + 1, y - detail + 1, x, y)) {
            const def = CONTENT.structures[p.id];
            const id = def?.far ?? def?.materials.wall[0];
            const t = id !== undefined ? CONTENT.tileIds[id] : undefined;
            if (t !== undefined && (built === null || (TILES[t]?.height ?? 2.8) > (TILES[built]?.height ?? 2.8))) built = t;
          }
        } else if (l.shape === 'rings') {
          const d = Math.hypot(x - s.cx, y - s.cy);
          for (const r of l.rings) if (Math.abs(d - r) < Math.max(0.7, detail * 0.5)) built = l.wall;
        }
      }
    }
    const nearSite = built !== null || cleared;
    const out: WorldSample = { ground: g, biome, trees: nearSite ? 0 : this.treeDensity(x, y, biome), road: this.roadAt(x, y, g, detail * 0.5), built };
    if (water !== undefined) out.water = water;
    return out;
  }
}

const lands = new Map<number, Terrain>();

/** The land of a seed, made once: other realms read it (the underworld lies under it). */
export function landOf(seed: number): Terrain {
  let t = lands.get(seed);
  if (!t) {
    if (lands.size > 4) lands.clear();
    t = new Terrain(seed);
    lands.set(seed, t);
  }
  return t;
}
