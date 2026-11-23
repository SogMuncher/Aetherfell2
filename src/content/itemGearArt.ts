// Gear pictures as art pieces: weapon parts (grip, guard, blade, haft, heads) and the four kinds of armour
import type { ArtDef, ArtId, ArtPart } from '../types';

/**
 * Pieces of gear pictures, built by the one sprite assembler like creatures and trees. A gear form
 * lists its pieces (content/gear.ts `parts`, e.g. grip + guard + blade + pommel); the item picture
 * is those pieces together, in the colours of the item's material and quality, stretched by its
 * numbers (reach makes it longer, damage heavier). Shared colour slots let pieces combine:
 * metal (the material), fittings (bronze, gold when fine), grip, haft, gem, rune (an enchantment's glow),
 * shell and trim (armour). Features: gem, rune, plate (hard armour), all switched on per item.
 *
 * Weapons stand upright from the butt (up 0) to the tip (up 1) and lie corner to corner in their
 * picture (`tilt`); their cutting edge is on the back side (-forward), which ends up on the LEFT,
 * upper side of the picture, so in the hand it faces the foe. Armour stands upright, its front to the viewer.
 */

const WEAPON = { metal: ['@iron'], fittings: ['@brass'], grip: ['@leather'], haft: ['@haft'], gem: ['#5ac8e6'], rune: ['@aether'] };
const EDGE = '#eef2f6';

function weapon(parts: ArtPart[]): ArtDef {
  return { colors: WEAPON, features: { gem: 0, rune: 0 }, tilt: 45, variants: 1, views: 1, parts };
}

const ARMOUR = { shell: ['@leather'], trim: ['@brass'], rune: ['@aether'] };

function armour(parts: ArtPart[]): ArtDef {
  return { colors: ARMOUR, features: { plate: 0, rune: 0 }, variants: 1, views: 1, parts };
}

/** A garment piece that is cloth when soft and metal plate when hard. */
function worn(p: ArtPart): ArtPart[] {
  return [
    { ...p, surface: 'cloth', feature: '!plate' },
    { ...p, surface: 'metal', feature: 'plate' },
  ];
}

/** A haft: wood with a leather wrap where the hands go. */
const HAFT: ArtPart[] = [
  { shape: 'drum', at: [0, 0.46, 0], size: [0.036, 0.46, 0.036], color: 'haft', surface: 'wood' },
  { shape: 'drum', at: [0, 0.12, 0], size: [0.042, 0.09, 0.042], color: 'grip', surface: 'cloth' },
];

