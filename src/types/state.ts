import type { Chunk, TileAccess } from './tiles';
import type { Entity } from './entities';
import type { Content, FactionId, ItemId, RealmId, ThingId } from './defs';
import type { EffectRequest } from './effects';
import type { SimEvent } from './events';
import type { JournalEntry, Location, Quest, WeatherState } from './world';
import type { ItemStack } from './items';
import type { MatterAccess } from './matter';
import type { StructureDef, StructureReport, StructureSite, Volume } from './volume';

export const TICK_RATE = 20;
export const TICK_DT = 1 / TICK_RATE;

/** Requests between systems. A producer pushes; the owning system drains it each tick. */
export interface SimQueues {
  /** Everything that harms, heals, heats, soaks, shoves… — applied by the effects system. */
  effects: EffectRequest[];
  /** Interactions: a player poked something at a tile/entity. Cleared at the end of the tick. */
  /** `z`: the cell height of a door of the 3D layer (left out: the ground). */
  use: { player: number; tileX: number; tileY: number; z?: number; entity: number | null }[];
  /** Deaths with credit. Cleared at the end of the tick. */
  kills: { killer: number; def: ThingId }[];
  /** A party taking a way into another realm (the sim loop swaps the realms after the systems have run). */
  travel: { to: RealmId; x: number; y: number; by: number }[];
  /** Things called to a spot (a horn calling the airship): their own system answers. Cleared at the end of the tick. */
  calls: { thing: ThingId; x: number; y: number; by: number }[];
}

/**
 * What a realm keeps while the party is somewhere else: its tiles, cells, things, places and the clocks
 * on them. Exactly the fields of SimState that describe "the world around you" — swapping realms swaps
 * these in and out and nothing else, so every system works unchanged in every realm.
 */
export interface RealmWorld {
  chunks: Map<number, Chunk>;
  volume: Volume;
  /** Everything but the travellers (who are in the active realm's `entities` along with it). */
  entities: Entity[];
  burning: number[];
  damp: number[];
  temp: [number, number][];
  later: [number, number][];
  tileWear: [number, number][];
  regions: number[];
  locations: Location[];
  /** When the party left (sim tick): the realm catches up on this much time when they come back. */
  leftAt: number;
}

export interface SimState {
  version: number;
  seed: number;
  tick: number;
  rng: number;
  nextEntityId: number;
  entities: Map<number, Entity>;
  /** peer id → entity id */
  players: Record<string, number>;
  chunks: Map<number, Chunk>;
  /** The realm the party is in; the fields below (chunks, volume, entities, places…) describe it. */
  realm: RealmId;
  /** The other realms, set aside as they were left. */
  stash: Record<RealmId, RealmWorld>;
  /** The 3D layer: floors above floors, roofs, stairs, bridges. */
  volume: Volume;
  /** Tile keys changed this tick (emitted as tileChanged events). */
  tileChanges: Set<number>;
  /** Tile keys currently on fire. */
  burning: Set<number>;
  /** Tile keys with local wetness that is drying out. */
  damp: Set<number>;
  /** Temperature of spots warmer or colder than their surroundings (spot key -> degrees, 0 = surroundings; absent = 0). */
  temp: Map<number, number>;
  /** Tiles that change by themselves (ash greening over): tile key → tick when it turns. */
  later: Map<number, number>;
  /** Damage on breakable tiles (doors, fences…): tile key → wear taken so far. It mends over time. */
  tileWear: Map<number, number>;
  locations: Location[];
  /** Region keys whose locations are registered. */
  regions: Set<number>;
  weather: WeatherState;
  /** How each faction feels about each other one, -1..1. */
  factions: Record<FactionId, Record<FactionId, number>>;
  journal: JournalEntry[];
  quests: Quest[];
  nextQuestId: number;
  /**
   * Characters of travellers who are not here right now (they left, or the world was loaded
   * without them), by their player id. Joining again with the same id brings them back as they were.
   */
  absent: Record<string, Entity>;
  queues: SimQueues;
}

export interface Rng {
  next(): number;
  range(a: number, b: number): number;
  int(n: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

export interface SpatialQuery {
  /** Entities whose centre lies within r of (x, y). */
  near(x: number, y: number, r: number): Entity[];
}

export type SpawnInit = Partial<Omit<Entity, 'id' | 'def' | 'pos'>>;

/** Everything a system may use. Built by simLoop — systems never import each other. */
export interface SimContext {
  state: SimState;
  tiles: TileAccess;
  /** Stuff at a place, ground or 3D cell alike: fire, wet, oil, soot, wear, material. Use this, not tiles, for anything that happens TO matter. */
  matter: MatterAccess;
  query: SpatialQuery;
  rng: Rng;
  emit(e: SimEvent): void;
  /** Creates an entity from a thing definition. */
  spawn(thing: ThingId, x: number, y: number, init?: SpawnInit): Entity;
  /** Tumbles items out into the world as loose objects. */
  dropItems(x: number, y: number, z: number, items: readonly ItemStack[]): void;
  /** Breaks an item here: its `onBreak` burst lands on the spot and what it breaks into tumbles out (`by` caused it). */
  breakItem(item: ItemId, x: number, y: number, z: number, by: number | null): void;
  /** Raises a building from a recipe into the 3D layer. */
  build(def: StructureDef, site: StructureSite, seed?: number): StructureReport;
  /** Every definition registry. */
  content: Content;
  dt: number;
}

export type SimSystem = (ctx: SimContext) => void;

export function emptyQueues(): SimQueues {
  return { effects: [], use: [], kills: [], travel: [], calls: [] };
}
