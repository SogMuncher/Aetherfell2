import type { PaletteDef, PaletteId } from '../types';

/**
 * Palettes: the colours that fill the colour regions of every picture (creatures, trees, rocks,
 * props, items, the weapon in your hand). A part names a region ('coat'); the thing's definition
 * says which colours that region may take, usually as '@palette' from this list. Each pick starts
 * from one swatch and drifts a little in hue, richness and lightness, so a pack of wolves or a
 * wood of oaks never repeats exactly. Add a palette here and any look, form or prop can use it.
 */
export const PALETTES: Record<PaletteId, PaletteDef> = {
  // Living things.
  skin: { swatches: ['#e0b08a', '#c89070', '#a87050', '#7a5038', '#f0c8a8'], drift: { hue: 4, sat: 0.08, light: 0.05 } },
  hair: { swatches: ['#3c2814', '#c8aa5a', '#1e1a18', '#8c4628', '#6e6a66', '#d8d0c0'], drift: { hue: 6, sat: 0.12, light: 0.08 } },
  'fur.grey': { swatches: ['#6a6a72', '#7c7870', '#4e4c50', '#8a8a8e'], drift: { hue: 10, sat: 0.2, light: 0.1 } },
  'fur.pale': { swatches: ['#a8a49c', '#94908a', '#b8b2a6'], drift: { hue: 8, sat: 0.15, light: 0.06 } },
  'fur.brown': { swatches: ['#966640', '#a8784a', '#87583a'], drift: { hue: 6, sat: 0.12, light: 0.1 } },
  'fur.cream': { swatches: ['#d8c8a8', '#c8b490'], drift: { hue: 5, sat: 0.1, light: 0.05 } },
  horn: { swatches: ['#d0bc90', '#c0a878'], drift: { hue: 5, sat: 0.1, light: 0.06 } },
  // Cloth and leather that people wear.
  'cloth.plain': { swatches: ['#5a6e3c', '#785032', '#465a82', '#8c7850', '#7a4040', '#6a6a5a'], drift: { hue: 8, sat: 0.12, light: 0.08 } },
  'cloth.dark': { swatches: ['#46404e', '#5a4a3a', '#3e4a3e', '#463e50'], drift: { hue: 8, sat: 0.1, light: 0.06 } },
  'cloth.bright': { swatches: ['#3c5aa0', '#a08c32', '#783c8c', '#328c78', '#962828', '#28508c', '#2e6e3a', '#6e2e6e'], drift: { hue: 6, sat: 0.08, light: 0.06 } },
  'cloth.undyed': { swatches: ['#c8b898', '#d8ccb0', '#b8a888'], drift: { hue: 4, sat: 0.1, light: 0.05 } },
  leather: { swatches: ['#46321e', '#3a2a1c', '#5c4028', '#2a1e14'], drift: { hue: 6, sat: 0.12, light: 0.08 } },
  rag: { swatches: ['#8a7a5a', '#6e5e44', '#9a8a68'], drift: { hue: 8, sat: 0.15, light: 0.08 } },
  // Plants.
  bark: { swatches: ['#5c4029', '#4f3a28', '#66482e', '#56402c'], drift: { hue: 6, sat: 0.12, light: 0.08 } },
  leaf: { swatches: ['#3e7030', '#47782f', '#4f7a2a', '#3a6634', '#55803a'], drift: { hue: 9, sat: 0.12, light: 0.08 } },
  moss: { swatches: ['#4e6e34', '#5a7a3a'], drift: { hue: 8, sat: 0.12, light: 0.08 } },
  hay: { swatches: ['#c8a850', '#b8984a', '#d0b060'], drift: { hue: 5, sat: 0.1, light: 0.06 } },
  // Stone, earth and fire.
  stone: { swatches: ['#7a7670', '#86827a', '#6e6c6a', '#8a8478', '#75726c'], drift: { hue: 12, sat: 0.12, light: 0.07 } },
  clay: { swatches: ['#a05c38', '#96583a', '#b06a40', '#8a5234'], drift: { hue: 6, sat: 0.1, light: 0.08 } },
  ember: { swatches: ['#ffaa3c', '#ff8a2a', '#ffc85a'], drift: { hue: 6, sat: 0.05, light: 0.05 } },
  // Worked wood and metal.
  plank: { swatches: ['#84583a', '#9c7046', '#7a5232', '#8c6440'], drift: { hue: 5, sat: 0.12, light: 0.08 } },
  tarred: { swatches: ['#4e3c28', '#443426', '#56422c'], drift: { hue: 5, sat: 0.1, light: 0.06 } },
  haft: { swatches: ['#6e4c2e', '#5e4028', '#7a5636'], drift: { hue: 5, sat: 0.12, light: 0.08 } },
  iron: { swatches: ['#6e7078', '#7a7c84', '#62646a'], drift: { hue: 8, sat: 0.1, light: 0.06 } },
  brass: { swatches: ['#96783c', '#a08440', '#8c6e36'], drift: { hue: 4, sat: 0.08, light: 0.06 } },
  gold: { swatches: ['#e0be5a', '#f0d070', '#d6b048'], drift: { hue: 4, sat: 0.06, light: 0.05 } },
  // Magic.
  aether: { swatches: ['#60e0d0', '#6edcd2', '#8ab4f0'], drift: { hue: 10, sat: 0.05, light: 0.05 } },
  'hide.toad': { swatches: ['#5c6e36', '#6e7a3a', '#4a5e34', '#7a6a3a'], drift: { hue: 14, sat: 0.15, light: 0.1 } },
};

/** Why a colour choice cannot be used, or null if it is fine ('#rrggbb' or '@a-known-palette'). */
export function colourProblem(c: string, palettes: Readonly<Record<PaletteId, PaletteDef>> = PALETTES): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return null;
  if (c.startsWith('@')) return c.slice(1) in palettes ? null : `unknown palette '${c}'`;
  return `colour '${c}' is neither #rrggbb nor @palette`;
}

/** Problems in the palettes themselves, for validateContent(). */
export function paletteProblems(palettes: Readonly<Record<PaletteId, PaletteDef>>): string[] {
  const out: string[] = [];
  for (const [id, p] of Object.entries(palettes)) {
    if (!p.swatches.length) out.push(`palette '${id}' has no swatches`);
    for (const s of p.swatches) if (!/^#[0-9a-fA-F]{6}$/.test(s)) out.push(`palette '${id}': swatch '${s}' is not #rrggbb`);
  }
  return out;
}
