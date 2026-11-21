import type { FormDef, FormId, PieceDef } from '../types';

/**
 * Props as forms: barrels, crates, chests, urns, torches, campfires and trap plates are put
 * together from pieces (balls, boxes, cones, drums) exactly like trees and rocks (content/forms.ts),
 * and drawn by the same painter. Each piece belongs to a colour region ('wood', 'hoop'), filled
 * from palettes (content/palettes.ts) per placed prop, so no two barrels are quite the same.
 * A thing names its prop in `sprite` (content/things.ts); a container that has been opened shows
 * the form named `<sprite>Open` when there is one.
 *
 * Measurements are metres, [forward, up, side], from the middle of the prop's foot. Pieces marked
 * `align` keep the prop's own facing so made things line up (a lid on its box, posts at corners).
 */

/** A band round a drum-shaped body: a hoop, a lip, a ring of runes. */
function band(radius: number, at: number, thick: number, color: string, surface: PieceDef['surface'] = 'metal'): PieceDef {
  return { shape: 'drum', align: true, size: [radius, thick, 0], raise: at - thick, color, surface };
}

/**
 * A strong box with a lid that is shut or thrown open, iron bands and a lock. Its front (the lock)
 * faces forward; `w` is half its width across, `d` half its depth, `h` the height of the box.
 */
function chest(o: { w: number; d: number; h: number; open: boolean; bands: number; lock: string }): FormDef {
  const lidH = o.h * 0.28;
  const pieces: PieceDef[] = [
    // The box.
    { shape: 'box', align: true, size: [o.d, o.h * 0.5, o.w], color: 'wood', surface: 'wood' },
    // Iron bands wrapping the box (and the lid when it is shut), and a strip round the foot.
    ...Array.from({ length: o.bands }, (_, i): PieceDef => ({
      shape: 'box',
      align: true,
      size: [o.d + 0.012, (o.open ? o.h : o.h + lidH * 2) * 0.5 + 0.01, 0.025],
      offset: [0, 0, o.w * 0.7 * (o.bands > 1 ? (i / (o.bands - 1)) * 2 - 1 : 0)],
      color: 'band',
      surface: 'metal',
    })),
    { shape: 'box', align: true, size: [o.d + 0.01, 0.025, o.w + 0.01], color: 'band', surface: 'metal' },
  ];
  if (o.open) {
    // The lid thrown back on its hinges, the dark inside, and a heap of what it held.
    pieces.push({ shape: 'box', align: true, size: [0.03, lidH * 1.6, o.w], raise: o.h - 0.03, offset: [-o.d - 0.03, 0, 0], lean: -22, color: 'wood', surface: 'wood' });
    pieces.push({ shape: 'box', align: true, size: [o.d * 0.9, 0.01, o.w * 0.92], raise: o.h - 0.03, color: '#28180e' });
    pieces.push({ shape: 'ball', count: [6, 9], size: [[0.05, 0.07], [0.04, 0.06], 0], spread: [0, o.d * 0.7], raise: o.h - 0.06, color: 'treasure', surface: 'metal', shade: 0.15 });
  } else {
    pieces.push({ shape: 'box', align: true, size: [o.d + 0.01, lidH, o.w + 0.01], raise: o.h, color: 'wood', surface: 'wood' });
    pieces.push({ shape: 'box', align: true, size: [0.02, 0.06, 0.05], raise: o.h - 0.08, offset: [o.d + 0.015, 0, 0], color: o.lock, surface: o.lock === 'rune' ? 'glow' : 'metal' });
  }
  return { ppm: 20, variants: 3, vary: 0.05, colors: { wood: ['@plank'], band: ['@iron'], treasure: ['@gold'], rune: ['@aether'], lockBrass: ['@brass'] }, pieces };
}

