import { CONTENT } from '../../content';
import { type Land, type Way, centre, dist, gradeOf, mouth, netOf, siteKey } from './wayParts';
import type { Pt, SiteLayout } from './sites';
import { type Span, planBridge } from './decks';
import type { WayGradeDef } from '../../types';
import { hash2 } from './noise';


/** How hard a route is: steps under water or off the allowed ground weigh heavily, climbing a little. */
export function cost(land: Land, pts: Pt[]): { cost: number; wet: number } {
  const r = CONTENT.world.roads;
  let c = 0;
  let bad = 0;
  let n = 0;
  let prev = Number.NaN;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i] as Pt;
    const q = pts[i + 1] as Pt;
    const steps = Math.max(1, Math.ceil(dist(p, q) / 8));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const g = land.rawGround(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t, 3);
      n++;
      if (g < r.lowest || g > r.highest) bad++;
      if (!Number.isNaN(prev)) c += Math.abs(g - prev) * 0.6;
      prev = g;
    }
  }
  // Water: a short crossing costs a little (it will be bridged), a long one is as good as impassable.
  const w = land.streamLevelAt;
  if (w) {
    const r2 = CONTENT.world.water;
    let run = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const p = pts[i] as Pt;
      const q = pts[i + 1] as Pt;
      const len = dist(p, q);
      const steps = Math.max(1, Math.ceil(len / 3));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        if (!Number.isNaN(w.call(land, p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t))) run += len / steps;
        else if (run > 0) {
          c += 12;
          if (run > r2.span - 6) bad += Math.ceil(run / 4);
          run = 0;
        }
      }
    }
    if (run > 0) {
      c += 12;
      if (run > r2.span - 6) bad += Math.ceil(run / 4);
    }
  }
  return { cost: c + bad * 40, wet: n === 0 ? 0 : bad / n };
}

/**
 * Where the route meets water, makes it cross on a bridge: each run of water becomes a straight deck along the nearer
 * axis, and the route is cut to go into one end and out of the other. A run too long to span is left as it is.
 */
export function bridgeUp(land: Land, pts: Pt[], key: string, def: WayGradeDef): { pts: Pt[]; spans: Span[]; unbridged: number } {
  const wl = land.streamLevelAt;
  const look = def.bridge;
  if (!wl || !look || !land.ground) return { pts, spans: [], unbridged: 0 };
  const wet = { waterLevelAt: (x: number, y: number): number => wl.call(land, x, y), groundAt: (x: number, y: number): number => land.ground?.(x, y) ?? 0 };
  interface Sample {
    j: number;
    t: number;
    x: number;
    y: number;
    w: boolean;
  }
  const samples: Sample[] = [];
  for (let j = 0; j + 1 < pts.length; j++) {
    const p = pts[j] as Pt;
    const q = pts[j + 1] as Pt;
    const m = Math.max(1, Math.ceil(dist(p, q) / 2));
    for (let k = 0; k < m; k++) {
      const x = p.x + ((q.x - p.x) * k) / m;
      const y = p.y + ((q.y - p.y) * k) / m;
      samples.push({ j, t: k, x, y, w: !Number.isNaN(wet.waterLevelAt(x, y)) });
    }
  }
  const out: Pt[] = [];
  const spans: Span[] = [];
  let unbridged = 0;
  let keep = 0; // pts before this index are already in `out`
  let i = 0;
  while (i < samples.length) {
    const s = samples[i] as Sample;
    if (!s.w) {
      i++;
      continue;
    }
    let e = i;
    while (e + 1 < samples.length && (samples[e + 1] as Sample).w) e++;
    const a = s;
    const b = samples[e] as Sample;
    // The route must have dry ground on both sides of the run, and not overlap the previous bridge.
    const before = a.t === 0 ? a.j - 1 : a.j;
    const after = b.j + 1;
    if (before >= keep - 1 && before >= 0 && after < pts.length) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const pa = samples[Math.max(0, i - 1)] as Sample;
      const pb = samples[Math.min(samples.length - 1, e + 1)] as Sample;
      const span = planBridge(wet, `${key}#${spans.length}`, mid, { x: pb.x - pa.x, y: pb.y - pa.y }, def.width, look);
      if (span) {
        for (let k = keep; k <= before; k++) out.push(pts[k] as Pt);
        const lat = (span.l0 + span.l1 + 1) / 2;
        const A = span.axis === 'x' ? { x: span.c0 + 0.5, y: lat } : { x: lat, y: span.c0 + 0.5 };
        const B = span.axis === 'x' ? { x: span.c1 + 0.5, y: lat } : { x: lat, y: span.c1 + 0.5 };
        // Enter at the end nearer the route's start.
        const first = dist(A, out[out.length - 1] ?? A) <= dist(B, out[out.length - 1] ?? B);
        out.push(first ? A : B, first ? B : A);
        spans.push(span);
        keep = after;
      } else unbridged++;
    } else unbridged++;
    i = e + 1;
  }
  if (spans.length === 0) return { pts, spans, unbridged };
  for (let k = keep; k < pts.length; k++) out.push(pts[k] as Pt);
  return { pts: out, spans, unbridged };
}

