import type { CityLayout, CompassSide, DistrictDef, Landmark, PlannedStructure, StreetStyle, TileKind } from '../../types';
import type { CityPlan } from './cityParts';
import type { House, Pt, Rect } from './sites';
import { hash2 } from './noise';
import { raiseWard } from './cityWard';
import { cityWall } from './cityWall';
import { weighted } from './cityParts';


/** Is there water at this spot? (Supplied by the world: rivers and lakes are not built on.) */
export type WetProbe = (x: number, y: number) => boolean;

/** One ward as it is placed: where it stands, how big, its kind, and whether a wall rings it. */
export interface Ward {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  /** Rounded off to an oval. */
  round: boolean;
  /** Its street pattern (spacing and widths). */
  streets: StreetStyle;
  plaza: number;
  landmarks: readonly Landmark[];
  districts: readonly DistrictDef[];
  /** The keep, only in the first ward. */
  main: boolean;
  /** Which sides open onto an avenue to another ward. */
  linked: Set<CompassSide>;
}

interface Link {
  a: Ward;
  b: Ward;
  side: CompassSide;
}

const SIDES: readonly CompassSide[] = ['n', 'e', 's', 'w'];
const OPPOSITE: Record<CompassSide, CompassSide> = { n: 's', s: 'n', e: 'w', w: 'e' };

