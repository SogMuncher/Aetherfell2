import type { RGB, TileInfo, TileKind, TileLater, TileShape, TextureId } from '../types';
import { TILE_LEDGER } from './tileCodes';

/** One tile as written in content: other tiles are named by string id. */
export interface TileEntry {
  name: string;
  /** Surface (content/surfaces.ts) of its top. */
  floor: TextureId;
  material: string;
  shape?: TileShape;
  solid?: boolean;
  flammability?: number;
  fuel?: number;
  /** Tile id it becomes when it burns out (default ash). */
  burnsInto?: string;
  /** Surface of its sides when raised (walls, doors). */
  wall?: TextureId;
  sprite?: string | null;
  liquid?: boolean;
  level?: boolean;
  height?: number;
  freezesInto?: string;
  meltsInto?: string;
  slide?: number;
  far?: RGB;
  crown?: number;
  leafy?: number;
  /** Damage it takes from blows before it breaks (none = blows cannot break it). */
  durability?: number;
  /** Tile id it becomes when it breaks. */
  breaksInto?: string;
  /** It turns into another tile (by id) by itself after some minutes. */
  later?: TileLater<string>;
}

/**
 * Ground and structure kinds. A new kind of ground is one entry here (plus a surface in
 * content/surfaces.ts if it needs its own look). Fire numbers live here because a tree and a bush of
 * the same wood burn differently.
 */
