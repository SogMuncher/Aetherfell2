import { CONTENT } from '../../content';
import { type CityLayout, type CompassSide, type DistrictDef, type PlannedStructure, type StructureDef, type TileKind, turnToward } from '../../types';
import type { House, Rect } from './sites';
import { type Line, RING_AT, ROT_OUT_FACE, houseFor, planned, weighted } from './cityParts';
import { cityWall } from './cityWall';
import type { Ward } from './city';
import { structureSize } from '../../content/structures';


/**
 * Plans one ward: its keep and landmarks, its wall, and its blocks filled by district. Returns the
 * painter for its streets (inside its own rectangle only).
 */
export function raiseWard(w: Ward, r: (k: number, a?: number, b?: number) => number, l: CityLayout, push: (s: PlannedStructure) => boolean, dwellings: House[]): (x: number, y: number) => TileKind | null {
  const { cx, cy, hx, hy } = w;
  const reserved: Rect[] = [];
  const P = w.plaza;
  reserved.push({ x0: cx - P - 1, y0: cy - P - 1, x1: cx + P + 1, y1: cy + P + 1 });

  // The heart: the keep inside its curtain wall (first ward only), landmarks round the plaza.
  if (w.main) {
    const C = l.centre.court;
    const keepDef = CONTENT.structures[l.centre.keep];
    if (keepDef) {
      const [kw, kd] = structureSize(keepDef, r(3), r(4));
      // Door to the south, where the court's gate is.
      push(planned(l.centre.keep, cx - Math.floor(kw / 2), cy - Math.floor(kd / 2) - (C > 0 ? 1 : 0), 2, kw, kd, Math.floor(r(5) * 2147483647)));
    }
    if (C > 0 && l.centre.courtTower && l.centre.courtGate) {
      cityWall([{ cx, cy, hx: C, hy: C, gates: ['s'] }], 0, { run: l.walls.run, tower: l.centre.courtTower, gate: l.centre.courtGate, towerEvery: 0 }, Math.floor(r(6) * 2147483647)).pieces.forEach(push);
    }
  }
  w.landmarks.forEach((m, i) => {
    const def = CONTENT.structures[m.structure];
    if (!def) return;
    const [lw, ld] = structureSize(def, r(10 + i), r(30 + i));
    const mx = cx + m.at[0];
    const my = cy + m.at[1];
    const rot = m.rot ?? turnToward(mx, my, cx, cy);
    const fx = rot & 1 ? ld : lw;
    const fy = rot & 1 ? lw : ld;
    const s = planned(m.structure, Math.round(mx - fx / 2), Math.round(my - fy / 2), rot, lw, ld, Math.floor(r(50 + i) * 2147483647));
    push(s);
    reserved.push({ x0: s.x - 3, y0: s.y - 3, x1: s.x + s.fx + 2, y1: s.y + s.fy + 2 });
  });

  // Streets: ring street, main streets from the gates, side streets on a grid.
  const lineSet = (half: number): Line[] => {
    const out: Line[] = [{ c: -(half - RING_AT), w: 3 }, { c: 0, w: w.streets.main }, { c: half - RING_AT, w: 3 }];
    for (let k = 1; k * w.streets.every <= half - RING_AT - 12; k++) out.push({ c: k * w.streets.every, w: w.streets.width }, { c: -k * w.streets.every, w: w.streets.width });
    return out.sort((a, b) => a.c - b.c);
  };
  const vx = lineSet(hx).map((s) => ({ c: s.c + cx, w: s.w }));
  const hy2 = lineSet(hy).map((s) => ({ c: s.c + cy, w: s.w }));

  // Blocks between the streets, filled by district.
  const hits = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  const districtAt = (bx: number, by: number): DistrictDef | undefined => {
    const nx = (bx - cx) / hx;
    const ny = (by - cy) / hy;
    const u = Math.max(Math.abs(nx), Math.abs(ny));
    const side: CompassSide = Math.abs(nx) > Math.abs(ny) ? (nx > 0 ? 'e' : 'w') : ny > 0 ? 's' : 'n';
    return w.districts.find((d) => u >= d.from && u < d.to && (!d.sides || d.sides.includes(side)));
  };
  // A round ward is rounded off: blocks beyond its ellipse are left to the land.
  const roundOk = (bx: number, by: number): boolean => !w.round || ((bx - cx) / hx) ** 2 + ((by - cy) / hy) ** 2 <= 1.05;
  for (let i = 0; i + 1 < vx.length; i++) {
    for (let j = 0; j + 1 < hy2.length; j++) {
      const a = vx[i];
      const b = vx[i + 1];
      const c = hy2[j];
      const e = hy2[j + 1];
      if (!a || !b || !c || !e) continue;
      const block: Rect = { x0: a.c + (a.w - 1) / 2 + 2, x1: b.c - (b.w - 1) / 2 - 2, y0: c.c + (c.w - 1) / 2 + 2, y1: e.c - (e.w - 1) / 2 - 2 };
      const bw = block.x1 - block.x0 + 1;
      const bh = block.y1 - block.y0 + 1;
      if (bw < 8 || bh < 8) continue;
      if (!roundOk((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2)) continue;
      const dist = districtAt((block.x0 + block.x1) / 2, (block.y0 + block.y1) / 2);
      if (!dist) continue;
      const bseed = (k: number): number => r(100 + k, i * 13 + 5, j * 29 + 7);
      // One big building for the whole block?
      if (dist.block && bseed(1) < dist.block.chance) {
        const id = weighted(dist.block.buildings, bseed(2));
        const def = id ? CONTENT.structures[id] : undefined;
        if (id && def && !reserved.some((q) => hits(q, block))) {
          const s = fit(id, def, block, 'any', bseed(3), bseed(4), bseed(5), cx, cy);
          if (s && push(s)) {
            if (def.dwelling !== false) dwellings.push(houseFor(s));
            continue;
          }
        }
      }
      // Otherwise small lots, one building each.
      const nx = Math.max(1, Math.round(bw / 8));
      const ny = Math.max(1, Math.round(bh / 8));
      const lw = Math.floor((bw - (nx - 1)) / nx);
      const lh = Math.floor((bh - (ny - 1)) / ny);
      for (let lj = 0; lj < ny; lj++) {
        for (let li = 0; li < nx; li++) {
          const lot: Rect = { x0: block.x0 + li * (lw + 1), y0: block.y0 + lj * (lh + 1), x1: block.x0 + li * (lw + 1) + lw - 1, y1: block.y0 + lj * (lh + 1) + lh - 1 };
          if (reserved.some((q) => hits(q, lot))) continue;
          const s = (k: number): number => r(200 + k, (i * 7 + li) * 31 + 1, (j * 11 + lj) * 17 + 3);
          if (s(1) >= dist.fill) continue;
          const id = weighted(dist.lots, s(2));
          const def = id ? CONTENT.structures[id] : undefined;
          if (!id || !def) continue;
          // Which street it faces: any edge of the block it touches.
          const edges: ('n' | 's' | 'w' | 'e')[] = [];
          if (lj === 0) edges.push('n');
          if (lj === ny - 1) edges.push('s');
          if (li === 0) edges.push('w');
          if (li === nx - 1) edges.push('e');
          const face = edges.length > 0 ? edges[Math.floor(s(3) * edges.length)] ?? 'n' : 'n';
          const placed = fit(id, def, lot, face, s(4), s(5), s(6), cx, cy);
          if (!placed || !push(placed)) continue;
          if (def.dwelling !== false) dwellings.push(houseFor(placed));
        }
      }
    }
  }

  const half = (n: number): number => (n - 1) / 2;
  const onLine = (lines: Line[], v: number): Line | undefined => lines.find((q) => Math.abs(v - q.c) <= half(q.w));
  return (x: number, y: number): TileKind | null => {
    const ax = Math.abs(x - cx);
    const ay = Math.abs(y - cy);
    if (w.round && (ax / hx) ** 2 + (ay / hy) ** 2 > 1) return null;
    if (ax <= P && ay <= P) return l.tiles.main;
    const lx = onLine(vx, x);
    const ly = onLine(hy2, y);
    // Main streets run right out through the gates; ring and side streets are plain and stay inside the ring.
    if ((lx && lx.w === w.streets.main) || (ly && ly.w === w.streets.main)) return l.tiles.main;
    if ((lx && ay <= hy - RING_AT + 1) || (ly && ax <= hx - RING_AT + 1)) return l.tiles.street;
    return l.tiles.ground;
  };
}

/** Sets one building inside a lot, front to the street on the side `face` (or the side towards the middle of the city when 'any'). */
export function fit(id: string, def: StructureDef, lot: Rect, face: CompassSide | 'any', r1: number, r2: number, r3: number, cx: number, cy: number): PlannedStructure | null {
  const lw = lot.x1 - lot.x0 + 1;
  const lh = lot.y1 - lot.y0 + 1;
  let [w, d] = structureSize(def, r1, r2);
  const f: CompassSide = face === 'any' ? (['n', 'e', 's', 'w'] as const)[turnToward((lot.x0 + lot.x1) / 2, (lot.y0 + lot.y1) / 2, cx, cy)] ?? 'n' : face;
  const rot = ROT_OUT_FACE[f];
  // Width runs along the street, depth away from it.
  const along = f === 'n' || f === 's' ? lw : lh;
  const away = f === 'n' || f === 's' ? lh : lw;
  w = Math.min(w, along);
  d = Math.min(d, away);
  if (w < 5 || d < 5) return null;
  const fx = rot & 1 ? d : w;
  const fy = rot & 1 ? w : d;
  const x0 = f === 'w' ? lot.x0 : f === 'e' ? lot.x1 - fx + 1 : lot.x0 + Math.floor((lw - fx) / 2);
  const y0 = f === 'n' ? lot.y0 : f === 's' ? lot.y1 - fy + 1 : lot.y0 + Math.floor((lh - fy) / 2);
  return planned(id, x0, y0, rot, w, d, Math.floor(r3 * 2147483647));
}