function barrel(o: { tarred: boolean }): FormDef {
  const pieces: PieceDef[] = [
    // A belly between two flat ends: a drum for the ends, a squashed ball for the bulge.
    { shape: 'drum', align: true, size: [0.3, 0.48, 0], color: 'wood', surface: 'wood' },
    { shape: 'ball', align: true, size: [0.345, 0.42, 0], raise: 0.06, color: 'wood', surface: 'wood' },
    band(0.312, 0.13, 0.03, 'hoop'),
    band(0.312, 0.88, 0.03, 'hoop'),
    band(0.35, 0.36, 0.025, 'hoop'),
    band(0.35, 0.62, 0.025, 'hoop'),
  ];
  if (o.tarred) {
    // A bung on top and a dark stain running down from it.
    pieces.push({ shape: 'drum', align: true, size: [0.05, 0.02, 0], raise: 0.95, offset: [0.15, 0, 0], color: '#1e1812' });
    pieces.push({ shape: 'box', align: true, size: [0.04, 0.3, 0.06], raise: 0.35, offset: [0.33, 0, 0], color: '#1e1812' });
  }
  return { ppm: 20, variants: 3, vary: 0.06, colors: { wood: [o.tarred ? '@tarred' : '@plank'], hoop: ['@iron'] }, pieces };
}

function urn(o: { sealed: boolean }): FormDef {
  const pieces: PieceDef[] = [
    { shape: 'ball', align: true, size: [0.22, 0.24, 0], raise: 0.02, color: 'clay', surface: 'skin' },
    { shape: 'drum', align: true, size: [0.085, 0.07, 0], raise: 0.46, color: 'clay', surface: 'skin' },
    band(0.115, 0.62, 0.02, 'clay', 'skin'),
    // A painted band round the belly.
    band(0.222, 0.3, 0.018, 'paint', 'smooth'),
  ];
  if (o.sealed) {
    pieces.push({ shape: 'ball', align: true, size: [0.1, 0.04, 0], raise: 0.6, color: 'seal', surface: 'glow' });
    pieces.push(band(0.224, 0.22, 0.014, 'seal', 'glow'));
  }
  return { ppm: 22, variants: 3, vary: 0.08, colors: { clay: ['@clay'], paint: ['#2a1c14', '#e0d0b0', '#5a2a1a'], seal: ['@aether'] }, pieces };
}

const FURN_COLORS = { wood: ['@plank'], dark: ['#2a1c12', '#241810'], sheet: ['#cfc7ae', '#bdb59c', '#d8d0b8'], blanket: ['#8a3a30', '#3a4a78', '#4a6a3a', '#7a5a2a'], brass: ['@brass'], stone: ['@stone'], ember: ['@ember'], log: ['@bark'] };

