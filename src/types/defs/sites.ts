import type { PopulationEntry } from './brains';
import type { RoleId } from './ids';
import type { TileKind } from '../tiles';


/**
 * How a site is laid out on the ground. A new kind of place can reuse any of these shapes with its
 * own numbers and tiles; only a genuinely new shape needs code (sim/world/chunkgen.ts).
 */
export type SiteLayoutDef =
  /**
   * Buildings in a ring around a square, doors facing in, paths from the square to each door. Each
   * building is one of `buildings` (structure recipes, content/structures.ts), picked by weight and
   * raised in the 3D layer; recipes with `dwelling: false` (barns, towers) get no villager. `ring` is how far from
   * the middle they stand (default [14, 22]; [0, 0] puts a lone building in the middle). `centre`
   * is a tile id set in the middle of the square (a well).
   */
  | { shape: 'village'; houses: [number, number]; square: number; buildings: Readonly<Record<string, number>>; path: TileKind; ground: TileKind; ring?: [number, number]; centre?: string }
  /** Concentric crumbling walls (radii in metres) with gaps you can slip through. */
  | { shape: 'rings'; rings: number[]; wall: TileKind; gap: number; floor: TileKind; scatter: { tile: TileKind; chance: number } }
  /** A circle of standing pieces on cleared ground. */
  | { shape: 'circle'; ring: number; count: number; stone: TileKind; clear: number; floor: TileKind }
  /** A patch of one tile (a fire pit) inside a cleared space. */
  | { shape: 'clearing'; inner: number; innerTile: TileKind; clear: number; floor: TileKind }
  /** A walled city of 3D structures; see CityLayout. */
  | CityLayout;

/** Which side of a city: where a district lies, or which way a gate faces. */
export type CompassSide = 'n' | 'e' | 's' | 'w';

/**
 * A part of a city, picked by how far from the middle (0 = the centre, 1 = the wall; measured in
 * the city's own proportions) and, if given, which sides it lies on. Its blocks are filled with the
 * `lots` (small buildings, one per lot, picked by weight; `fill` is the chance a lot is built on)
 * and now and then, by `block`, one big building that takes a whole block. Ids are structures
 * (content/structures.ts).
 */
export interface DistrictDef {
  name: string;
  from: number;
  to: number;
  sides?: CompassSide[];
  lots: Readonly<Record<string, number>>;
  fill: number;
  block?: { chance: number; buildings: Readonly<Record<string, number>> };
}

/** A building set in the middle of a city, at an offset from its centre, its front towards the middle. */
export interface Landmark {
  structure: string;
  at: [number, number];
  /** Quarter turns to face; default: towards the city centre. */
  rot?: number;
}

export interface CityLayout {
  shape: 'city';
  /** Half-width and half-depth of the walled area, [low, high] metres. */
  half: [number, number];
  /** Wall pieces by structure id: a straight run, a tower (corners and along the wall), a gate (middle of each side). */
  walls: { run: string; tower: string; gate: string; towerEvery: number };
  /** The heart: a paved plaza, the keep inside a curtain wall (half-size `court`, 0 = no wall), landmarks around it. */
  centre: { plaza: number; keep: string; court: number; courtTower?: string; courtGate?: string; landmarks: Landmark[] };
  /** Streets: every `every` metres, `width` wide (odd); main streets from the gates are `main` wide. */
  streets: { every: number; width: number; main: number };
  districts: DistrictDef[];
  /** Tiles: main streets and plaza, side streets, ground between buildings. */
  tiles: { main: TileKind; street: TileKind; ground: TileKind };
  /** Most people who live in it. */
  residents: number;
  /**
   * A megacity: more wards (each a walled or open district with its own grid, plaza and landmarks)
   * grown outwards from the first one (the `centre` and `districts` above), joined by avenues
   * through facing gates. Wards are placed one beside another, `gap` metres apart, anywhere within
   * `reach` metres of the middle, so every city comes out a different organic shape. A ward never
   * stands on water (see sim/world/city.ts).
   */
  sprawl?: { wards: [number, number]; half: [number, number]; gap: number; reach: number; kinds: WardDef[] };
}

/** A kind of ward in a megacity: how likely, whether a wall rings it, its plaza and landmarks (offsets from its middle), and its districts. */
export interface WardDef {
  name: string;
  weight: number;
  /** Ringed by a wall with gates (default). Open wards are rounded off instead. */
  walled?: boolean;
  plaza: number;
  landmarks: Landmark[];
  districts: DistrictDef[];
}

export interface SiteDef {
  /** Share of 256 m regions where this kind rolls a place (each kind rolls on its own, by its id). */
  chance: number;
  /** When two kinds both roll the same region, the higher priority wins (default 0). */
  priority?: number;
  /** Raw ground height the centre must lie between (exclusive). */
  ground: [number, number];
  /** Metres the place covers. */
  radius: number;
  /** Name pattern: {base} is a made-up place name ("Ashford"), {a} its first syllable ("Ash"). */
  name: string;
  layout: SiteLayoutDef;
  /** What villagers say about it in a rumour: {name} and {base} as above. */
  rumour: string;
  /** How being near it feels to the music (mood signal name → strength 0..1). */
  mood?: Record<string, number>;
  /** Population list placed the first time a player comes near. */
  population: PopulationEntry[];
  /** One villager per house, with these roles in turn (villages only). */
  villagers?: RoleId[];
  /** Journal verb on discovery: "found the …". */
  verb: string;
  /** Roads, paths and trails: the best grade of way this place keeps (a key of `world.roads.grades`), and how many neighbours it tries to link to. Left out = nothing leads here. */
  way?: { grade: string; links: number };
  /**
   * What lies beneath, in a lattice realm (the underworld is laid 1:1 under the land): a great hall of half-size `hall`
   * under the place's middle (at most 7), and within `reach` metres of it the tunnels are `density` (0..1) likely to be open.
   * Scatter entries with `under` naming this site appear only in its hall.
   */
  under?: { hall: number; reach: number; density: number };
}
