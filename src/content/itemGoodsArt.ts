// Everyday item pictures as art pieces: vessels, torch, coin, key, food, pelt, shard, rune stone, bundle, lump
import type { ArtDef, ArtId, ArtPart } from '../types';

/**
 * The base shapes of items that are not gear, built by the one sprite assembler. An item names its
 * shape in `look.form` (or gets one from what it is, render/entities/itemLook.ts); vessels pick a
 * body ('item.vessel.round'…). Colours come from the item: fill (its tint or liquid), shell, glow
 * and the materials of its kind (glass, cork, clay, wood). Features: sparkle (motes in a liquid),
 * low (a vessel less than about half full), glow (a lit mark). The side axis (+) faces the viewer.
 */

const GOODS = { fill: ['@clay'], shell: ['@stone'], glass: ['#c8dce8'], cork: ['@plank'], clay: ['@clay'], wood: ['@haft'], rag: ['@rag'], glow: ['@aether'], flame: ['@ember'], bone: ['#e6dcc8'] };

function goods(parts: ArtPart[], tilt = 0): ArtDef {
  return { colors: GOODS, features: { sparkle: 0, low: 0, glow: 0, stroke1: 0.5, stroke2: 0.5, stroke3: 0.5, stroke4: 0.5, stroke5: 0.5 }, tilt, variants: 1, views: 1, parts };
}

/** Liquid seen through the front of the glass: full, or only the lower part when `low`. */
function liquid(shape: 'ball' | 'drum', y: number, r: number, h: number): ArtPart[] {
  return [
    { shape, at: [0, y, 0.01], size: [r * 0.97, h * 0.96, r * 1.04], color: 'fill', surface: 'smooth', feature: '!low' },
    { shape, at: [0, y - h * 0.45, 0.01], size: [r * 0.97, h * 0.5, r * 1.04], color: 'fill', surface: 'smooth', feature: 'low' },
    { shape: 'ball', at: [-r * 0.3, y - h * 0.2, r], size: [0.018, 0.018, 0.02], color: 'glow', surface: 'glow', feature: 'sparkle' },
    { shape: 'ball', at: [r * 0.25, y - h * 0.45, r], size: [0.014, 0.014, 0.02], color: 'glow', surface: 'glow', feature: 'sparkle' },
  ];
}

/** Neck and stopper of a glass vessel. */
function neck(y: number, r: number, h: number): ArtPart[] {
  return [
    { shape: 'drum', at: [0, y + h, 0], size: [r, h, r], color: 'glass', surface: 'smooth' },
    { shape: 'drum', at: [0, y + h * 2 + 0.03, 0], size: [r * 1.1, 0.035, r * 1.1], color: 'cork', surface: 'wood' },
  ];
}

