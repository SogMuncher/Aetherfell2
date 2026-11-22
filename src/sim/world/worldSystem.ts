import { CHUNK_SIZE, type Entity, type Location, type SimContext, type SimState, type SimSystem, type Vec2, packKey, unpackKey } from '../../types';
import { REGION_SIZE, type SiteLayout, siteInRegion } from './sites';
import type { Terrain } from './terrain';
import type { WorldTiles } from './worldTiles';
import { furnishHalls, populate, raise } from './worldPopulate';


/**
 * Keeps the world around the party alive: registers named places as players approach,
 * fills them with people and things the first time, notices discoveries, and unloads
 * untouched far-away chunks so memory stays flat no matter how far you travel.
 */
export function createWorldSystem(terrain: Terrain, tiles: WorldTiles): SimSystem {
  const layouts = new Map<number, SiteLayout>();
  /** Regions that already hold a registered place (rebuilt from state.locations, so loads need nothing extra). */
  const placed = new Set<number>();
  let placedCount = 0;
  let realmSeen = '';
  const probe = (x: number, y: number): number => terrain.rawGround(x, y, 3);

  return (ctx: SimContext) => {
    const { state } = ctx;
    const players = Object.values(state.players)
      .map((id) => state.entities.get(id))
      .filter((e): e is Entity => !!e);

    // Each realm keeps its own places (they travel with it): start the bookkeeping over when the party changes realm.
    if (state.realm !== realmSeen) {
      realmSeen = state.realm;
      layouts.clear();
      placed.clear();
      placedCount = 0;
    }
    for (; placedCount < state.locations.length; placedCount++) {
      const l = state.locations[placedCount];
      if (l) placed.add(packKey(Math.floor(l.pos.x / REGION_SIZE), Math.floor(l.pos.y / REGION_SIZE)));
    }
    // A realm of halls is furnished chunk by chunk as the party comes near (its own data says with what).
    if (ctx.content.realms[state.realm]?.ground === 'lattice') furnishHalls(ctx, players);
    // Villages, ruins and the rest are places of the land. A realm under it shows those that have a cavern beneath them,
    // by its own name pattern; it has no places of its own.
    const realm = ctx.content.realms[state.realm];
    const below = realm?.places;
    const landed = realm?.ground === 'surface';
    for (const p of landed || below ? players : []) {
      const rx = Math.floor(p.pos.x / REGION_SIZE);
      const ry = Math.floor(p.pos.y / REGION_SIZE);
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const key = packKey(rx + i, ry + j);
          if (state.regions.has(key)) continue;
          state.regions.add(key);
          // A region forgotten after a long journey may already hold a place: never register it twice.
          if (placed.has(key)) continue;
          const site = siteInRegion(state.seed, rx + i, ry + j, probe);
          if (!site || (!landed && !ctx.content.sites[site.kind]?.under?.cavern)) continue;
          const siteKey = packKey(Math.floor(site.cx / REGION_SIZE), Math.floor(site.cy / REGION_SIZE));
          if (placed.has(siteKey)) continue;
          placed.add(key);
          placed.add(siteKey);
          const loc: Location = {
            id: state.locations.length,
            kind: site.kind,
            name: landed || !below ? site.name : below.name.replace('{name}', site.name),
            pos: { x: site.cx, y: site.cy },
            radius: site.radius,
            discovered: false,
            populated: false,
          };
          state.locations.push(loc);
          placedCount = state.locations.length;
          layouts.set(loc.id, site);
        }
      }
    }

    for (const loc of state.locations) {
      let nearest = Infinity;
      let who: Entity | null = null;
      for (const p of players) {
        const d = Math.hypot(p.pos.x - loc.pos.x, p.pos.y - loc.pos.y);
        if (d < nearest) {
          nearest = d;
          who = p;
        }
      }
      if (!loc.populated && nearest - loc.radius < ctx.content.rules.sites.fill) {
        const site = layouts.get(loc.id) ?? siteInRegion(state.seed, Math.floor(loc.pos.x / REGION_SIZE), Math.floor(loc.pos.y / REGION_SIZE), probe);
        // Buildings go up first, a few every tick; people and things move in once they stand.
        // Below the land a place is only its own buildings, fallen (`under.ruin`), with nobody living there.
        const ruin = landed ? 0 : (ctx.content.sites[loc.kind]?.under?.ruin ?? 0);
        if (!site || (!landed && ruin <= 0) || raise(ctx, loc, site, ruin)) {
          if (site && landed) populate(ctx, loc, site);
          loc.populated = true;
        }
      }
      if (!loc.discovered && who && nearest < loc.radius + 8) {
        loc.discovered = true;
        loc.discoveredAt = state.tick;
        ctx.emit({ type: 'discovered', locationId: loc.id, name: loc.name, x: loc.pos.x, y: loc.pos.y });
        const verb = ctx.content.sites[loc.kind]?.verb ?? 'discovered';
        const text = `${who.player?.name ?? 'Someone'} ${verb} ${loc.name}.`;
        state.journal.push({ tick: state.tick, day: state.weather.day, text });
        ctx.emit({ type: 'journal', text });
      }
    }

    if (state.tick % 100 === 0) unloadFarChunks(state, players.map((p) => p.pos), tiles);
  };
}

/**
 * Forgets untouched chunks far from everyone (they regrow from the seed when needed). Also run by
 * guests on their copy of the world, around themselves, so a long session does not fill memory.
 */
export function unloadFarChunks(state: SimState, centres: readonly Vec2[], tiles: WorldTiles): void {
  const keep = 7;
  let removed = false;
  for (const [key, c] of state.chunks) {
    if (c.dirty) continue;
    let near = false;
    for (const p of centres) {
      const pcx = Math.floor(p.x / CHUNK_SIZE);
      const pcy = Math.floor(p.y / CHUNK_SIZE);
      if (Math.abs(pcx - c.cx) <= keep && Math.abs(pcy - c.cy) <= keep) {
        near = true;
        break;
      }
    }
    if (!near) {
      state.chunks.delete(key);
      removed = true;
    }
  }
  if (removed) tiles.resetCache();
  // Regions far from everyone can be forgotten; their places stay registered and are never added twice.
  if (state.regions.size > 2000) {
    for (const k of state.regions) {
      const r = unpackKey(k);
      const far = centres.every((p) => Math.abs(Math.floor(p.x / REGION_SIZE) - r.x) > 4 || Math.abs(Math.floor(p.y / REGION_SIZE) - r.y) > 4);
      if (far) state.regions.delete(k);
    }
  }
}
