// Airship fittings as art: wheel, levers and aether tank in pictures that show their state (gauge frames), propeller, lantern, windsock, anchor, chain, ladder
import type { ArtDef, ArtId, ArtPart } from '../types';

const COLORS = {
  wood: ['@plank'],
  dark: ['#3a2a1c'],
  rim: ['#6a4426'],
  brass: ['#b08838', '#c09a48'],
  glass: ['#a8c8d0'],
  aether: ['#60e0d0'],
  empty: ['#1c2826'],
  red: ['#a83828'],
  iron: ['#4a4e54'],
  flame: ['#ffc860'],
  pane: ['#d08a3c'],
  sockA: ['#c03828'],
  sockB: ['#e8e0d0'],
  rope: ['#9a8458', '#8a7448'],
};
/** Pictures per gauge: the station's `gauge` (content/things.ts) must match. */
export const PROP_FRAMES = 9;
const RAD = Math.PI / 180;

function prop(parts: ArtPart[], views?: number): ArtDef {
  return { ppm: 36, variants: 1, colors: COLORS, parts, ...(views ? { views } : {}) };
}

/**
 * A ship's wheel on a binnacle, its face toward the helmsman behind it: a rim of sixteen staves, eight spokes that run
 * out past the rim into turned handles, a brass hub. Turned `turn` degrees (hard over at the ends); the red handle
 * shows how far it is from the middle.
 */
function wheel(turn: number): ArtDef {
  const R = 0.44;
  const C = [0.12, 1.08] as const;
  const at = (a: number, r: number): [number, number, number] => [C[0], C[1] + Math.cos(a * RAD) * r, -Math.sin(a * RAD) * r];
  const rim: ArtPart[] = Array.from({ length: 16 }, (_, i) => ({ shape: 'box', at: at(i * 22.5 + turn, R), size: [0.035, 0.09, 0.04], roll: -(i * 22.5 + turn) + 90, color: 'rim', surface: 'wood' }));
  const spokes: ArtPart[] = [0, 45, 90, 135].map((a) => ({ shape: 'box', at: [C[0], C[1], 0], size: [0.02, R + 0.08, 0.02], roll: -(a + turn), color: 'wood', surface: 'wood' }));
  const knobs: ArtPart[] = Array.from({ length: 8 }, (_, i) => ({ shape: 'drum', at: at(i * 45 + turn, R + 0.14), size: [0.028, 0.06, 0.028], roll: -(i * 45 + turn), color: i === 0 ? 'red' : 'wood', surface: 'wood' }));
  return prop([
    // Binnacle: a stout timber post on a plinth, iron-banded, with a brass compass bowl on its back.
    { shape: 'box', at: [-0.08, 0.06, 0], size: [0.24, 0.06, 0.24], color: 'dark', surface: 'wood' },
    { shape: 'box', at: [-0.08, 0.55, 0], size: [0.12, 0.45, 0.12], color: 'wood', surface: 'wood' },
    { shape: 'box', at: [-0.08, 0.3, 0], size: [0.13, 0.025, 0.13], color: 'iron', surface: 'metal' },
    { shape: 'box', at: [-0.08, 0.85, 0], size: [0.13, 0.025, 0.13], color: 'iron', surface: 'metal' },
    { shape: 'drum', at: [-0.12, 1.02, 0], size: [0.1, 0.04, 0.1], color: 'brass', surface: 'metal' },
    { shape: 'ball', at: [-0.12, 1.07, 0], size: [0.08, 0.04, 0.08], color: 'glass', surface: 'smooth' },
    { shape: 'drum', at: [0.03, C[1], 0], size: [0.035, 0.1, 0.035], tilt: 90, color: 'iron', surface: 'metal' },
    ...rim,
    ...spokes,
    ...knobs,
    { shape: 'drum', at: [C[0] + 0.02, C[1], 0], size: [0.085, 0.04, 0.085], tilt: 90, color: 'brass', surface: 'metal' },
    { shape: 'ball', at: [C[0] + 0.06, C[1], 0], size: [0.04, 0.04, 0.04], color: 'brass', surface: 'metal' },
  ]);
}

/**
 * A lever standing in an iron-bound timber housing, through a slotted brass plate, leaning `lean` degrees forward (+)
 * or back (-); `tag` colours the grip and the band on the housing's face, so the two levers tell apart.
 */
