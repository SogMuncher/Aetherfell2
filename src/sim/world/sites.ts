import type { HouseGeometry, LocationKind, PlannedStructure, SiteDef, SiteLayoutDef, TileKind } from '../../types';
import { CONTENT, fillText } from '../../content';
import { cityLayout } from './city';
import { structuredHouse } from './cityParts';
import { hash2 } from './noise';
import { isWater } from './water';

/** World is divided into 256 m regions; each may hold one site (kinds and odds in content/sites.ts). */
export const REGION_SIZE = 256;

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One dwelling as laid out: the ground it covers (x0..y1), the cell outside its door, and the plan for it. */
export interface House extends Rect {
  /** The cell just outside the door. */
  doorX: number;
  doorY: number;
  /** Which recipe (content/structures.ts). */
  building: string;
  /** Everything it covers, with a margin. */
  bounds: Rect;
  structure: PlannedStructure;
  /** Where its door, way in, home spot and ground-floor room fall. */
  geometry: HouseGeometry;
}

export interface SiteLayout {
  kind: LocationKind;
  rx: number;
  ry: number;
  cx: number;
  cy: number;
  radius: number;
  name: string;
  /** How it is laid out, straight from its site definition. */
  layout: SiteLayoutDef;
  /** Where people live (empty for places without houses). */
  houses: House[];
  /** Everything to raise in the 3D layer, in the order it should go up. */
  plan: PlannedStructure[];
  /** The plan sorted into 16 m squares, for quick lookups of what stands where. */
  index: Map<number, PlannedStructure[]>;
  /** Where people gather by day. */
  square: { x: number; y: number };
  /** Where roads join the place from outside (a city's street ends); left out = the middle. */
  mouths?: Pt[];
  /** The ground its built-up parts cover (a city's wards, whole-cell boxes): what water, ports and bridges must fit round. */
  footprint: Rect[];
  /** Where its wall's gates open (cities); empty for places without a wall. */
  gates: Pt[];
  /** Tile laid at a spot by the layout itself, or null to leave it (cities draw streets this way). */
  paint?: (x: number, y: number) => TileKind | null;
}

const SYL_A = ['Ash', 'Bram', 'Cor', 'Dun', 'El', 'Fen', 'Gar', 'Hal', 'Ire', 'Kel', 'Lor', 'Mor', 'Nor', 'Os', 'Pell', 'Rav', 'Sel', 'Thorn', 'Ul', 'Wyn'];
const SYL_B = ['brook', 'ford', 'mere', 'wick', 'stead', 'holt', 'hollow', 'gate', 'barrow', 'moor', 'field', 'crest', 'well', 'dell', 'haven', 'reach'];

/** A made-up name for the place in region (rx, ry), shaped by its site's name pattern. */
export function siteName(seed: number, rx: number, ry: number, kind: LocationKind): string {
  const a = SYL_A[Math.floor(hash2(seed + 11, rx, ry) * SYL_A.length)] ?? 'Ash';
  const b = SYL_B[Math.floor(hash2(seed + 12, rx, ry) * SYL_B.length)] ?? 'ford';
  return fillText(CONTENT.sites[kind]?.name ?? '{base}', { a, base: a + b });
}

/**
 * Is there a river or lake at this spot? Places keep off water. The water of the world is a plain
 * function of the seed that reads no places (so there is no loop); this is where it plugs in.
 */
function isWetAt(seed: number, x: number, y: number): boolean {
  return isWater(seed, x, y);
}

const cache = new Map<string, SiteLayout | null>();

/** A steady number for a site id, so its rolls depend on its name, not on where it is listed. */
function idSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Which kind of site a region holds. Every kind rolls for itself, by its own id, against its
 * `chance`; kinds whose ground does not suit the spot drop out. If several are left, the higher
 * `priority` wins, then the one that rolled furthest under its chance. So adding a new kind of
 * place never moves an old one, except where the new one wins an overlap (give it a lower priority
 * than the old ones to rule that out too).
 */
