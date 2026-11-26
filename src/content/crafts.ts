// Crafts as data: the airship's hull (swept fine cells), what is fitted aboard, and how it flies
import type { CraftDef, Fitting, HullBox } from '../types';
import { sweep, type Sweep } from './hullSweep';

const Q = Math.PI / 2;

/*
 * The airship, in its own metres: x runs stern (0) to bow (22, the bowsprit beyond), y port to starboard about the
 * keel line YC, z up from the keel. A round-bellied hull with a sharp bow whose keel sweeps up into the stem and a stern
 * that overhangs; below deck a hold (floor 1.5, deck 4.5); a raised stern deck (7) over a cabin; a long sailcloth
 * envelope high overhead on rope stays; a propeller astern; a rope ladder down the port side.
 */
const L = 22;
const HB = 4.5;
const YC = 6.25;
const MAIN = 4.5;
const QUARTER = 7;
const AFT = 6.5;
/** The envelope: middle (x, z) and half-sizes. */
const ENV = { x: 11, z: 16.5, rx: 11, ry: 5, rz: 4.5 };
/** A ship's lantern from its foot to the top of its hook (content/shipProps.ts), to hang it right under a beam. */
const LAMP_TALL = 0.62;
/** The rope ladder hangs just outside the widest beam of the port side. */
const LADDER_Y = YC - HB - 0.45;

/** Width of the deck seen from above, 0..1: a square stern, a long bow drawn to a point. */
const plan = (x: number): number => (x < 3 ? 0.78 + 0.22 * Math.sqrt(x / 3) : x > L - 10 ? Math.max(0, 1 - ((x - (L - 10)) / 10) ** 2) : 1);
/** The keel sweeps up into the stem at the bow and into an overhanging counter at the stern. */
const bottom = (x: number): number => 0.5 + (x > L - 8 ? 4 * ((x - (L - 8)) / 8) ** 2 : x < 4 ? 2 * ((4 - x) / 4) ** 2 : 0);
/** The round of the bilge: half the beam at the keel, the full beam 2.5 m up. */
const section = (h: number): number => (h < 0 ? 0 : 0.5 + 0.5 * Math.sqrt(Math.min(1, h / 2.5)));
const top = (x: number): number => (x < AFT ? QUARTER : MAIN);
const inPlan = (x: number, y: number): boolean => x >= 0 && x < L && Math.abs(y - YC) < HB * plan(x);
const inHull = (x: number, y: number, z: number): boolean => z >= bottom(x) && z < top(x) && Math.abs(y - YC) < HB * plan(x) * section(z - bottom(x));
/** A metre-high bulwark round the edge of each deck. */
const bulwark = (x: number, y: number, z: number): boolean =>
  z >= top(x) && z < top(x) + 1 && inPlan(x, y) && [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([dx = 0, dy = 0]) => !inPlan(x + dx, y + dy) || top(x + dx) < top(x));
const inEnvelope = (x: number, y: number, z: number): boolean => ((x - ENV.x) / ENV.rx) ** 2 + ((y - YC) / ENV.ry) ** 2 + ((z - ENV.z) / ENV.rz) ** 2 < 1;

/** The hull. The shell (two cells deep where it curves), the decks and the hold floor show; the hold and the stern cabin are hollow. */
export const HULL_SWEEP: Sweep = {
  solid: (x, y, z) => inHull(x, y, z) || bulwark(x, y, z),
  keep: (x, _y, z, edge) => edge || z >= top(x) || z < 1.5 || z >= top(x) - 0.5 || (x < AFT && z >= MAIN - 0.5 && z < MAIN),
  // A dark wale along the side under the deck and a dark cap along the top of the bulwark.
  mat: (x, y, z) => ((z >= MAIN - 1 && z < MAIN - 0.5 && Math.abs(y - YC) > HB * plan(x) - 1) || z >= top(x) + 0.5 ? 'post' : 'hullPlank'),
  from: [0, 0, 0],
  to: [L, 13, QUARTER + 1],
};

/** The gas envelope: a long sailcloth shell high over the deck. */
export const ENVELOPE_SWEEP: Sweep = {
  solid: inEnvelope,
  keep: (_x, _y, _z, edge) => edge,
  mat: 'sailcloth',
  from: [0, 1, 11.5],
  to: [L, 11.5, 21.5],
};

const box = (from: [number, number, number], to: [number, number, number], shape: string | null, mat?: string, rot?: number): HullBox => ({ from, to, shape, mat, rot, fine: true });
/** A flight of half-metre stair cells, `n` long, rising `dir` (+1 toward the bow, -1 toward the stern). */
const flight = (x: number, y0: number, y1: number, z: number, n: number, dir: number): HullBox[] =>
  Array.from({ length: n }, (_, k) => box([x + dir * k * 0.5, y0, z + k * 0.5], [x + dir * k * 0.5 + 0.5, y1, z + k * 0.5 + 0.5], 'stair', 'hullPlank', dir > 0 ? 0 : 2));
/** The outermost half-metre column of the deck at `x` on one side (-1 port, 1 starboard): where a stay rises. */
const edgeY = (x: number, side: number): number => {
  let y = 6;
  while (inPlan(x + 0.25, y + 0.25 + side * 0.5)) y += side * 0.5;
  return y;
};
/** Rope stays from the top of the bulwark, both sides, straight up into the envelope. */
const stays = (x: number): HullBox[] =>
  [-1, 1].map((side) => {
    const y = edgeY(x, side);
    let z = top(x) + 1;
    while (z < 22 && !inEnvelope(x + 0.25, y + 0.25, z + 0.25)) z += 0.5;
    return box([x, y, top(x) + 1], [x + 0.5, y + 0.5, z + 0.5], 'postThin', 'post');
  });

