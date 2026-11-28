// Underworld prop pictures: sarcophagus, bones, candles, lectern, altar, weapon rack, trap plates (merged into the art table)
import type { ArtDef, ArtId, ArtPart } from '../types';

/** The pictures of content/thingsUnder.ts, grown from parts like every prop (content/props.ts explains the measures). */

function sarcophagus(open: boolean): ArtDef {
  const parts: ArtPart[] = [
    { shape: 'box', align: true, size: [0.9, 0.3, 0.42], color: 'stone', surface: 'stone' },
    { shape: 'box', align: true, size: [0.92, 0.05, 0.44], color: 'dark', surface: 'stone' },
  ];
  if (open) {
    parts.push({ shape: 'box', align: true, size: [0.85, 0.01, 0.36], raise: 0.6, color: '#1a1612' });
    parts.push({ shape: 'box', align: true, size: [0.9, 0.06, 0.44], raise: 0.02, offset: [0, 0, 0.62], lean: 12, color: 'stone', surface: 'stone' });
    parts.push({ shape: 'ball', count: [3, 5], size: [[0.05, 0.08], 0.04, 0], spread: [0, 0.5], raise: 0.56, color: 'bone', surface: 'smooth' });
  } else {
    // The lid, a carved figure laid on it.
    parts.push({ shape: 'box', align: true, size: [0.94, 0.06, 0.46], raise: 0.6, color: 'stone', surface: 'stone' });
    parts.push({ shape: 'box', align: true, size: [0.6, 0.06, 0.16], raise: 0.72, color: 'carve', surface: 'stone' });
    parts.push({ shape: 'ball', align: true, size: [0.1, 0.07, 0], raise: 0.72, offset: [-0.7, 0, 0], color: 'carve', surface: 'stone' });
  }
  return { ppm: 20, variants: 3, vary: 0.05, colors: { stone: ['@stone'], dark: ['#3a3634', '#2e2a28'], carve: ['#8a8478', '#7a7468'], bone: ['#d8d0bc'] }, parts };
}

function plate(rune: readonly string[]): ArtDef {
  return {
    ppm: 20,
    variants: 2,
    colors: { stone: ['@stone'], rune },
    parts: [
      { shape: 'box', align: true, size: [0.48, 0.03, 0.48], color: 'stone', surface: 'stone' },
      { shape: 'box', align: true, count: 4, spread: 0.28, size: [0.05, 0.008, 0.05], raise: 0.055, color: 'rune', surface: 'glow' },
      { shape: 'box', align: true, size: [0.12, 0.008, 0.03], raise: 0.055, color: 'rune', surface: 'glow' },
    ],
  };
}

export const UNDER_PROPS: Record<ArtId, ArtDef> = {
  sarcophagus: sarcophagus(false),
  sarcophagusOpen: sarcophagus(true),
  bonePile: {
    ppm: 22,
    variants: 4,
    colors: { bone: ['#d8d0bc', '#c8bea4', '#e0d8c4'] },
    parts: [
      { shape: 'drum', count: [6, 9], size: [0.025, [0.18, 0.3], 0], spread: [0.05, 0.3], lean: [-85, -70], raise: 0.02, color: 'bone', surface: 'smooth' },
      { shape: 'ball', size: [0.11, 0.1, 0], raise: 0.04, offset: [0.08, 0, 0.05], color: 'bone', surface: 'smooth' },
      { shape: 'box', size: [0.03, 0.015, 0.02], raise: 0.1, offset: [0.18, 0, 0.03], color: '#2a2420' },
    ],
  },
  candles: {
    ppm: 24,
    variants: 3,
    colors: { iron: ['@iron'], wax: ['#e8dcc0', '#d8c8a0'], flame: ['@ember'] },
    parts: [
      { shape: 'drum', align: true, size: [0.18, 0.05, 0], color: 'iron', surface: 'metal' },
      { shape: 'drum', align: true, size: [0.04, 0.85, 0], color: 'iron', surface: 'metal' },
      { shape: 'box', align: true, size: [0.24, 0.03, 0.04], raise: 0.86, color: 'iron', surface: 'metal' },
      { shape: 'drum', align: true, count: 3, spread: 0.4, size: [0.045, [0.12, 0.18], 0], raise: 0.9, color: 'wax', surface: 'smooth' },
      { shape: 'ball', align: true, count: 3, spread: 0.4, size: [0.03, 0.05, 0], raise: 1.06, color: 'flame', surface: 'glow' },
    ],
  },
  lectern: {
    ppm: 20,
    variants: 3,
    colors: { wood: ['@plank'], page: ['#d8ccaa', '#cabd98'], cover: ['#5a2a1a', '#2a3a5a'] },
    parts: [
      { shape: 'box', align: true, size: [0.2, 0.03, 0.2], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.05, 0.5, 0.05], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.2, 0.03, 0.26], raise: 1.02, lean: -20, color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.16, 0.02, 0.22], raise: 1.08, lean: -20, color: 'cover', surface: 'cloth' },
      { shape: 'box', align: true, size: [0.14, 0.012, 0.2], raise: 1.1, lean: -20, color: 'page', surface: 'cloth' },
    ],
  },
  altar: {
    ppm: 20,
    variants: 2,
    colors: { stone: ['@stone'], cloth: ['#5a1a1a', '#1a2a5a'], glow: ['@aether'], gold: ['@gold'] },
    parts: [
      { shape: 'box', align: true, size: [0.4, 0.45, 0.7], color: 'stone', surface: 'stone' },
      { shape: 'box', align: true, size: [0.44, 0.04, 0.74], raise: 0.9, color: 'stone', surface: 'stone' },
      { shape: 'box', align: true, size: [0.02, 0.3, 0.3], raise: 0.3, offset: [0.42, 0, 0], color: 'cloth', surface: 'cloth' },
      { shape: 'drum', align: true, size: [0.06, 0.12, 0], raise: 0.98, color: 'gold', surface: 'metal' },
      { shape: 'ball', align: true, size: [0.05, 0.05, 0], raise: 1.12, color: 'glow', surface: 'glow' },
    ],
  },
  weaponRack: {
    ppm: 20,
    variants: 3,
    colors: { wood: ['@plank'], iron: ['@iron'], haft: ['@haft'] },
    parts: [
      { shape: 'box', align: true, size: [0.12, 0.03, 0.45], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, count: 2, spread: 0.8, turn: 90, size: [0.04, 0.6, 0.04], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.05, 0.03, 0.45], raise: 1.1, color: 'wood', surface: 'wood' },
      { shape: 'drum', count: [3, 4], size: [0.018, [0.6, 0.7], 0], spread: [0.1, 0.35], lean: [-8, 8], raise: 0.05, color: 'haft', surface: 'wood', children: [
        { shape: 'cone', on: 'top', align: true, size: [0.035, 0.14, 0], color: 'iron', surface: 'metal' },
      ] },
    ],
  },
  plateSpike: plate(['#9a9a9a', '#b0b0b0']),
  plateFrost: plate(['#80c8f0', '#a0d8ff']),
  plateGust: plate(['#c8e8d0', '#a8d8b8']),
  plateOil: plate(['#4a3a20', '#5a4828']),
};