export const PROPS: Record<FormId, FormDef> = {
  bed: {
    ppm: 20,
    variants: 3,
    vary: 0.05,
    colors: FURN_COLORS,
    pieces: [
      { shape: 'box', align: true, size: [0.75, 0.13, 0.42], offset: [0.25, 0, 0], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.04, 0.3, 0.45], offset: [-0.48, 0, 0], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.72, 0.07, 0.4], raise: 0.26, offset: [0.25, 0, 0], color: 'sheet', surface: 'cloth' },
      { shape: 'box', align: true, size: [0.16, 0.05, 0.3], raise: 0.33, offset: [-0.3, 0, 0], color: 'sheet', surface: 'cloth' },
      { shape: 'box', align: true, size: [0.45, 0.04, 0.42], raise: 0.33, offset: [0.4, 0, 0], color: 'blanket', surface: 'cloth' },
    ],
  },
  table: {
    ppm: 20,
    variants: 3,
    vary: 0.05,
    colors: FURN_COLORS,
    pieces: [
      { shape: 'box', align: true, size: [0.46, 0.03, 0.46], raise: 0.7, color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, count: 4, spread: 0.62, turn: 45, size: [0.04, 0.35, 0.04], color: 'wood', surface: 'wood' },
    ],
  },
  cupboard: {
    ppm: 20,
    variants: 3,
    vary: 0.05,
    colors: FURN_COLORS,
    pieces: [
      { shape: 'box', align: true, size: [0.26, 0.52, 0.42], color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.29, 0.03, 0.45], raise: 1.04, color: 'wood', surface: 'wood' },
      { shape: 'box', align: true, size: [0.01, 0.4, 0.18], raise: 0.12, offset: [0.265, 0, 0.2], color: 'dark', surface: 'wood' },
      { shape: 'box', align: true, size: [0.01, 0.4, 0.18], raise: 0.12, offset: [0.265, 0, -0.2], color: 'dark', surface: 'wood' },
      { shape: 'ball', align: true, count: 2, spread: 0.04, size: [0.02, 0.02, 0], raise: 0.55, offset: [0.28, 0, 0], color: 'brass', surface: 'metal' },
    ],
  },
  hearth: {
    ppm: 20,
    variants: 3,
    vary: 0.05,
    colors: FURN_COLORS,
    pieces: [
      { shape: 'box', align: true, size: [0.4, 0.4, 0.5], color: 'stone', surface: 'stone', shade: 0.1 },
      { shape: 'box', align: true, size: [0.02, 0.22, 0.3], raise: 0.1, offset: [0.4, 0, 0], color: 'dark' },
      { shape: 'drum', count: [2, 3], size: [0.05, [0.22, 0.3], 0], spread: [0.08, 0.14], lean: [-80, -70], raise: 0.12, offset: [0.25, 0, 0], color: 'log', surface: 'bark' },
      { shape: 'ball', count: [3, 4], size: [[0.06, 0.08], 0.05, 0], spread: [0, 0.1], raise: 0.12, offset: [0.28, 0, 0], color: 'ember', surface: 'glow' },
    ],
  },
  barrel: barrel({ tarred: false }),
  oilBarrel: barrel({ tarred: true }),
  crate: {
    ppm: 20,
    variants: 3,
    vary: 0.06,
    colors: { wood: ['@plank'], slat: ['@plank'] },
    pieces: [
      { shape: 'box', align: true, size: [0.38, 0.36, 0.38], color: 'wood', surface: 'wood' },
      // Corner posts, top and bottom rims, and a brace across two faces.
      { shape: 'box', align: true, count: 4, spread: 0.54, turn: 45, size: [0.045, 0.37, 0.045], color: 'slat', surface: 'wood' },
      { shape: 'box', align: true, size: [0.4, 0.035, 0.4], color: 'slat', surface: 'wood' },
      { shape: 'box', align: true, size: [0.4, 0.035, 0.4], raise: 0.65, color: 'slat', surface: 'wood' },
      { shape: 'box', align: true, size: [0.36, 0.03, 0.02], raise: 0.36, offset: [0, 0, 0.385], lean: 0, color: 'slat', surface: 'wood' },
      { shape: 'box', align: true, size: [0.02, 0.03, 0.36], raise: 0.36, offset: [0.385, 0, 0], color: 'slat', surface: 'wood' },
    ],
  },
  chest: chest({ w: 0.42, d: 0.28, h: 0.42, open: false, bands: 2, lock: 'lockBrass' }),
  chestOpen: chest({ w: 0.42, d: 0.28, h: 0.42, open: true, bands: 2, lock: 'lockBrass' }),
  ironChest: chest({ w: 0.5, d: 0.32, h: 0.46, open: false, bands: 3, lock: 'rune' }),
  ironChestOpen: chest({ w: 0.5, d: 0.32, h: 0.46, open: true, bands: 3, lock: 'rune' }),
  urn: urn({ sealed: false }),
  urnSealed: urn({ sealed: true }),
  torch: {
    ppm: 22,
    variants: 3,
    views: 1,
    colors: { shaft: ['@haft'], wrap: ['@rag'], soot: ['#2a221c', '#3a3028'] },
    pieces: [
      { shape: 'drum', size: [0.04, 0.68, 0], lean: [0, 3], color: 'shaft', surface: 'wood', children: [
        // Oily rag wrapped round the head, scorched black at the top; the flame itself is particles.
        { shape: 'drum', on: 'top', align: true, size: [0.07, 0.09, 0], lift: -0.18, color: 'wrap', surface: 'cloth' },
        { shape: 'ball', on: 'top', align: true, size: [0.072, 0.05, 0], lift: -0.03, color: 'soot', surface: 'fur' },
      ] },
    ],
  },
  // Faces away from its wall: an iron plate on the wall, a cup, and the brand leaning out of it.
  wallTorch: {
    ppm: 22,
    variants: 3,
    colors: { iron: ['@iron'], shaft: ['@haft'], wrap: ['@rag'], soot: ['#2a221c', '#3a3028'] },
    pieces: [
      { shape: 'box', align: true, size: [0.012, 0.1, 0.045], raise: 0.04, offset: [-0.055, 0, 0], color: 'iron', surface: 'metal' },
      { shape: 'box', align: true, size: [0.05, 0.012, 0.012], raise: 0.12, offset: [-0.01, 0, 0], color: 'iron', surface: 'metal' },
      { shape: 'drum', align: true, size: [0.034, 0.03, 0], raise: 0.1, offset: [0.045, 0, 0], color: 'iron', surface: 'metal' },
      { shape: 'drum', align: true, size: [0.03, 0.4, 0], raise: 0.06, offset: [0.03, 0, 0], lean: 14, color: 'shaft', surface: 'wood', children: [
        { shape: 'drum', on: 'top', align: true, size: [0.058, 0.09, 0], lift: -0.15, color: 'wrap', surface: 'cloth' },
        { shape: 'ball', on: 'top', align: true, size: [0.06, 0.045, 0], lift: -0.04, color: 'soot', surface: 'fur' },
      ] },
    ],
  },
  campfire: {
    ppm: 20,
    variants: 4,
    colors: { stone: ['@stone'], log: ['@bark'], ember: ['@ember'], ash: ['#3a3430', '#4a4440'] },
    pieces: [
      { shape: 'drum', align: true, size: [0.32, 0.02, 0], color: 'ash', surface: 'stone' },
      // A ring of stones, tipped every which way.
      { shape: 'box', count: [7, 9], size: [[0.1, 0.14], [0.08, 0.11], [0.09, 0.13]], spread: [0.42, 0.48], lean: [0, 25], lift: -0.03, color: 'stone', surface: 'stone', shade: 0.12 },
      // Logs leaning together over the embers.
      { shape: 'drum', count: [3, 5], size: [0.05, [0.28, 0.34], 0], spread: [0.26, 0.32], lean: [-42, -32], raise: 0.02, color: 'log', surface: 'bark', shade: 0.1 },
      { shape: 'ball', count: [3, 5], size: [[0.06, 0.09], 0.05, 0], spread: [0, 0.14], color: 'ember', surface: 'glow' },
    ],
  },
  stairDown: {
    ppm: 20,
    variants: 2,
    colors: { stone: ['@stone'], dark: ['#0a080e'], step: ['#4a4650', '#56525c'] },
    pieces: [
      { shape: 'drum', align: true, size: [0.62, 0.03, 0], color: 'dark', surface: 'stone' },
      { shape: 'box', align: true, count: 3, size: [0.5, 0.03, 0.1], raise: 0.01, color: 'step', surface: 'stone' },
      { shape: 'box', count: [9, 11], size: [[0.12, 0.17], [0.08, 0.14], [0.12, 0.17]], spread: [0.66, 0.74], lean: [0, 10], color: 'stone', surface: 'stone', shade: 0.12 },
    ],
  },
  stairUp: {
    ppm: 20,
    variants: 2,
    colors: { stone: ['@stone'], light: ['#e8eef8', '#d8e4f4'], step: ['#4a4650', '#56525c'] },
    pieces: [
      { shape: 'drum', align: true, size: [0.62, 0.03, 0], color: 'light', surface: 'glow' },
      { shape: 'box', align: true, count: 3, size: [0.5, 0.03, 0.1], raise: 0.01, color: 'step', surface: 'stone' },
      { shape: 'box', count: [9, 11], size: [[0.12, 0.17], [0.08, 0.14], [0.12, 0.17]], spread: [0.66, 0.74], lean: [0, 10], color: 'stone', surface: 'stone', shade: 0.12 },
    ],
  },
  plate: {
    ppm: 20,
    variants: 2,
    colors: { stone: ['@stone'], rune: ['#c85a28', '#d87030'] },
    pieces: [
      { shape: 'box', align: true, size: [0.48, 0.03, 0.48], color: 'stone', surface: 'stone' },
      // Runes cut into the top, glowing faintly.
      { shape: 'box', align: true, count: 4, spread: 0.28, size: [0.05, 0.008, 0.05], raise: 0.055, color: 'rune', surface: 'glow' },
      { shape: 'box', align: true, size: [0.08, 0.008, 0.08], raise: 0.055, turn: 45, color: 'rune', surface: 'glow' },
    ],
  },
};
