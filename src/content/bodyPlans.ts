// Body plans as reusable parts (two legs, four legs, hopper, antlers): segmented limbs on joints, roles for body moves
import type { ArtPart, Vec3 } from '../types';

/**
 * Each plan returns plain parts ([forward, up, side] metres from the ground between the feet, side
 * positive on the left) so a look (content/looks.ts) can reuse it with its own proportions, colours
 * and extras. Trunks are boxes on purpose: a block shows plainly whether it is seen side-on or head-on
 * as it turns, a ball looks the same from everywhere. Limbs come in two halves on their own joints
 * (thigh and shin, upper arm and forearm) so knees and elbows bend. `act` names each joint's role in
 * the body moves (content/moves.ts); `wear` says which gear slot covers or holds there.
 */

const v = (f: number, u: number, s: number): Vec3 => [f, u, s];

export interface FourLegs {
  /** Height of the back. */
  back: number;
  /** Half the body's length, depth and width. */
  body: Vec3;
  /** Leg thickness (radius) at the top; the lower leg is thinner. */
  leg: number;
  /** Where the legs sit forward/back from the middle, and how far apart. */
  legAt: number;
  legApart: number;
  /** How much the legs swing (degrees). */
  swing: number;
  /** Neck: length, how far it leans forward (degrees from upright), thickness. */
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
  /** Colour slot of the feet (paws in the leg colour, or hooves). */
  foot: string;
}

/** Where a four-legged animal's head sits (antlers, horns and such grow from there). */
export function headOf(p: FourLegs): Vec3 {
  const nt = (p.neckTilt * Math.PI) / 180;
  const base = v(p.body[0] * 0.8, p.back - p.body[1] + p.body[1] * 0.35, 0);
  return v(base[0] + Math.sin(nt) * p.neck + p.head[0] * 0.4, base[1] + Math.cos(nt) * p.neck, 0);
}

