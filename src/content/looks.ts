// Creatures and people as art data: a body plan (content/bodyPlans.ts) with its own proportions, colours, build and extras
import type { ArtDef, ArtId, Vec3 } from '../types';
import { antlers, fourLegs, type FourLegs, headOf, hopper, twoLegs } from './bodyPlans';

/**
 * How creatures look. Each look is a handful of solid parts placed in metres ([forward, up, side]
 * from the ground between the feet). The renderer turns them into sprites from 8 directions and
 * animates them (walk, rest, knocked down, every swing and the throw) by turning parts about their joints.
 * `build` makes each shape lankier or stockier, `vary` each placed one bigger or smaller.
 * Looks are keyed by the sprite id in a thing's definition (content/things.ts).
 */

const v = (f: number, u: number, s: number): Vec3 => [f, u, s];

// Colour choices are '#rrggbb' or '@palette' (content/palettes.ts): palette picks drift a little,
// so every individual wears its own shade.
const SKIN = ['@skin'];
const HAIR = ['@hair'];

/** A deer's body, kept apart so its antlers can find its head. */
const DEER: FourLegs = {
  back: 1.0, body: v(0.42, 0.17, 0.15), leg: 0.035, legAt: 0.28, legApart: 0.08, swing: 26,
  neck: 0.36, neckTilt: 30, neckThick: 0.08, head: v(0.11, 0.08, 0.075), muzzle: 0.12, muzzleThick: 0.05,
  ears: v(0.04, 0.11, 0.02), tail: v(0.05, 0.1, 0.045), tailDroop: 70, eyeSize: 0.018, foot: 'hoof',
};

export const LOOKS: Record<ArtId, ArtDef> = {
  wolf: {
    ppm: 18,
    parts: fourLegs({
      back: 0.74, body: v(0.42, 0.17, 0.15), leg: 0.055, legAt: 0.27, legApart: 0.09, swing: 30,
      neck: 0.26, neckTilt: 52, neckThick: 0.12, head: v(0.14, 0.12, 0.11), muzzle: 0.16, muzzleThick: 0.055,
      ears: v(0.035, 0.09, 0.025), tail: v(0.055, 0.34, 0.05), tailDroop: 125, eyeSize: 0.02, foot: 'legs',
    }),
    colors: {
      coat: ['@fur.grey'],
      back: ['#4a484e', '#3e3c40', '#5a5650'],
      belly: ['@fur.pale'],
      legs: ['#5c5a60', '#6a6660'],
      tail: ['#5a5a62', '#6e6a64'],
      muzzle: ['#8a8680'],
      nose: ['#1a1818'],
      eye: ['#f0c83c'],
    },
    gait: { stride: 1.6, bounce: 0.03, sway: 2 },
    attack: { lean: 12, lunge: 0.25 },
    build: { tall: [0.92, 1.06], wide: [0.88, 1.15] },
    vary: 0.1,
  },
  deer: {
    ppm: 18,
    parts: [...fourLegs(DEER), ...antlers(v(headOf(DEER)[0] - 0.02, headOf(DEER)[1] + 0.06, 0), 0.32)],
    colors: {
      coat: ['@fur.brown'],
      back: ['#6a4630', '#5e3e2a'],
      belly: ['@fur.cream'],
      hoof: ['#2a2420'],
      legs: ['#7a5236', '#86603e'],
      tail: ['#f0ece2'],
      muzzle: ['#6e4c34'],
      nose: ['#1e1a18'],
      eye: ['#1a1410'],
      antler: ['@horn'],
    },
    features: { antlers: 0.45 },
    gait: { stride: 2, bounce: 0.04, sway: 2 },
    attack: { lean: -6, lunge: 0.15 },
    build: { tall: [0.94, 1.06], wide: [0.9, 1.1] },
    vary: 0.08,
  },
  villager: {
    ppm: 21,
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
    gait: { stride: 1.3, bounce: 0.025, sway: 4 },
    attack: { lean: 10, lunge: 0.1 },
    build: { tall: [0.92, 1.06], wide: [0.86, 1.2] },
    vary: 0.07,
  },
  /** A hedge-mage: robed, usually hooded and dark. */
  hexer: {
    ppm: 21,
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
    gait: { stride: 1.3, bounce: 0.02, sway: 3 },
    attack: { lean: 8, lunge: 0.06 },
    build: { tall: [0.95, 1.06], wide: [0.84, 1.04] },
    vary: 0.06,
  },
  /** A cutthroat: patched leathers, a rag cape, rough hair. */
  raider: {
    ppm: 21,
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
    gait: { stride: 1.5, bounce: 0.03, sway: 4 },
    attack: { lean: 14, lunge: 0.14 },
    build: { tall: [0.95, 1.08], wide: [0.95, 1.25] },
    vary: 0.08,
  },
  player: {
    ppm: 21,
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
    gait: { stride: 1.5, bounce: 0.03, sway: 4 },
    attack: { lean: 10, lunge: 0.12 },
    build: { tall: [0.97, 1.03], wide: [0.94, 1.08] },
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
    build: { tall: [0.85, 1.1], wide: [0.9, 1.2] },
    vary: 0.2,
  },
};
