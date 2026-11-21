import { type CompassSide, type PlannedStructure, type StructureDef, type TileKind, houseGeometry, turnToward } from '../../types';
import type { House, Pt, Rect } from './sites';
import { structureSize } from '../../content/structures';


/**
 * Lays out a walled city as a plan of structures plus a function that paints its streets. Pure and
 * deterministic: everything comes from the seed, the region and the layout data (content/sites.ts),
 * so every machine plans the same city. Nothing here builds anything; the world system raises the
 * planned structures a few at a time (sim/world/worldSystem.ts).
 *
 * Shape: a rectangular wall (straight runs, towers at the corners and along it, a gate in the
 * middle of each side), a ring street just inside, main streets from the gates to a paved plaza,
 * side streets on a grid, and blocks between them filled by district. In the plaza stands the keep
 * (inside its own curtain wall) and landmarks such as the church.
 */

/** Thickness of a wall run: three of stone and a row for the stairs on the inside. */
export const WALL_D = 4;
export const TOWER = 6;
export const GATE_W = 9;
export const GATE_D = 6;
/** Where the ring street runs, in metres in from the wall's outer face (its middle). */
export const RING_AT = 7;
export const MAX_RUN = 14;

export interface CityPlan {
  plan: PlannedStructure[];
  houses: House[];
  paint: (x: number, y: number) => TileKind | null;
  radius: number;
  square: { x: number; y: number };
  /** Where the streets leave the gates: roads from the world meet the city here. */
  mouths: { x: number; y: number }[];
  /** The ground each ward covers (cells), and where its wall's gates open: for things that must fit round a city (water, ports). */
  footprint: Rect[];
  gates: Pt[];
}

export function planned(id: string, x: number, y: number, rot: number, w: number, d: number, seed: number): PlannedStructure {
  const odd = rot & 1;
  return { id, x, y, rot, w, d, seed, fx: odd ? d : w, fy: odd ? w : d };
}

/** A house raised in the 3D layer: where it stands, which way it faces, and where its door and rooms fall. */
export function structuredHouse(id: string, def: StructureDef, rnd: (k: number) => number, mx: number, my: number, sx: number, sy: number): House {
  const [w, d] = structureSize(def, rnd(1), rnd(2));
  const rot = turnToward(mx, my, sx, sy);
  const fx = rot & 1 ? d : w;
  const fy = rot & 1 ? w : d;
  const x0 = Math.round(mx - fx / 2);
  const y0 = Math.round(my - fy / 2);
  return houseFor(planned(id, x0, y0, rot, w, d, Math.floor(rnd(3) * 2147483647)));
}

export function houseFor(s: PlannedStructure): House {
  const g = houseGeometry(s.x, s.y, s.w, s.d, s.rot);
  const room: Rect = { x0: s.x, y0: s.y, x1: s.x + s.fx - 1, y1: s.y + s.fy - 1 };
  const bounds: Rect = { x0: room.x0 - 2, y0: room.y0 - 2, x1: room.x1 + 2, y1: room.y1 + 2 };
  return { ...room, doorX: g.out.x, doorY: g.out.y, building: s.id, bounds, structure: s, geometry: g };
}

export function weighted(w: Readonly<Record<string, number>>, roll: number): string | null {
  let total = 0;
  for (const v of Object.values(w)) total += Math.max(0, v);
  if (total <= 0) return null;
  let upto = 0;
  for (const [id, v] of Object.entries(w)) {
    upto += Math.max(0, v) / total;
    if (roll < upto) return id;
  }
  return Object.keys(w)[0] ?? null;
}

export const ROT_OUT: Record<CompassSide, number> = { n: 0, e: 1, s: 2, w: 3 };
export const ROT_IN: Record<CompassSide, number> = { n: 2, e: 3, s: 0, w: 1 };

export interface Ring {
  cx: number;
  cy: number;
  hx: number;
  hy: number;
  run: string;
  tower: string;
  gate: string;
  gates: readonly CompassSide[];
  towerEvery: number;
}

/** Puts a wall round a rectangle: towers at the corners (and along long runs), gates where asked, straight runs between. */
export function ring(r: Ring, out: PlannedStructure[], salt: number): void {
  const at = (side: CompassSide, a: number, d: number): [number, number] =>
    side === 'n' ? [a, r.cy - r.hy] : side === 's' ? [a, r.cy + r.hy - (d - 1)] : side === 'w' ? [r.cx - r.hx, a] : [r.cx + r.hx - (d - 1), a];
  let k = 0;
  const add = (side: CompassSide, id: string, a: number, w: number, d: number, rot: number): void => {
    const [x, y] = at(side, a, d);
    out.push(planned(id, x, y, rot, w, d, salt + k++ * 7919));
  };
  for (const side of ['n', 's', 'w', 'e'] as const) {
    const horizontal = side === 'n' || side === 's';
    const lo = horizontal ? r.cx - r.hx : r.cy - r.hy;
    const hi = horizontal ? r.cx + r.hx : r.cy + r.hy;
    const mid = horizontal ? r.cx : r.cy;
    // Corner towers belong to the north and south sides; the east and west run between them.
    const spans: { a: number; w: number }[] = [];
    const from = horizontal ? lo : lo + TOWER;
    const to = horizontal ? hi : hi - TOWER;
    if (horizontal) {
      add(side, r.tower, lo, TOWER, TOWER, ROT_IN[side]);
      add(side, r.tower, hi - TOWER + 1, TOWER, TOWER, ROT_IN[side]);
      spans.push({ a: lo, w: TOWER }, { a: hi - TOWER + 1, w: TOWER });
    }
    const gated = r.gates.includes(side);
    if (gated) {
      add(side, r.gate, mid - Math.floor(GATE_W / 2), GATE_W, GATE_D, ROT_OUT[side]);
      spans.push({ a: mid - Math.floor(GATE_W / 2), w: GATE_W });
    }
    // Towers along each stretch between what stands already.
    const edges = [...spans].sort((p, q) => p.a - q.a);
    const stretches: [number, number][] = [];
    let cursor = from;
    for (const s of edges) {
      if (s.a > cursor) stretches.push([cursor, s.a - 1]);
      cursor = Math.max(cursor, s.a + s.w);
    }
    if (cursor <= to) stretches.push([cursor, to]);
    for (const [a0, a1] of stretches) {
      const len = a1 - a0 + 1;
      const n = r.towerEvery > 0 ? Math.floor(len / r.towerEvery) : 0;
      const towers: number[] = [];
      for (let t = 1; t <= n; t++) {
        const c = Math.round(a0 + (len * t) / (n + 1));
        towers.push(Math.max(a0, Math.min(a1 - TOWER + 1, c - Math.floor(TOWER / 2))));
      }
      for (const a of towers) add(side, r.tower, a, TOWER, TOWER, ROT_IN[side]);
      // Straight runs fill what is left, none longer than MAX_RUN.
      let c2 = a0;
      for (const a of [...towers, a1 + 1]) {
        let gap = a - c2;
        if (gap > 0) {
          const pieces = Math.ceil(gap / MAX_RUN);
          for (let p = 0; p < pieces; p++) {
            const w = Math.floor(gap / (pieces - p));
            add(side, r.run, c2, w, WALL_D, ROT_OUT[side]);
            c2 += w;
            gap -= w;
          }
        }
        c2 = a + TOWER;
      }
    }
  }
}

export interface Line {
  c: number;
  w: number;
}

/** Front normals: rot0 faces north (-y), rot1 east, rot2 south, rot3 west. */
export const ROT_OUT_FACE: Record<CompassSide, number> = { n: 0, e: 1, s: 2, w: 3 };