/** A route between two points with a gentle sideways bend: `bend` in -1..1 picks which way and how much. */
export function route(a: Pt, b: Pt, bend: number, wander: number, phase: number): Pt[] {
  const len = dist(a, b);
  const n = Math.max(2, Math.ceil(len / 20));
  const nx = -(b.y - a.y) / (len || 1);
  const ny = (b.x - a.x) / (len || 1);
  const pts: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const s = Math.sin(Math.PI * t);
    const off = len * wander * s * (bend * 0.9 + 0.35 * Math.sin(3 * Math.PI * t + phase));
    pts.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
  }
  return pts;
}

export function wayBetween(land: Land, a: SiteLayout, b: SiteLayout): Way | null {
  const [p, q] = siteKey(a) < siteKey(b) ? [a, b] : [b, a];
  const key = `${siteKey(p)}~${siteKey(q)}`;
  const net = netOf(land.seed);
  const hit = net.ways.get(key);
  if (hit !== undefined) return hit;
  const r = CONTENT.world.roads;
  const gp = gradeOf(p);
  const gq = gradeOf(q);
  const dp = gp !== undefined ? r.grades[gp] : undefined;
  const dq = gq !== undefined ? r.grades[gq] : undefined;
  let way: Way | null = null;
  if (gp !== undefined && gq !== undefined && dp && dq) {
    const grade = dp.rank <= dq.rank ? gp : gq;
    const def = dp.rank <= dq.rank ? dp : dq;
    const pa = mouth(p, centre(q));
    const pb = mouth(q, centre(p));
    const phase = hash2(land.seed + 410, p.rx * 131 + q.rx, p.ry * 137 + q.ry) * 6.28;
    let best: { pts: Pt[]; spans: Span[]; unbridged: number } | null = null;
    let bestCost = Infinity;
    for (const bend of [0, 0.5, -0.5, 1, -1]) {
      const pts = route(pa, pb, bend, def.wander, phase);
      const c = cost(land, pts);
      if (c.wet > r.wet) continue;
      // A route over water it cannot bridge (it runs along a river, or the banks are too far apart) is a poor one.
      const bridged = bridgeUp(land, pts, key, def);
      const score = c.cost + bridged.unbridged * 400;
      if (score < bestCost) {
        bestCost = score;
        best = bridged;
      }
    }
    // No road leads into water: a link that would have to ford a river is not made.
    if (best && best.unbridged === 0) way = { key, grade, def, a: p, b: q, pts: best.pts, spans: best.spans };
  }
  net.ways.set(key, way);
  return way;
}

export function wayBox(w: Way): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of w.pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0: x0 - 4, y0: y0 - 4, x1: x1 + 4, y1: y1 + 4 };
}