export const ITEM_GEAR_ART: Record<ArtId, ArtDef> = {
  'item.grip': weapon([{ shape: 'drum', at: [0, 0.1, 0], size: [0.042, 0.1, 0.042], color: 'grip', surface: 'cloth' }]),
  'item.guard': weapon([{ shape: 'box', at: [0, 0.215, 0], size: [0.17, 0.03, 0.045], color: 'fittings', surface: 'metal' }]),
  'item.blade': weapon([
    { shape: 'box', at: [0, 0.58, 0], size: [0.098, 0.35, 0.019], color: 'metal', surface: 'metal' },
    { shape: 'cone', at: [0, 0.93, 0], size: [0.098, 0.12, 0.019], color: 'metal', surface: 'metal' },
    { shape: 'box', at: [-0.091, 0.58, 0], size: [0.016, 0.35, 0.022], color: EDGE, surface: 'metal' },
    { shape: 'box', at: [0.016, 0.55, 0], size: [0.018, 0.28, 0.026], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.pommel': weapon([
    { shape: 'ball', at: [0, -0.02, 0], size: [0.065, 0.055, 0.065], color: 'fittings', surface: 'metal' },
    { shape: 'ball', at: [0, -0.02, 0.045], size: [0.03, 0.03, 0.03], color: 'gem', surface: 'glow', feature: 'gem' },
  ]),
  'item.haft': weapon(HAFT),
  'item.axeBit': weapon([
    { shape: 'box', at: [-0.165, 0.84, 0], size: [0.165, 0.12, 0.024], color: 'metal', surface: 'metal' },
    { shape: 'box', at: [-0.33, 0.84, 0], size: [0.045, 0.24, 0.027], color: 'metal', surface: 'metal' },
    { shape: 'box', at: [-0.375, 0.84, 0], size: [0.018, 0.24, 0.03], color: EDGE, surface: 'metal' },
    { shape: 'box', at: [0.068, 0.84, 0], size: [0.06, 0.075, 0.06], color: 'metal', surface: 'metal' },
    { shape: 'box', at: [-0.195, 0.84, 0.027], size: [0.09, 0.024, 0.006], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.hammerHead': weapon([
    { shape: 'box', at: [0, 0.88, 0], size: [0.255, 0.128, 0.12], color: 'metal', surface: 'metal' },
    { shape: 'box', at: [-0.262, 0.88, 0], size: [0.022, 0.143, 0.135], color: EDGE, surface: 'metal' },
    { shape: 'drum', at: [0, 0.78, 0], size: [0.075, 0.075, 0.075], color: 'fittings', surface: 'metal' },
    { shape: 'box', at: [0, 0.88, 0.12], size: [0.135, 0.024, 0.006], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.clubHead': weapon([
    { shape: 'ball', at: [0, 0.82, 0], size: [0.15, 0.27, 0.15], color: 'haft', surface: 'wood' },
    { shape: 'ball', at: [-0.15, 0.86, 0], size: [0.038, 0.038, 0.038], color: 'metal', surface: 'metal' },
    { shape: 'ball', at: [0.15, 0.78, 0], size: [0.038, 0.038, 0.038], color: 'metal', surface: 'metal' },
    { shape: 'ball', at: [0, 0.9, 0.15], size: [0.038, 0.038, 0.038], color: 'metal', surface: 'metal' },
  ]),
  'item.spearHead': weapon([
    { shape: 'cone', at: [0, 0.86, 0], size: [0.128, 0.42, 0.027], color: 'metal', surface: 'metal' },
    { shape: 'drum', at: [0, 0.84, 0], size: [0.075, 0.075, 0.075], color: 'fittings', surface: 'metal' },
    { shape: 'box', at: [0, 0.95, 0.027], size: [0.018, 0.12, 0.006], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.headgear': armour([
    ...worn({ shape: 'ball', at: [0, 0.48, 0], size: [0.3, 0.3, 0.3], color: 'shell' }),
    { shape: 'drum', at: [0, 0.37, 0], size: [0.32, 0.035, 0.32], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'box', at: [0, 0.42, 0.3], size: [0.035, 0.12, 0.02], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'drum', at: [0, 0.34, 0], size: [0.31, 0.03, 0.31], color: 'trim', surface: 'cloth', feature: '!plate' },
    { shape: 'ball', at: [0, 0.62, 0.22], size: [0.04, 0.03, 0.02], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.torsowear': armour([
    ...worn({ shape: 'box', at: [0, 0.48, 0], size: [0.22, 0.3, 0.1], color: 'shell' }),
    ...worn({ shape: 'ball', at: [-0.24, 0.72, 0], size: [0.1, 0.08, 0.1], color: 'shell' }),
    ...worn({ shape: 'ball', at: [0.24, 0.72, 0], size: [0.1, 0.08, 0.1], color: 'shell' }),
    { shape: 'drum', at: [-0.28, 0.52, 0], size: [0.06, 0.16, 0.06], color: 'shell', surface: 'cloth', feature: '!plate', tilt: -10 },
    { shape: 'drum', at: [0.28, 0.52, 0], size: [0.06, 0.16, 0.06], color: 'shell', surface: 'cloth', feature: '!plate', tilt: 10 },
    { shape: 'box', at: [0, 0.24, 0.01], size: [0.23, 0.035, 0.1], color: 'trim', surface: 'metal' },
    { shape: 'box', at: [0, 0.5, 0.1], size: [0.02, 0.2, 0.01], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0, 0.6, 0.1], size: [0.04, 0.03, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.armwear': armour([
    ...worn({ shape: 'drum', at: [-0.17, 0.48, 0], size: [0.085, 0.22, 0.085], color: 'shell', tilt: -12 }),
    ...worn({ shape: 'drum', at: [0.17, 0.48, 0], size: [0.085, 0.22, 0.085], color: 'shell', tilt: 12 }),
    { shape: 'drum', at: [-0.2, 0.62, 0], size: [0.092, 0.025, 0.092], color: 'trim', surface: 'metal', tilt: -12 },
    { shape: 'drum', at: [0.2, 0.62, 0], size: [0.092, 0.025, 0.092], color: 'trim', surface: 'metal', tilt: 12 },
    { shape: 'drum', at: [-0.14, 0.33, 0], size: [0.09, 0.025, 0.09], color: 'trim', surface: 'metal', tilt: -12, feature: 'plate' },
    { shape: 'drum', at: [0.14, 0.33, 0], size: [0.09, 0.025, 0.09], color: 'trim', surface: 'metal', tilt: 12, feature: 'plate' },
    { shape: 'ball', at: [0.17, 0.48, 0.085], size: [0.025, 0.025, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.legwear': armour([
    ...worn({ shape: 'box', at: [0, 0.78, 0], size: [0.23, 0.08, 0.09], color: 'shell' }),
    ...worn({ shape: 'box', at: [-0.115, 0.42, 0], size: [0.105, 0.32, 0.08], color: 'shell', tilt: -4 }),
    ...worn({ shape: 'box', at: [0.115, 0.42, 0], size: [0.105, 0.32, 0.08], color: 'shell', tilt: 4 }),
    { shape: 'box', at: [0, 0.85, 0.01], size: [0.24, 0.025, 0.09], color: 'trim', surface: 'metal' },
    { shape: 'ball', at: [-0.12, 0.4, 0.07], size: [0.06, 0.05, 0.03], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0.12, 0.4, 0.07], size: [0.06, 0.05, 0.03], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [-0.12, 0.62, 0.075], size: [0.025, 0.025, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
};
