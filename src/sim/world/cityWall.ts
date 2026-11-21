import type { CompassSide, PlannedStructure } from '../../types';
import { GATE_D, GATE_W, MAX_RUN, ROT_IN, ROT_OUT, TOWER, WALL_D, planned } from './cityParts';

/** A rectangle to wall in (half-sizes from its middle) and the sides that get a gate in the middle. */
export interface Enclosed {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  gates: readonly CompassSide[];
}

export interface WallKit {
  run: string;
  tower: string;
  gate: string;
  towerEvery: number;
}

/** Where a gate opens: the side it faces and the cell just inside its outer face. */
export interface GateAt {
  side: CompassSide;
  x: number;
  y: number;
}

interface Seg {
  side: CompassSide;
  /** The line the outer face lies on (for n and w the first row, for s and e one past the last). */
  f: number;
  a0: number;
  a1: number;
}

/**
 * One wall round everything: the rectangles (each grown by `margin`) are merged and the outline of the
 * merged shape is walled, so touching or overlapping rectangles share a single wall with no wall between
 * them. Straight runs between towers (corners, every `towerEvery` m), and a gate on each exposed side
 * that asks for one, in line with the middle of its rectangle.
 */
export function cityWall(items: readonly Enclosed[], margin: number, kit: WallKit, salt: number, want: (g: GateAt) => boolean = () => true): { pieces: PlannedStructure[]; gates: GateAt[] } {
  const rects = items.map((i) => ({ x0: i.cx - i.hx - margin, x1: i.cx + i.hx + margin + 1, y0: i.cy - i.hy - margin, y1: i.cy + i.hy + margin + 1 }));
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const ys = [...new Set(rects.flatMap((r) => [r.y0, r.y1]))].sort((a, b) => a - b);
  const full = (i: number, j: number): boolean => {
    const xm = xs[i];
    const ym = ys[j];
    if (xm === undefined || ym === undefined) return false;
    return rects.some((r) => xm >= r.x0 && xm < r.x1 && ym >= r.y0 && ym < r.y1);
  };
  // Edges between a filled cell and an empty neighbour, merged into straight segments.
  const raw = new Map<string, [number, number][]>();
  const edge = (side: CompassSide, f: number, a0: number, a1: number): void => {
    const key = `${side}:${f}`;
    const list = raw.get(key);
    if (list) list.push([a0, a1]);
    else raw.set(key, [[a0, a1]]);
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      if (!full(i, j)) continue;
      const x0 = xs[i] ?? 0;
      const x1 = xs[i + 1] ?? 0;
      const y0 = ys[j] ?? 0;
      const y1 = ys[j + 1] ?? 0;
      if (!full(i, j - 1)) edge('n', y0, x0, x1);
      if (!full(i, j + 1)) edge('s', y1, x0, x1);
      if (!full(i - 1, j)) edge('w', x0, y0, y1);
      if (!full(i + 1, j)) edge('e', x1, y0, y1);
    }
  }
  const segs: Seg[] = [];
  for (const [key, list] of raw) {
    const side = key[0] as CompassSide;
    const f = Number(key.slice(2));
    list.sort((p, q) => p[0] - q[0]);
    let cur: [number, number] | null = null;
    for (const s of list) {
      if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
      else {
        if (cur) segs.push({ side, f, a0: cur[0], a1: cur[1] - 1 });
        cur = [s[0], s[1]];
      }
    }
    if (cur) segs.push({ side, f, a0: cur[0], a1: cur[1] - 1 });
  }
  segs.sort((p, q) => p.side.localeCompare(q.side) || p.f - q.f || p.a0 - q.a0);

  const pieces: PlannedStructure[] = [];
  const gates: GateAt[] = [];
  let k = 0;
  for (const s of segs) {
    const add = (id: string, a: number, w: number, d: number, rot: number): void => {
      const x = s.side === 'n' || s.side === 's' ? a : s.side === 'w' ? s.f : s.f - d;
      const y = s.side === 'w' || s.side === 'e' ? a : s.side === 'n' ? s.f : s.f - d;
      // Two sides meet at corners and jogs: whatever stands already keeps its place.
      const piece = planned(id, x, y, rot, w, d, salt + k++ * 7919);
      if (pieces.some((q) => q.x < piece.x + piece.fx && q.x + q.fx > piece.x && q.y < piece.y + piece.fy && q.y + q.fy > piece.y)) return;
      pieces.push(piece);
    };
    const len = s.a1 - s.a0 + 1;
    if (len < TOWER * 2) {
      // Too short for towers: one plain run.
      add(kit.run, s.a0, len, WALL_D, ROT_OUT[s.side]);
      continue;
    }
    const spans: { a: number; w: number }[] = [{ a: s.a0, w: TOWER }, { a: s.a1 - TOWER + 1, w: TOWER }];
    add(kit.tower, s.a0, TOWER, TOWER, ROT_IN[s.side]);
    add(kit.tower, s.a1 - TOWER + 1, TOWER, TOWER, ROT_IN[s.side]);
    const horizontal = s.side === 'n' || s.side === 's';
    for (const it of items) {
      if (!it.gates.includes(s.side)) continue;
      const m = horizontal ? it.cx : it.cy;
      const line = s.side === 'n' ? it.cy - it.hy - margin : s.side === 's' ? it.cy + it.hy + margin + 1 : s.side === 'w' ? it.cx - it.hx - margin : it.cx + it.hx + margin + 1;
      const g0 = m - Math.floor(GATE_W / 2);
      if (line !== s.f || g0 < s.a0 + TOWER || g0 + GATE_W > s.a1 - TOWER + 1) continue;
      const at: GateAt = { side: s.side, x: horizontal ? m : s.side === 'w' ? s.f : s.f - 1, y: horizontal ? (s.side === 'n' ? s.f : s.f - 1) : m };
      // No road leaves here: the wall stays whole.
      if (!want(at)) continue;
      add(kit.gate, g0, GATE_W, GATE_D, ROT_OUT[s.side]);
      spans.push({ a: g0, w: GATE_W });
      gates.push(at);
    }
    // Towers along each stretch between what stands already, straight runs in what is left.
    const sorted = [...spans].sort((p, q) => p.a - q.a);
    let cursor = s.a0;
    const stretches: [number, number][] = [];
    for (const sp of sorted) {
      if (sp.a > cursor) stretches.push([cursor, sp.a - 1]);
      cursor = Math.max(cursor, sp.a + sp.w);
    }
    if (cursor <= s.a1) stretches.push([cursor, s.a1]);
    for (const [a0, a1] of stretches) {
      const n = kit.towerEvery > 0 ? Math.floor((a1 - a0 + 1) / kit.towerEvery) : 0;
      const towers: number[] = [];
      for (let t = 1; t <= n; t++) towers.push(Math.max(a0, Math.min(a1 - TOWER + 1, Math.round(a0 + ((a1 - a0 + 1) * t) / (n + 1)) - Math.floor(TOWER / 2))));
      for (const a of towers) add(kit.tower, a, TOWER, TOWER, ROT_IN[s.side]);
      let c = a0;
      for (const a of [...towers, a1 + 1]) {
        let gap = a - c;
        const pieceCount = Math.ceil(gap / MAX_RUN);
        for (let p = 0; p < pieceCount; p++) {
          const w = Math.floor(gap / (pieceCount - p));
          add(kit.run, c, w, WALL_D, ROT_OUT[s.side]);
          c += w;
          gap -= w;
        }
        c = a + TOWER;
      }
    }
  }
  return { pieces, gates };
}
