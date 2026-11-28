import type { Entity, Location, Placement, SimContext, SpawnInit, StructureReport } from '../../types';
import type { House, SiteLayout } from './sites';
import { fillText, thingDef } from '../../content';
import { houseFor } from './cityParts';


/** Buildings a place raises per tick, so a whole city goes up over a few seconds instead of in one stall. */
export const BUILDS_PER_TICK = 3;
/** A very large place (a megacity) goes up faster, so it is standing within about half a minute. */
export const BUILDS_FULL_IN = 600;

/** Raises the next few planned structures of a place (fallen at least `ruin`, 0..1); true once all of them stand. */
export function raise(ctx: SimContext, loc: Location, site: SiteLayout, ruin = 0): boolean {
  const total = site.plan.length;
  let n = loc.built ?? 0;
  const perTick = Math.max(BUILDS_PER_TICK, Math.ceil(total / BUILDS_FULL_IN));
  for (let k = 0; k < perTick && n < total; k++, n++) {
    const s = site.plan[n];
    const recipe = s ? ctx.content.structures[s.id] : undefined;
    if (!s || !recipe) continue;
    // Its district's materials over the recipe's.
    const plain = s.look ? { ...recipe, materials: { ...recipe.materials, ...s.look } } : recipe;
    // Fallen further where the place says so (the same building, as a ruin under the land).
    const def = ruin > (plain.decay ?? 0) ? { ...plain, decay: ruin } : plain;
    const report = ctx.build(def, { x: s.x, y: s.y, rot: s.rot, size: [s.w, s.d], ground: (x, y) => ctx.tiles.ground(x, y) }, s.seed);
    furnish(ctx, loc, report);
  }
  loc.built = n;
  return n >= total;
}

/** Puts the things a building holds (beds, tables, chests, torches…) inside it. */
export function furnish(ctx: SimContext, loc: Location, report: StructureReport): void {
  for (const f of report.furnishings) {
    // Things made to hang on a wall go up on it: their angle faces away from the wall, and a cell is half a metre across.
    const m = thingDef(ctx.content, f.thing).mount;
    const back = m ? 0.5 - m.flush : 0;
    const z = f.z + (m?.height ?? 0);
    ctx.spawn(f.thing, f.x - Math.cos(f.angle) * back, f.y - Math.sin(f.angle) * back, { z, prevZ: z, angle: f.angle, site: loc.id });
  }
}

export function place(ctx: SimContext, thing: string, x: number, y: number, init: SpawnInit = {}): Entity {
  const z = ctx.tiles.ground(x, y);
  return ctx.spawn(thing, x, y, { z, prevZ: z, ...init });
}

/** Finds a free spot for a placement, trying a few times so nothing lands inside a wall. */
export function spot(ctx: SimContext, site: SiteLayout, p: Placement, houseIdx: number): { x: number; y: number } | null {
  const cx = site.cx + 0.5;
  const cy = site.cy + 0.5;
  for (let tries = 0; tries < 8; tries++) {
    let x = cx;
    let y = cy;
    if (p.at === 'centre') {
      x += p.offset?.[0] ?? 0;
      y += p.offset?.[1] ?? 0;
    } else if (p.at === 'ring') {
      const a = ctx.rng.range(0, Math.PI * 2);
      const d = ctx.rng.range(p.min, p.max);
      x += Math.cos(a) * d;
      y += Math.sin(a) * d;
    } else {
      const h = site.houses[houseIdx];
      // Houses raised in the 3D layer are furnished by their own recipe.
      if (!h || h.structure) return null;
      x = p.corner === 'near' ? h.x0 + 1.5 : h.x1 - 0.5;
      y = p.corner === 'near' ? h.y0 + 1.5 : h.y1 - 0.5;
    }
    // Not inside or on top of anything built in the 3D layer.
    if (!ctx.tiles.blocked(x, y) && !ctx.tiles.info(x, y).liquid && ctx.state.volume.topAt(x, y) <= ctx.tiles.ground(x, y) + 0.05) return { x, y };
    if (p.at !== 'ring') return null;
  }
  return null;
}

