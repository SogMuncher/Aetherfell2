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

export interface Line {
  c: number;
  w: number;
}

/** Front normals: rot0 faces north (-y), rot1 east, rot2 south, rot3 west. */
export const ROT_OUT_FACE: Record<CompassSide, number> = { n: 0, e: 1, s: 2, w: 3 };
