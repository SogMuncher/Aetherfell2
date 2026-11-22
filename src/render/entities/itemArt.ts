import type { ItemDef } from '../../types';
import { rhash } from '../color';
import type { Rgb, Axis, Painter } from './itemPaint';
import { scale, mix, clamp, lum, lit, blob, axis, along, seedOf, WOOD, LEATHER, BONE, STONE, WHITE, materialsFor, resolveLook, Pix } from './itemPaint';
import { ITEM_PARTS, weaponAxis } from './itemParts';
import { vessel } from './itemVessel';

/**
 * Item pictures, built from the item's definition rather than drawn by hand (tools and look in
 * itemPaint.ts). Every picture is a list of pieces painted in order: gear names its pieces
 * (itemParts.ts: grip, guard, blade, haft, axe bit, plates…); other items are one shared base form
 * (a vessel, coin, key, loaf, pelt, shard, stone…). Nothing here names an item id. Every item has
 * exactly one picture: the bag, the ground and the hand all use it, never mirrored, so an edge
 * painted on the left stays on the left.
 */

export { ITEM_ART, itemForm } from './itemPaint';


const FORMS: Record<string, Painter> = {
  ...ITEM_PARTS,
  vessel: (c, _d, L) => vessel(c, L),
  // A brand: a haft, a rag-wrapped head scorched at the top, and a flame in the colour of its light.
  torch: (c, d, L) => {
    const ax = weaponAxis(0.74 * L.size);
    const fire: Rgb = d.light ? [d.light.r * 255, d.light.g * 255, d.light.b * 255] : [255, 160, 60];
    const rag = mix(LEATHER, WOOD, 0.4);
    const haft = mix(WOOD, scale(WOOD, 0.75), rhash(L.seed, 4, 1));
    c.paint((u, v, x, y) => {
      const { t, s } = along(ax, u, v);
      if (t < -0.02 || t > 1.3) return null;
      const as = Math.abs(s);
      // Flame: a teardrop licking up from the head, white-hot in the middle.
      if (t > 0.9) {
        const k = (t - 0.9) / 0.4;
        const hw = 0.085 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.9) * (1 - k * 0.35);
        if (as < hw && k < 1) {
          const core = 1 - as / Math.max(0.001, hw);
          return mix(fire, WHITE, clamp(core * 0.9 - k * 0.3, 0, 0.85));
        }
      }
      if (t > 1) return null;
      if (t > 0.74) {
        const hw = 0.055 - (t - 0.74) * 0.06;
        if (as > hw) return null;
        const scorch = clamp((t - 0.86) / 0.14, 0, 1);
        const base = lit(rag, s / hw, 0.1);
        return rhash(x, y, L.seed) < 0.3 ? scale(mix(base, [30, 24, 18], scorch), 0.85) : mix(base, [30, 24, 18], scorch);
      }
      if (as < 0.028) return s < 0 ? haft : scale(haft, 0.72);
      return null;
    });
  },
  coin: (c, _d, L) => {
    const r = 0.24 * L.size;
    const face = blob(0.5, 0.5, r, r, L.fill);
    c.paint((u, v) => {
      const col = face(u, v);
      if (!col) return null;
      const d = Math.hypot(u - 0.5, v - 0.5);
      return d > r - 0.05 ? scale(L.fill, 0.75) : col;
    });
    c.dot(0.4, 0.38, WHITE);
  },
  key: (c, _d, L) => {
    const ax = axis(0.3, 0.3, 0.8, 0.8);
    c.paint((u, v) => {
      const ring = Math.hypot(u - 0.27, v - 0.27);
      if (ring < 0.16 && ring > 0.07) return lit(L.fill, (u - 0.27) * 5, (v - 0.27) * 5);
      const { t, s } = along(ax, u, v);
      if (t >= 0 && t <= 1 && Math.abs(s) < 0.035) return L.fill;
      // Teeth.
      if (t > 0.7 && t <= 1 && s > 0 && s < 0.13 && Math.floor(t * 12) % 2 === 0) return scale(L.fill, 0.8);
      return null;
    });
  },
  loaf: (c, _d, L) => {
    const rx = 0.32 * L.size;
    const ry = 0.2 * L.size;
    const base = blob(0.5, 0.56, rx, ry, L.fill);
    const cuts = 2 + Math.floor(rhash(L.seed, 5, 5) * 3);
    c.paint((u, v) => {
      const col = base(u, v);
      if (!col) return null;
      const k = ((u - 0.5 + rx) / (2 * rx)) * (cuts + 1);
      const score = Math.abs(k - Math.round(k)) < 0.12 && Math.round(k) > 0 && Math.round(k) <= cuts && v < 0.58;
      return score ? scale(col, 0.6) : col;
    });
  },
  haunch: (c, _d, L) => {
    c.paint(blob(0.42, 0.58, 0.27 * L.size, 0.23 * L.size, L.fill));
    const bone = axis(0.6, 0.42, 0.82, 0.18);
    c.paint((u, v) => {
      const { t, s } = along(bone, u, v);
      if (t > 0 && t < 1 && Math.abs(s) < 0.035) return BONE;
      return Math.hypot(u - 0.84, v - 0.16) < 0.06 ? BONE : null;
    });
  },
  pelt: (c, _d, L) => {
    const base = blob(0.5, 0.55, 0.36 * L.size, 0.24 * L.size, L.fill);
    c.paint((u, v, x, y) => {
      const col = base(u, v);
      if (!col) return null;
      // Fur: streaks and a ragged lower edge.
      if (v > 0.68 && (x + Math.floor(rhash(x, 0, L.seed) * 2)) % 2 === 0) return null;
      return rhash(x, y, L.seed) > 0.75 ? scale(col, 0.82) : col;
    });
  },
  shard: (c, _d, L) => {
    const s = L.size;
    c.paint((u, v) => {
      const dv = v - 0.5;
      const hw = (0.2 - Math.abs(dv) * 0.42) * s;
      if (Math.abs(dv) > 0.42 * s || Math.abs(u - 0.5) > hw) return null;
      return u < 0.5 ? scale(L.fill, 1.12) : scale(L.fill, 0.78);
    });
    c.dot(0.45, 0.32, WHITE);
  },
  stone: (c, _d, L) => {
    const base = blob(0.5, 0.55, 0.32 * L.size, 0.28 * L.size, L.shell ?? STONE);
    const glow = L.glow ?? L.fill;
    // A carved rune: a few strokes picked from the item's seed.
    const strokes: Axis[] = [];
    const n = 2 + Math.floor(rhash(L.seed, 7, 1) * 2);
    for (let i = 0; i < n; i++) {
      const a = rhash(L.seed, i, 8) * Math.PI;
      const r = 0.14;
      strokes.push(axis(0.5 - Math.cos(a) * r, 0.55 - Math.sin(a) * r, 0.5 + Math.cos(a) * r * 0.8, 0.55 + Math.sin(a) * r * 0.8));
    }
    c.paint((u, v) => {
      const col = base(u, v);
      if (!col) return null;
      for (const ax of strokes) {
        const { t, s } = along(ax, u, v);
        if (t >= 0 && t <= 1 && Math.abs(s) < 0.03) return glow;
      }
      return col;
    });
  },
  bundle: (c, _d, L) => {
    // Cloth rolled round two poles and lashed.
    const poles = axis(0.12, 0.84, 0.86, 0.12);
    c.paint((u, v) => {
      const { t, s } = along(poles, u, v);
      if (t < 0 || t > 1) return null;
      if (Math.abs(s) < 0.2 * L.size && t > 0.2 && t < 0.8) {
        if (Math.abs(t - 0.5) < 0.03) return LEATHER;
        return lit(L.fill, s / 0.2, (t - 0.5) * 2);
      }
      if (Math.abs(Math.abs(s) - 0.05) < 0.025) return WOOD;
      return null;
    });
  },
  lump: (c, _d, L) => {
    c.paint(blob(0.5, 0.55, 0.26 * L.size, 0.24 * L.size, L.fill));
    c.dot(0.4, 0.42, WHITE);
  },
};

/**
 * Paints the picture of an item from what its definition says it is, using the shared base forms
 * above. Any new item gets a sensible picture with no new art.
 */
export function paintItem(def: ItemDef | undefined): Uint32Array {
  const c = new Pix();
  if (!def) {
    c.paint(blob(0.5, 0.5, 0.25, 0.25, [255, 0, 255]));
  } else {
    materialsFor(seedOf(def));
    const L = resolveLook(def);
    for (const part of L.parts) (FORMS[part] ?? FORMS.lump)?.(c, def, L);
    // Very dark items still need to read as something.
    if (lum(L.fill) < 0.12 && L.form === 'lump') c.dot(0.5, 0.5, WHITE);
  }
  c.outline();
  return c.px;
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

/** The base forms this painter knows, for checks and tools. */
export const ITEM_FORMS: readonly string[] = Object.keys(FORMS);
