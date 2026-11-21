import { CELL, type Land, type RegionWays, SPAN, type Seg, type Way, type WayHit, cellKey, chosen, netOf, siteKey, sitesAround } from './wayParts';
import { type Pt, REGION_SIZE } from './sites';
import { wayBetween, wayBox } from './wayRoute';

export type { Land, Way, WayHit } from './wayParts';


function regionWays(land: Land, rx: number, ry: number): RegionWays {
  const net = netOf(land.seed);
  const k = cellKey(rx, ry);
  const hit = net.regions.get(k);
  if (hit) return hit;
  if (net.regions.size > 512) net.regions.clear();
  const rx0 = rx * REGION_SIZE;
  const ry0 = ry * REGION_SIZE;
  const sites = sitesAround(land, rx, ry, SPAN + 1);
  const byKey = new Map(sites.map((s) => [siteKey(s), s] as const));
  const seen = new Set<string>();
  const ways: Way[] = [];
  for (const a of sites) {
    for (const bk of chosen(land, a)) {
      const b = byKey.get(bk) ?? null;
      if (!b) continue;
      const w = wayBetween(land, a, b);
      if (!w || seen.has(w.key)) continue;
      seen.add(w.key);
      const box = wayBox(w);
      if (box.x1 < rx0 || box.x0 > rx0 + REGION_SIZE || box.y1 < ry0 || box.y0 > ry0 + REGION_SIZE) continue;
      ways.push(w);
    }
  }
  // Places that reach for a neighbour which does not reach back still get the link, from the neighbour's side.
  for (const b of sites) {
    for (const ak of chosen(land, b)) {
      const a = byKey.get(ak);
      if (!a) continue;
      const w = wayBetween(land, a, b);
      if (!w || seen.has(w.key)) continue;
      seen.add(w.key);
      const box = wayBox(w);
      if (box.x1 < rx0 || box.x0 > rx0 + REGION_SIZE || box.y1 < ry0 || box.y0 > ry0 + REGION_SIZE) continue;
      ways.push(w);
    }
  }
  ways.sort((p, q) => (p.key < q.key ? -1 : 1));
  const cells = new Map<number, Seg[]>();
  for (const w of ways) {
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const p = w.pts[i] as Pt;
      const q = w.pts[i + 1] as Pt;
      const half = w.def.width / 2;
      const seg: Seg = { ax: p.x, ay: p.y, bx: q.x, by: q.y, half, rank: w.def.rank, tile: w.def.tile };
      const m = half + 1;
      for (let cy = Math.floor((Math.min(p.y, q.y) - m) / CELL); cy <= Math.floor((Math.max(p.y, q.y) + m) / CELL); cy++) {
        for (let cx = Math.floor((Math.min(p.x, q.x) - m) / CELL); cx <= Math.floor((Math.max(p.x, q.x) + m) / CELL); cx++) {
          const ck = cellKey(cx, cy);
          const list = cells.get(ck);
          if (list) list.push(seg);
          else cells.set(ck, [seg]);
        }
      }
    }
  }
  const out: RegionWays = { ways, cells };
  net.regions.set(k, out);
  return out;
}

/** Every way whose route passes through (or within a few metres of) region (rx, ry). */
export function waysTouching(land: Land, rx: number, ry: number): readonly Way[] {
  return regionWays(land, rx, ry).ways;
}

/** The best way under a point (the highest grade, then the nearest), or null. `spread` widens every way by that many metres (for coarse samples). */
export function wayHit(land: Land, x: number, y: number, spread = 0): WayHit | null {
  const rw = regionWays(land, Math.floor(x / REGION_SIZE), Math.floor(y / REGION_SIZE));
  const list = rw.cells.get(cellKey(Math.floor(x / CELL), Math.floor(y / CELL)));
  if (!list) return null;
  let best: WayHit | null = null;
  for (const s of list) {
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const len = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (y - s.ay) * vy) / len));
    const d = Math.hypot(x - (s.ax + vx * t), y - (s.ay + vy * t));
    if (d > s.half + spread) continue;
    if (best === null || s.rank > best.rank || (s.rank === best.rank && d < best.d)) best = { tile: s.tile, rank: s.rank, half: s.half, d };
  }
  return best;
}