const BASE: Record<string, TileEntry> = {
  grass: { name: 'grass', floor: 'grass', material: 'grass', flammability: 0.12, fuel: 50 },
  brush: { name: 'dry brush', floor: 'brush', material: 'grass', flammability: 0.75, fuel: 100 },
  oak: { name: 'oak', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'oak', leafy: 1, height: 7.5, flammability: 0.35, fuel: 160, burnsInto: 'burntTree', far: [40, 74, 34], crown: 1 },
  pine: { name: 'pine', floor: 'snow', material: 'wood', shape: 'billboard', solid: true, sprite: 'pine', leafy: 1, height: 8.5, flammability: 0.4, fuel: 140, burnsInto: 'burntTree', far: [34, 58, 44], crown: 1 },
  water: { name: 'water', floor: 'water', material: 'water', liquid: true, level: true, freezesInto: 'ice' },
  ice: { name: 'ice', floor: 'ice', material: 'ice', level: true, meltsInto: 'water', slide: 0.6 },
  sand: { name: 'sand', floor: 'sand', material: 'sand' },
  road: { name: 'road', floor: 'road', material: 'earth' },
  trail: { name: 'footpath', floor: 'trail', material: 'earth' },
  cobble: { name: 'cobbled road', floor: 'cobble', material: 'stone' },
  stoneWall: { durability: 700, breaksInto: 'rubble', name: 'stone wall', floor: 'stone', material: 'stone', shape: 'block', solid: true, wall: 'stone', height: 3.2 },
  woodWall: { durability: 220, breaksInto: 'woodFloor', name: 'timber wall', floor: 'planks', material: 'wood', shape: 'block', solid: true, wall: 'wood', flammability: 0.12, fuel: 255, height: 2.8, far: [112, 72, 46] },
  door: { durability: 40, breaksInto: 'woodFloor', name: 'door', floor: 'planks', material: 'wood', shape: 'door', solid: true, wall: 'door', flammability: 0.1, fuel: 200, height: 2.2, far: [112, 72, 46] },
  woodFloor: { durability: 120, breaksInto: 'road', name: 'plank floor', floor: 'planks', material: 'wood', flammability: 0.08, fuel: 120, far: [112, 72, 46] },
  flagstone: { durability: 400, breaksInto: 'rubble', name: 'flagstones', floor: 'flagstone', material: 'stone' },
  ruinWall: { durability: 500, breaksInto: 'rubble', name: 'ancient wall', floor: 'flagstone', material: 'stone', shape: 'block', solid: true, wall: 'ruin', height: 4, far: [108, 108, 112] },
  ash: { name: 'ash', floor: 'ash', material: 'ash', later: { into: 'grass', minutes: [12, 24] } },
  burntTree: { name: 'charred trunk', floor: 'ash', material: 'wood', shape: 'billboard', solid: true, sprite: 'charredTrunk', height: 5, far: [38, 34, 32], later: { into: 'ash', minutes: [20, 40] } },
  rock: { name: 'boulder', floor: 'grass', material: 'stone', shape: 'billboard', solid: true, sprite: 'boulder', height: 1.3, far: [112, 110, 104] },
  bush: { name: 'bush', floor: 'grass', material: 'wood', shape: 'billboard', sprite: 'bush', leafy: 1, flammability: 0.65, fuel: 110, far: [52, 88, 40] },
  standingStone: { name: 'standing stone', floor: 'grass', material: 'stone', shape: 'billboard', solid: true, sprite: 'standingStone', height: 3.2, far: [120, 118, 112] },
  snow: { name: 'snow', floor: 'snow', material: 'snow' },
  // Wet sedge of the marshes: green, soggy, hard to set alight.
  sedge: { name: 'marsh sedge', floor: 'sedge', material: 'grass', flammability: 0.05, fuel: 60 },

  // Trees, plants and stones grown from forms (content/forms.ts): `sprite` names the form.
  birch: { name: 'birch', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'birch', leafy: 1, height: 8, flammability: 0.4, fuel: 130, burnsInto: 'burntTree', far: [70, 104, 46], crown: 1 },
  willow: { name: 'willow', floor: 'sedge', material: 'wood', shape: 'billboard', solid: true, sprite: 'willow', leafy: 1, height: 6, flammability: 0.2, fuel: 150, burnsInto: 'burntTree', far: [76, 108, 58], crown: 1 },
  deadTree: { name: 'dead tree', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'deadTree', height: 6, flammability: 0.6, fuel: 120, far: [110, 104, 96] },
  log: { name: 'fallen log', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'log', height: 0.7, flammability: 0.3, fuel: 200 },
  stump: { name: 'stump', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'stump', height: 0.6, flammability: 0.25, fuel: 160 },
  fern: { name: 'ferns', floor: 'grass', material: 'grass', shape: 'billboard', sprite: 'fern', leafy: 0.5, flammability: 0.5, fuel: 70 },
  mushrooms: { name: 'mushrooms', floor: 'grass', material: 'grass', shape: 'billboard', sprite: 'mushrooms', flammability: 0.05, fuel: 30 },
  flowers: { name: 'wild flowers', floor: 'grass', material: 'grass', shape: 'billboard', sprite: 'flowers', leafy: 0.3, flammability: 0.15, fuel: 40 },
  reeds: { name: 'reeds', floor: 'sedge', material: 'grass', shape: 'billboard', sprite: 'reeds', leafy: 0.4, flammability: 0.55, fuel: 70 },
  cairn: { name: 'cairn', floor: 'grass', material: 'stone', shape: 'billboard', solid: true, sprite: 'cairn', height: 1.5 },
  crystals: { name: 'crystal outcrop', floor: 'grass', material: 'stone', shape: 'billboard', solid: true, sprite: 'crystals', height: 1.2, far: [120, 110, 150] },
  haystack: { durability: 18, breaksInto: 'grass', name: 'haystack', floor: 'grass', material: 'grass', shape: 'billboard', solid: true, sprite: 'haystack', height: 2, flammability: 0.9, fuel: 140, far: [190, 164, 84] },
  woodpile: { durability: 45, breaksInto: 'grass', name: 'woodpile', floor: 'grass', material: 'wood', shape: 'billboard', solid: true, sprite: 'woodpile', height: 1, flammability: 0.35, fuel: 255 },
  well: { name: 'well', floor: 'flagstone', material: 'stone', shape: 'billboard', solid: true, sprite: 'well', height: 2.4 },
  rubble: { durability: 30, breaksInto: 'flagstone', name: 'rubble', floor: 'flagstone', material: 'stone', shape: 'billboard', solid: true, sprite: 'rubble', height: 0.6 },

  // Building parts (houses, walls, windows and posts for tile-based structures).
  fence: { durability: 26, breaksInto: 'grass', name: 'fence', floor: 'grass', material: 'wood', shape: 'block', solid: true, wall: 'fence', height: 1.1, flammability: 0.2, fuel: 160 },
  hedge: { durability: 22, breaksInto: 'grass', name: 'hedge', floor: 'grass', material: 'wood', shape: 'block', solid: true, wall: 'hedge', leafy: 1, height: 1.6, flammability: 0.35, fuel: 140, far: [52, 86, 40] },
  window: { durability: 20, breaksInto: 'woodFloor', name: 'window', floor: 'planks', material: 'wood', shape: 'block', solid: true, wall: 'wood', height: 1.1, flammability: 0.12, fuel: 200, far: [112, 72, 46] },
  post: { durability: 300, breaksInto: 'woodFloor', name: 'corner post', floor: 'planks', material: 'wood', shape: 'block', solid: true, wall: 'logs', height: 3.1, flammability: 0.08, fuel: 255, far: [96, 62, 40] },
  towerWall: { durability: 900, breaksInto: 'rubble', name: 'tower wall', floor: 'flagstone', material: 'stone', shape: 'block', solid: true, wall: 'stone', height: 6.5, far: [118, 114, 108] },
  stoneSill: { durability: 400, breaksInto: 'rubble', name: 'stone window', floor: 'flagstone', material: 'stone', shape: 'block', solid: true, wall: 'stone', height: 1.1, far: [118, 114, 108] },
  // Boggy fen ground: catches only now and then, but holds fire far longer than grass.
  // Building materials for the 3D layer (cells are made of these; as a plain tile they are just floors).
  thatch: { durability: 70, breaksInto: 'grass', name: 'thatch', floor: 'thatch', wall: 'thatch', material: 'grass', flammability: 0.7, fuel: 200, far: [168, 140, 78] },
  roofTile: { durability: 140, breaksInto: 'rubble', name: 'clay tiles', floor: 'roof', wall: 'roof', material: 'stone', far: [140, 70, 50] },
  slate: { durability: 160, breaksInto: 'rubble', name: 'slate', floor: 'slate', wall: 'slate', material: 'stone', far: [78, 86, 98] },
  plaster: { durability: 260, breaksInto: 'rubble', name: 'plaster', floor: 'plaster', wall: 'plaster', material: 'stone', far: [200, 190, 162] },
  // The living rock of the underworld: you cannot dig through it, nor climb over it.
  caveRock: { name: 'living rock', floor: 'rock', wall: 'rock', material: 'stone', shape: 'block', solid: true, height: 30, far: [38, 34, 40] },
  peat: { name: 'peat bog', floor: 'peat', material: 'peat', flammability: 0.2, fuel: 255 },
};

