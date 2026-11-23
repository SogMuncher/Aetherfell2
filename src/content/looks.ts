// Creatures and people as art data: fixed parts on joints that swing, plus body-plan helpers (four legs, two legs, hopper)
import type { ArtDef, ArtId, ArtPart, Vec3 } from '../types';

/**
 * How creatures look. Each look is a handful of solid parts placed in metres ([forward, up, side]
 * from the ground between the feet). The renderer turns them into sprites from 8 directions and
 * animates them (walk, rest, attack, knocked down) by swinging parts about their joints.
 *
 * Body plans below (four legs, two legs, hopper) are just helpers that return parts, so a new
 * creature can reuse one with its own proportions and add horns, tails or hats on top.
 * Looks are keyed by the sprite id in a thing's definition (content/things.ts).
 */

const v = (f: number, u: number, s: number): Vec3 => [f, u, s];

export interface FourLegs {
  /** Height of the back. */
  back: number;
  /** Half the body's length, depth and width. */
  body: Vec3;
  /** Leg thickness (radius). */
  leg: number;
  /** Where the legs sit forward/back from the middle, and how far apart. */
  legAt: number;
  legApart: number;
  /** How much the legs swing (degrees). */
  swing: number;
  /** Neck: length and how far it leans forward (degrees from upright). */
  neck: number;
  neckTilt: number;
  neckThick: number;
  /** Head radii. */
  head: Vec3;
  /** Muzzle length and thickness; 0 = none. */
  muzzle: number;
  muzzleThick: number;
  ears: Vec3;
  tail: Vec3;
  /** Tail angle back from straight up (degrees): 90 = straight out, 150 = hanging. */
  tailDroop: number;
  eyeSize: number;
}

/** A four-legged animal: body, chest, four legs that trot, neck, head, muzzle, ears, eyes, tail. */
export function fourLegs(p: FourLegs): ArtPart[] {
  const top = p.back;
  const cy = top - p.body[1];
  const legLen = cy;
  const half = legLen / 2;
  const neckBase = v(p.body[0] * 0.75, cy + p.body[1] * 0.4, 0);
  const nt = (p.neckTilt * Math.PI) / 180;
  const neckMid = v(neckBase[0] + Math.sin(nt) * p.neck * 0.5, neckBase[1] + Math.cos(nt) * p.neck * 0.5, 0);
  const headAt = v(neckBase[0] + Math.sin(nt) * p.neck + p.head[0] * 0.4, neckBase[1] + Math.cos(nt) * p.neck, 0);
  const parts: ArtPart[] = [
    { id: 'body', shape: 'ball', at: v(0, cy, 0), size: p.body, color: 'coat', surface: 'fur', idle: 1.5 },
    { parent: 'body', shape: 'ball', at: v(0, cy - p.body[1] * 0.35, 0), size: v(p.body[0] * 0.8, p.body[1] * 0.7, p.body[2] * 0.85), color: 'belly', surface: 'fur' },
    { parent: 'body', shape: 'ball', at: v(p.body[0] * 0.6, cy + p.body[1] * 0.05, 0), size: v(p.body[0] * 0.45, p.body[1] * 1.08, p.body[2] * 1.05), color: 'coat', surface: 'fur' },
    // Legs hang from the hips and shoulders and trot in diagonal pairs.
    { id: 'foreleg', shape: 'ball', at: v(p.legAt, half, p.legApart), size: v(p.leg, half + p.leg, p.leg), pivot: v(p.legAt, cy, p.legApart), color: 'legs', surface: 'fur', mirror: true, stride: { swing: p.swing, phase: 0 } },
    { id: 'hindleg', shape: 'ball', at: v(-p.legAt, half, p.legApart), size: v(p.leg * 1.15, half + p.leg, p.leg), pivot: v(-p.legAt, cy, p.legApart), color: 'legs', surface: 'fur', mirror: true, stride: { swing: p.swing, phase: 0.5 } },
    { id: 'neck', shape: 'ball', at: neckMid, size: v(p.neckThick, p.neck * 0.6, p.neckThick * 0.85), tilt: p.neckTilt, pivot: neckBase, color: 'coat', surface: 'fur', strike: 25, idle: 3 },
    { id: 'head', parent: 'neck', shape: 'ball', at: headAt, size: p.head, color: 'coat', surface: 'fur' },
    { parent: 'head', shape: 'ball', at: v(headAt[0] + p.head[0] * 0.5, headAt[1] + p.head[1] * 0.45, p.head[2] * 0.55), size: v(p.eyeSize, p.eyeSize, p.eyeSize), color: 'eye', surface: 'glow', mirror: true },
    { parent: 'head', shape: 'cone', at: v(headAt[0] - p.head[0] * 0.2, headAt[1] + p.head[1] * 0.7, p.head[2] * 0.55), size: p.ears, roll: 18, tilt: -10, color: 'coat', surface: 'fur', mirror: true },
    { shape: 'cone', at: v(-p.body[0] * 0.95, cy + p.body[1] * 0.3, 0), size: p.tail, tilt: -p.tailDroop, pivot: v(-p.body[0] * 0.95, cy + p.body[1] * 0.3, 0), color: 'tail', surface: 'fur', idle: 12, stride: { swing: 8, phase: 0.25 } },
  ];
  if (p.muzzle > 0) {
    parts.push(
      { parent: 'head', shape: 'cone', at: v(headAt[0] + p.head[0] * 0.55, headAt[1] - p.head[1] * 0.2, 0), size: v(p.muzzleThick, p.muzzle, p.muzzleThick * 0.9), tilt: 100, color: 'muzzle', surface: 'fur' },
      { parent: 'head', shape: 'ball', at: v(headAt[0] + p.head[0] * 0.55 + p.muzzle * 0.95, headAt[1] - p.head[1] * 0.2 - p.muzzle * 0.17, 0), size: v(p.muzzleThick * 0.4, p.muzzleThick * 0.4, p.muzzleThick * 0.45), color: 'nose', surface: 'smooth' },
    );
  }
  return parts;
}