export function kindFor(seed: number, rx: number, ry: number, groundAtCentre: number): LocationKind | null {
  let best: LocationKind | null = null;
  let bestPriority = -Infinity;
  let bestScore = Infinity;
  for (const [id, def] of Object.entries(CONTENT.sites)) {
    if (def.chance <= 0) continue;
    const roll = hash2((seed + 3) ^ idSeed(id), rx, ry);
    if (roll >= def.chance) continue;
    if (!(groundAtCentre > def.ground[0] && groundAtCentre < def.ground[1])) continue;
    const priority = def.priority ?? 0;
    const score = roll / def.chance;
    if (priority > bestPriority || (priority === bestPriority && score < bestScore)) {
      best = id;
      bestPriority = priority;
      bestScore = score;
    }
  }
  return best;
}

/** Sites at least this wide claim the ground round them. */
const GREAT = 100;

/** Does a bigger (or equal and earlier) place in a neighbouring region cover this one's spot? */
function yieldsToGreater(seed: number, rx: number, ry: number, cx: number, cy: number, kind: LocationKind, rawGround: (x: number, y: number) => number): boolean {
  const mine = CONTENT.sites[kind];
  if (!mine) return false;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      if (i === 0 && j === 0) continue;
      const nx = rx + i;
      const ny = ry + j;
      const ncx = Math.floor(nx * REGION_SIZE + 64 + hash2(seed + 4, nx, ny) * 128);
      const ncy = Math.floor(ny * REGION_SIZE + 64 + hash2(seed + 5, nx, ny) * 128);
      const k = kindFor(seed, nx, ny, rawGround(ncx, ncy));
      const other = k ? CONTENT.sites[k] : undefined;
      if (!k || !other || other.radius < GREAT) continue;
      const stronger = other.radius > mine.radius || (other.radius === mine.radius && (other.priority ?? 0) >= (mine.priority ?? 0) && (nx < rx || (nx === rx && ny < ry)));
      if (stronger && Math.hypot(ncx - cx, ncy - cy) < other.radius + (mine.radius >= GREAT ? mine.radius : 0) + 30) return true;
    }
  }
  return false;
}

