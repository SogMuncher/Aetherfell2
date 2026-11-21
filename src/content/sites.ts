import type { SiteDef, SiteId } from '../types';
import { Tile as T } from '../types';

/**
 * Named places: how common they are, where they may stand, how they are laid out, what lives there
 * and how they feel. The world system lays them out and places this population. A new kind of
 * place is a new entry here; it can reuse any layout shape with its own numbers and tiles.
 * Order matters: each region rolls once and the first entry whose share covers the roll wins.
 */
export const SITES: Record<SiteId, SiteDef> = {
  village: {
    chance: 0.2,
    ground: [2, 55],
    radius: 58,
    name: '{base}',
    layout: { shape: 'village', houses: [9, 15], square: 9, ring: [13, 48], buildings: { cottage: 5, hall: 2, smithy: 1 }, centre: 'well', path: T.Road, ground: T.Grass,
      // Each village rolls one of these: add a row (or change a weight) for a new kind of village.
      styles: [
        { weight: 4, pattern: 'ring' },
        { weight: 2.5, pattern: 'street', ring: [7, 44], houses: [10, 16], buildings: { cottage: 4, workshop: 2, tavern: 1, smithy: 1, hall: 1 } },
        { weight: 1.5, pattern: 'cross', ring: [8, 40], houses: [12, 18], buildings: { cottage: 5, townhouse: 2, workshop: 1, smithy: 1 } },
        { weight: 2, pattern: 'scatter', ring: [10, 46], houses: [8, 12], buildings: { cottage: 4, farmhouse: 3, barn: 2, hovel: 1 } },
      ],
    },
    rumour: 'a village called {name}',
    mood: { settlement: 1 },
    way: { grade: 'road', links: 3 },
    under: { hall: 5, reach: 52, density: 0.9 },
    verb: 'came upon the village of',
    villagers: ['elder', 'smith', 'trader', 'brewer', 'farmer', 'farmer', 'trader', 'farmer'],
    population: [
      { thing: 'torch', count: 1, chance: 1, place: { at: 'centre', offset: [2, 2] } },
      { thing: 'oilBarrel', count: 1, chance: 0.7, place: { at: 'centre', offset: [-3, 2] } },
      { thing: 'crate', count: 1, chance: 1, place: { at: 'centre', offset: [3, -2] } },
      // Some villages stand over an old stair nobody likes to talk about.
      { thing: 'descent', count: 1, chance: 0.25, place: { at: 'centre', offset: [-4, 3] } },
    ],
  },
  ruin: {
    chance: 0.16,
    ground: [1.5, 110],
    radius: 22,
    name: 'Ruins of {base}',
    layout: { shape: 'rings', rings: [7, 13, 19], wall: T.RuinWall, gap: 0.28, floor: T.Flagstone, scatter: { tile: T.Brush, chance: 0.08 } },
    rumour: 'old ruins, {base}, where something still keeps torches lit over a chest no one has opened',
    mood: { ruin: 1 },
    way: { grade: 'trail', links: 2 },
    under: { hall: 7, reach: 30, density: 0.95 },
    verb: 'found the',
    population: [
      // A locked chest at the heart, its key sealed in one of the urns, the way guarded by fire plates.
      { thing: 'ruinChest', count: 1, chance: 1, place: { at: 'centre' } },
      { thing: 'fireTrap', count: 5, chance: 1, place: { at: 'ring', min: 1.8, max: 4.5 } },
      { thing: 'keyUrn', count: 1, chance: 1, place: { at: 'ring', min: 6, max: 12 } },
      { thing: 'urn', count: 3, chance: 1, place: { at: 'ring', min: 5, max: 12 } },
      { thing: 'torch', count: 1, chance: 1, place: { at: 'centre', offset: [3, 0] } },
      { thing: 'torch', count: 1, chance: 1, place: { at: 'centre', offset: [-9, 4] } },
      // The old stair under the ruins goes down into the underworld.
      { thing: 'descent', count: 1, chance: 1, place: { at: 'centre', offset: [0, 6] } },
      { thing: 'oilBarrel', count: 4, chance: 1, place: { at: 'ring', min: 8, max: 12 } },
      { thing: 'wolf', count: 3, chance: 1, place: { at: 'ring', min: 22, max: 26 } },
      // Whoever has made the ruins home: a hedge-mage who throws spells from a distance, and cutthroats.
      { thing: 'hexer', count: 1, chance: 0.7, place: { at: 'ring', min: 9, max: 15 } },
      { thing: 'raider', count: 2, chance: 0.5, place: { at: 'ring', min: 12, max: 18 } },
    ],
  },
  stones: {
    chance: 0.09,
    ground: [1.5, 110],
    radius: 12,
    name: 'The {a} Stones',
    layout: { shape: 'circle', ring: 7, count: 9, stone: T.StandingStone, clear: 9, floor: T.Grass },
    rumour: 'a ring of standing stones that hum at night',
    mood: { wonder: 0.35 },
    way: { grade: 'trail', links: 1 },
    under: { hall: 6, reach: 18, density: 0.9 },
    verb: 'discovered',
    population: [
      { thing: 'looseItem', count: 1, chance: 1, place: { at: 'centre' }, item: { id: 'runeShard', count: 1 } },
      // The stones hum because of what lies under them.
      { thing: 'descent', count: 1, chance: 0.8, place: { at: 'centre', offset: [0, 2] } },
      { thing: 'offeringUrn', count: 2, chance: 0.8, place: { at: 'ring', min: 2, max: 4 } },
    ],
  },
  camp: {
    chance: 0.1,
    ground: [1.5, 110],
    radius: 10,
    name: "{a}'s Camp",
    layout: { shape: 'clearing', inner: 5, innerTile: T.Ash, clear: 9, floor: T.Grass },
    rumour: "a hunters' camp",
    mood: { warmth: 0.6 },
    way: { grade: 'trail', links: 1 },
    verb: 'discovered',
    population: [
      { thing: 'campfire', count: 1, chance: 1, place: { at: 'centre' } },
      { thing: 'crate', count: 1, chance: 1, place: { at: 'centre', offset: [3, 1] } },
      { thing: 'oilBarrel', count: 1, chance: 1, place: { at: 'centre', offset: [-3, 2] } },
      { thing: 'chest', count: 1, chance: 1, place: { at: 'centre', offset: [1, -3] } },
      { thing: 'looseItem', count: 1, chance: 0.5, place: { at: 'centre', offset: [-1, -2] }, item: { id: 'glider', count: 1 } },
    ],
  },
  // New places are added at the end so the regions older kinds already hold stay as they were.
  /** A lone farm: a farmhouse and a barn or two, hay in the yards, a farmer at home. */
  farmstead: {
    chance: 0.05,
    ground: [2, 60],
    radius: 32,
    name: '{base} Farm',
    layout: { shape: 'village', houses: [3, 5], square: 4, ring: [9, 24], buildings: { farmhouse: 2, barn: 1 }, path: T.Road, ground: T.Grass },
    rumour: 'a farm out at {base}, where they always need a hand',
    mood: { settlement: 0.6, warmth: 0.3 },
    way: { grade: 'road', links: 2 },
    verb: 'came upon',
    villagers: ['farmer'],
    population: [
      { thing: 'crate', count: 1, chance: 1, place: { at: 'centre', offset: [1, 1] } },
      { thing: 'barrel', count: 1, chance: 0.6, place: { at: 'centre', offset: [-2, 1] } },
    ],
  },
  /** An old watchtower standing alone on high ground. */
  watchtower: {
    chance: 0.04,
    ground: [20, 140],
    radius: 10,
    name: '{a} Watch',
    layout: { shape: 'village', houses: [1, 1], square: 0, ring: [0, 0], buildings: { tower: 1 }, path: T.Flagstone, ground: T.Grass },
    rumour: 'an old watchtower, {name}, that looks out over half the world',
    mood: { wonder: 0.3, ruin: 0.3 },
    way: { grade: 'trail', links: 1 },
    under: { hall: 4, reach: 14, density: 0.85 },
    verb: 'climbed up to',
    population: [
      { thing: 'torch', count: 1, chance: 1, place: { at: 'centre', offset: [6, 0] } },
    ],
  },
  /** A hamlet nobody lives in any more: tumbledown stone cottages, rubble and brush. */
  hamlet: {
    chance: 0.05,
    ground: [2, 90],
    radius: 46,
    name: 'Old {base}',
    layout: { shape: 'village', houses: [7, 11], square: 5, ring: [11, 36], buildings: { ruinedCottage: 1 }, path: T.Brush, ground: T.Grass },
    rumour: 'the empty cottages of old {base}; nobody says why they left',
    mood: { ruin: 0.7, murk: 0.2 },
    way: { grade: 'trail', links: 2 },
    under: { hall: 5, reach: 44, density: 0.9 },
    verb: 'wandered into',
    population: [
      { thing: 'urn', count: 2, chance: 0.7, place: { at: 'ring', min: 6, max: 36 } },
      { thing: 'wolf', count: 2, chance: 0.6, place: { at: 'ring', min: 30, max: 44 } },
    ],
  },
  /** A peat fen: soggy ground that smoulders for ages once lit, home to toads. */
  fen: {
    chance: 0.07,
    // Fens fit only low wet ground, so where one fits it takes the spot.
    priority: 1,
    ground: [0.8, 12],
    radius: 16,
    name: '{a}mere Fen',
    layout: { shape: 'clearing', inner: 11, innerTile: T.Peat, clear: 14, floor: T.Brush },
    rumour: 'a peat fen out past {base} where the toads sing and the ground burns for days',
    mood: { murk: 1, water: 0.4 },
    way: { grade: 'trail', links: 1 },
    verb: 'waded into',
    population: [
      { thing: 'bogToad', count: 3, chance: 1, place: { at: 'ring', min: 3, max: 9 } },
      { thing: 'urn', count: 1, chance: 0.6, place: { at: 'ring', min: 4, max: 8 } },
      { thing: 'looseItem', count: 1, chance: 0.5, place: { at: 'centre' }, item: { id: 'spicedCider', count: 1 } },
    ],
  },
  /** A great walled city: gates, towers, streets, districts, and a keep and church in the middle. */
  city: {
    chance: 0.03,
    priority: 2,
    ground: [3, 45],
    radius: 170,
    name: '{base}',
    layout: {
      shape: 'city',
      half: [92, 118],
      walls: { run: 'cityWall', tower: 'wallTower', gate: 'cityGate', towerEvery: 26 },
      centre: {
        plaza: 26,
        keep: 'keep',
        court: 13,
        courtTower: 'wallTower',
        courtGate: 'cityGate',
        landmarks: [
          { structure: 'church', at: [-22, 3] },
          { structure: 'belfry', at: [-22, -14] },
          { structure: 'barracks', at: [22, 0] },
        ],
      },
      streets: { every: 21, width: 3, main: 5 },
      streetStyles: [
        { weight: 3, every: 21, width: 3, main: 5 },
        { weight: 1, every: 17, width: 3, main: 5 },
        { weight: 1, every: 27, width: 5, main: 7 },
      ],
      districts: [
        // Round the plaza: the best houses, inns and shops.
        { name: 'market', from: 0, to: 0.55, lots: { townhouse: 4, workshop: 3, manor: 1 }, fill: 0.9, block: { chance: 0.2, buildings: { tavern: 3, manor: 1 } } },
        // East and west: makers and sellers.
        { name: 'craft quarter', from: 0.55, to: 0.85, sides: ['e', 'w'], lots: { workshop: 4, smithy: 2, townhouse: 3, cottage: 2 }, fill: 0.85, block: { chance: 0.15, buildings: { warehouse: 2, tavern: 1 } } },
        // North: quiet homes.
        { name: 'residential', from: 0.55, to: 0.85, sides: ['n'], lots: { cottage: 5, townhouse: 3, manor: 1 }, fill: 0.85, block: { chance: 0.08, buildings: { manor: 1 } } },
        // South, by the road to the world: stores and barracks.
        { name: 'trade quarter', from: 0.55, to: 0.85, sides: ['s'], lots: { workshop: 3, townhouse: 2, cottage: 2 }, fill: 0.8, block: { chance: 0.25, buildings: { warehouse: 3, barracks: 1 } } },
        // Along the walls: the poor, and the farms that feed the city.
        { name: 'outskirts', from: 0.85, to: 2, lots: { hovel: 4, cottage: 3, farmhouse: 1 }, fill: 0.65, block: { chance: 0.1, buildings: { barn: 1, warehouse: 1 } } },
      ],
      tiles: { main: T.Flagstone, street: T.Road, ground: T.Grass },
      residents: 30,
    },
    rumour: 'the great walled city of {name}, with a keep in its heart and a hundred chimneys',
    mood: { settlement: 1, wonder: 0.3 },
    way: { grade: 'highroad', links: 4 },
    under: { hall: 7, reach: 130, density: 0.97 },
    verb: 'came to the gates of',
    villagers: ['elder', 'trader', 'smith', 'brewer', 'farmer', 'trader', 'farmer'],
    population: [
      { thing: 'oilBarrel', count: 10, chance: 1, place: { at: 'ring', min: 8, max: 120 } },
      { thing: 'crate', count: 14, chance: 1, place: { at: 'ring', min: 8, max: 120 } },
      { thing: 'torch', count: 16, chance: 1, place: { at: 'ring', min: 6, max: 120 } },
    ],
  },
  /**
   * A megacity, like a Daggerfall capital: the walled city of the old kind with a dozen more wards
   * grown outwards from it (walled quarters and open sprawl), joined by avenues through facing gates.
   * No two come out the same shape.
   */
  megacity: {
    chance: 0.02,
    priority: 3,
    ground: [3, 30],
    radius: 235,
    name: '{base}',
    layout: {
      shape: 'city',
      half: [84, 100],
      walls: { run: 'cityWall', tower: 'wallTower', gate: 'cityGate', towerEvery: 26, margin: 10 },
      centre: {
        plaza: 26,
        keep: 'keep',
        court: 13,
        courtTower: 'wallTower',
        courtGate: 'cityGate',
        landmarks: [
          { structure: 'church', at: [-22, 3] },
          { structure: 'belfry', at: [-22, -14] },
          { structure: 'barracks', at: [22, 0] },
        ],
      },
      streets: { every: 21, width: 3, main: 5 },
      // Each ward picks a street pattern: tight lanes, the usual grid, or wide boulevards.
      streetStyles: [
        { weight: 3, every: 21, width: 3, main: 5 },
        { weight: 2, every: 15, width: 3, main: 5 },
        { weight: 2, every: 27, width: 5, main: 7 },
        { weight: 1, every: 33, width: 5, main: 9 },
      ],
      districts: [
        // Round the plaza: the best houses, inns and shops.
        { name: 'market', from: 0, to: 0.55, lots: { townhouse: 4, workshop: 3, manor: 1 }, fill: 0.9, block: { chance: 0.2, buildings: { tavern: 3, manor: 1 } } },
        // East and west: makers and sellers.
        { name: 'craft quarter', from: 0.55, to: 0.85, sides: ['e', 'w'], lots: { workshop: 4, smithy: 2, townhouse: 3, cottage: 2 }, fill: 0.85, block: { chance: 0.15, buildings: { warehouse: 2, tavern: 1 } } },
        // North: quiet homes.
        { name: 'residential', from: 0.55, to: 0.85, sides: ['n'], lots: { cottage: 5, townhouse: 3, manor: 1 }, fill: 0.85, block: { chance: 0.08, buildings: { manor: 1 } } },
        // South, by the road to the world: stores and barracks.
        { name: 'trade quarter', from: 0.55, to: 0.85, sides: ['s'], lots: { workshop: 3, townhouse: 2, cottage: 2 }, fill: 0.8, block: { chance: 0.25, buildings: { warehouse: 3, barracks: 1 } } },
        // Along the walls: the poor, and the farms that feed the city.
        { name: 'outskirts', from: 0.85, to: 2, lots: { hovel: 4, cottage: 3, farmhouse: 1 }, fill: 0.65, block: { chance: 0.1, buildings: { barn: 1, warehouse: 1 } } },
      ],
      tiles: { main: T.Flagstone, street: T.Road, ground: T.Grass },
      residents: 90,
      sprawl: {
        wards: [8, 12],
        half: [34, 60],
        gap: 14,
        reach: 215,
        kinds: [
          {
            name: 'merchant ward',
            weight: 3,
            plaza: 11,
            landmarks: [{ structure: 'tavern', at: [0, -20] }],
            districts: [
              { name: 'bazaar', from: 0, to: 0.62, lots: { workshop: 4, townhouse: 3, tavern: 1 }, fill: 0.9, block: { chance: 0.2, buildings: { warehouse: 2, tavern: 1 } } },
              { name: 'merchant homes', from: 0.62, to: 2, lots: { townhouse: 4, cottage: 3, workshop: 2 }, fill: 0.8 },
            ],
          },
          {
            name: 'temple ward',
            weight: 1.5,
            plaza: 11,
            landmarks: [{ structure: 'church', at: [-17, 0] }, { structure: 'belfry', at: [17, 0] }],
            districts: [{ name: 'cloister', from: 0, to: 2, lots: { townhouse: 3, cottage: 3, manor: 1 }, fill: 0.7 }],
          },
          {
            name: 'garrison ward',
            weight: 1,
            plaza: 10,
            landmarks: [{ structure: 'barracks', at: [0, 18] }],
            districts: [{ name: 'garrison', from: 0, to: 2, lots: { cottage: 3, smithy: 2, townhouse: 1 }, fill: 0.75, block: { chance: 0.25, buildings: { barracks: 2, warehouse: 1 } } }],
          },
          {
            name: 'craft ward',
            weight: 3,
            plaza: 9,
            landmarks: [],
            districts: [{ name: 'workshops', from: 0, to: 2, lots: { workshop: 4, smithy: 3, cottage: 2, townhouse: 1 }, fill: 0.88, block: { chance: 0.15, buildings: { warehouse: 3 } } }],
          },
          {
            name: 'noble ward',
            weight: 1,
            plaza: 12,
            landmarks: [],
            districts: [{ name: 'estates', from: 0, to: 2, lots: { manor: 3, townhouse: 3 }, fill: 0.7, block: { chance: 0.3, buildings: { manor: 1 } } }],
          },
          {
            name: 'old town',
            weight: 3,
            round: true,
            plaza: 8,
            landmarks: [],
            districts: [{ name: 'tenements', from: 0, to: 2, lots: { cottage: 4, hovel: 3, workshop: 1, tavern: 1 }, fill: 0.85, block: { chance: 0.1, buildings: { tavern: 1, warehouse: 1 } } }],
          },
          {
            name: 'shanties',
            weight: 2.5,
            round: true,
            plaza: 6,
            landmarks: [],
            districts: [{ name: 'shanties', from: 0, to: 2, lots: { hovel: 5, cottage: 1 }, fill: 0.7 }],
          },
          {
            name: 'farms',
            weight: 1.5,
            round: true,
            plaza: 6,
            landmarks: [],
            districts: [{ name: 'farmland', from: 0, to: 2, lots: { farmhouse: 2, barn: 2, hovel: 1 }, fill: 0.45 }],
          },
        ],
      },
    },
    rumour: 'the vast city of {name}, a dozen quarters wide, where a stranger can walk a day and not see the same street twice',
    mood: { settlement: 1, wonder: 0.3 },
    way: { grade: 'highroad', links: 5 },
    under: { hall: 7, reach: 215, density: 0.97 },
    verb: 'beheld the vastness of',
    villagers: ['elder', 'trader', 'smith', 'brewer', 'farmer', 'trader', 'farmer'],
    population: [
      { thing: 'oilBarrel', count: 24, chance: 1, place: { at: 'ring', min: 8, max: 200 } },
      { thing: 'crate', count: 30, chance: 1, place: { at: 'ring', min: 8, max: 200 } },
      { thing: 'torch', count: 50, chance: 1, place: { at: 'ring', min: 6, max: 200 } },
    ],
  },
};
