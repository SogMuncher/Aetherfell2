// City districts and megacity wards as data: what each quarter builds, what it is built of, how it is paved and how its lanes run.
import type { DistrictDef, WardDef } from '../types';

/** Rough country walls and roofs: the poor edge of a town and the farms. */
const RUSTIC = { wall: ['daub', 'woodWall', 'logWall', 'fieldstone'], roof: ['thatch', 'turfRoof', 'shingles'], floor: ['rushFloor', 'woodFloor'] };

/** The districts of a walled city (and the first ward of a megacity), from the plaza out to the wall. */
export const CITY_DISTRICTS: DistrictDef[] = [
  // Round the plaza: the best houses, inns and shops, timber-framed and washed in colour, on paved ground.
  { name: 'market', from: 0, to: 0.55, lots: { townhouse: 4, workshop: 3, manor: 1 }, fill: 0.9, block: { chance: 0.2, buildings: { tavern: 3, manor: 1 } },
    materials: { wall: ['halfTimber', 'plaster', 'ochrePlaster', 'brickWall'], roof: ['roofTile', 'slate'] }, tiles: { street: 'setts', ground: 'cobble' } },
  // East and west: makers and sellers in brick and timber, yards of beaten earth.
  { name: 'craft quarter', from: 0.55, to: 0.85, sides: ['e', 'w'], lots: { workshop: 4, smithy: 2, townhouse: 3, cottage: 2 }, fill: 0.85, block: { chance: 0.15, buildings: { warehouse: 2, tavern: 1 } },
    materials: { wall: ['brickWall', 'woodWall', 'halfTimber', 'fieldstone'], roof: ['roofTile', 'shingles'] }, tiles: { street: 'cobble', ground: 'trail' } },
  // North: quiet homes in pale and rose washes, gardens between.
  { name: 'residential', from: 0.55, to: 0.85, sides: ['n'], lots: { cottage: 5, townhouse: 3, manor: 1 }, fill: 0.85, block: { chance: 0.08, buildings: { manor: 1 } },
    materials: { wall: ['plaster', 'rosePlaster', 'ochrePlaster', 'halfTimber'], roof: ['roofTile', 'slate'] } },
  // South, by the road to the world: brick stores and barracks round gravel yards.
  { name: 'trade quarter', from: 0.55, to: 0.85, sides: ['s'], lots: { workshop: 3, townhouse: 2, cottage: 2 }, fill: 0.8, block: { chance: 0.25, buildings: { warehouse: 3, barracks: 1 } },
    materials: { wall: ['brickWall', 'woodWall', 'stoneWall'], roof: ['slate', 'shingles'] }, tiles: { ground: 'gravel' } },
  // Along the walls: the poor, and the farms that feed the city, on dirt lanes.
  { name: 'outskirts', from: 0.85, to: 2, lots: { hovel: 4, cottage: 3, farmhouse: 1 }, fill: 0.65, block: { chance: 0.1, buildings: { barn: 1, warehouse: 1 } },
    materials: RUSTIC, tiles: { street: 'trail' } },
];