/** A four-legged animal: barrel, chest and haunch, legs in two halves that trot, neck, head, muzzle and jaw, ears, eyes, tail. */
export function fourLegs(p: FourLegs): ArtPart[] {
  const cy = p.back - p.body[1];
  const legLen = cy;
  const knee = legLen * 0.48;
  const neckBase = v(p.body[0] * 0.8, cy + p.body[1] * 0.35, 0);
  const nt = (p.neckTilt * Math.PI) / 180;
  const neckMid = v(neckBase[0] + Math.sin(nt) * p.neck * 0.5, neckBase[1] + Math.cos(nt) * p.neck * 0.5, 0);
  const h = headOf(p);
  const b = p.body;
  const limb = (id: string, at: number, thick: number, phase: number): ArtPart[] => [
    { id, shape: 'box', at: v(at, (cy + knee) / 2, p.legApart), size: v(thick * 1.3, (cy - knee) / 2 + thick * 0.5, thick), pivot: v(at, cy, p.legApart), color: 'coat', surface: 'fur', mirror: true, stride: { swing: p.swing, phase, lift: 0.05 } },
    { id: `${id}Low`, parent: id, shape: 'box', at: v(at, knee / 2 + p.leg * 0.3, p.legApart), size: v(thick * 0.7, knee / 2, thick * 0.7), pivot: v(at, knee, p.legApart), color: 'legs', surface: 'fur', mirror: true, stride: { swing: p.swing * 1.2, phase: phase + 0.12, fold: true } },
    { parent: `${id}Low`, shape: 'box', at: v(at + p.leg * 0.25, p.leg * 0.32, p.legApart), size: v(p.leg * 0.95, p.leg * 0.32, p.leg * 0.75), color: p.foot, surface: 'smooth', mirror: true },
  ];
  const parts: ArtPart[] = [
    // The barrel is a block (reads side-on or head-on), rounded off by a deep chest and a haunch.
    { id: 'body', shape: 'box', at: v(0, cy, 0), size: v(b[0] * 0.62, b[1] * 0.72, b[2] * 0.8), color: 'coat', surface: 'fur', idle: 1.5 },
    { parent: 'body', shape: 'ball', at: v(b[0] * 0.55, cy, 0), size: v(b[0] * 0.42, b[1] * 0.98, b[2] * 1.0), color: 'coat', surface: 'fur' },
    { parent: 'body', shape: 'ball', at: v(-b[0] * 0.6, cy + b[1] * 0.08, 0), size: v(b[0] * 0.42, b[1] * 0.98, b[2] * 1.0), color: 'coat', surface: 'fur' },
    { parent: 'body', shape: 'box', at: v(0.05, cy - b[1] * 0.45, 0), size: v(b[0] * 0.45, b[1] * 0.35, b[2] * 0.7), color: 'belly', surface: 'fur' },
    { parent: 'body', shape: 'box', at: v(0, cy + b[1] * 0.68, 0), size: v(b[0] * 0.65, b[1] * 0.14, b[2] * 0.55), color: 'back', surface: 'fur' },
    // Legs trot in diagonal pairs; the lower half folds back as it lifts.
    ...limb('foreleg', p.legAt, p.leg, 0),
    ...limb('hindleg', -p.legAt, p.leg * 1.2, 0.5),
    { id: 'neck', shape: 'box', at: neckMid, size: v(p.neckThick, p.neck * 0.62, p.neckThick * 0.8), tilt: p.neckTilt, pivot: neckBase, color: 'coat', surface: 'fur', idle: 3, act: 'neck' },
    { id: 'head', parent: 'neck', shape: 'ball', at: h, size: p.head, color: 'coat', surface: 'fur' },
    { parent: 'head', shape: 'box', at: v(h[0] - p.head[0] * 0.1, h[1] + p.head[1] * 0.3, 0), size: v(p.head[0] * 0.8, p.head[1] * 0.55, p.head[2] * 0.85), color: 'back', surface: 'fur' },
    { parent: 'head', shape: 'ball', at: v(h[0] + p.head[0] * 0.55, h[1] + p.head[1] * 0.4, p.head[2] * 0.58), size: v(p.eyeSize, p.eyeSize, p.eyeSize), color: 'eye', surface: 'glow', mirror: true },
    { parent: 'head', shape: 'cone', at: v(h[0] - p.head[0] * 0.25, h[1] + p.head[1] * 0.65, p.head[2] * 0.55), size: p.ears, roll: 18, tilt: -10, color: 'coat', surface: 'fur', mirror: true },
    { parent: 'body', shape: 'cone', at: v(-b[0] * 0.98, cy + b[1] * 0.45, 0), size: p.tail, tilt: -p.tailDroop, pivot: v(-b[0] * 0.98, cy + b[1] * 0.45, 0), color: 'tail', surface: 'fur', idle: 12, stride: { swing: 8, phase: 0.25 } },
  ];
  if (p.muzzle > 0) {
    const m = v(h[0] + p.head[0] * 0.5 + p.muzzle * 0.5, h[1] - p.head[1] * 0.18, 0);
    parts.push(
      { parent: 'head', shape: 'box', at: m, size: v(p.muzzle * 0.5, p.muzzleThick * 0.8, p.muzzleThick * 0.85), tilt: -8, color: 'muzzle', surface: 'fur' },
      { parent: 'head', shape: 'box', at: v(m[0] - p.muzzle * 0.05, m[1] - p.muzzleThick * 0.85, 0), size: v(p.muzzle * 0.42, p.muzzleThick * 0.3, p.muzzleThick * 0.7), color: 'belly', surface: 'fur' },
      { parent: 'head', shape: 'box', at: v(m[0] + p.muzzle * 0.48, m[1] + p.muzzleThick * 0.45, 0), size: v(p.muzzleThick * 0.3, p.muzzleThick * 0.3, p.muzzleThick * 0.45), color: 'nose', surface: 'smooth' },
    );
  }
  return parts;
}

/**
 * A person: hips, thighs and shins with boots, a block of a chest over a narrower waist, belt and
 * tunic hem, upper arms and forearms with hands, neck, head with jaw, nose, brows, ears and hair,
 * and optional robe, apron, beard, hat and cape. The right hand holds the weapon.
 */