/**
 * A person: legs, boots, belted tunic, arms (the right one swings the weapon), hands, head, hair,
 * face, and optional robe, apron, beard, hat and cape. `wear` marks where worn armour and the held item go.
 */
export function twoLegs(height = 1.75): ArtPart[] {
  const k = height / 1.75;
  const p = (f: number, u: number, s: number): Vec3 => [f * k, u * k, s * k];
  return [
    { id: 'leg', shape: 'box', at: p(0, 0.46, 0.085), size: p(0.065, 0.44, 0.06), pivot: p(0, 0.9, 0.085), color: 'legs', surface: 'cloth', mirror: true, wear: 'legs', stride: { swing: 26, phase: 0 } },
    { parent: 'leg', shape: 'box', at: p(0.03, 0.06, 0.085), size: p(0.095, 0.06, 0.065), color: 'boots', surface: 'skin', mirror: true },
    { id: 'torso', shape: 'box', at: p(0, 1.13, 0), size: p(0.105, 0.23, 0.18), color: 'tunic', surface: 'cloth', idle: 1, wear: 'torso' },
    { parent: 'torso', shape: 'box', at: p(0, 0.85, 0), size: p(0.115, 0.08, 0.19), color: 'tunic', surface: 'cloth', wear: 'torso' },
    { parent: 'torso', shape: 'box', at: p(0, 0.93, 0), size: p(0.118, 0.028, 0.192), color: 'belt', surface: 'skin' },
    { parent: 'torso', shape: 'box', at: p(0, 0.58, 0), size: p(0.12, 0.34, 0.19), color: 'tunic', surface: 'cloth', feature: 'robe' },
    { parent: 'torso', shape: 'box', at: p(0.118, 0.8, 0), size: p(0.012, 0.3, 0.13), color: 'apron', surface: 'skin', feature: 'apron' },
    { parent: 'torso', shape: 'box', at: p(-0.135, 1.0, 0), size: p(0.02, 0.36, 0.19), pivot: p(-0.11, 1.36, 0), color: 'cape', surface: 'cloth', feature: 'cape', stride: { swing: 7, phase: 0.25 }, idle: 2 },
    // Arms swing against the legs; the right one (negative side) raises the blow.
    { id: 'armL', shape: 'box', at: p(0, 1.1, 0.235), size: p(0.05, 0.23, 0.05), pivot: p(0, 1.33, 0.235), color: 'sleeve', surface: 'cloth', stride: { swing: 20, phase: 0.5 }, wear: 'arms' },
    { id: 'armR', shape: 'box', at: p(0, 1.1, -0.235), size: p(0.05, 0.23, 0.05), pivot: p(0, 1.33, -0.235), color: 'sleeve', surface: 'cloth', stride: { swing: 20, phase: 0 }, strike: -120, wear: 'arms' },
    { parent: 'armL', shape: 'ball', at: p(0, 0.85, 0.235), size: p(0.045, 0.045, 0.045), color: 'skin', surface: 'skin' },
    { parent: 'armR', shape: 'ball', at: p(0, 0.85, -0.235), size: p(0.045, 0.045, 0.045), color: 'skin', surface: 'skin', wear: 'hand' },
    { id: 'head', parent: 'torso', shape: 'ball', at: p(0, 1.52, 0), size: p(0.12, 0.135, 0.11), pivot: p(0, 1.4, 0), color: 'skin', surface: 'skin', strike: 8, wear: 'head' },
    { parent: 'head', shape: 'ball', at: p(-0.025, 1.6, 0), size: p(0.12, 0.09, 0.117), color: 'hair', surface: 'fur', feature: '!hat' },
    { parent: 'head', shape: 'ball', at: p(-0.06, 1.5, 0), size: p(0.06, 0.1, 0.09), color: 'hair', surface: 'fur' },
    { parent: 'head', shape: 'ball', at: p(0.108, 1.535, 0.042), size: p(0.016, 0.018, 0.016), color: 'eye', surface: 'smooth', mirror: true },
    { parent: 'head', shape: 'ball', at: p(0.12, 1.505, 0), size: p(0.02, 0.025, 0.018), color: 'skin', surface: 'skin' },
    { parent: 'head', shape: 'ball', at: p(0.065, 1.425, 0), size: p(0.055, 0.075, 0.075), color: 'hair', surface: 'fur', feature: 'beard' },
    { parent: 'head', shape: 'ball', at: p(0, 1.6, 0), size: p(0.19, 0.014, 0.19), color: 'hat', surface: 'cloth', feature: 'hat' },
    { parent: 'head', shape: 'cone', at: p(0, 1.6, 0), size: p(0.11, 0.16, 0.11), color: 'hat', surface: 'cloth', feature: 'hat' },
  ];
}