function lever(lean: number, tag: string): ArtDef {
  const r = lean * RAD;
  const P = 0.62;
  const along = (d: number): [number, number, number] => [Math.sin(r) * d, P + Math.cos(r) * d, 0];
  const marks: ArtPart[] = [-30, -15, 0, 15, 30].map((a) => ({ shape: 'box', at: [Math.sin(a * RAD) * 0.25, P + 0.035, 0.07], size: [0.012, 0.01, 0.02], color: a === 0 ? tag : 'dark', surface: 'metal' }));
  return prop([
    { shape: 'box', at: [0, 0.04, 0], size: [0.24, 0.04, 0.18], color: 'dark', surface: 'wood' },
    { shape: 'box', at: [0, 0.32, 0], size: [0.2, 0.26, 0.14], color: 'wood', surface: 'wood' },
    { shape: 'box', at: [0, 0.12, 0], size: [0.21, 0.025, 0.15], color: 'iron', surface: 'metal' },
    { shape: 'box', at: [0, 0.5, 0], size: [0.21, 0.025, 0.15], color: 'iron', surface: 'metal' },
    { shape: 'box', at: [0.205, 0.32, 0], size: [0.01, 0.06, 0.1], color: tag, surface: 'metal' },
    // The slotted plate on top, and its notches.
    { shape: 'box', at: [0, P, 0.07], size: [0.24, 0.025, 0.05], color: 'brass', surface: 'metal' },
    { shape: 'box', at: [0, P, -0.07], size: [0.24, 0.025, 0.05], color: 'brass', surface: 'metal' },
    ...marks,
    { shape: 'drum', at: [0, P - 0.06, 0], size: [0.035, 0.16, 0.035], tilt: 90, roll: 90, color: 'iron', surface: 'metal' },
    // The arm, its grip and knob.
    { shape: 'box', at: along(0.25), size: [0.022, 0.3, 0.022], tilt: lean, color: 'iron', surface: 'metal' },
    { shape: 'drum', at: along(0.6), size: [0.035, 0.09, 0.035], tilt: lean, color: tag, surface: 'wood' },
    { shape: 'ball', at: along(0.71), size: [0.045, 0.04, 0.045], color: 'brass', surface: 'metal' },
  ]);
}

/** A glass tank in a brass cage on a brass foot, a valve wheel on top; the glowing aether inside stands `full` (0..1) high. */
function tank(full: number): ArtDef {
  const h = 0.4 * full;
  const straps: ArtPart[] = [45, 135, 225, 315].map((a) => ({ shape: 'box', at: [Math.cos(a * RAD) * 0.27, 0.66, Math.sin(a * RAD) * 0.27], size: [0.022, 0.44, 0.022], color: 'brass', surface: 'metal' }));
  const valve: ArtPart[] = [0, 60, 120].map((a) => ({ shape: 'box', at: [0, 1.4, 0], size: [0.11, 0.01, 0.012], yaw: a, color: 'red', surface: 'metal' }));
  return prop([
    { shape: 'drum', at: [0, 0.07, 0], size: [0.34, 0.07, 0.34], color: 'dark', surface: 'wood' },
    { shape: 'drum', at: [0, 0.17, 0], size: [0.3, 0.05, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 0.65, 0], size: [0.25, 0.44, 0.25], color: 'empty', surface: 'smooth' },
    ...(full > 0 ? [{ shape: 'drum', at: [0, 0.23 + h, 0], size: [0.245, h, 0.245], color: 'aether', surface: 'glow' } as ArtPart] : []),
    { shape: 'drum', at: [0, 0.65, 0], size: [0.26, 0.44, 0.26], color: 'glass', surface: 'smooth', shade: 0 },
    ...straps,
    { shape: 'drum', at: [0, 0.45, 0], size: [0.275, 0.02, 0.275], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 0.85, 0], size: [0.275, 0.02, 0.275], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 1.11, 0], size: [0.3, 0.04, 0.3], color: 'brass', surface: 'metal' },
    { shape: 'cone', at: [0, 1.15, 0], size: [0.2, 0.14, 0.2], color: 'brass', surface: 'metal' },
    { shape: 'drum', at: [0, 1.33, 0], size: [0.025, 0.07, 0.025], color: 'iron', surface: 'metal' },
    { shape: 'drum', at: [0, 1.4, 0], size: [0.11, 0.012, 0.11], color: 'red', surface: 'metal' },
    ...valve,
    // A pipe from the top down into the deck, where the aether goes to the ship.
    { shape: 'drum', at: [-0.34, 0.62, 0], size: [0.03, 0.52, 0.03], color: 'brass', surface: 'metal' },
    { shape: 'box', at: [-0.2, 1.14, 0], size: [0.14, 0.025, 0.025], color: 'brass', surface: 'metal' },
  ]);
}

