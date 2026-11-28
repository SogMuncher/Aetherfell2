// Underworld data shapes: biomes (regions that change how the rock is dug), their rooms and what lies in them
import type { SiteId, ThingId } from './ids';

/**
 * Where a thing is put in an underground hall: its middle, a corner, against a wall (things with `mount` hang on it),
 * anywhere on its floor, or out in a corridor leading from it (where traps wait). `under` limits it to halls beneath
 * those places above.
 */
export interface ScatterDef {
  thing: ThingId;
  chance: number;
  at: 'middle' | 'corner' | 'wall' | 'any' | 'path';
  under?: SiteId[];
}

/** One kind of room a biome digs (a shrine, an ossuary, a reading hall, a flooded pit). Unset fields take the biome's. */
export interface UnderRoomDef {
  weight: number;
  /** Floor tile. */
  floor?: string;
  /** Free-standing pillars of this tile every `every` metres (great halls only). */
  pillars?: { tile: string; every: number };
  /** The walls are lined with this tile (shelves, tomb niches, ore): every tile of the edge row whose roll is under `share`. */
  lining?: { tile: string; share: number };
  /** A raised walkway of this tile along two walls, reached by a stair (halls 7 m tall and 9 m across or more): a second level to fight from. */
  gallery?: string;
  /** The floor is sunk this many metres, ramped down from the doorways: a pit to fall, push or wade into. */
  sink?: number;
  /** The sunk middle stands flooded. */
  pool?: boolean;
  scatter?: ScatterDef[];
}

/**
 * A region of the underworld with its own way of being dug (sim/world/underBiome.ts). The land above sways which one
 * lies where (`favours`: land biomes it is likelier under); every tile and thing named is ordinary content, so fire,
 * water, blows and light treat it like anything else.
 */
export interface UnderBiomeDef {
  name: string;
  weight: number;
  favours?: string[];
  /** Living rock of its walls and roof. */
  wall: string;
  /** Patches of the walls are this instead (ore, flowstone): its share of wall tiles. */
  vein?: { tile: string; share: number };
  floor: string;
  corridorFloor?: string;
  /** 'rooms' = squared halls and straight corridors; 'caves' = rounded hollows and winding passages. */
  shape: 'rooms' | 'caves';
  /** Half-size of its halls (metres, at most 7). */
  hall: readonly [number, number];
  /** Clear height of halls and corridors; corridors are `half` metres either side of the middle. */
  height: number;
  corridor: { half: number; height: number };
  /** Chance a passage between two neighbouring halls is open. */
  link: number;
  rubble?: { tile: string; chance: number };
  /** Doors where corridors meet halls: this share of mouths, and of those this share locked. */
  doors?: { tile: string; chance: number; locked: number; lockedTile: string };
  rooms: readonly UnderRoomDef[];
  /** In every hall of the biome. */
  scatter?: ScatterDef[];
}