export const ITEM_GOODS_ART: Record<ArtId, ArtDef> = {
  'item.vessel.round': goods([{ shape: 'ball', at: [0, 0.3, 0], size: [0.24, 0.24, 0.24], color: 'glass' }, ...liquid('ball', 0.3, 0.24, 0.24), ...neck(0.52, 0.06, 0.07)]),
  'item.vessel.tall': goods([{ shape: 'drum', at: [0, 0.3, 0], size: [0.13, 0.27, 0.13], color: 'glass' }, ...liquid('drum', 0.3, 0.13, 0.27), ...neck(0.55, 0.05, 0.09)]),
  'item.vessel.vial': goods([{ shape: 'drum', at: [0, 0.36, 0], size: [0.07, 0.26, 0.07], color: 'glass' }, ...liquid('drum', 0.36, 0.07, 0.26), ...neck(0.6, 0.04, 0.04)]),
  'item.vessel.jug': goods([
    { shape: 'ball', at: [0, 0.3, 0], size: [0.24, 0.26, 0.24], color: 'clay' },
    { shape: 'drum', at: [0, 0.62, 0], size: [0.1, 0.1, 0.1], color: 'clay' },
    { shape: 'drum', at: [0, 0.725, 0], size: [0.085, 0.01, 0.085], color: 'fill' },
    { shape: 'box', at: [0.25, 0.45, 0], size: [0.03, 0.14, 0.025], color: 'clay', tilt: -20 },
  ]),
  'item.vessel.pot': goods([
    { shape: 'ball', at: [0, 0.3, 0], size: [0.28, 0.25, 0.28], color: 'clay' },
    { shape: 'drum', at: [0, 0.58, 0], size: [0.13, 0.07, 0.13], color: 'clay' },
    { shape: 'drum', at: [0, 0.66, 0], size: [0.16, 0.025, 0.16], color: 'clay' },
    { shape: 'drum', at: [0, 0.69, 0], size: [0.12, 0.01, 0.12], color: 'fill' },
  ]),
  'item.torch': goods(
    [
      { shape: 'drum', at: [0, 0.34, 0], size: [0.03, 0.34, 0.03], color: 'wood', surface: 'wood' },
      { shape: 'drum', at: [0, 0.7, 0], size: [0.05, 0.08, 0.05], color: 'rag', surface: 'cloth' },
      { shape: 'cone', at: [0, 0.74, 0], size: [0.1, 0.36, 0.1], color: 'flame', surface: 'glow' },
      { shape: 'cone', at: [0, 0.76, 0.06], size: [0.05, 0.2, 0.05], color: '#fff2c0', surface: 'glow' },
    ],
    40,
  ),
  'item.coin': goods([
    { shape: 'drum', at: [0, 0.3, 0], size: [0.24, 0.03, 0.24], color: 'fill', surface: 'metal', roll: 90 },
    { shape: 'drum', at: [0, 0.3, 0.02], size: [0.17, 0.02, 0.17], color: 'fill', surface: 'smooth', roll: 90 },
  ]),
  'item.key': goods(
    [
      { shape: 'drum', at: [0, 0.85, 0], size: [0.13, 0.03, 0.13], color: 'fill', surface: 'metal', roll: 90 },
      { shape: 'drum', at: [0, 0.85, 0.02], size: [0.06, 0.03, 0.06], color: '#20242a', roll: 90 },
      { shape: 'box', at: [0, 0.45, 0], size: [0.035, 0.32, 0.03], color: 'fill', surface: 'metal' },
      { shape: 'box', at: [0.08, 0.18, 0], size: [0.07, 0.035, 0.03], color: 'fill', surface: 'metal' },
      { shape: 'box', at: [0.06, 0.28, 0], size: [0.05, 0.03, 0.03], color: 'fill', surface: 'metal' },
    ],
    45,
  ),
  'item.loaf': goods([
    { shape: 'ball', at: [0, 0.3, 0], size: [0.36, 0.18, 0.2], color: 'fill' },
    { shape: 'box', at: [-0.12, 0.44, 0.05], size: [0.015, 0.03, 0.08], color: 'bone', tilt: 20 },
    { shape: 'box', at: [0, 0.47, 0.05], size: [0.015, 0.03, 0.08], color: 'bone', tilt: 20 },
    { shape: 'box', at: [0.12, 0.44, 0.05], size: [0.015, 0.03, 0.08], color: 'bone', tilt: 20 },
  ]),
  'item.haunch': goods([
    { shape: 'ball', at: [0.06, 0.32, 0], size: [0.25, 0.2, 0.18], color: 'fill', surface: 'skin' },
    { shape: 'drum', at: [-0.24, 0.34, 0], size: [0.03, 0.12, 0.03], color: 'bone', tilt: -80 },
    { shape: 'ball', at: [-0.37, 0.34, 0], size: [0.045, 0.04, 0.04], color: 'bone' },
  ]),
  'item.pelt': goods([
    { shape: 'box', at: [0, 0.4, 0], size: [0.3, 0.24, 0.02], color: 'fill', surface: 'fur' },
    { shape: 'box', at: [-0.32, 0.6, 0], size: [0.06, 0.05, 0.015], color: 'fill', surface: 'fur', tilt: -30 },
    { shape: 'box', at: [0.32, 0.6, 0], size: [0.06, 0.05, 0.015], color: 'fill', surface: 'fur', tilt: 30 },
    { shape: 'box', at: [-0.3, 0.18, 0], size: [0.06, 0.05, 0.015], color: 'fill', surface: 'fur', tilt: 30 },
    { shape: 'box', at: [0.3, 0.18, 0], size: [0.06, 0.05, 0.015], color: 'fill', surface: 'fur', tilt: -30 },
    { shape: 'cone', at: [0, 0.16, 0], size: [0.04, 0.16, 0.015], color: 'fill', surface: 'fur', tilt: 180 },
  ]),
  'item.shard': goods(
    [
      { shape: 'cone', at: [0, 0.45, 0], size: [0.16, 0.38, 0.1], color: 'fill', surface: 'shell' },
      { shape: 'cone', at: [0, 0.45, 0], size: [0.16, 0.3, 0.1], color: 'fill', surface: 'shell', tilt: 180 },
      { shape: 'ball', at: [-0.04, 0.5, 0.06], size: [0.02, 0.06, 0.015], color: 'glow', surface: 'glow', feature: 'glow' },
    ],
    20,
  ),
  // A curled horn: a tube that thickens along a curve to a flared bell, brass at the mouthpiece and round the bell.
  'item.horn': goods([
    ...Array.from({ length: 9 }, (_, i): ArtPart => {
      const a = -160 + i * 22;
      const r = (a * Math.PI) / 180;
      return { shape: 'drum', at: [0.05 + Math.cos(r) * 0.3, 0.42 + Math.sin(r) * 0.3, 0], size: [0.025 + i * 0.008, 0.075, 0.025 + i * 0.008], tilt: -a, color: 'bone', surface: 'smooth' };
    }),
    { shape: 'cone', at: [0.05 + Math.cos(0.72) * 0.36, 0.42 + Math.sin(0.72) * 0.36, 0], size: [0.17, 0.16, 0.17], tilt: 180 - 41, color: 'bone', surface: 'smooth' },
    { shape: 'drum', at: [0.05 + Math.cos(0.72) * 0.37, 0.42 + Math.sin(0.72) * 0.37, 0], size: [0.175, 0.015, 0.175], tilt: -41, color: '#b08838', surface: 'metal' },
    { shape: 'drum', at: [0.05 + Math.cos(-2.79) * 0.3, 0.42 + Math.sin(-2.79) * 0.3, 0], size: [0.03, 0.05, 0.03], tilt: 160, color: '#b08838', surface: 'metal' },
    { shape: 'drum', at: [0.05 + Math.cos(-1.4) * 0.3, 0.42 + Math.sin(-1.4) * 0.3, 0], size: [0.06, 0.015, 0.06], tilt: 80, color: '#b08838', surface: 'metal' },
  ]),
  'item.stone': goods([
    { shape: 'ball', at: [0, 0.32, 0], size: [0.28, 0.27, 0.1], color: 'shell', surface: 'stone' },
    // A glyph of a few strokes, different on every stone (each stroke is a feature its seed rolls).
    { shape: 'box', at: [0, 0.32, 0.09], size: [0.025, 0.13, 0.02], color: 'glow', surface: 'glow', feature: 'stroke1' },
    { shape: 'box', at: [0, 0.32, 0.09], size: [0.12, 0.025, 0.02], color: 'glow', surface: 'glow', feature: 'stroke2' },
    { shape: 'box', at: [0.02, 0.34, 0.095], size: [0.025, 0.11, 0.02], color: 'glow', surface: 'glow', roll: 40, feature: 'stroke3' },
    { shape: 'box', at: [-0.02, 0.3, 0.095], size: [0.025, 0.11, 0.02], color: 'glow', surface: 'glow', roll: -40, feature: 'stroke4' },
    { shape: 'box', at: [0.06, 0.24, 0.09], size: [0.06, 0.022, 0.02], color: 'glow', surface: 'glow', feature: 'stroke5' },
    { shape: 'box', at: [-0.06, 0.4, 0.09], size: [0.022, 0.06, 0.02], color: 'glow', surface: 'glow', feature: '!stroke2' },
  ]),
  'item.bundle': goods(
    [
      { shape: 'drum', at: [-0.05, 0.5, 0], size: [0.016, 0.48, 0.016], color: 'wood', surface: 'wood' },
      { shape: 'drum', at: [0.05, 0.5, 0], size: [0.016, 0.48, 0.016], color: 'wood', surface: 'wood' },
      { shape: 'drum', at: [0, 0.5, 0], size: [0.16, 0.3, 0.1], color: 'fill', surface: 'cloth' },
      { shape: 'drum', at: [0, 0.5, 0], size: [0.17, 0.02, 0.11], color: 'rag', surface: 'cloth' },
    ],
    45,
  ),
  'item.lump': goods([
    { shape: 'ball', at: [0, 0.3, 0], size: [0.26, 0.24, 0.24], color: 'fill', surface: 'stone' },
    { shape: 'ball', at: [-0.08, 0.4, 0.2], size: [0.03, 0.03, 0.03], color: 'glow', surface: 'glow', feature: 'glow' },
  ]),
};
