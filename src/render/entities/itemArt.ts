// Item pictures: one per item, built by the sprite assembler from its art pieces in its material's colours
import type { ArtDef, DressDef, ItemDef } from '../../types';
import { CONTENT } from '../../content';
import { pack } from '../color';
import { paintSolids } from './bodyPaint';
import { artColours, buildArt } from './artGrow';
import { poseSolids, solidBox } from './assembler';
import { type Look, type Rgb, clamp, mix, resolveLook, seedOf } from './itemLook';

/**
 * Items are drawn like everything else: their pieces are art recipes in CONTENT.art ('item.blade',
 * 'item.vessel.round'…, content/itemGearArt.ts and itemGoodsArt.ts). Gear lists its pieces; other
 * items are one base shape. The item's own definition then dresses the recipe: material and
 * tint give the colours, quality a gilded guard and a gem, an enchantment a glowing rune, wear
 * rust, reach and damage stretch it longer and heavier. Nothing here names an item id.
 *
 * Every item has exactly one picture: the bag, the ground and the hand all use it, never mirrored,
 * so the edge (painted on the left) stays on the left.
 */

/** Side length of every item picture, in pixels. The bag shows it at 2×; the world uses it as a billboard. */
export const ITEM_ART = 20;
export { itemForm } from './itemLook';

const RUST: Rgb = [140, 74, 40];
const WHITE: Rgb = [255, 255, 255];
/** Anything swung without fighting numbers still gets a sensible size. */
const PLAIN = { damage: 6, reach: 1.6, push: 1 };

function hex(c: Rgb): string {
  const h = (v: number): string => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
}

/** The art recipe of each piece the item is made of (a vessel by its body; unknown pieces are a lump). */
function piecesOf(L: Look): ArtDef[] {
  return L.parts.map((p) => CONTENT.art[p === 'vessel' ? `item.vessel.${L.body}` : `item.${p}`] ?? (CONTENT.art['item.lump'] as ArtDef));
}

/** One recipe from several pieces: their parts together, every colour slot and feature any of them has. */
function combine(defs: readonly ArtDef[]): ArtDef {
  const colors: Record<string, readonly string[]> = {};
  const features: Record<string, number> = {};
  for (const d of defs) {
    for (const [k, v] of Object.entries(d.colors)) colors[k] ??= v;
    for (const [k, v] of Object.entries(d.features ?? {})) features[k] ??= v;
  }
  return { colors, features, parts: defs.flatMap((d) => d.parts), tilt: defs[0]?.tilt ?? 0, variants: 1, views: 1 };
}

/** What this item lays over its recipe: colours from its material and quality, features, and its size. */
function dressOf(def: ItemDef, L: Look): DressDef {
  const worn = clamp(1 - (def.wear ?? 1) / Math.max(1, def.durability ?? 1), 0, 1);
  const colors: Record<string, string[]> = { fill: [hex(L.fill)] };
  const features: string[] = [];
  const t = def.weapon?.tint;
  const metal = L.shell ?? (t && t.r + t.g + t.b > 0 ? ([t.r, t.g, t.b] as Rgb) : ([196, 202, 212] as Rgb));
  colors.metal = [hex(mix(metal, RUST, worn * 0.5))];
  if (def.value >= 35) colors.fittings = ['@gold'];
  const base = mix(L.shell ?? L.fill, RUST, worn * 0.4);
  if (def.armour || L.shell) colors.shell = [hex(base)];
  colors.trim = [hex(L.glow ?? mix(base, WHITE, 0.3))];
  const gem = L.glow ?? (def.weapon && def.value >= 50 ? ([90, 200, 230] as Rgb) : null);
  if (gem) {
    colors.gem = [hex(gem)];
    features.push('gem');
  }
  if (L.glow) {
    colors.glow = colors.rune = [hex(L.glow)];
    features.push('glow');
    if (L.sparkle) features.push('rune');
  }
  if (def.light) colors.flame = [hex([def.light.r * 255, def.light.g * 255, def.light.b * 255])];
  if (L.sparkle) features.push('sparkle');
  if (L.level < 0.6) features.push('low');
  if ((def.look?.plate ?? 0) >= 0.5) features.push('plate');
  const surfaces = def.look?.surface ? { shell: def.look.surface } : undefined;
  let stretch: [number, number, number] | undefined;
  if (def.weapon || L.parts.length > 1) {
    const w = def.weapon ?? PLAIN;
    const length = clamp(0.8 + (w.reach - 2) * 0.3, 0.5, 0.98) * L.size;
    const heft = clamp((w.damage - 8) / 20, 0, 1);
    if (!def.armour) stretch = [0.8 + heft * 0.6, length * 1.2, 1];
  }
  return { colors, features, stretch, surfaces };
}

