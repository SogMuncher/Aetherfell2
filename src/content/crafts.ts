// Crafts as data: the airship's hull (swept fine cells), what is fitted aboard, and how it flies
import type { CraftDef, HullBox } from '../types';
import { sweep } from './hullSweep';

const Q = Math.PI / 2;

/*
 * The airship, in its own metres: x runs stern (0) to bow (22), y port to starboard about the keel line YC, z up from
 * the keel. A round-bellied hull with a rising bow; below deck a hold (floor 1.5, deck 4.5); a raised stern deck (7)
 * over a cabin, with the wheel, levers and aether tank; a sailcloth envelope on two masts overhead.
 */
const L = 22;
const HB = 4.5;
const YC = 6.25;
const MAIN = 4.5;
const QUARTER = 7;
const AFT = 6.5;

/** Width of the deck seen from above, 0..1: a square stern, a long rounded bow. */
const plan = (x: number): number => (x < 3 ? 0.78 + 0.22 * Math.sqrt(x / 3) : x > L - 9 ? Math.sqrt(Math.max(0, 1 - ((x - (L - 9)) / 9) ** 2)) : 1);
/** The keel rises toward bow and stern. */
const bottom = (x: number): number => 0.5 + (x > L - 7 ? 3 * ((x - (L - 7)) / 7) ** 2 : x < 4 ? 1.2 * ((4 - x) / 4) ** 2 : 0);
/** The round of the bilge: half the beam at the keel, the full beam 2.5 m up. */
const section = (h: number): number => (h < 0 ? 0 : 0.5 + 0.5 * Math.sqrt(Math.min(1, h / 2.5)));
const top = (x: number): number => (x < AFT ? QUARTER : MAIN);
const inPlan = (x: number, y: number): boolean => x >= 0 && x < L && Math.abs(y - YC) < HB * plan(x);
const inHull = (x: number, y: number, z: number): boolean => z >= bottom(x) && z < top(x) && Math.abs(y - YC) < HB * plan(x) * section(z - bottom(x));
/** A metre-high bulwark round the edge of each deck. */
const bulwark = (x: number, y: number, z: number): boolean =>
  z >= top(x) && z < top(x) + 1 && inPlan(x, y) && [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([dx = 0, dy = 0]) => !inPlan(x + dx, y + dy) || top(x + dx) < top(x));

const hull = sweep({
  solid: (x, y, z) => inHull(x, y, z) || bulwark(x, y, z),
  // The shell, the bulwarks, the decks and the hold floor show; the hold and the stern cabin are hollow.
  keep: (x, _y, z, edge) => edge || z >= top(x) || z < 1.5 || z >= top(x) - 0.5 || (x < AFT && z >= MAIN - 0.5 && z < MAIN),
  mat: 'hullPlank',
  from: [0, 0, 0],
  to: [L, 13, QUARTER + 1],
});

/** The gas envelope: a long sailcloth shell over the deck. */
const envelope = sweep({
  solid: (x, y, z) => ((x - 11) / 10.5) ** 2 + ((y - YC) / 3.75) ** 2 + ((z - 12.75) / 3.2) ** 2 < 1,
  keep: (_x, _y, _z, edge) => edge,
  mat: 'sailcloth',
  from: [0, 2, 9],
  to: [L, 10.5, 16],
});

const box = (from: [number, number, number], to: [number, number, number], shape: string | null, mat?: string, rot?: number): HullBox => ({ from, to, shape, mat, rot, fine: true });
/** A flight of half-metre stair cells, `n` long, rising `dir` (+1 toward the bow, -1 toward the stern). */
const flight = (x: number, y0: number, y1: number, z: number, n: number, dir: number): HullBox[] =>
  Array.from({ length: n }, (_, k) => box([x + dir * k * 0.5, y0, z + k * 0.5], [x + dir * k * 0.5 + 0.5, y1, z + k * 0.5 + 0.5], 'stair', 'hullPlank', dir > 0 ? 0 : 2));

export const AIRSHIP: CraftDef = {
  size: [L, 15, 16],
  pivot: [11, YC],
  hull: [
    ...hull,
    ...envelope,
    // Keel, and two masts holding the envelope up.
    box([3, 6, 0], [17, 6.5, 0.5], 'vee', 'hullPlank'),
    box([7.5, 6, MAIN], [8, 6.5, 10.5], 'columnWide', 'post'),
    box([17.5, 6, MAIN], [18, 6.5, 10.5], 'columnWide', 'post'),
    // Cut out: the hatch, the cabin door, stern windows, portholes, gaps in the bulwarks for the stairs and the plank.
    box([14, 7, MAIN - 0.5], [16.5, 8.5, MAIN], null),
    box([AFT - 0.5, 5.5, MAIN], [AFT, 7, MAIN + 2], null),
    box([0, 4.5, 5.5], [0.5, 5, 6], null),
    box([0, 7.5, 5.5], [0.5, 8, 6], null),
    ...[5, 8, 11, 14, 17].flatMap((x) => [box([x, 1.5, 2.5], [x + 0.5, 3.5, 3], null), box([x, 9, 2.5], [x + 0.5, 11, 3], null)]),
    box([AFT - 0.5, 2.5, QUARTER], [AFT, 3.5, QUARTER + 1], null),
    box([AFT - 0.5, 9, QUARTER], [AFT, 10, QUARTER + 1], null),
    box([9.5, 1.5, MAIN], [11, 2.5, MAIN + 1], null),
    box([11, 10, MAIN], [12.5, 11, MAIN + 1], null),
    // Stairs: down the hatch to the hold, up both sides to the stern deck, and up the port side from the ground.
    ...flight(16, 7, 8.5, 1.5, 6, -1),
    ...flight(8.5, 2.5, 3.5, MAIN, 5, -1),
    ...flight(8.5, 9, 10, MAIN, 5, -1),
    ...flight(5.5, 1, 2, 0, 9, 1),
    // The launching plank out to starboard.
    box([11, 10.5, MAIN - 0.5], [12.5, 15, MAIN], 'cube', 'hullPlank'),
  ],
  fittings: [
    { thing: 'shipWheel', at: [4, YC, QUARTER] },
    { thing: 'throttleLever', at: [4.3, YC - 1.6, QUARTER] },
    { thing: 'altitudeLever', at: [4.3, YC + 1.6, QUARTER] },
    // It comes with ten minutes of aether, enough to answer the first call and fly a while.
    { thing: 'fuelTank', at: [1.6, YC, QUARTER], fill: 600 },
    { thing: 'shipHold', at: [18.2, 5, 1.5], face: 2 * Q },
    { thing: 'launchPlank', at: [11.75, 13, MAIN], face: Q },
  ],
  thrust: { channel: 'throttle', speed: 9, accel: 0.5 },
  turn: { channel: 'helm', rate: 0.35 },
  climb: { channel: 'lift', rate: 4 },
  fuel: 'fuel',
  sink: 0.8,
  wind: 0.7,
  air: { base: 40, span: 180, speed: 1.5, calm: 0.75, top: 260 },
  clearance: 0.3,
  called: { cruise: 30, near: 16 },
};