/** A squat hopper: round body, wide head, bulging eyes, big folded hind legs, small forelegs. */
export function hopper(size: number): ArtPart[] {
  const p = (f: number, u: number, s: number): Vec3 => [f * size, u * size, s * size];
  return [
    { id: 'body', shape: 'ball', at: p(-0.04, 0.2, 0), size: p(0.25, 0.16, 0.22), color: 'coat', surface: 'scales', idle: 2 },
    { parent: 'body', shape: 'ball', at: p(0.02, 0.13, 0), size: p(0.24, 0.1, 0.19), color: 'belly', surface: 'smooth' },
    { id: 'head', parent: 'body', shape: 'ball', at: p(0.16, 0.24, 0), size: p(0.14, 0.11, 0.18), pivot: p(0.05, 0.2, 0), color: 'coat', surface: 'scales', strike: 18 },
    { parent: 'head', shape: 'ball', at: p(0.18, 0.34, 0.1), size: p(0.055, 0.055, 0.055), color: 'eye', surface: 'smooth', mirror: true },
    { parent: 'head', shape: 'ball', at: p(0.225, 0.35, 0.115), size: p(0.022, 0.03, 0.02), color: 'pupil', surface: 'glow', mirror: true },
    { parent: 'head', shape: 'ball', at: p(0.2, 0.15, 0), size: p(0.1, 0.05, 0.13), color: 'belly', surface: 'smooth', idle: 6 },
    { id: 'haunch', shape: 'ball', at: p(-0.12, 0.12, 0.19), size: p(0.15, 0.09, 0.07), pivot: p(-0.08, 0.18, 0.17), color: 'coat', surface: 'scales', mirror: true, stride: { swing: 30, phase: 0 } },
    { parent: 'haunch', shape: 'ball', at: p(0.02, 0.025, 0.24), size: p(0.12, 0.025, 0.06), color: 'coat', surface: 'scales', mirror: true },
    { shape: 'ball', at: p(0.15, 0.07, 0.12), size: p(0.03, 0.08, 0.03), pivot: p(0.15, 0.15, 0.12), color: 'coat', surface: 'scales', mirror: true, stride: { swing: 20, phase: 0.5 } },
  ];
}