/** An item's recipe and what dresses it (its own colours, features, size, textures): drawn in its picture or in a hand. */
export function itemRecipe(def: ItemDef): { art: ArtDef; dress: DressDef; colours: Uint32Array } {
  const L = resolveLook(def);
  const art = combine(piecesOf(L));
  const dress = dressOf(def, L);
  return { art, dress, colours: artColours(art, seedOf(def), dress) };
}

/** Builds and paints one item: posed, its colours baked in, centred and fitted to the picture. */
export function paintItem(def: ItemDef | undefined): Uint32Array {
  const out = new Uint32Array(ITEM_ART * ITEM_ART);
  const L = def ? resolveLook(def) : null;
  const r = def ? itemRecipe(def) : null;
  const art: ArtDef = r ? r.art : (CONTENT.art['item.lump'] as ArtDef);
  const dress: DressDef = r ? r.dress : { colors: { fill: ['#ff00ff'] } };
  const seed = def ? seedOf(def) : 1;
  const colours = r ? r.colours : artColours(art, seed, dress);
  const built = buildArt(art, seed, dress);
  const solids = poseSolids({ ...built, key: '', def: art, colours, ppm: ITEM_ART }, 'idle', 0);
  for (const s of solids) {
    if (s.region <= 0) continue;
    const c = colours[s.region] ?? 0;
    const k = s.tone;
    s.color = pack((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k);
    s.region = 0;
  }
  if (!solids.length) return out;
  // Fit the picture: the middle of what was built goes to the middle. Stretched things (weapons) keep
  // their length, shrunk only if they would not fit; everything else fills the picture by its size.
  const box = solidBox(solids);
  const span = Math.max(0.01, box.max[0] - box.min[0], box.max[1] - box.min[1]);
  const k = dress.stretch ? Math.min(1, 0.92 / span) : Math.min(0.95, 0.82 * (L?.size ?? 1)) / span;
  const cx = (box.max[0] + box.min[0]) / 2;
  const cy = (box.max[1] + box.min[1]) / 2;
  for (const s of solids) {
    s.c = [(s.c[0] - cx) * k, (s.c[1] - cy) * k + 0.475, s.c[2] * k];
    s.size = [s.size[0] * k, s.size[1] * k, s.size[2] * k];
  }
  // Seen from the front (+side faces the viewer), forward to the right, never mirrored.
  const pic = paintSolids(solids, ITEM_ART, 0, -1, 0.45, 0.95);
  for (let y = 0; y < Math.min(ITEM_ART, pic.h); y++) for (let x = 0; x < Math.min(ITEM_ART, pic.w); x++) out[y * ITEM_ART + x] = pic.px[y * pic.w + x] ?? 0;
  ring(out);
  return out;
}

/** A dark ring round the picture's outside, so it reads on any background (bag, ground, hand). */
function ring(px: Uint32Array): void {
  const n = ITEM_ART;
  const near: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (px[y * n + x]) continue;
      const on = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < n && yy < n && (px[yy * n + xx] ?? 0) >>> 24 === 255;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) near.push(y * n + x);
    }
  }
  for (const o of near) px[o] = pack(18, 16, 14);
}

/** How big the item looks lying in the world, in metres. */
export function itemWorldSize(def: ItemDef | undefined): number {
  if (!def) return 0.35;
  const L = resolveLook(def);
  if (def.weapon) return (0.55 + def.weapon.reach * 0.14) * L.size;
  if (L.parts.length > 1) return 0.6 * L.size;
  if (def.armour) return 0.45 * L.size;
  if (L.form === 'bundle') return 0.7 * L.size;
  if (L.form === 'vessel') return (L.body === 'pot' || L.body === 'jug' ? 0.42 : 0.34) * L.size;
  return 0.38 * L.size;
}

/** The base shapes and gear pieces items can name (art recipes 'item.<name>'; vessels by body). */
export const ITEM_FORMS: readonly string[] = [
  'vessel',
  ...Object.keys(CONTENT.art)
    .filter((k) => k.startsWith('item.') && !k.startsWith('item.vessel.'))
    .map((k) => k.slice(5)),
];
