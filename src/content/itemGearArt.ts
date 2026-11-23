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
/** The dark of an opening: a visor slit, a neck hole. */
const SLIT = '#141210';

function weapon(parts: ArtPart[]): ArtDef {
  return { colors: WEAPON, features: { gem: 0, rune: 0 }, tilt: 45, variants: 1, views: 1, parts };
}

const ARMOUR = { shell: ['@leather'], trim: ['@brass'], rune: ['@aether'] };

function armour(parts: ArtPart[]): ArtDef {
  return { colors: ARMOUR, features: { plate: 0, rune: 0 }, variants: 1, views: 1, parts };
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
  // Armour: the silhouette comes from the form (a helm's visor, a cuirass's shoulder plates), the
  // colour and texture of the shell from the material (dress `surfaces`), so leather and iron share a shape.
  'item.headgear': armour([
    { shape: 'ball', at: [0, 0.5, 0], size: [0.3, 0.27, 0.3], color: 'shell', surface: 'cloth' },
    { shape: 'drum', at: [0, 0.32, 0], size: [0.29, 0.12, 0.29], color: 'shell', surface: 'cloth', feature: 'plate' },
    { shape: 'box', at: [0, 0.37, 0.28], size: [0.21, 0.024, 0.03], color: SLIT, surface: 'smooth', feature: 'plate' },
    { shape: 'box', at: [0, 0.3, 0.3], size: [0.032, 0.11, 0.02], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'drum', at: [0, 0.43, 0], size: [0.315, 0.035, 0.315], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0, 0.77, 0], size: [0.04, 0.05, 0.24], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'drum', at: [0, 0.3, 0], size: [0.32, 0.05, 0.32], color: 'trim', surface: 'cloth', feature: '!plate' },
    { shape: 'ball', at: [0, 0.6, 0.25], size: [0.04, 0.03, 0.02], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.torsowear': armour([
    { shape: 'box', at: [0, 0.42, 0], size: [0.18, 0.26, 0.1], color: 'shell', surface: 'cloth' },
    { shape: 'box', at: [0, 0.6, 0], size: [0.22, 0.1, 0.1], color: 'shell', surface: 'cloth' },
    { shape: 'drum', at: [-0.3, 0.52, 0], size: [0.07, 0.19, 0.07], color: 'shell', surface: 'cloth', tilt: 32, feature: '!plate' },
    { shape: 'drum', at: [0.3, 0.52, 0], size: [0.07, 0.19, 0.07], color: 'shell', surface: 'cloth', tilt: -32, feature: '!plate' },
    { shape: 'ball', at: [-0.23, 0.64, 0], size: [0.12, 0.1, 0.12], color: 'shell', surface: 'cloth', feature: 'plate' },
    { shape: 'ball', at: [0.23, 0.64, 0], size: [0.12, 0.1, 0.12], color: 'shell', surface: 'cloth', feature: 'plate' },
    { shape: 'ball', at: [0, 0.655, 0.09], size: [0.07, 0.035, 0.03], color: SLIT, surface: 'smooth' },
    { shape: 'box', at: [0, 0.18, 0.01], size: [0.185, 0.03, 0.105], color: 'trim', surface: 'metal' },
    { shape: 'box', at: [0, 0.42, 0.1], size: [0.016, 0.2, 0.01], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0, 0.58, 0.1], size: [0.04, 0.03, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.armwear': armour([
    { shape: 'drum', at: [-0.2, 0.52, 0], size: [0.085, 0.2, 0.085], color: 'shell', surface: 'cloth', tilt: 6 },
    { shape: 'drum', at: [0.2, 0.52, 0], size: [0.085, 0.2, 0.085], color: 'shell', surface: 'cloth', tilt: -6 },
    { shape: 'ball', at: [-0.215, 0.26, 0], size: [0.075, 0.075, 0.065], color: 'shell', surface: 'cloth' },
    { shape: 'ball', at: [0.215, 0.26, 0], size: [0.075, 0.075, 0.065], color: 'shell', surface: 'cloth' },
    { shape: 'drum', at: [-0.19, 0.71, 0], size: [0.1, 0.03, 0.1], color: 'trim', surface: 'metal', tilt: 6 },
    { shape: 'drum', at: [0.19, 0.71, 0], size: [0.1, 0.03, 0.1], color: 'trim', surface: 'metal', tilt: -6 },
    { shape: 'drum', at: [-0.205, 0.45, 0], size: [0.092, 0.022, 0.092], color: 'trim', surface: 'cloth', tilt: 6, feature: '!plate' },
    { shape: 'drum', at: [0.205, 0.45, 0], size: [0.092, 0.022, 0.092], color: 'trim', surface: 'cloth', tilt: -6, feature: '!plate' },
    { shape: 'ball', at: [-0.2, 0.52, 0.085], size: [0.03, 0.12, 0.02], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0.2, 0.52, 0.085], size: [0.03, 0.12, 0.02], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0.2, 0.6, 0.09], size: [0.025, 0.025, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
  'item.legwear': armour([
    { shape: 'box', at: [0, 0.83, 0], size: [0.22, 0.07, 0.095], color: 'shell', surface: 'cloth' },
    { shape: 'box', at: [-0.12, 0.45, 0], size: [0.095, 0.36, 0.085], color: 'shell', surface: 'cloth', tilt: 6 },
    { shape: 'box', at: [0.12, 0.45, 0], size: [0.095, 0.36, 0.085], color: 'shell', surface: 'cloth', tilt: -6 },
    { shape: 'box', at: [0, 0.89, 0.01], size: [0.225, 0.022, 0.1], color: 'trim', surface: 'metal' },
    { shape: 'box', at: [-0.15, 0.12, 0.01], size: [0.1, 0.035, 0.09], color: 'trim', surface: 'metal' },
    { shape: 'box', at: [0.15, 0.12, 0.01], size: [0.1, 0.035, 0.09], color: 'trim', surface: 'metal' },
    { shape: 'ball', at: [-0.13, 0.45, 0.08], size: [0.065, 0.055, 0.03], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [0.13, 0.45, 0.08], size: [0.065, 0.055, 0.03], color: 'trim', surface: 'metal', feature: 'plate' },
    { shape: 'ball', at: [-0.12, 0.65, 0.085], size: [0.025, 0.025, 0.012], color: 'rune', surface: 'glow', feature: 'rune' },
  ]),
};
