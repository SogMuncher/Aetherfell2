export type { SurfaceLayer, SurfaceDef, BiomeWhen, BiomeDef, LandLayer, WayGradeDef, DeckLook, ShoreRule, WaterGenDef, WorldGenDef } from './worldgen';
/**
 * A tile kind is a small number (its `code` in content/tiles.ts) so chunks stay compact typed arrays.
 * Codes are stored in saves: never reuse one. New tiles need only a content entry.
 */
export type TileKind = number;

/**
 * Short names for the original tiles' codes, kept so existing content and tests read nicely.
 * Optional: new tiles do not need a line here (content refers to tiles by their string id).
 */
export const Tile = {
  Grass: 0,
  Brush: 1,
  Tree: 2,
  Water: 3,
  Sand: 4,
  Road: 5,
  StoneWall: 6,
  WoodWall: 7,
  Door: 8,
  WoodFloor: 9,
  Flagstone: 10,
  RuinWall: 11,
  Ash: 12,
  BurntTree: 13,
  Rock: 14,
  Bush: 15,
  StandingStone: 16,
  Snow: 17,
  Pine: 18,
  Ice: 19,
  Peat: 20,
} as const;

/** A procedural surface (texture) id: an entry in content/surfaces.ts. */
export type TextureId = string;

/** How the renderer should treat a tile. */
export type TileShape = 'floor' | 'block' | 'billboard' | 'door';

/** Form id (content/forms.ts) a billboard tile is grown from; render falls back to a prop picture of that name, then a placeholder. */
export type BillboardSprite = string;

export type RGB = readonly [number, number, number];

export interface TileInfo {
  /** Stable string id (content key), e.g. 'peat'. */
  readonly id: string;
  /** Stable number stored in chunks and saves. */
  readonly code: TileKind;
  readonly name: string;
  readonly shape: TileShape;
  /** Blocks movement (doors are handled by openness). */
  readonly solid: boolean;
  /** 0 = never burns, 1 = catches instantly. */
  readonly flammability: number;
  /** Ticks of burning before it is consumed. */
  readonly fuel: number;
  /** What the tile becomes when it burns out. */
  readonly burnsInto: TileKind;
  readonly floor: TextureId;
  readonly wall: TextureId;
  /** Physical material: resistances and footstep sounds. */
  readonly material: string;
  readonly sprite: BillboardSprite | null;
  readonly liquid: boolean;
  /** Surface rests at sea level when the ground is below it (water, ice). */
  readonly level: boolean;
  /** How tall a solid thing stands above the ground (walls, doors, trees, rocks); you can pass over it. 0 for open ground. */
  readonly height: number;
  /** Chill turns it into this (water freezes to ice). */
  readonly freezesInto?: TileKind;
  /** Heat, or time, turns it back into this (ice melts to water). */
  readonly meltsInto?: TileKind;
  /** How much of their speed sliding things keep each second (ice ≈ 0.6; default 0.02). */
  readonly slide?: number;
  /** Colour seen from far away. Default: the average colour of its floor surface. */
  readonly far?: RGB;
  /** 0..1: how much leafy canopy it makes when seen from far away (trees 1). */
  readonly crown?: number;
  /** 0..1: how much living green it is (trees, bushes, ferns): wind rustles it and the music hears woodland. */
  readonly leafy?: number;
  /** Damage it takes before it breaks when struck (after the material's resistance). None = it cannot be broken by blows. */
  readonly durability?: number;
  /** What it becomes when it breaks (a door becomes a plank floor). */
  readonly breaksInto?: TileKind;
  /** It turns into another tile by itself after a while (ash grows over, a burnt trunk falls). */
  readonly later?: TileLater<TileKind>;
}

/** "Becomes X after N minutes" (content/tiles.ts names the tile by id; the table holds its code). */
export interface TileLater<T> {
  into: T;
  /** Game minutes (real minutes) it takes, picked between the two for each tile. */
  minutes: readonly [number, number];
  /** Only while the ground is dry or wet; otherwise it waits and tries again later. */
  needs?: 'dry' | 'wet';
}

export const CHUNK_SIZE = 32;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;

