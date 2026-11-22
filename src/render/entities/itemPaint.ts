import type { ItemDef, ItemLook, VesselBody } from '../../types';
import { pack } from '../color';
import { swatch } from '../palette';

/**
 * Item pictures, built from the item's definition rather than drawn by hand. This file holds the
 * shared painting tools and works out the look; the pieces live in itemVessel.ts, itemParts.ts and itemArt.ts.
 *
 * Every picture starts from one of a few shared base shapes ("forms"): a vessel, a bladed or
 * hafted weapon, a coin, a key, a loaf, a pelt, a shard, a stone and so on. The definition then
 * decides the details: a potion is a glass flask filled to its level with its own liquid colour,
 * a weapon's length follows its reach, its blade or head grows with damage and weight, a cheap or
 * worn blade has nicks and rust, a valuable one a gilded guard and a gem. Nothing here names an
 * item id, so a new item in content/items.ts gets a fitting picture with no new art. To steer a
 * picture, give the item a `look` (types/defs.ts ItemLook); anything left out is worked out here.
 *
 * Shapes are written in 0..1 picture coordinates, so ITEM_ART can change freely.
 */

/** Side length of every item picture, in pixels. The bag shows it at 2×; the world uses it as a billboard. */
export const ITEM_ART = 20;

export type Rgb = readonly [number, number, number];

export function rgb(c: number): Rgb {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
export function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lum(c: Rgb): number {
  return (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255;
}

// The everyday materials items are made of. They start as these, and each item kind then picks its
// own from the palettes (content/palettes.ts) before it is painted, so one sword's grip is darker
// leather than another's and no two pots are the same clay.
export let WOOD: Rgb = [120, 84, 50];
export let CORK: Rgb = [150, 112, 70];
export const GLASS: Rgb = [200, 220, 232];
export let CLAY: Rgb = [150, 92, 58];
export let LEATHER: Rgb = [92, 60, 36];
export let GOLD: Rgb = [214, 176, 72];
export let BRONZE: Rgb = [150, 112, 64];
export const BONE: Rgb = [230, 220, 200];
export let STONE: Rgb = [130, 128, 136];
export const RUST: Rgb = [140, 74, 40];
export const WHITE: Rgb = [255, 255, 255];

export function unpack(c: number): Rgb {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
}
/** Picks this item kind's own materials from the palettes. */
export function materialsFor(seed: number): void {
  WOOD = unpack(swatch('@haft', seed, 11));
  CORK = unpack(swatch('@plank', seed, 12));
  CLAY = unpack(swatch('@clay', seed, 13));
  LEATHER = unpack(swatch('@leather', seed, 14));
  GOLD = unpack(swatch('@gold', seed, 15));
  BRONZE = unpack(swatch('@brass', seed, 16));
  STONE = unpack(swatch('@stone', seed, 17));
}

/** A picture being painted. Shapes are fragment tests: given a pixel centre (u, v), return its colour or null. */
export class Pix {
  readonly px = new Uint32Array(ITEM_ART * ITEM_ART);
  paint(frag: (u: number, v: number, x: number, y: number) => Rgb | null): void {
    for (let y = 0; y < ITEM_ART; y++) {
      for (let x = 0; x < ITEM_ART; x++) {
        const c = frag((x + 0.5) / ITEM_ART, (y + 0.5) / ITEM_ART, x, y);
        if (c) this.px[y * ITEM_ART + x] = pack(c[0], c[1], c[2]);
      }
    }
  }
  dot(u: number, v: number, c: Rgb): void {
    const x = Math.floor(u * ITEM_ART);
    const y = Math.floor(v * ITEM_ART);
    if (x >= 0 && y >= 0 && x < ITEM_ART && y < ITEM_ART) this.px[y * ITEM_ART + x] = pack(c[0], c[1], c[2]);
  }
  /** Dark rim round every painted pixel so items read against any background. */
  outline(): void {
    const src = this.px.slice();
    const rim = pack(18, 14, 10);
    const N = ITEM_ART;
    const on = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < N && j < N && (src[j * N + i] ?? 0) !== 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (src[y * N + x]) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) this.px[y * N + x] = rim;
      }
    }
  }
}