/** A ship's lantern: a glass box with a glowing flame in an iron frame, hung from a bracket that reaches up and back. */
const LANTERN: ArtDef = prop([
  { shape: 'box', at: [0, 0.03, 0], size: [0.09, 0.03, 0.09], color: 'iron', surface: 'metal' },
  { shape: 'box', at: [0, 0.2, 0], size: [0.075, 0.14, 0.075], color: 'pane', surface: 'glow' },
  { shape: 'ball', at: [0, 0.18, 0.076], size: [0.035, 0.06, 0.01], color: 'flame', surface: 'glow' },
  ...[45, 135, 225, 315].map((a): ArtPart => ({ shape: 'box', at: [Math.cos(a * RAD) * 0.1, 0.2, Math.sin(a * RAD) * 0.1], size: [0.012, 0.15, 0.012], color: 'iron', surface: 'metal' })),
  { shape: 'cone', at: [0, 0.35, 0], size: [0.1, 0.09, 0.1], color: 'iron', surface: 'metal' },
  { shape: 'drum', at: [0, 0.47, 0], size: [0.03, 0.012, 0.03], tilt: 90, color: 'iron', surface: 'metal' },
  { shape: 'box', at: [0, 0.55, 0], size: [0.01, 0.06, 0.01], color: 'iron', surface: 'metal' },
  { shape: 'box', at: [-0.2, 0.61, 0], size: [0.2, 0.012, 0.012], color: 'iron', surface: 'metal' },
]);

/** A windsock on a pole: a striped cloth cone streaming forward (downwind), stirring in the breeze. */
const WINDSOCK: ArtDef = prop([
  { shape: 'drum', at: [0, 0.05, 0], size: [0.08, 0.05, 0.08], color: 'dark', surface: 'wood' },
  { shape: 'drum', at: [0, 1.2, 0], size: [0.025, 1.15, 0.025], color: 'wood', surface: 'wood' },
  { shape: 'ball', at: [0, 2.38, 0], size: [0.04, 0.04, 0.04], color: 'brass', surface: 'metal' },
  { shape: 'drum', at: [0.03, 2.2, 0], size: [0.11, 0.012, 0.11], tilt: 90, roll: 90, color: 'iron', surface: 'metal' },
  ...[0, 1, 2, 3].map((k): ArtPart => ({
    shape: 'drum',
    at: [0.14 + k * 0.2, 2.2 - k * 0.035, 0],
    size: [0.1 - k * 0.018, 0.1, 0.1 - k * 0.018],
    tilt: 96,
    pivot: [0.03, 2.2, 0],
    idle: 4 + k * 3,
    id: `sock${k}`,
    color: k % 2 ? 'sockB' : 'sockA',
    surface: 'cloth',
  })),
]);

/** An iron anchor: ring, stock across the shank, and two curved arms ending in flukes. */
const ANCHOR: ArtDef = prop([
  { shape: 'drum', at: [0, 0.86, 0], size: [0.07, 0.015, 0.07], tilt: 90, color: 'iron', surface: 'metal' },
  { shape: 'box', at: [0, 0.74, 0], size: [0.04, 0.035, 0.26], color: 'dark', surface: 'wood' },
  { shape: 'box', at: [0, 0.45, 0], size: [0.035, 0.34, 0.035], color: 'iron', surface: 'metal' },
  { shape: 'ball', at: [0, 0.12, 0], size: [0.06, 0.05, 0.06], color: 'iron', surface: 'metal' },
  ...[-1, 1].flatMap((s): ArtPart[] => [
    { shape: 'box', at: [0, 0.16, s * 0.14], size: [0.03, 0.15, 0.03], roll: s * 62, color: 'iron', surface: 'metal' },
    { shape: 'box', at: [0, 0.3, s * 0.28], size: [0.03, 0.08, 0.03], roll: s * 20, color: 'iron', surface: 'metal' },
    { shape: 'cone', at: [0, 0.36, s * 0.3], size: [0.06, 0.12, 0.03], roll: s * 15, color: 'iron', surface: 'metal' },
  ]),
]);

/** One link of chain (drawn many times along a chain), the same from every side. */
const CHAIN_LINK: ArtDef = { ...prop([{ shape: 'drum', at: [0, 0.08, 0], size: [0.05, 0.016, 0.08], tilt: 90, color: 'iron', surface: 'metal' }], 1), ppm: 40 };

/** A rope ladder's rung (drawn every 0.3 m along it): a wooden step with its two ropes. */
const LADDER_RUNG: ArtDef = {
  ...prop([
    { shape: 'box', at: [0, 0.03, 0], size: [0.03, 0.025, 0.28], color: 'wood', surface: 'wood' },
    ...[-1, 1].map((s): ArtPart => ({ shape: 'box', at: [0, 0.15, s * 0.3], size: [0.015, 0.15, 0.015], color: 'rope', surface: 'cloth' })),
  ], 1),
  ppm: 40,
};