/** Antlers: two forked beams of cones, for a head at `at`. */
function antlers(at: Vec3, reach: number): ArtPart[] {
  const beam = (side: number): ArtPart[] => [
    { parent: 'head', shape: 'cone', at: v(at[0], at[1], side * 0.05), size: v(0.018, reach, 0.018), tilt: -25, roll: side * 30, color: 'antler', surface: 'shell', feature: 'antlers' },
    { parent: 'head', shape: 'cone', at: v(at[0] - 0.04, at[1] + reach * 0.45, side * (0.05 + reach * 0.22)), size: v(0.012, reach * 0.5, 0.012), tilt: 20, roll: side * 10, color: 'antler', surface: 'shell', feature: 'antlers' },
    { parent: 'head', shape: 'cone', at: v(at[0] - 0.09, at[1] + reach * 0.7, side * (0.05 + reach * 0.35)), size: v(0.011, reach * 0.4, 0.011), tilt: -10, roll: side * 35, color: 'antler', surface: 'shell', feature: 'antlers' },
  ];
  return [...beam(1), ...beam(-1)];
}

// Colour choices are '#rrggbb' or '@palette' (content/palettes.ts): palette picks drift a little,
// so every individual wears its own shade.
const SKIN = ['@skin'];
const HAIR = ['@hair'];