/** One 32×32 block of the world. Plain typed arrays so it saves and syncs cheaply. */
export interface Chunk {
  cx: number;
  cy: number;
  kind: Uint8Array;
  /** 0..255 local wetness (puddles, splashes). Global rain wetness is added on top. */
  wet: Uint8Array;
  /** 0 = not burning, otherwise remaining burn ticks (capped 255). */
  fire: Uint8Array;
  /** Remaining fuel (ticks) — refilled from TileInfo when generated. */
  fuel: Uint16Array;
  oil: Uint8Array;
  soot: Uint8Array;
  /** 0 = closed, 255 = fully open. */
  door: Uint8Array;
  /** Ground height at tile corners, (CHUNK_SIZE+1)² values. Tile (i,j) spans corners i..i+1, j..j+1. */
  height: Float32Array;
  /** Height of the water surface at each tile (0 = sea level). Only meaningful for water and for tiles that rest on it (ice); grown from the seed, never saved. */
  level: Float32Array;
  /** Changed since generation — only dirty chunks are saved. */
  dirty: boolean;
  /** Bumped on every change so render caches know to rebuild. */
  version: number;
}

/** Plain snapshot of one tile, used in tileChanged events and network sync. */
export interface TileCellData {
  kind: TileKind;
  wet: number;
  fire: number;
  fuel: number;
  oil: number;
  soot: number;
  door: number;
}

/** Read access to the tile world. Generates chunks lazily (deterministic from the seed). */
export interface ReadonlyTiles {
  kind(x: number, y: number): TileKind;
  info(x: number, y: number): TileInfo;
  wet(x: number, y: number): number;
  fire(x: number, y: number): number;
  oil(x: number, y: number): number;
  soot(x: number, y: number): number;
  door(x: number, y: number): number;
  /** Ground height (bilinear over tile corners), ignoring structures. Works at any real position. */
  ground(x: number, y: number): number;
  /** Height you stand on at this point: ground, or structure top for walls. */
  surface(x: number, y: number): number;
  /** Height of the water surface here (0 = sea level; a river or lake higher up stands at its own level). */
  waterLevel(x: number, y: number): number;
  /** Blocks movement right now (closed doors are solid, open ones are not). */
  blocked(x: number, y: number): boolean;
  cell(x: number, y: number): TileCellData;
  chunk(cx: number, cy: number): Chunk;
  /** The chunk if it is in memory, without generating it. */
  peekChunk(cx: number, cy: number): Chunk | undefined;
  /** Every chunk in memory (changed chunks always stay in memory). */
  loadedChunks(): Iterable<Chunk>;
}

/** Write access — only handed to sim systems through SimContext. */
export interface TileAccess extends ReadonlyTiles {
  setKind(x: number, y: number, kind: TileKind): void;
  setWet(x: number, y: number, v: number): void;
  setFire(x: number, y: number, v: number): void;
  setFuel(x: number, y: number, v: number): void;
  fuel(x: number, y: number): number;
  setOil(x: number, y: number, v: number): void;
  setSoot(x: number, y: number, v: number): void;
  setDoor(x: number, y: number, v: number): void;
  setCell(x: number, y: number, cell: TileCellData): void;
}


/** A biome id: an entry in content/biomes.ts. */
export type BiomeId = string;

/** Pure, seed-derived description of the land at any point — used for distant terrain. */
export interface WorldSample {
  ground: number;
  biome: BiomeId;
  /** 0..1 how wooded the area is. */
  trees: number;
  /** 0..1 how close to a road centre. */
  road: number;
  /** Tile code of the building or wall standing here, seen from afar (its far colour and height); null for none. */
  built: TileKind | null;
  /** Height of river or lake water over this point, when there is some (the sea is where `ground` < 0). */
  water?: number;
}

/** Deterministic land sampler — what the renderer uses for anything beyond loaded tiles. */
export interface WorldSampler {
  sample(x: number, y: number, detail: number): WorldSample;
  /** Tile kinds of chunk (cx, cy) exactly as generated from the seed, before anything changed them. */
  naturalKinds(cx: number, cy: number): Uint8Array;
}

/** Packs integer tile/chunk coords into one safe number key. */
export function packKey(x: number, y: number): number {
  return (x + 1048576) * 2097152 + (y + 1048576);
}

export function unpackKey(k: number): { x: number; y: number } {
  const x = Math.floor(k / 2097152) - 1048576;
  const y = (k % 2097152) - 1048576;
  return { x, y };
}