export function twoLegs(height = 1.75): ArtPart[] {
  const k = height / 1.75;
  const p = (f: number, u: number, s: number): Vec3 => [f * k, u * k, s * k];
  const arm = (side: number, id: string, fore: string, role: string, foreRole: string, phase: number): ArtPart[] => [
    { id, parent: 'torso', shape: 'box', at: p(0, 1.3, side * 0.222), size: p(0.052, 0.14, 0.05), pivot: p(0, 1.43, side * 0.222), color: 'sleeve', surface: 'cloth', stride: { swing: 22, phase }, act: role, wear: 'arms' },
    { parent: id, shape: 'ball', at: p(0, 1.4, side * 0.214), size: p(0.062, 0.055, 0.06), color: 'sleeve', surface: 'cloth' },
    { id: fore, parent: id, shape: 'box', at: p(0.004, 1.04, side * 0.224), size: p(0.044, 0.125, 0.044), pivot: p(0, 1.16, side * 0.222), color: 'sleeve', surface: 'cloth', stride: { swing: -24, phase, fold: true }, act: foreRole, wear: 'arms' },
    { parent: fore, shape: 'box', at: p(0.008, 0.875, side * 0.224), size: p(0.036, 0.048, 0.028), color: 'skin', surface: 'skin', ...(side < 0 ? { wear: 'hand' } : {}) },
  ];
  return [
    // Legs: thigh and shin, the knee folding as the foot comes through.
    { id: 'leg', shape: 'box', at: p(0, 0.71, 0.086), size: p(0.07, 0.21, 0.066), pivot: p(0, 0.92, 0.086), color: 'legs', surface: 'cloth', mirror: true, wear: 'legs', stride: { swing: 26, phase: 0, lift: 0.04 } },
    { id: 'shin', parent: 'leg', shape: 'box', at: p(0, 0.3, 0.086), size: p(0.056, 0.2, 0.052), pivot: p(0, 0.5, 0.086), color: 'legs', surface: 'cloth', mirror: true, wear: 'legs', stride: { swing: 42, phase: 0.12, fold: true } },
    { parent: 'shin', shape: 'box', at: p(0, 0.15, 0.086), size: p(0.064, 0.065, 0.06), color: 'boots', surface: 'skin', mirror: true },
    { parent: 'shin', shape: 'box', at: p(0.035, 0.045, 0.086), size: p(0.11, 0.045, 0.058), color: 'boots', surface: 'skin', mirror: true },
    { shape: 'box', at: p(0, 0.93, 0), size: p(0.095, 0.07, 0.15), color: 'legs', surface: 'cloth' },
    // Chest: a block, broad at the shoulders, over a narrower waist; it twists from the hips.
    { id: 'torso', shape: 'box', at: p(0, 1.3, 0), size: p(0.11, 0.165, 0.172), pivot: p(0, 0.98, 0), color: 'tunic', surface: 'cloth', idle: 1, act: 'torso', wear: 'torso' },
    { parent: 'torso', shape: 'box', at: p(0, 1.07, 0), size: p(0.096, 0.09, 0.148), color: 'tunic', surface: 'cloth', wear: 'torso' },
    { parent: 'torso', shape: 'box', at: p(0, 0.9, 0), size: p(0.104, 0.07, 0.158), color: 'tunic', surface: 'cloth', feature: '!robe' },
    { parent: 'torso', shape: 'box', at: p(0, 0.99, 0), size: p(0.101, 0.024, 0.152), color: 'belt', surface: 'skin' },
    { parent: 'torso', shape: 'box', at: p(0.1, 0.99, 0), size: p(0.006, 0.02, 0.022), color: '#b8a058', surface: 'metal' },
    { parent: 'torso', shape: 'box', at: p(0.095, 1.38, 0), size: p(0.02, 0.06, 0.05), color: 'skin', surface: 'skin' },
    { parent: 'torso', shape: 'box', at: p(0, 0.6, 0), size: p(0.12, 0.38, 0.18), color: 'tunic', surface: 'cloth', feature: 'robe' },
    { parent: 'torso', shape: 'box', at: p(0.112, 0.86, 0), size: p(0.01, 0.3, 0.12), color: 'apron', surface: 'skin', feature: 'apron' },
    { parent: 'torso', shape: 'box', at: p(-0.13, 1.0, 0), size: p(0.018, 0.4, 0.18), pivot: p(-0.115, 1.42, 0), color: 'cape', surface: 'cloth', feature: 'cape', stride: { swing: 7, phase: 0.25 }, idle: 2 },
    // Arms: the right one (negative side) strikes and throws.
    ...arm(1, 'armL', 'foreL', 'off', 'offFore', 0.5),
    ...arm(-1, 'armR', 'foreR', 'arm', 'fore', 0),
    // Head: neck, skull, jaw, nose, brows, ears, hair; beard and hat by feature.
    { parent: 'torso', shape: 'drum', at: p(0, 1.5, 0), size: p(0.048, 0.045, 0.048), color: 'skin', surface: 'skin' },
    { id: 'head', parent: 'torso', shape: 'ball', at: p(0, 1.635, 0), size: p(0.103, 0.118, 0.092), pivot: p(0, 1.52, 0), color: 'skin', surface: 'skin', act: 'head', wear: 'head' },
    { parent: 'head', shape: 'box', at: p(0.025, 1.565, 0), size: p(0.07, 0.04, 0.068), color: 'skin', surface: 'skin' },
    { parent: 'head', shape: 'box', at: p(0.1, 1.618, 0), size: p(0.018, 0.026, 0.014), color: 'skin', surface: 'skin' },
    { parent: 'head', shape: 'ball', at: p(0.088, 1.645, 0.038), size: p(0.014, 0.012, 0.016), color: 'eye', surface: 'smooth', mirror: true },
    { parent: 'head', shape: 'box', at: p(0.092, 1.667, 0.038), size: p(0.012, 0.007, 0.028), color: 'hair', surface: 'fur', mirror: true },
    { parent: 'head', shape: 'ball', at: p(-0.005, 1.63, 0.092), size: p(0.016, 0.028, 0.012), color: 'skin', surface: 'skin', mirror: true },
    { parent: 'head', shape: 'ball', at: p(-0.018, 1.69, 0), size: p(0.105, 0.072, 0.098), color: 'hair', surface: 'fur', feature: '!hat' },
    { parent: 'head', shape: 'box', at: p(-0.06, 1.62, 0), size: p(0.05, 0.08, 0.085), color: 'hair', surface: 'fur' },
    { parent: 'head', shape: 'box', at: p(0.07, 1.555, 0), size: p(0.045, 0.06, 0.075), color: 'hair', surface: 'fur', feature: 'beard' },
    { parent: 'head', shape: 'drum', at: p(0, 1.72, 0), size: p(0.17, 0.012, 0.17), color: 'hat', surface: 'cloth', feature: 'hat' },
    { parent: 'head', shape: 'cone', at: p(0, 1.72, 0), size: p(0.1, 0.15, 0.1), color: 'hat', surface: 'cloth', feature: 'hat' },
  ];
}