/** Frames of the propeller's turn: three blades a third of a turn apart, so `SPIN_FRAMES` pictures cover 120°. */
export const SPIN_FRAMES = 6;
/** A three-bladed propeller on a shaft running forward into the stern post, its hub 1.25 m up, turned `turn` degrees. */
function propeller(turn: number): ArtDef {
  const H = 3;
  const L = 3;
  return prop([
    { shape: 'box', at: [0.5, H, 0], size: [0.5, 0.12, 0.12], color: 'iron', surface: 'metal' },
    { shape: 'drum', at: [0.08, H, 0], size: [0.3, 0.2, 0.3], tilt: 90, color: 'brass', surface: 'metal' },
    ...[0, 120, 240].map((a): ArtPart => ({ shape: 'box', at: [0, H + Math.cos((a + turn) * RAD) * L * 0.55, -Math.sin((a + turn) * RAD) * L * 0.55], size: [0.06, L * 0.45, 0.32], roll: -(a + turn), color: 'wood', surface: 'wood' })),
    { shape: 'ball', at: [-0.14, H, 0], size: [0.17, 0.17, 0.17], color: 'brass', surface: 'metal' },
  ]);
}

/** Every picture: `<name><frame>` for frame 0 (the low end) to PROP_FRAMES - 1, and the bare name for the middle (or empty tank). */
/**
 * The whole airship as one picture, seen from afar where its cells fade out (content/crafts.ts measures): hull bowl, rail
 * and quarterdeck, rope stays, the envelope and its tail fins. Its origin is the craft's pivot at the keel.
 */
const AIRSHIP_FAR: ArtDef = {
  ppm: 3,
  variants: 1,
  colors: { ...COLORS, canvas: ['#c8b48c'] },
  parts: [
    { shape: 'ball', at: [0, 3.5, 0], size: [11, 3, 4.5], color: 'wood', surface: 'wood' },
    { shape: 'box', at: [0, 5.6, 0], size: [9.5, 0.6, 4.3], color: 'dark', surface: 'wood' },
    { shape: 'box', at: [-7.5, 6.8, 0], size: [2.5, 1.2, 4], color: 'wood', surface: 'wood' },
    { shape: 'box', at: [12.5, 5, 0], size: [1.8, 0.2, 0.2], color: 'dark', surface: 'wood' },
    ...[-3, 2, 5].flatMap((f): ArtPart[] => [-3.5, 3.5].map((y): ArtPart => ({ shape: 'drum', at: [f, 9.5, y], size: [0.12, 3.5, 0.12], color: 'dark', surface: 'wood' }))),
    { shape: 'ball', at: [1, 18, 0], size: [14.5, 6, 7], color: 'canvas', surface: 'cloth' },
    { shape: 'box', at: [-13, 18, 0], size: [1.5, 3, 0.2], color: 'canvas', surface: 'cloth' },
    { shape: 'box', at: [-13, 18, 0], size: [1.5, 0.2, 3], color: 'canvas', surface: 'cloth' },
  ],
};

export const SHIP_PROPS: Record<ArtId, ArtDef> = { airshipFar: AIRSHIP_FAR, shipLamp: LANTERN, windsock: WINDSOCK, shipAnchor: ANCHOR, chainLink: CHAIN_LINK, ladderRung: LADDER_RUNG };
for (let i = 0; i < SPIN_FRAMES; i++) SHIP_PROPS[`shipPropeller${i}`] = propeller((i * 120) / SPIN_FRAMES);
for (let i = 0; i < PROP_FRAMES; i++) {
  const t = i / (PROP_FRAMES - 1);
  SHIP_PROPS[`shipWheel${i}`] = wheel((t * 2 - 1) * 120);
  SHIP_PROPS[`throttleLever${i}`] = lever((t * 2 - 1) * 35, 'brass');
  SHIP_PROPS[`altitudeLever${i}`] = lever((t * 2 - 1) * 35, 'red');
  SHIP_PROPS[`anchorWinch${i}`] = lever((t * 2 - 1) * 35, 'iron');
  SHIP_PROPS[`fuelTank${i}`] = tank(t);
}
const mid = Math.floor(PROP_FRAMES / 2);
SHIP_PROPS.shipWheel = SHIP_PROPS[`shipWheel${mid}`] as ArtDef;
SHIP_PROPS.throttleLever = SHIP_PROPS[`throttleLever${mid}`] as ArtDef;
SHIP_PROPS.altitudeLever = SHIP_PROPS[`altitudeLever${mid}`] as ArtDef;
SHIP_PROPS.anchorWinch = SHIP_PROPS[`anchorWinch${mid}`] as ArtDef;
SHIP_PROPS.fuelTank = SHIP_PROPS.fuelTank0 as ArtDef;
SHIP_PROPS.shipPropeller = SHIP_PROPS.shipPropeller0 as ArtDef;
