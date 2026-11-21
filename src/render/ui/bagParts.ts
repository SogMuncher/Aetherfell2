import { CONTENT, effectWords, gearCondition, itemDef } from '../../content';
import { ITEM_ART, paintItem } from '../entities/itemArt';
import type { ItemDef, ItemId } from '../../types';
import { pack, rhash, vnoise } from '../color';


/** Inside of the bag, in CSS pixels. */
export const AREA_W = 288;
export const AREA_H = 208;
/** Items are drawn at 2× their art. */
export const ICON = ITEM_ART * 2;
/** Below this share of the view height, letting go is a drop rather than a throw (matches the sim). */
export const DROP_BELOW = 0.15;
export const STORE = 'aetherfell2.bag';

export interface Spot {
  x: number;
  y: number;
}

export interface Icon {
  el: HTMLElement;
  count: HTMLElement;
  shown: number;
}

export interface Drag {
  id: ItemId;
  el: HTMLElement;
  pointer: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  ghost: HTMLElement | null;
}

/** A loose item being pulled out of the view towards the bag. */
export interface WorldDrag {
  entity: number;
  item: ItemId;
  pointer: number;
  sx: number;
  sy: number;
  ghost: HTMLElement | null;
}

/** Extra screen pixels (of the low-res view) around an item's picture that still count as touching it. */
export const PICK_PAD = 2;

export const iconUrls = new Map<ItemId, string>();

/** The item's picture as an image URL, painted once from its definition. */
export function iconUrl(id: ItemId): string {
  let url = iconUrls.get(id);
  if (url !== undefined) return url;
  const c = document.createElement('canvas');
  c.width = ITEM_ART;
  c.height = ITEM_ART;
  const g = c.getContext('2d');
  if (g) {
    const img = g.createImageData(ITEM_ART, ITEM_ART);
    new Uint32Array(img.data.buffer).set(paintItem(itemDef(CONTENT, id)));
    g.putImageData(img, 0, 0);
  }
  url = c.toDataURL();
  iconUrls.set(id, url);
  return url;
}

/** Worn leather with a stitched seam, painted once. */
export function leatherUrl(): string {
  const w = AREA_W / 2;
  const h = AREA_H / 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return '';
  const img = g.createImageData(w, h);
  const px = new Uint32Array(img.data.buffer);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = vnoise(x / 9, y / 7, 3) * 0.6 + vnoise(x / 3, y / 3, 4) * 0.25 + rhash(x, y, 5) * 0.15;
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      const dark = edge < 6 ? 0.6 + edge * 0.06 : 1;
      const crease = Math.abs(Math.sin(x * 0.07 + vnoise(x / 20, y / 20, 6) * 3) * 40 - (y - h / 2)) < 0.8 ? 0.82 : 1;
      let k = (0.62 + n * 0.45) * dark * crease;
      const seam = edge === 4 && (x + y) % 4 < 2;
      if (seam) k = 1.5;
      px[y * w + x] = pack(84 * k, 54 * k, 32 * k);
    }
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** What a single click tells you about an item, in plain words. */
export function describe(def: ItemDef): string[] {
  const out: string[] = [];
  if (def.armour) {
    const a = def.armour;
    const reg = CONTENT.gear.regions[a.region]?.name.toLowerCase() ?? a.region;
    out.push(`Armour for the ${reg}: turns ${a.armor} off each blow. Double-click to wear.`);
    out.push(`Condition: ${gearCondition(a)} (${a.wear}/${a.durability} blows left).`);
    const res = Object.entries(a.resist).filter(([, v]) => v !== undefined && Math.abs(v - 1) > 0.01).map(([k, v]) => `${k} ${(v ?? 1) < 1 ? '−' : '+'}${Math.round(Math.abs(1 - (v ?? 1)) * 100)}%`);
    if (res.length) out.push(`Harm taken: ${res.join(', ')}.`);
  }
  if (def.weapon) out.push(`Weapon: ${def.weapon.damage} ${def.weapon.kind}, reach ${def.weapon.reach.toFixed(1)} m. Double-click to wield.`);
  if (def.use?.length) {
    const verb = def.category === 'potion' ? 'Drink' : def.category === 'food' ? 'Eat' : 'Use';
    out.push(`${verb} (double-click): ${effectWords(CONTENT, def.use, 1)}.`);
  }
  if (def.thrown) out.push(`Bursts where it lands: ${effectWords(CONTENT, def.thrown.effects, 1)}.`);
  if (def.glide) out.push('Jump, then hold Space in the air to glide.');
  if (def.teaches) out.push(`Carved with the ${CONTENT.runes[def.teaches]?.name ?? def.teaches} rune.`);
  if (def.category === 'key') out.push('Opens the lock it fits.');
  out.push(`${def.weight} kg${def.value ? ` · worth about ${def.value} silver` : ''}`);
  return out;
}

export function readStore(): { spots: Map<ItemId, Spot>; win: Spot | null } {
  const spots = new Map<ItemId, Spot>();
  let win: Spot | null = null;
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (typeof raw === 'object' && raw !== null) {
      const r = raw as { spots?: unknown; win?: unknown };
      if (typeof r.spots === 'object' && r.spots !== null) {
        for (const [id, v] of Object.entries(r.spots as Record<string, unknown>)) {
          if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') spots.set(id, { x: clamp01(v[0]), y: clamp01(v[1]) });
        }
      }
      if (Array.isArray(r.win) && typeof r.win[0] === 'number' && typeof r.win[1] === 'number') win = { x: r.win[0], y: r.win[1] };
    }
  } catch {
    /* storage may be blocked or hold junk: start fresh */
  }
  return { spots, win };
}

export function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5;
}