const ALL = BASE;

/** What a tile with an unknown code (say, from a retired tile in an old save) behaves like. */
const DEFAULT_BURNT = 'ash';

/**
 * Numbers for every tile: the ledger's number when it has one, otherwise the next number nobody
 * holds (in the order the tiles are written), so a new tile never needs a hand-picked code.
 */
export function assignTileCodes(ids: readonly string[], ledger: readonly string[] = TILE_LEDGER): Record<string, TileKind> {
  const out: Record<string, TileKind> = {};
  const taken = new Set<number>();
  ledger.forEach((id, code) => {
    if (out[id] === undefined) out[id] = code;
    taken.add(code);
  });
  let next = 0;
  for (const id of ids) {
    if (out[id] !== undefined) continue;
    while (taken.has(next)) next++;
    out[id] = next;
    taken.add(next);
  }
  // Retired ledger tiles keep their number reserved but are not tiles any more.
  for (const id of Object.keys(out)) if (!ids.includes(id)) delete out[id];
  return out;
}

function build(): { byCode: Record<TileKind, TileInfo>; ids: Record<string, TileKind> } {
  const ids = assignTileCodes(Object.keys(ALL));
  const ref = (id: string | undefined): TileKind | undefined => (id === undefined ? undefined : (ids[id] ?? 0));
  const byCode: Record<TileKind, TileInfo> = {};
  for (const [id, e] of Object.entries(ALL)) {
    const info: TileInfo = {
      id,
      code: ids[id] ?? 0,
      name: e.name,
      shape: e.shape ?? 'floor',
      solid: e.solid ?? false,
      flammability: e.flammability ?? 0,
      fuel: e.fuel ?? 0,
      burnsInto: ref(e.burnsInto ?? DEFAULT_BURNT) ?? 0,
      floor: e.floor,
      wall: e.wall ?? 'stone',
      material: e.material,
      sprite: e.sprite ?? null,
      liquid: e.liquid ?? false,
      level: e.level ?? false,
      height: e.height ?? 0,
      ...(e.freezesInto !== undefined ? { freezesInto: ref(e.freezesInto) } : {}),
      ...(e.meltsInto !== undefined ? { meltsInto: ref(e.meltsInto) } : {}),
      ...(e.slide !== undefined ? { slide: e.slide } : {}),
      ...(e.far ? { far: e.far } : {}),
      ...(e.crown !== undefined ? { crown: e.crown } : {}),
      ...(e.leafy !== undefined ? { leafy: e.leafy } : {}),
      ...(e.durability !== undefined ? { durability: e.durability } : {}),
      ...(e.breaksInto !== undefined ? { breaksInto: ref(e.breaksInto) } : {}),
      ...(e.later ? { later: { ...e.later, into: ref(e.later.into) ?? 0 } } : {}),
    };
    byCode[info.code] = info;
  }
  return { byCode, ids };
}

const built = build();

/** Tile kinds by code: what chunks store. `TILES[chunk.kind[i]]`. */
export const TILES: Readonly<Record<TileKind, TileInfo>> = built.byCode;

/** Tile codes by string id. */
export const TILE_IDS: Readonly<Record<string, TileKind>> = built.ids;

/** Problems in the tile table itself: duplicate codes, codes out of range, references to unknown tiles. */
export function tileTableProblems(): string[] {
  const out: string[] = [];
  const ledger = new Set<string>();
  for (const id of TILE_LEDGER) {
    if (ledger.has(id)) out.push(`tile ledger: '${id}' is listed twice`);
    ledger.add(id);
  }
  const codes = Object.values(built.ids);
  if (codes.some((c) => c > 255)) out.push('tiles: more than 256 kinds of tile (chunks store one byte per tile)');
  for (const [id, e] of Object.entries(ALL)) {
    for (const [field, ref] of [['burnsInto', e.burnsInto], ['freezesInto', e.freezesInto], ['meltsInto', e.meltsInto], ['breaksInto', e.breaksInto], ['later', e.later?.into]] as const) {
      if (ref !== undefined && !(ref in ALL)) out.push(`tile '${id}': ${field} names unknown tile '${ref}'`);
    }
  }
  return out;
}

/** Tiles that have a number only for now (not yet in content/tileCodes.ts). Not an error. */
export function tilesMissingFromLedger(): string[] {
  return Object.keys(ALL).filter((id) => !TILE_LEDGER.includes(id));
}

/** The code of a tile by its id; unknown ids give code 0 (and validateContent reports them). */
export function tileCode(id: string): TileKind {
  return TILE_IDS[id] ?? 0;
}