export const LOOKS: Record<ArtId, ArtDef> = {
  wolf: {
    ppm: 18,
    parts: fourLegs({
      back: 0.74, body: v(0.42, 0.2, 0.16), leg: 0.06, legAt: 0.27, legApart: 0.09, swing: 30,
      neck: 0.2, neckTilt: 60, neckThick: 0.13, head: v(0.13, 0.11, 0.1), muzzle: 0.16, muzzleThick: 0.055,
      ears: v(0.035, 0.09, 0.025), tail: v(0.055, 0.34, 0.05), tailDroop: 125, eyeSize: 0.02,
    }),
    colors: {
      coat: ['@fur.grey'],
      belly: ['@fur.pale'],
      legs: ['#5c5a60', '#6a6660'],
      tail: ['#5a5a62', '#6e6a64'],
      muzzle: ['#8a8680'],
      nose: ['#1a1818'],
      eye: ['#f0c83c'],
    },
    gait: { stride: 1.6, bounce: 0.03 },
    attack: { lean: 12, lunge: 0.25 },
    vary: 0.1,
  },
  deer: {
    ppm: 18,
    parts: [
      ...fourLegs({
        back: 1.0, body: v(0.42, 0.17, 0.15), leg: 0.035, legAt: 0.28, legApart: 0.08, swing: 26,
        neck: 0.36, neckTilt: 30, neckThick: 0.08, head: v(0.11, 0.08, 0.075), muzzle: 0.12, muzzleThick: 0.05,
        ears: v(0.04, 0.11, 0.02), tail: v(0.05, 0.1, 0.045), tailDroop: 70, eyeSize: 0.018,
      }),
      ...antlers(v(0.7, 1.43, 0), 0.32),
    ],
    colors: {
      coat: ['@fur.brown'],
      belly: ['@fur.cream'],
      legs: ['#7a5236', '#86603e'],
      tail: ['#f0ece2'],
      muzzle: ['#6e4c34'],
      nose: ['#1e1a18'],
      eye: ['#1a1410'],
      antler: ['@horn'],
    },
    features: { antlers: 0.45 },
    gait: { stride: 2, bounce: 0.04 },
    attack: { lean: -6, lunge: 0.15 },
    vary: 0.08,
  },
  villager: {
    ppm: 18,
    parts: twoLegs(1.72),
    colors: {
      skin: SKIN,
      hair: HAIR,
      eye: ['#1a1410'],
      tunic: ['@cloth.plain'],
      sleeve: ['#6a5a44', '#5a6e3c', '#8c7850'],
      legs: ['@cloth.dark'],
      boots: ['@leather'],
      belt: ['@leather'],
      apron: ['@cloth.undyed'],
      hat: ['#c8a85a', '#6a5038'],
      cape: ['#6a3030'],
    },
    features: { beard: 0.3, hat: 0.2, robe: 0.1, cape: 0 },
    gait: { stride: 1.3, bounce: 0.025 },
    attack: { lean: 10, lunge: 0.1 },
    vary: 0.07,
  },
  /** A hedge-mage: robed, usually hooded and dark. */
  hexer: {
    ppm: 18,
    parts: twoLegs(1.74),
    colors: {
      skin: SKIN,
      hair: ['#d8d0c0', '#6e6a66', '#1e1a18'],
      eye: ['#d8c0ff'],
      tunic: ['#3c3250', '#2e2a46', '#463040'],
      sleeve: ['#3c3250', '#2e2a46'],
      legs: ['#2a2430'],
      boots: ['@leather'],
      belt: ['#b8a050'],
      apron: ['#c8b898'],
      hat: ['#2e2640', '#3a2e52'],
      cape: ['#4a2a5a', '#2a3a5a'],
    },
    features: { robe: 1, hat: 0.8, beard: 0.45, cape: 0.5 },
    gait: { stride: 1.3, bounce: 0.02 },
    attack: { lean: 8, lunge: 0.06 },
    vary: 0.06,
  },
  /** A cutthroat: patched leathers, a rag cape, rough hair. */
  raider: {
    ppm: 18,
    parts: twoLegs(1.78),
    colors: {
      skin: SKIN,
      hair: HAIR,
      eye: ['#1a1410'],
      tunic: ['@rag', '@leather'],
      sleeve: ['@leather'],
      legs: ['@cloth.dark'],
      boots: ['@leather'],
      belt: ['@leather'],
      apron: ['@rag'],
      hat: ['#4a3a2c'],
      cape: ['#5a2a24', '#3a3a30'],
    },
    features: { beard: 0.6, cape: 0.35, hat: 0.25 },
    gait: { stride: 1.5, bounce: 0.03 },
    attack: { lean: 14, lunge: 0.14 },
    vary: 0.08,
  },
  player: {
    ppm: 18,
    parts: twoLegs(1.75),
    colors: {
      skin: SKIN,
      hair: HAIR,
      eye: ['#1a1410'],
      // Each friend gets their own colour.
      tunic: ['#3c5aa0', '#a08c32', '#783c8c', '#328c78'],
      sleeve: ['#5a4632'],
      legs: ['#463e50'],
      boots: ['#3a2a1c'],
      belt: ['#2a1e14'],
      apron: ['#c8b898'],
      hat: ['#6a5038'],
      cape: ['#962828', '#28508c', '#2e6e3a', '#6e2e6e'],
    },
    features: { cape: 1, beard: 0.25 },
    gait: { stride: 1.5, bounce: 0.03 },
    attack: { lean: 10, lunge: 0.12 },
  },
  toad: {
    ppm: 18,
    parts: hopper(1.15),
    colors: {
      coat: ['@hide.toad'],
      belly: ['#b8b070', '#a8a468'],
      eye: ['#d8bc3c', '#c8a030'],
      pupil: ['#141414'],
    },
    gait: { stride: 0.8, bounce: 0.16, hop: true },
    attack: { lean: 8, lunge: 0.2 },
    vary: 0.2,
  },
};