/** Pure: which site (if any) sits in region (rx, ry)? Ground suitability is checked by the caller-provided probe. */
export function siteInRegion(seed: number, rx: number, ry: number, rawGround: (x: number, y: number) => number): SiteLayout | null {
  const key = `${seed}:${rx}:${ry}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size > 4096) cache.clear();
  const cx = Math.floor(rx * REGION_SIZE + 64 + hash2(seed + 4, rx, ry) * 128);
  const cy = Math.floor(ry * REGION_SIZE + 64 + hash2(seed + 5, rx, ry) * 128);
  let kind = kindFor(seed, rx, ry, rawGround(cx, cy));
  // Great places claim their room: a small place does not spring up inside a neighbouring city.
  if (kind && yieldsToGreater(seed, rx, ry, cx, cy, kind, rawGround)) kind = null;
  const def = kind ? CONTENT.sites[kind] : undefined;
  const site = kind && def ? layout(seed, kind, def, rx, ry, cx, cy) : null;
  cache.set(key, site);
  return site;
}

function layout(seed: number, kind: LocationKind, def: SiteDef, rx: number, ry: number, cx: number, cy: number): SiteLayout {
  const houses: House[] = [];
  const plan: PlannedStructure[] = [];
  const taken: Rect[] = [];
  const l = def.layout;
  if (l.shape === 'city') {
    const c = cityLayout(seed, rx, ry, cx, cy, l, (x, y) => isWetAt(seed, x, y));
    return { kind, rx, ry, cx, cy, radius: c.radius, name: siteName(seed, rx, ry, kind), layout: l, houses: c.houses, plan: c.plan, index: indexPlan(c.plan), square: c.square, paint: c.paint, mouths: c.mouths, footprint: c.footprint, gates: c.gates };
  }
  if (l.shape === 'village') {
    const [lo, hi] = l.houses;
    const n = lo + Math.floor(hash2(seed + 6, rx, ry) * (hi - lo + 1));
    const [rin, rout] = l.ring ?? [14, 22];
    // Each house gets a few tries at a free spot, so a big village fills up instead of losing houses to overlaps.
    let placed = 0;
    for (let t = 0; placed < n && t < n * 6; t++) {
      const salt = seed + 1000 + t * 37;
      const id = pickBuilding(l.buildings, hash2(salt, rx, ry));
      if (!id) continue;
      const a = hash2(seed + 7 + t * 5, rx, ry) * Math.PI * 2;
      const d = rin + Math.sqrt(hash2(seed + 8 + t * 3, rx, ry)) * (rout - rin);
      const mx = cx + Math.cos(a) * d;
      const my = cy + Math.sin(a) * d;
      const sdef = CONTENT.structures[id];
      if (!sdef) continue;
      const h = structuredHouse(id, sdef, (k) => hash2(salt + k, rx, ry), mx, my, cx, cy);
      // Leave room: nothing built on top of an earlier house, or in a river or lake.
      if (taken.some((o) => h.bounds.x0 <= o.x1 && h.bounds.x1 >= o.x0 && h.bounds.y0 <= o.y1 && h.bounds.y1 >= o.y0)) continue;
      if (isWetAt(seed, mx, my) || isWetAt(seed, h.x0, h.y0) || isWetAt(seed, h.x1, h.y1)) continue;
      taken.push(h.bounds);
      plan.push(h.structure);
      placed++;
      if (sdef.dwelling !== false) houses.push(h);
    }
  }
  const r = def.radius;
  return { kind, rx, ry, cx, cy, radius: r, name: siteName(seed, rx, ry, kind), layout: l, houses, plan, index: indexPlan(plan), square: { x: cx, y: cy }, footprint: [{ x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r }], gates: [] };
}

/** Picks a building kind by weight from a roll in 0..1. */
function pickBuilding(weights: Readonly<Record<string, number>>, roll: number): string | null {
  let total = 0;
  for (const w of Object.values(weights)) total += Math.max(0, w);
  let upto = 0;
  for (const [id, w] of Object.entries(weights)) {
    upto += Math.max(0, w) / (total || 1);
    if (roll < upto) return id;
  }
  return Object.keys(weights)[0] ?? null;
}

const BUCKET = 16;
const bucketKey = (bx: number, by: number): number => (bx + 65536) * 131072 + (by + 65536);

function indexPlan(plan: readonly PlannedStructure[]): Map<number, PlannedStructure[]> {
  const out = new Map<number, PlannedStructure[]>();
  for (const s of plan) {
    for (let by = Math.floor(s.y / BUCKET); by <= Math.floor((s.y + s.fy - 1) / BUCKET); by++) {
      for (let bx = Math.floor(s.x / BUCKET); bx <= Math.floor((s.x + s.fx - 1) / BUCKET); bx++) {
        const k = bucketKey(bx, by);
        const list = out.get(k);
        if (list) list.push(s);
        else out.set(k, [s]);
      }
    }
  }
  return out;
}

/** The planned structures touching a box of world cells (inclusive). */
export function structuresIn(site: SiteLayout, x0: number, y0: number, x1: number, y1: number): PlannedStructure[] {
  const out: PlannedStructure[] = [];
  for (let by = Math.floor(y0 / BUCKET); by <= Math.floor(y1 / BUCKET); by++) {
    for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) {
      for (const s of site.index.get(bucketKey(bx, by)) ?? []) if (!out.includes(s) && s.x <= x1 && s.x + s.fx > x0 && s.y <= y1 && s.y + s.fy > y0) out.push(s);
    }
  }
  return out;
}
