import type { PaletteDef, PaletteId } from '../types';
import { CONTENT } from '../content';
import { pack, rhash } from './color';

/**
 * Turns colour choices ('#rrggbb' or '@palette', see types/palettes.ts) into packed pixels, and
 * fills a thing's colour regions with one individual's colours. Pictures that carry regions are
 * painted once per shape; these colours are laid over them when they are drawn, so every wolf,
 * tree or barrel can wear its own colours without painting a new picture.
 */

const MAGENTA = pack(255, 0, 255);

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * One colour for a choice. `seed` makes the pick stable: the same seed always gives the same
 * swatch and the same drift.
 */
export function swatch(choice: string, seed: number, salt = 0, palettes: Readonly<Record<PaletteId, PaletteDef>> = CONTENT.palettes): number {
  if (choice.startsWith('#')) {
    const [r, g, b] = hexToRgb(choice);
    return pack(r, g, b);
  }
  const pal = choice.startsWith('@') ? palettes[choice.slice(1)] : undefined;
  if (!pal || !pal.swatches.length) return MAGENTA;
  const base = pal.swatches[Math.floor(rhash(seed, salt, 401) * pal.swatches.length)] ?? pal.swatches[0] ?? '#ff00ff';
  const [r, g, b] = hexToRgb(base);
  const d = pal.drift;
  if (!d) return pack(r, g, b);
  const [h, s, l] = rgbToHsl(r, g, b);
  const u = (k: number): number => rhash(seed, salt, 402 + k) * 2 - 1;
  const [nr, ng, nb] = hslToRgb(h + u(0) * (d.hue ?? 0), clamp01(s * (1 + u(1) * (d.sat ?? 0))), clamp01(l * (1 + u(2) * (d.light ?? 0))));
  return pack(nr, ng, nb);
}

/**
 * Colours for every region of one individual: slot i of `slots` goes in entry i + 1 (entry 0 is
 * "no region": the picture's own colour). Each slot picks one of its choices, then that choice's
 * colour.
 */
export function regionColours(slots: readonly string[], choicesOf: (slot: string) => readonly string[] | undefined, seed: number): Uint32Array {
  const out = new Uint32Array(slots.length + 1);
  slots.forEach((slot, i) => {
    const list = choicesOf(slot) ?? [];
    const choice = list[Math.floor(rhash(seed, i, 77) * list.length)] ?? list[0] ?? '#ff00ff';
    out[i + 1] = swatch(choice, seed, i + 1);
  });
  return out;
}

/** Brightness stored per region pixel is this many steps per 1.0 (so up to 2.55× fits a byte). */
export const SHADE_ONE = 100;