/** The kinds of ward a megacity grows: each its own buildings, materials, paving and street pattern. */
export const WARD_KINDS: WardDef[] = [
  {
    name: 'merchant ward',
    weight: 3,
    plaza: 11,
    landmarks: [{ structure: 'tavern', at: [0, -20] }],
    districts: [
      { name: 'bazaar', from: 0, to: 0.62, lots: { workshop: 4, townhouse: 3, tavern: 1 }, fill: 0.9, block: { chance: 0.2, buildings: { warehouse: 2, tavern: 1 } },
        materials: { wall: ['halfTimber', 'ochrePlaster', 'brickWall'], roof: ['roofTile', 'shingles'] }, tiles: { street: 'setts', ground: 'cobble' } },
      { name: 'merchant homes', from: 0.62, to: 2, lots: { townhouse: 4, cottage: 3, workshop: 2 }, fill: 0.8,
        materials: { wall: ['plaster', 'rosePlaster', 'halfTimber'], roof: ['roofTile', 'slate'] } },
    ],
  },
  {
    name: 'temple ward',
    weight: 1.5,
    plaza: 11,
    landmarks: [{ structure: 'church', at: [-17, 0] }, { structure: 'belfry', at: [17, 0] }],
    // Broad straight ways for processions.
    streets: { every: 27, width: 5, main: 7 },
    districts: [{ name: 'cloister', from: 0, to: 2, lots: { townhouse: 3, cottage: 3, manor: 1 }, fill: 0.7,
      materials: { wall: ['ashlar', 'sandstone', 'plaster'], roof: ['slate', 'copperRoof'], floor: ['tiledFloor', 'flagstone'] }, tiles: { street: 'setts', ground: 'gravel' } }],
  },
  {
    name: 'garrison ward',
    weight: 1,
    plaza: 10,
    landmarks: [{ structure: 'barracks', at: [0, 18] }],
    streets: { every: 21, width: 3, main: 7 },
    districts: [{ name: 'garrison', from: 0, to: 2, lots: { cottage: 3, smithy: 2, townhouse: 1 }, fill: 0.75, block: { chance: 0.25, buildings: { barracks: 2, warehouse: 1 } },
      materials: { wall: ['basalt', 'stoneWall', 'brickWall'], roof: ['slate'] }, tiles: { ground: 'gravel' } }],
  },
  {
    name: 'craft ward',
    weight: 3,
    plaza: 9,
    landmarks: [],
    districts: [{ name: 'workshops', from: 0, to: 2, lots: { workshop: 4, smithy: 3, cottage: 2, townhouse: 1 }, fill: 0.88, block: { chance: 0.15, buildings: { warehouse: 3 } },
      materials: { wall: ['brickWall', 'woodWall', 'halfTimber'], roof: ['shingles', 'roofTile'] }, tiles: { street: 'cobble', ground: 'trail' } }],
  },
  {
    name: 'noble ward',
    weight: 1,
    plaza: 12,
    landmarks: [],
    // Wide boulevards between walled gardens.
    streets: { every: 33, width: 5, main: 9 },
    districts: [{ name: 'estates', from: 0, to: 2, lots: { manor: 3, townhouse: 3 }, fill: 0.7, block: { chance: 0.3, buildings: { manor: 1 } },
      materials: { wall: ['ashlar', 'marble', 'rosePlaster', 'plaster'], trim: ['ashlar'], roof: ['slate', 'copperRoof'], floor: ['tiledFloor', 'darkPlanks', 'marble'] }, tiles: { street: 'setts' } }],
  },
  {
    name: 'old town',
    weight: 3,
    round: true,
    plaza: 8,
    landmarks: [],
    // Tight crooked lanes.
    streets: { every: 15, width: 3, main: 5, jitter: 3, bend: 2 },
    districts: [{ name: 'tenements', from: 0, to: 2, lots: { cottage: 4, hovel: 3, workshop: 1, tavern: 1 }, fill: 0.85, block: { chance: 0.1, buildings: { tavern: 1, warehouse: 1 } },
      materials: { wall: ['halfTimber', 'daub', 'plaster', 'fieldstone'], roof: ['roofTile', 'thatch', 'shingles'] }, tiles: { street: 'cobble', ground: 'trail' } }],
  },
  {
    name: 'shanties',
    weight: 2.5,
    round: true,
    plaza: 6,
    landmarks: [],
    streets: { every: 15, width: 3, main: 5, jitter: 4, bend: 3 },
    districts: [{ name: 'shanties', from: 0, to: 2, lots: { hovel: 5, cottage: 1 }, fill: 0.7,
      materials: { wall: ['daub', 'woodWall', 'logWall'], roof: ['thatch', 'turfRoof'], floor: ['rushFloor'] }, tiles: { street: 'mud', ground: 'trail' } }],
  },
  {
    name: 'farms',
    weight: 1.5,
    round: true,
    plaza: 6,
    landmarks: [],
    streets: { every: 27, width: 3, main: 5, jitter: 4, bend: 3 },
    districts: [{ name: 'farmland', from: 0, to: 2, lots: { farmhouse: 2, barn: 2, hovel: 1 }, fill: 0.45, materials: RUSTIC, tiles: { street: 'trail' } }],
  },
];
