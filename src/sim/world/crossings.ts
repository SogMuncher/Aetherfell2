import type { TileKind, Volume } from '../../types';
import { CHUNK_SIZE } from '../../types';
import { CONTENT } from '../../content';
import { tileCode } from '../../content/tiles';
import { hash2 } from './noise';
import { REGION_SIZE } from './sites';
import type { SiteLayout } from './sites';
import type { Terrain } from './terrain';
import { waysTouching } from './roads';
import { buildSpan, deckTop, spanBox } from './decks';
import type { Pt, Span, Wet } from './decks';

/**
 * Where water meets people. Bridges come with the ways (sim/world/roads.ts routes each way straight across the water it
 * meets); ports are decided here: a place of a kind that keeps a harbour (content/world.ts `water.harbour`) with water
 * near its edge gets a paved quay down to the shore and one to three piers out over the water. Both are `Span`s (decks.ts)
 * written into the 3D layer when the chunk they stand in is first made; everything is a pure function of the seed.
 */

export interface Harbour {
  site: SiteLayout;
  /** Paved way from the place's edge to the quay, and the quay itself (a rectangle of cells). */
  road: { a: Pt; b: Pt; half: number };
  quay: { x0: number; y0: number; x1: number; y1: number };
  spans: Span[];
}

const harbours = new Map<number, Map<string, Harbour | null>>();

function wetOf(land: Terrain): Wet {
  return { waterLevelAt: (x, y) => land.waterLevelAt(x, y), groundAt: (x, y) => land.ground(x, y) };
}

/** The port of a place, or null: none of the right kind, or no water within reach of its edge. */
export function harbourOf(land: Terrain, site: SiteLayout): Harbour | null {
  let byKey = harbours.get(land.seed);
  if (!byKey) {
    if (harbours.size > 6) harbours.clear();
    byKey = new Map();
    harbours.set(land.seed, byKey);
  }
  const key = `${site.rx},${site.ry}`;
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const h = planHarbour(land, site, key);
  byKey.set(key, h);
  return h;
}

function planHarbour(land: Terrain, site: SiteLayout, key: string): Harbour | null {
  const H = CONTENT.world.water.harbour;
  if (!H.sites.includes(site.kind)) return null;
  // The nearest water, looking out from the place's edge in every direction.
  let bestR = Infinity;
  let bestA = 0;
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    for (let r = site.radius; r < site.radius + H.reach && r < bestR; r += 4) {
      if (!Number.isNaN(land.waterLevelAt(site.cx + Math.cos(a) * r, site.cy + Math.sin(a) * r))) {
        bestR = r;
        bestA = a;
        break;
      }
    }
  }
  if (!Number.isFinite(bestR)) return null;
  const wet = wetOf(land);
  const dx = Math.cos(bestA);
  const dy = Math.sin(bestA);
  const axis: 'x' | 'y' = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
  const sign = (axis === 'x' ? dx : dy) >= 0 ? 1 : -1;
  const shoreX = site.cx + dx * bestR;
  const shoreY = site.cy + dy * bestR;
  const along = axis === 'x' ? shoreX : shoreY;
  const across = axis === 'x' ? shoreY : shoreX;
  const W = Math.max(3, H.pier.width);
  const want = H.piers[0] + Math.floor(hash2(land.seed + 801, site.rx, site.ry) * (H.piers[1] - H.piers[0] + 1));
  const spans: Span[] = [];
  const cellWet = (c: number, l: number): boolean => {
    const x = axis === 'x' ? c + 0.5 : l + 0.5;
    const y = axis === 'x' ? l + 0.5 : c + 0.5;
    return !Number.isNaN(land.waterLevelAt(x, y));
  };
  let lmin = Infinity;
  let lmax = -Infinity;
  let shoreC = Math.floor(along);
  for (let n = 0; n < want + 2 && spans.length < want; n++) {
    // Piers alternate either side of the first, a few metres apart.
    const step = n === 0 ? 0 : (n % 2 === 1 ? 1 : -1) * Math.ceil(n / 2) * (W + 4);
    const l0 = Math.floor(across) + step - Math.floor((W - 1) / 2);
    const lc = l0 + Math.floor((W - 1) / 2);
    // Start a few metres inland of the shore and walk out to the first water.
    let c = Math.floor(along) - sign * 8;
    let guard = 0;
    while (!cellWet(c, lc) && guard++ < H.reach + 24) c += sign;
    if (!cellWet(c, lc)) continue;
    const firstWet = c;
    const len = H.pier.length[0] + Math.floor(hash2(land.seed + 802 + n, site.rx, site.ry) * (H.pier.length[1] - H.pier.length[0] + 1));
    // The pier goes only as far as the water does.
    let reach = 0;
    while (reach < len && cellWet(firstWet + sign * reach, lc) && cellWet(firstWet + sign * reach, l0) && cellWet(firstWet + sign * reach, l0 + W - 1)) reach++;
    if (reach < 6) continue;
    const shoreIn = firstWet - sign * 2;
    const farEnd = firstWet + sign * (reach - 1);
    const c0 = sign > 0 ? shoreIn : farEnd;
    const c1 = sign > 0 ? farEnd : shoreIn;
    const top = deckTop(wet, axis, Math.min(c0, c1), Math.max(c0, c1), lc);
    // The shore must meet the foot of the ramp: a pier is not built under a cliff or off a steep beach.
    const landing = (q: number): number => wet.groundAt(axis === 'x' ? q : lc + 0.5, axis === 'x' ? lc + 0.5 : q);
    const outer = sign > 0 ? shoreIn - 1 : shoreIn + 2;
    let fits = top - 1 - landing(outer) <= 0.35;
    for (let u = 0; u <= 1 && fits; u += 0.25) if (landing(outer + sign * u) - (top - 1 + u) > 0.4) fits = false;
    if (!fits) continue;
    spans.push({
      kind: 'pier',
      key: `${key}/pier${n}`,
      axis,
      c0,
      c1,
      l0,
      l1: l0 + W - 1,
      top,
      look: H.pier,
      ramps: sign > 0 ? [true, false] : [false, true],
      capLow: sign < 0,
      capHigh: sign > 0,
    });
    lmin = Math.min(lmin, l0);
    lmax = Math.max(lmax, l0 + W - 1);
    shoreC = firstWet;
  }
  if (spans.length === 0) return null;
  // The quay: a paved apron on the shore round the foot of the piers, and a road back to the place.
  const qa = shoreC - sign * 6;
  const qb = shoreC - sign;
  const ql0 = lmin - 2;
  const ql1 = lmax + 2;
  const quay = axis === 'x' ? { x0: Math.min(qa, qb), x1: Math.max(qa, qb), y0: ql0, y1: ql1 } : { y0: Math.min(qa, qb), y1: Math.max(qa, qb), x0: ql0, x1: ql1 };
  const mid = (lmin + lmax + 1) / 2;
  const foot = axis === 'x' ? { x: qa + 0.5, y: mid } : { x: mid, y: qa + 0.5 };
  const edge = { x: site.cx + (foot.x - site.cx) * ((site.radius - 6) / Math.max(1, Math.hypot(foot.x - site.cx, foot.y - site.cy))), y: site.cy + (foot.y - site.cy) * ((site.radius - 6) / Math.max(1, Math.hypot(foot.x - site.cx, foot.y - site.cy))) };
  return { site, road: { a: edge, b: foot, half: 1.6 }, quay, spans };
}

