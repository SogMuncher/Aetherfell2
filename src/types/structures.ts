/** Which material (a tile id) plays each part of a building; one is picked per building. */
export interface StructureMaterials {
  wall: readonly string[];
  /** Corner posts and bands. Falls back to the wall material. */
  trim?: readonly string[];
  floor: readonly string[];
  roof: readonly string[];
  /** The plinth under the building. Falls back to the wall material. */
  foundation?: readonly string[];
  /** The front door leaf (a door tile kind: it opens, shuts, burns and breaks). Default `door`. */
  door?: readonly string[];
}

export type RoofKind = 'gable' | 'hip' | 'flat';

/**
 * A recipe for a building, read by the structure builder. Everything is in metres (cells) and the
 * builder snaps the pieces to a grid: 3 m storeys, walls one cell thick, stairs where they fit.
 */
export interface StructureDef {
  name: string;
  form: 'house' | 'arch' | 'wall';
  /** Footprint ranges, door side being the front. */
  width: readonly [number, number];
  depth: readonly [number, number];
  materials: StructureMaterials;
  // House
  storeys?: readonly [number, number];
  roof?: RoofKind;
  /** A window every this many metres along a wall (0 = none). */
  windowEvery?: number;
  /** Corner posts and a band along each storey's top in the trim material. */
  frame?: boolean;
  /** Rounded corners (a round tower). */
  round?: boolean;
  /** Open form: two rows of round columns this many metres apart (3 = round arches between them). */
  columns?: number;
  /** Battlements around a flat roof, and stairs up to it. */
  parapet?: boolean;
  /** Somebody lives here (has a home spot, and a villager per house in a settlement). Default true for houses. */
  dwelling?: boolean;
  /** House form: no floors above the ground one, so the storeys only make it taller (a nave, a great hall). */
  open?: boolean;
  /** 0..1: how much has fallen down. */
  decay?: number;
  /** What stands inside (house form): beds, tables, chests, torches… each placed on a kind of spot. */
  furnish?: readonly Furnish[];
  /** The tile shown for it in the far distance (a tall block). Default: the first wall material. */
  far?: string;
  // Wall (a rampart: `width` is its length, `depth` its thickness, plus one more row if it has `stairs`)
  /** Height of the walkway on top, from the ground floor level. */
  height?: readonly [number, number];
  /** A stair up the inner side near the left end. */
  stairs?: boolean;
  // Arch
  /** Clear height of the opening. */
  opening?: readonly [number, number];
  /** Thickness of each pier. */
  pier?: number;
  /** A walkway (with a rail) across the top. */
  deck?: boolean;
}

/** One kind of thing to stand inside a building, and where. */
export interface Furnish {
  thing: string;
  count: number | readonly [number, number];
  /** Chance each one is really there (default 1). */
  chance?: number;
  /** Corner of a room, against a wall, against the back wall, or out in the middle. */
  at: 'corner' | 'wall' | 'back' | 'middle';
  /** Which floors: the ground floor, the ones above, or any (default ground). */
  floors?: 'ground' | 'upper' | 'any';
}

/** A thing the builder wants placed inside what it built. */
export interface Furnishing {
  thing: string;
  x: number;
  y: number;
  z: number;
  /** Which way it faces (radians), away from its wall. */
  angle: number;
}

/** Where and how to build one. */
export interface StructureSite {
  /** World cell of the structure's own (0,0) corner, before turning — or, when `anchor` is 'door', of the cell in front of its door. */
  x: number;
  y: number;
  anchor?: 'corner' | 'door';
  /** Height of the ground-floor surface. Left out, the builder picks the highest ground under the footprint. */
  z?: number;
  /** Quarter turns. */
  rot: number;
  /** Ground height lookup, so the plinth can reach the ground on slopes. */
  ground?: (x: number, y: number) => number;
  /** Width and depth to use instead of drawing them (so a layout can know the footprint beforehand). */
  size?: readonly [number, number];
}

export interface StructureReport {
  /** World cells the structure covers (inclusive). */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
  cells: number;
  /** Height of the ground-floor surface. */
  floor: number;
  storeys: number;
  /** The cell just outside the door, where you would stand to enter. */
  doorX: number;
  doorY: number;
  /** Cell and level of the staircase bottom, or null. */
  stairs: { x: number; y: number; z: number } | null;
  width: number;
  depth: number;
  /** The doorway: the cell outside it and the cell just inside (the way in is straight between them). */
  door: { outX: number; outY: number; inX: number; inY: number };
  /** A free spot on the ground floor near the door, where someone can stand at home. */
  home: { x: number; y: number };
  /** Cells of the ground-floor room inside the walls (inclusive). */
  interior: { x0: number; y0: number; x1: number; y1: number };
  furnishings: Furnishing[];
}

/** Local cell of a structure (its own frame, door side at y = 0) → offset from its corner after the quarter turns. */
export function turnCell(lx: number, ly: number, W: number, D: number, rot: number): [number, number] {
  const r = rot & 3;
  return r === 0 ? [lx, ly] : r === 1 ? [D - 1 - ly, lx] : r === 2 ? [W - 1 - lx, D - 1 - ly] : [ly, W - 1 - lx];
}

/** A structure planned for a place: which recipe, where, which way, and how big, before anything is built. */
export interface PlannedStructure {
  id: string;
  /** World cell of its corner (the corner with the lowest x and y, whatever the turn). */
  x: number;
  y: number;
  rot: number;
  w: number;
  d: number;
  /** Seeds its rolls, so it comes out the same on every machine. */
  seed: number;
  /** Cells it covers on the ground (width and depth swap on odd turns). */
  fx: number;
  fy: number;
}

/** Where the door, the way in and the home spot of a house fall in the world, worked out before it is built. */
export interface HouseGeometry {
  out: { x: number; y: number };
  in: { x: number; y: number };
  home: { x: number; y: number };
  /** Cells of the ground-floor room (inclusive). */
  interior: { x0: number; y0: number; x1: number; y1: number };
}

/** The door is always in the middle of the front wall (see the builder). */
export function houseGeometry(x: number, y: number, W: number, D: number, rot: number): HouseGeometry {
  const dc = Math.floor(W / 2);
  const at = (lx: number, ly: number): { x: number; y: number } => {
    const [rx, ry] = turnCell(lx, ly, W, D, rot);
    return { x: x + rx, y: y + ry };
  };
  const a = at(1, 1);
  const b = at(W - 2, D - 2);
  return { out: at(dc, -1), in: at(dc, 1), home: at(dc, Math.min(2, D - 2)), interior: { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) } };
}

/** Which quarter turn puts a house's front towards (tx, ty) from its middle. */
export function turnToward(cx: number, cy: number, tx: number, ty: number): number {
  const fx = tx - cx;
  const fy = ty - cy;
  // Front normals: rot0 (0,-1), rot1 (1,0), rot2 (0,1), rot3 (-1,0).
  return Math.abs(fx) > Math.abs(fy) ? (fx > 0 ? 1 : 3) : fy > 0 ? 2 : 0;
}