/** A lantern hung by its hook from a stay (its hook arm reaching back to the rope). */
const onStay = (x: number, side: number): Fitting => ({ thing: 'shipLamp', at: [x + 0.25, edgeY(x, side) + 0.25 - side * 0.35, MAIN + 1.6], face: side * Q });
/** Lanterns: hung on the stays, standing on the stern rail, and hanging by their hooks right under the beams of the hold and the cabin. */
const lamps: Fitting[] = [
  onStay(9, -1),
  onStay(16, 1),
  ...([
    [0.25, YC - 2.5, QUARTER + 1, 0],
    [0.25, YC + 2.5, QUARTER + 1, 0],
    [7.5, YC, MAIN - 0.5 - LAMP_TALL, 0],
    [13, YC - 1, MAIN - 0.5 - LAMP_TALL, 0],
    [3.5, YC + 1.5, QUARTER - 0.5 - LAMP_TALL, 0],
  ] as const).map(([x, y, z, face]): Fitting => ({ thing: 'shipLamp', at: [x, y, z], face })),
];

/** The hold's goods: crates and barrels along both sides below deck, one crate stacked on another. Loose, so they slide, tumble and can be knocked about. */
const goods: Fitting[] = ([
  ['crate', 8.6, 4.2, 1.5],
  ['crate', 8.6, 4.2, 2.3],
  ['barrel', 7.5, 4.4, 1.5],
  ['crate', 11.4, 4.2, 1.5],
  ['barrel', 12.4, 4.4, 1.5],
  ['crate', 9.2, 8.3, 1.5],
  ['crate', 10.4, 8.3, 1.5],
  ['barrel', 8, 8.2, 1.5],
] as const).map(([thing, x, y, z]) => ({ thing, at: [x, y, z], face: x * 1.7, loose: true }));

export const AIRSHIP: CraftDef = {
  size: [24.5, 15, 22],
  pivot: [11, YC],
  hull: [
    ...sweep(HULL_SWEEP),
    ...sweep(ENVELOPE_SWEEP),
    // Keel, bowsprit and the rope stays holding the envelope up.
    box([3, 6, 0], [17, 6.5, 0.5], 'vee', 'hullPlank'),
    box([21, 6, MAIN], [23, 6.5, MAIN + 0.5], 'cube', 'post'),
    box([23, 6, MAIN + 0.5], [24.5, 6.5, MAIN + 1], 'cube', 'post'),
    ...[9, 13, 16].flatMap(stays),
    // Cut out: the hatch, the cabin door (through both layers of the bulkhead), gaps in the bulwarks for the stairs, the ladder,
    // the plank and the anchor's cathead.
    box([12, 6.5, MAIN - 0.5], [15, 8, MAIN], null),
    box([AFT - 1, 5.5, MAIN], [AFT, 7, MAIN + 2], null),
    box([AFT - 0.5, 2.5, QUARTER], [AFT, 3.5, QUARTER + 1], null),
    box([AFT - 0.5, 9, QUARTER], [AFT, 10, QUARTER + 1], null),
    box([9.5, 1.5, MAIN], [11, 2.5, MAIN + 1], null),
    box([11.5, 10, MAIN], [12.5, 11, MAIN + 1], null),
    box([18.5, YC, MAIN], [20, 12, MAIN + 1], null),
    // Stairs: down the hatch to the hold (toward the stern, landing amidships) and up both sides to the stern deck.
    ...flight(12, 6.5, 8, 1.5, 6, 1),
    ...flight(8.5, 2.5, 3.5, MAIN, 5, -1),
    ...flight(8.5, 9, 10, MAIN, 5, -1),
    // The launching plank out to starboard: a thin board a metre wide; the cathead, a short beam out over the bow.
    box([11.5, 10.5, MAIN - 0.5], [12.5, 14, MAIN], 'slabHigh', 'hullPlank'),
    box([19, 8, MAIN - 0.5], [19.5, 9.5, MAIN], 'cube', 'post'),
  ],
  fittings: [
    // The helm on the stern deck; the altitude lever on the main deck; the aether tank in the cabin under the stern deck.
    { thing: 'shipWheel', at: [4.5, YC, QUARTER], face: Math.PI },
    { thing: 'throttleLever', at: [4.8, YC - 1.6, QUARTER] },
    { thing: 'windsock', at: [0.9, YC + 2, QUARTER] },
    { thing: 'altitudeLever', at: [10, YC - 1.5, MAIN] },
    // It comes with ten minutes of aether, enough to answer the first call and fly a while.
    { thing: 'fuelTank', at: [1.8, YC, MAIN], fill: 600 },
    { thing: 'shipHold', at: [10, 4.2, 1.5], face: Q },
    ...goods,
    ...lamps,
    { thing: 'launchPlank', at: [12, 12.5, MAIN], face: Q },
    // A rope ladder down the port side from the gap in the bulwark, long enough to reach the ground on a slope; the propeller astern, on a shaft from the stern post.
    { thing: 'ropeLadder', at: [10.25, LADDER_Y, -1.5], tie: [10.25, LADDER_Y + 0.15, MAIN + 0.3] },
    { thing: 'shipPropeller', at: [-0.45, YC, 2.6] },
    // The anchor lies loose on the foredeck, its chain made fast just past the end of the cathead (clear of it, so a climber's head does not hit it).
    { thing: 'shipAnchor', at: [18.4, YC + 1.2, MAIN], loose: true, tie: [19.25, 9.95, MAIN + 0.3] },
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
