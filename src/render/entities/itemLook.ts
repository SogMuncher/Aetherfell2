// What an item looks like, worked out from its definition: base shape, colours, size, gear parts (no item ids)
import type { ItemDef, ItemLook, VesselBody } from '../../types';

/**
 * Every field of an item's `look` (types/defs/items.ts) is optional: whatever is left out comes
 * from the rest of the definition (a potion is a flask of its tint, a weapon's size from its
 * numbers), so most items need no look at all. itemArt.ts turns the result into a picture.
 */

export type Rgb = readonly [number, number, number];

export function rgb(c: number): Rgb {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function seedOf(def: ItemDef): number {
  let h = 7;
  for (let i = 0; i < def.name.length; i++) h = (h * 31 + def.name.charCodeAt(i)) | 0;
  return h;
}


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