/** Harbours of the places within reach of the 3×3 regions round a point. */
export function harboursNear(land: Terrain, x: number, y: number): Harbour[] {
  const out: Harbour[] = [];
  for (const s of land.sitesNear(x, y)) {
    const h = harbourOf(land, s);
    if (h) out.push(h);
  }
  return out;
}

function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len));
  return Math.hypot(px - (a.x + vx * t), py - (a.y + vy * t));
}

/** The paving of a quay or the road to it at this tile, if any (the chunk generator lays it unless a wall or water is there). */
export function harbourTile(list: readonly Harbour[], x: number, y: number): TileKind | null {
  for (const h of list) {
    const q = h.quay;
    if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1) return tileCode(CONTENT.world.water.harbour.quay);
    if (Math.abs(x - h.site.cx) <= h.site.radius + 200 && Math.abs(y - h.site.cy) <= h.site.radius + 200 && distToSegment(x + 0.5, y + 0.5, h.road.a, h.road.b) < h.road.half) return tileCode(CONTENT.world.water.harbour.quay);
  }
  return null;
}

/** Every span (bridge or pier) that touches the box. */
export function spansIn(land: Terrain, x0: number, y0: number, x1: number, y1: number): Span[] {
  const out: Span[] = [];
  const hit = (s: Span): boolean => {
    const b = spanBox(s);
    return b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1;
  };
  const seen = new Set<string>();
  const rx0 = Math.floor(x0 / REGION_SIZE);
  const rx1 = Math.floor(x1 / REGION_SIZE);
  const ry0 = Math.floor(y0 / REGION_SIZE);
  const ry1 = Math.floor(y1 / REGION_SIZE);
  for (let ry = ry0; ry <= ry1; ry++) {
    for (let rx = rx0; rx <= rx1; rx++) {
      for (const w of waysTouching(land, rx, ry)) for (const s of w.spans) if (!seen.has(s.key) && hit(s)) (seen.add(s.key), out.push(s));
    }
  }
  for (const h of harboursNear(land, (x0 + x1) / 2, (y0 + y1) / 2)) for (const s of h.spans) if (!seen.has(s.key) && hit(s)) (seen.add(s.key), out.push(s));
  return out;
}

/** Writes the bridges and piers standing in chunk (cx, cy) into the 3D layer. Safe to repeat: it writes the same cells. */
export function buildSpansChunk(volume: Volume, land: Terrain, cx: number, cy: number): void {
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const box = { x0, y0, x1: x0 + CHUNK_SIZE - 1, y1: y0 + CHUNK_SIZE - 1 };
  const wet = wetOf(land);
  for (const s of spansIn(land, box.x0, box.y0, box.x1, box.y1)) buildSpan(volume, wet, s, box);
}