/** Light from the top left: a rounded object is brighter where its surface faces up-left. */
export function lit(c: Rgb, nx: number, ny: number): Rgb {
  const d = nx * nx + ny * ny;
  return scale(c, 0.72 + Math.max(0, -nx - ny) * 0.32 - d * 0.18);
}

/** An ellipse fragment, lit as a dome. */
export function blob(cx: number, cy: number, rx: number, ry: number, c: Rgb, flat = false): (u: number, v: number) => Rgb | null {
  return (u, v) => {
    const nx = (u - cx) / rx;
    const ny = (v - cy) / ry;
    if (nx * nx + ny * ny > 1) return null;
    return flat ? c : lit(c, nx, ny);
  };
}

/** Coordinates along a line: t is 0 at the start and 1 at the end, s the signed distance across it. */
export interface Axis {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  len: number;
}
export function axis(x0: number, y0: number, x1: number, y1: number): Axis {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return { x0, y0, dx, dy, len: Math.hypot(dx, dy) };
}
export function along(a: Axis, u: number, v: number): { t: number; s: number } {
  const px = u - a.x0;
  const py = v - a.y0;
  const t = (px * a.dx + py * a.dy) / (a.len * a.len);
  // Positive s is the right-hand side when looking from start to end (the lower-right in pictures).
  const s = (px * -a.dy + py * a.dx) / a.len;
  return { t, s };
}

/** A seeded number for this item, so two items of the same form still differ a little. */
export function seedOf(def: ItemDef): number {
  let h = 7;
  for (let i = 0; i < def.name.length; i++) h = (h * 31 + def.name.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Deciding the look

/** Everything a form needs, with every gap filled in from the definition. */
export interface Look {
  form: string;
  body: VesselBody;
  fill: Rgb;
  level: number;
  shell: Rgb | null;
  glow: Rgb | null;
  sparkle: boolean;
  size: number;
  seed: number;
  /** Pieces painted in order (ItemLook.parts), or just the one form. */
  parts: readonly string[];
}

/** The base shape of an item's picture and of the weapon in your hand: named by its look, else worked out from what it does. */
export function itemForm(def: ItemDef): string {
  return def.look?.form ?? defaultForm(def);
}

/** The base form an item gets when its definition does not name one, worked out from what it does. */
export function defaultForm(def: ItemDef): string {
  if (def.glide) return 'bundle';
  if (def.teaches) return 'stone';
  switch (def.category) {
    case 'currency':
      return 'coin';
    case 'key':
      return 'key';
    case 'potion':
      return 'vessel';
    case 'throwable':
      return 'vessel';
    case 'food':
      return def.weight >= 0.8 ? 'haunch' : 'loaf';
    case 'material':
      return def.weight >= 1 ? 'pelt' : 'shard';
    default:
      return 'lump';
  }
}

export function defaultBody(def: ItemDef): VesselBody {
  if (def.category === 'potion') return def.weight <= 0.2 ? 'vial' : 'round';
  if (def.weight > 0.8) return 'pot';
  if (def.weight <= 0.35) return 'vial';
  return 'tall';
}

export function resolveLook(def: ItemDef): Look {
  const l: ItemLook = def.look ?? {};
  const tint = rgb(def.tint);
  return {
    form: l.form ?? defaultForm(def),
    body: l.body ?? defaultBody(def),
    fill: l.fill !== undefined ? rgb(l.fill) : tint,
    level: clamp(l.level ?? 0.75, 0, 1),
    shell: l.shell !== undefined ? rgb(l.shell) : null,
    glow: l.glow !== undefined ? rgb(l.glow) : def.teaches ? tint : null,
    sparkle: l.sparkle ?? false,
    size: clamp(l.size ?? 1, 0.6, 1.4),
    seed: seedOf(def),
    parts: l.parts ?? [l.form ?? defaultForm(def)],
  };
}


/** Paints one piece of an item's picture over what is already there. */
export type Painter = (c: Pix, def: ItemDef, L: Look) => void;