/** The plan for the city whose middle is (cx, cy) in region (rx, ry). */
export function cityLayout(seed: number, rx: number, ry: number, cx: number, cy: number, l: CityLayout, wet: WetProbe = () => false, open: readonly Pt[] | null = null): CityPlan {
  const rr = (w: number) => (k: number, a = 0, b = 0): number => hash2(seed + 500 + k + w * 1009, rx * 31 + a, ry * 17 + b);
  const r = rr(0);
  const hx = l.half[0] + Math.floor(r(1) * (l.half[1] - l.half[0] + 1));
  const hy = Math.round(hx * (0.78 + r(2) * 0.2));
  // Each ward picks its street pattern from the weighted styles (a style is a row of data).
  const streetFor = (roll: number): StreetStyle => {
    const styles = l.streetStyles ?? [];
    const id = weighted(Object.fromEntries(styles.map((st, i) => [String(i), st.weight])), roll);
    return (id !== null ? styles[Number(id)] : undefined) ?? l.streets;
  };
  const wards: Ward[] = [{ cx, cy, hx, hy, round: false, streets: streetFor(r(3)), plaza: l.centre.plaza, landmarks: l.centre.landmarks, districts: l.districts, main: true, linked: new Set() }];
  const links: Link[] = [];

  // A megacity grows more wards beside the first, each touching its parent across a gap, none on water.
  const spr = l.sprawl;
  if (spr) {
    const want = spr.wards[0] + Math.floor(r(60) * (spr.wards[1] - spr.wards[0] + 1));
    const totalWeight = spr.kinds.reduce((t, k) => t + Math.max(0, k.weight), 0) || 1;
    for (let t = 1; wards.length < want && t <= want * 60; t++) {
      const q = (k: number): number => r(70 + k, t * 3, t * 5);
      const parent = wards[Math.floor(q(1) * wards.length)];
      if (!parent) continue;
      const side = SIDES[Math.floor(q(2) * 4)] ?? 'n';
      const nhx = spr.half[0] + Math.floor(q(3) * (spr.half[1] - spr.half[0] + 1));
      const nhy = spr.half[0] + Math.floor(q(4) * (spr.half[1] - spr.half[0] + 1));
      const horizontal = side === 'e' || side === 'w';
      const dir = side === 'e' || side === 's' ? 1 : -1;
      // Slide along the parent's side, but keep enough overlap to share an avenue.
      const room = (horizontal ? parent.hy + nhy : parent.hx + nhx) - 26;
      if (room <= 0) continue;
      const slide = Math.round((q(5) * 2 - 1) * room * 0.85);
      const ncx = horizontal ? parent.cx + dir * (parent.hx + spr.gap + nhx) : parent.cx + slide;
      const ncy = horizontal ? parent.cy + slide : parent.cy + dir * (parent.hy + spr.gap + nhy);
      if (Math.hypot(Math.abs(ncx - cx) + nhx, Math.abs(ncy - cy) + nhy) > spr.reach) continue;
      if (wards.some((w) => Math.abs(ncx - w.cx) < w.hx + nhx + spr.gap - 1 && Math.abs(ncy - w.cy) < w.hy + nhy + spr.gap - 1)) continue;
      // Rivers and lakes: the centre must be dry and most of the ground too.
      let dry = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (!wet(ncx + (i * nhx) / 2.5, ncy + (j * nhy) / 2.5)) dry++;
      if (wet(ncx, ncy) || dry < 19) continue;
      let pick = q(6) * totalWeight;
      let kind = spr.kinds[0];
      for (const k of spr.kinds) {
        pick -= Math.max(0, k.weight);
        if (pick < 0) {
          kind = k;
          break;
        }
      }
      if (!kind) continue;
      const w: Ward = { cx: ncx, cy: ncy, hx: nhx, hy: nhy, round: kind.round === true, streets: streetFor(q(7)), plaza: kind.plaza, landmarks: kind.landmarks, districts: kind.districts, main: false, linked: new Set() };
      wards.push(w);
      parent.linked.add(side);
      w.linked.add(OPPOSITE[side]);
      links.push({ a: parent, b: w, side });
    }
  }

  const plan: PlannedStructure[] = [];
  const dwellings: House[] = [];
  // Nothing is raised over a river or a lake: a piece with any corner or its middle wet is left out.
  const dry = (s: PlannedStructure): boolean =>
    !wet(s.x + s.fx / 2, s.y + s.fy / 2) && !wet(s.x, s.y) && !wet(s.x + s.fx - 1, s.y) && !wet(s.x, s.y + s.fy - 1) && !wet(s.x + s.fx - 1, s.y + s.fy - 1);
  const push = (s: PlannedStructure): boolean => {
    if (!dry(s)) return false;
    plan.push(s);
    return true;
  };
  // One wall round all of it.
  const M = l.walls.margin ?? 0;
  // A gate opens only where the ground out front is dry and (once roads are known) a road really runs out of it.
  const OUT = 40;
  const outFrom = (g: { side: CompassSide; x: number; y: number }): Pt => ({ x: g.x + (g.side === 'e' ? OUT : g.side === 'w' ? -OUT : 0), y: g.y + (g.side === 's' ? OUT : g.side === 'n' ? -OUT : 0) });
  const gateOk = (g: { side: CompassSide; x: number; y: number }): boolean => {
    const dx = g.side === 'e' ? 1 : g.side === 'w' ? -1 : 0;
    const dy = g.side === 's' ? 1 : g.side === 'n' ? -1 : 0;
    for (let d = 1; d <= OUT; d += 2) if (wet(g.x + dx * d, g.y + dy * d)) return false;
    if (!open) return true;
    const m = outFrom(g);
    return open.some((p) => Math.abs(p.x - m.x) < 2 && Math.abs(p.y - m.y) < 2);
  };
  const wall = cityWall(wards.map((w) => ({ cx: w.cx, cy: w.cy, hx: w.hx, hy: w.hy, gates: SIDES })), M, l.walls, Math.floor(r(7) * 2147483647), gateOk);
  wall.pieces.forEach(push);
  const painters: ((x: number, y: number) => TileKind | null)[] = [];
  wards.forEach((w, wi) => painters.push(raiseWard(w, rr(wi), l, push, dwellings)));

  // Only so many people live here: spread them over the dwellings.
  const houses: House[] = [];
  const take = Math.min(l.residents, dwellings.length);
  for (let n = 0; n < take; n++) {
    const h = dwellings[Math.floor((n * dwellings.length) / take)];
    if (h) houses.push(h);
  }

  const mw = (l.streets.main - 1) / 2;
  const inside = (w: Ward, x: number, y: number, m = 0): boolean => Math.abs(x - w.cx) <= w.hx + m && Math.abs(y - w.cy) <= w.hy + m;
  // Roads running out from the gates, where the ground is dry.
  const mouths: Pt[] = [];
  const stubs: { g: (typeof wall.gates)[number]; w: number }[] = [];
  for (const g of wall.gates) {
    // The ward whose middle this gate lines up with sets the width of the main street.
    const owner = wards.find((w) => (g.side === 'n' || g.side === 's' ? w.cx === g.x : w.cy === g.y));
    stubs.push({ g, w: ((owner?.streets.main ?? l.streets.main) - 1) / 2 });
    mouths.push(outFrom(g));
  }
  const onStub = (x: number, y: number): boolean => {
    for (const { g, w } of stubs) {
      const horizontal = g.side === 'e' || g.side === 'w';
      const along = horizontal ? (x - g.x) * (g.side === 'e' ? 1 : -1) : (y - g.y) * (g.side === 's' ? 1 : -1);
      const across = horizontal ? Math.abs(y - g.y) : Math.abs(x - g.x);
      if (along > -(M + 1) && along <= OUT && across <= w + 0.01) return true;
    }
    return false;
  };
  // Avenues between wards: out of a gate, across the gap, into the next gate.
  const onLink = (x: number, y: number): boolean => {
    for (const k of links) {
      const horizontal = k.side === 'e' || k.side === 'w';
      const dir = k.side === 'e' || k.side === 's' ? 1 : -1;
      if (horizontal) {
        const xm = k.a.cx + dir * (k.a.hx + (Math.abs(k.b.cx - k.a.cx) - k.a.hx - k.b.hx) / 2);
        if (Math.abs(y - k.a.cy) <= mw && x >= Math.min(k.a.cx, xm) && x <= Math.max(k.a.cx, xm)) return true;
        if (Math.abs(x - xm) <= mw && y >= Math.min(k.a.cy, k.b.cy) - mw && y <= Math.max(k.a.cy, k.b.cy) + mw) return true;
        if (Math.abs(y - k.b.cy) <= mw && x >= Math.min(xm, k.b.cx) && x <= Math.max(xm, k.b.cx)) return true;
      } else {
        const ym = k.a.cy + dir * (k.a.hy + (Math.abs(k.b.cy - k.a.cy) - k.a.hy - k.b.hy) / 2);
        if (Math.abs(x - k.a.cx) <= mw && y >= Math.min(k.a.cy, ym) && y <= Math.max(k.a.cy, ym)) return true;
        if (Math.abs(y - ym) <= mw && x >= Math.min(k.a.cx, k.b.cx) - mw && x <= Math.max(k.a.cx, k.b.cx) + mw) return true;
        if (Math.abs(x - k.b.cx) <= mw && y >= Math.min(ym, k.b.cy) && y <= Math.max(ym, k.b.cy)) return true;
      }
    }
    return false;
  };
  const rawPaint = (x: number, y: number): TileKind | null => {
    // Water is never paved over.
    if (wet(x, y)) return null;
    for (let i = 0; i < wards.length; i++) {
      const w = wards[i];
      if (w && inside(w, x, y)) return painters[i]?.(x, y) ?? null;
    }
    if (onLink(x, y) || onStub(x, y)) return l.tiles.street;
    return wards.some((w) => inside(w, x, y, M + 14)) ? l.tiles.ground : null;
  };

  // A street tile counts only if it runs back to a ward's middle or a gate road: no stray fragments (cut by water or rounded corners).
  const pad = M + 14;
  const bx0 = Math.min(...wards.map((w) => w.cx - w.hx)) - pad;
  const by0 = Math.min(...wards.map((w) => w.cy - w.hy)) - pad;
  const bx1 = Math.max(...wards.map((w) => w.cx + w.hx)) + pad + OUT;
  const by1 = Math.max(...wards.map((w) => w.cy + w.hy)) + pad + OUT;
  const bw = bx1 - bx0 + 1;
  let linked: Uint8Array | null = null;
  const isStreet = (x: number, y: number): boolean => {
    if (x < bx0 || y < by0 || x > bx1 || y > by1) return false;
    const t = rawPaint(x, y);
    return t !== null && (t === l.tiles.street || t === l.tiles.main);
  };
  const link = (): Uint8Array => {
    const seen = new Uint8Array(bw * (by1 - by0 + 1));
    const stack: number[] = [];
    const add = (x: number, y: number): void => {
      if (!isStreet(x, y)) return;
      const k = (y - by0) * bw + (x - bx0);
      if (seen[k]) return;
      seen[k] = 1;
      stack.push(x, y);
    };
    for (const w of wards) add(w.cx, w.cy);
    for (const m of mouths) add(m.x, m.y);
    while (stack.length > 0) {
      const y = stack.pop() ?? 0;
      const x = stack.pop() ?? 0;
      add(x + 1, y);
      add(x - 1, y);
      add(x, y + 1);
      add(x, y - 1);
    }
    return seen;
  };
  const paint = (x: number, y: number): TileKind | null => {
    const t = rawPaint(x, y);
    if (t === null || (t !== l.tiles.street && t !== l.tiles.main)) return t;
    linked ??= link();
    return linked[(y - by0) * bw + (x - bx0)] ? t : l.tiles.ground;
  };

  let radius = 0;
  const footprint: Rect[] = [];
  const gates: Pt[] = [];
  for (const w of wards) {
    radius = Math.max(radius, Math.hypot(Math.abs(w.cx - cx) + w.hx + M, Math.abs(w.cy - cy) + w.hy + M) + 14);
    footprint.push({ x0: w.cx - w.hx, y0: w.cy - w.hy, x1: w.cx + w.hx, y1: w.cy + w.hy });
  }
  for (const g of wall.gates) gates.push({ x: g.x, y: g.y });
  return { plan, houses, paint, radius, square: { x: cx, y: cy + Math.floor(l.centre.plaza * 0.6) }, mouths, footprint, gates };
}