/** A squat hopper: round body, wide head that snaps, bulging eyes, big folded hind legs, small forelegs. */
export function hopper(size: number): ArtPart[] {
  const p = (f: number, u: number, s: number): Vec3 => [f * size, u * size, s * size];
  return [
    { id: 'body', shape: 'ball', at: p(-0.04, 0.2, 0), size: p(0.25, 0.16, 0.22), color: 'coat', surface: 'scales', idle: 2 },
    { parent: 'body', shape: 'ball', at: p(0.02, 0.13, 0), size: p(0.24, 0.1, 0.19), color: 'belly', surface: 'smooth' },
    { parent: 'body', shape: 'ball', at: p(-0.1, 0.3, 0.08), size: p(0.05, 0.03, 0.05), color: 'belly', surface: 'scales', mirror: true },
    { id: 'head', parent: 'body', shape: 'ball', at: p(0.16, 0.24, 0), size: p(0.14, 0.11, 0.18), pivot: p(0.05, 0.2, 0), color: 'coat', surface: 'scales', act: 'neck' },
    { parent: 'head', shape: 'ball', at: p(0.18, 0.34, 0.1), size: p(0.055, 0.055, 0.055), color: 'eye', surface: 'smooth', mirror: true },
    { parent: 'head', shape: 'ball', at: p(0.225, 0.35, 0.115), size: p(0.022, 0.03, 0.02), color: 'pupil', surface: 'glow', mirror: true },
    { parent: 'head', shape: 'box', at: p(0.25, 0.2, 0), size: p(0.04, 0.008, 0.14), color: 'pupil', surface: 'smooth' },
    { parent: 'head', shape: 'ball', at: p(0.2, 0.15, 0), size: p(0.1, 0.05, 0.13), color: 'belly', surface: 'smooth', idle: 6 },
    { id: 'haunch', shape: 'ball', at: p(-0.12, 0.12, 0.19), size: p(0.15, 0.09, 0.07), pivot: p(-0.08, 0.18, 0.17), color: 'coat', surface: 'scales', mirror: true, stride: { swing: 30, phase: 0 } },
    { parent: 'haunch', shape: 'box', at: p(0.04, 0.02, 0.24), size: p(0.12, 0.02, 0.06), color: 'coat', surface: 'scales', mirror: true },
    { shape: 'box', at: p(0.15, 0.07, 0.12), size: p(0.028, 0.075, 0.028), pivot: p(0.15, 0.15, 0.12), color: 'coat', surface: 'scales', mirror: true, stride: { swing: 20, phase: 0.5 } },
    { shape: 'box', at: p(0.18, 0.01, 0.13), size: p(0.045, 0.01, 0.035), color: 'belly', surface: 'smooth', mirror: true },
  ];
}

/** Antlers: two forked beams of cones, for a head at `at`. */
export function antlers(at: Vec3, reach: number): ArtPart[] {
  const beam = (side: number): ArtPart[] => [
    { parent: 'head', shape: 'cone', at: v(at[0], at[1], side * 0.05), size: v(0.03, reach, 0.03), tilt: -25, roll: side * 30, color: 'antler', surface: 'shell', feature: 'antlers' },
    { parent: 'head', shape: 'cone', at: v(at[0] - 0.04, at[1] + reach * 0.45, side * (0.05 + reach * 0.22)), size: v(0.024, reach * 0.5, 0.024), tilt: 20, roll: side * 10, color: 'antler', surface: 'shell', feature: 'antlers' },
    { parent: 'head', shape: 'cone', at: v(at[0] - 0.09, at[1] + reach * 0.7, side * (0.05 + reach * 0.35)), size: v(0.022, reach * 0.4, 0.022), tilt: -10, roll: side * 35, color: 'antler', surface: 'shell', feature: 'antlers' },
  ];
  return [...beam(1), ...beam(-1)];
}
