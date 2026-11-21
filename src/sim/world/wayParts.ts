import { CONTENT } from '../../content';
import { type Pt, type SiteLayout, siteInRegion } from './sites';
import type { Span } from './decks';
import type { WayGradeDef } from '../../types';


/**
 * Roads, paths and trails. Places of the world (villages, cities, ruins, stones, camps…) keep a grade of
 * way (content/sites.ts `way`, grades in content/world.ts) and are joined to their nearest neighbours:
 * a link is as good as the lesser grade of its two ends, bends sideways a little, and picks the easiest of a few
 * routes over the land (dry, low, flat). Everything is a pure function of the seed, so every machine lays
 * the same ways, and other systems (the underworld) can follow them (`waysTouching`).
 */

/** The little the roads need to know of the land. */
export interface Land {
  readonly seed: number;
  rawGround(x: number, y: number, octaves?: number): number;
  /** Height of river or lake water at a point, NaN where dry (the sea is not asked: ways keep to land). Without it ways ignore rivers. */
  streamLevelAt?(x: number, y: number): number;
  /** The land as lived on (water carved in, places levelled). */
  ground?(x: number, y: number): number;
}

export interface Way {
  /** Same on every machine, however it is asked for. */
  key: string;
  grade: string;
  def: WayGradeDef;
  a: SiteLayout;
  b: SiteLayout;
  /** The route, from one place's gate to the other's, in world metres. */
  pts: Pt[];
  /** Bridges over the water the route meets (sim/world/decks.ts); the route runs straight across each. */
  spans: Span[];
}

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  half: number;
  rank: number;
  tile: string;
}

export interface WayHit {
  tile: string;
  rank: number;
  half: number;
  /** Metres from the middle of the way. */
  d: number;
}

export interface RegionWays {
  ways: Way[];
  cells: Map<number, Seg[]>;
}

export interface Net {
  chosen: Map<string, string[]>;
  ways: Map<string, Way | null>;
  regions: Map<number, RegionWays>;
}

export const CELL = 32;
export const SPAN = 3;
export const nets = new Map<number, Net>();

export function netOf(seed: number): Net {
  let n = nets.get(seed);
  if (!n) {
    if (nets.size > 6) nets.clear();
    n = { chosen: new Map(), ways: new Map(), regions: new Map() };
    nets.set(seed, n);
  }
  return n;
}

export const siteKey = (s: SiteLayout): string => `${s.rx},${s.ry}`;
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);
export const centre = (s: SiteLayout): Pt => ({ x: s.cx, y: s.cy });
export const cellKey = (cx: number, cy: number): number => (cx + 32768) * 65536 + (cy + 32768);

export function gradeOf(s: SiteLayout): string | undefined {
  return CONTENT.sites[s.kind]?.way?.grade;
}

/** Every place with a way, in the regions within `span` of (rx, ry). */
export function sitesAround(land: Land, rx: number, ry: number, span: number): SiteLayout[] {
  const out: SiteLayout[] = [];
  const probe = (x: number, y: number): number => land.rawGround(x, y, 3);
  for (let j = -span; j <= span; j++) {
    for (let i = -span; i <= span; i++) {
      const s = siteInRegion(land.seed, rx + i, ry + j, probe);
      if (s && gradeOf(s) !== undefined) out.push(s);
    }
  }
  return out;
}

/** The neighbours a place reaches out to: nearest first, skipping any that lie behind a nearer one on the same line. */
export function chosen(land: Land, a: SiteLayout): string[] {
  const net = netOf(land.seed);
  const key = siteKey(a);
  const hit = net.chosen.get(key);
  if (hit) return hit;
  const links = CONTENT.sites[a.kind]?.way?.links ?? 0;
  const reach = CONTENT.world.roads.reach;
  const ca = centre(a);
  const near = sitesAround(land, a.rx, a.ry, SPAN)
    .filter((s) => s !== a && siteKey(s) !== key)
    .map((s) => ({ s, d: dist(ca, centre(s)) }))
    .filter((e) => e.d <= reach)
    .sort((p, q) => p.d - q.d || (siteKey(p.s) < siteKey(q.s) ? -1 : 1));
  const out: SiteLayout[] = [];
  for (const e of near) {
    if (out.length >= links) break;
    const shadowed = out.some((c) => dist(ca, centre(c)) + dist(centre(c), centre(e.s)) < e.d * 1.12);
    if (!shadowed) out.push(e.s);
  }
  const keys = out.map(siteKey);
  net.chosen.set(key, keys);
  return keys;
}

/** Where a way enters a place coming from `from`: its nearest mouth (a city's street ends), or its middle. */
export function mouth(s: SiteLayout, from: Pt): Pt {
  const ms = s.mouths;
  if (!ms || ms.length === 0) return centre(s);
  let best = ms[0] as Pt;
  for (const m of ms) if (dist(m, from) < dist(best, from)) best = m;
  return best;
}