export function populate(ctx: SimContext, loc: Location, site: SiteLayout): void {
  const { state, rng } = ctx;
  const def = ctx.content.sites[site.kind];
  if (!def) return;
  // The population list, as data.
  for (const entry of def.population) {
    const p = entry.place;
    const slots = p.at === 'house' ? site.houses.map((_, i) => i).filter((i) => i >= p.first && (i - p.first) % p.every === 0) : [-1];
    for (const houseIdx of slots) {
      for (let n = 0; n < entry.count; n++) {
        if (!rng.chance(entry.chance)) continue;
        const at = spot(ctx, site, p, houseIdx);
        if (!at) continue;
        place(ctx, entry.thing, at.x, at.y, entry.item ? { item: { ...entry.item }, site: loc.id } : { site: loc.id });
      }
    }
  }
  // One villager per house, taking the site's roles in turn. What each role sells and asks is data.
  const roles = def.villagers ?? [];
  if (roles.length === 0) return;
  const names = ctx.content.villagerNames;
  // Where each kind of building stands (outside its door), for giving directions; the nearest to the middle of each kind.
  const sq = { x: site.square.x + 0.5, y: site.square.y + 0.5 };
  const landmarks: Record<string, { x: number; y: number }> = { square: sq };
  for (const h of site.houses) {
    const at = { x: h.geometry.out.x + 0.5, y: h.geometry.out.y + 0.5 };
    const was = landmarks[h.building];
    if (!was || Math.hypot(at.x - sq.x, at.y - sq.y) < Math.hypot(was.x - sq.x, was.y - sq.y)) landmarks[h.building] = at;
  }
  loc.landmarks = landmarks;
  site.houses.forEach((h, idx) => {
    const role = roles[idx % roles.length] ?? 'farmer';
    const job = ctx.content.roles[role];
    const name = names[(loc.id * 7 + idx * 3) % names.length] ?? 'Nell';
    const g = h.geometry;
    const home = { x: g.home.x + 0.5, y: g.home.y + 0.5 };
    const door = { out: { x: g.out.x + 0.5, y: g.out.y + 0.5 }, in: { x: g.in.x + 0.5, y: g.in.y + 0.5 }, room: g.interior };
    // Their own spot at every place their routine (or the shared one) names.
    const haunts: Record<string, { x: number; y: number }> = { home };
    const words = new Set([...Object.values(job?.routine ?? {}), ...Object.values(ctx.content.rules.routine)].flat());
    for (const w of words) {
      const spot = hauntSpot(ctx, site, w, home);
      if (spot) haunts[w] = spot;
    }
    const stock = (job?.stock ?? []).map((st) => ({ ...st }));
    let questId: number | null = null;
    const qt = job?.quest;
    if (qt) {
      questId = state.nextQuestId++;
      state.quests.push({
        id: questId,
        title: fillText(qt.title, { place: loc.name }),
        giver: 0,
        giverName: name,
        kind: qt.kind,
        targetKind: qt.kind === 'cull' ? qt.target : qt.kind === 'fetch' ? qt.item : qt.site,
        ...(qt.kind === 'explore' ? { what: qt.what } : {}),
        targetLocation: loc.id,
        needed: qt.kind === 'explore' ? 1 : qt.count,
        progress: 0,
        state: 'offered',
        reward: qt.reward,
      });
    }
    // They start the day at home and walk out to wherever their routine sends them.
    const v = place(ctx, 'villager', home.x, home.y, { site: loc.id, npc: { name, role, home, haunts, door, locationId: loc.id, questId, stock } });
    const q = questId === null ? undefined : state.quests.find((qq) => qq.id === questId);
    if (q) q.giver = v.id;
  });
}

/** Open ground here: no tile obstacle near and nothing of the 3D layer overhead. */
function openAt(ctx: SimContext, x: number, y: number): boolean {
  const ring = [[0, 0], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8], [0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]];
  return ring.every(([dx, dy]) => !ctx.tiles.blocked(x + (dx ?? 0), y + (dy ?? 0))) && ctx.state.volume.topAt(x, y) <= ctx.tiles.ground(x, y) + 0.05;
}

/**
 * One person's spot for a place word of a routine: 'home', 'square' (somewhere open near the middle),
 * 'edge' (out past the houses) or a building recipe id (a clear cell inside the nearest such building).
 * Null when the place has none, so the routine skips that word.
 */
function hauntSpot(ctx: SimContext, site: SiteLayout, word: string, home: { x: number; y: number }): { x: number; y: number } | null {
  const { rng, state } = ctx;
  const sx = site.square.x + 0.5;
  const sy = site.square.y + 0.5;
  if (word === 'home') return home;
  if (word === 'square' || word === 'edge') {
    // Spread over the whole open square, not bunched at its middle.
    const around = Math.max(5, site.layout.shape === 'village' ? site.layout.square * 0.7 : 5);
    for (let tries = 0; tries < 16; tries++) {
      const a = rng.range(0, Math.PI * 2);
      const r = word === 'square' ? rng.range(0, around) : site.radius + rng.range(2, 8);
      const x = sx + Math.cos(a) * r;
      const y = sy + Math.sin(a) * r;
      if (openAt(ctx, x, y)) return { x, y };
    }
    return word === 'square' ? { x: sx, y: sy } : null;
  }
  // Any building raised here, not only the ones someone lives in (taverns, barns and halls have no householder).
  let best: House | null = null;
  for (const s of site.plan) {
    if (s.id !== word) continue;
    const h = houseFor(s);
    if (!best || Math.hypot(h.x0 - home.x, h.y0 - home.y) < Math.hypot(best.x0 - home.x, best.y0 - home.y)) best = h;
  }
  if (!best) return null;
  const r = best.geometry.interior;
  for (let tries = 0; tries < 12; tries++) {
    const x = r.x0 + rng.int(r.x1 - r.x0 + 1) + 0.5;
    const y = r.y0 + rng.int(r.y1 - r.y0 + 1) + 0.5;
    const g = ctx.tiles.ground(x, y);
    if (!state.volume.solidBetween(x, y, g + 0.6, g + 1.5)) return { x, y };
  }
  return { x: best.geometry.home.x + 0.5, y: best.geometry.home.y + 0.5 };
}
