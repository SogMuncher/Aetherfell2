// Worn armour and the held item laid onto any creature's art recipe: shells over the parts each slot covers, the item at the hand
import type { ArtDef, ArtId, ArtPart, Entity, ItemDef, Span, Surface, Vec3 } from '../../types';
import { HAND_SLOT } from '../../types';
import { CONTENT, itemDef } from '../../content';
import { itemRecipe, itemWorldSize } from './itemArt';

/**
 * Nothing here knows a creature or an item. Body parts marked `wear` (content/looks.ts) say which
 * gear slot covers them. A worn piece becomes a shell over each marked part of its region: the same
 * shape grown and moved by the region's `fit` (content/gear.ts), in the piece's own colour and
 * texture (its material: leather, iron, linen). So every helm on every head shares one silhouette
 * and a new armour needs only data. The held item is its own picture's pieces (itemArt.ts), scaled
 * to its world size and set in the part marked 'hand', so it swings with the arm.
 */

export interface Outfitted {
  /** Recipe id plus what is worn and held: pictures are shared by everyone dressed alike. */
  id: ArtId;
  def: ArtDef;
  /** Features the gear covers up (a helm hides a hat). */
  hides: readonly string[];
}

const wearable = new WeakMap<ArtDef, boolean>();
const built = new Map<string, Outfitted>();

const mid = (s: Span): number => (typeof s === 'number' ? s : (s[0] + s[1]) / 2);

function hexOf(c: number): string {
  const h = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${h(c & 255)}${h((c >>> 8) & 255)}${h((c >>> 16) & 255)}`;
}

/** An item's definition as it looks fresh: wear only rusts the bag picture, so bodies are not repainted every blow. */
function fresh(id: string): ItemDef | undefined {
  const def = itemDef(CONTENT, id);
  return def ? { ...def, wear: def.durability } : undefined;
}

/** A shell over body part `p`, in the worn piece's colour and texture. */
function shell(p: ArtPart, fit: { grow: Vec3; shift: Vec3 }, color: string, surface: Surface): ArtPart | null {
  if (!p.at) return null;
  const s = [mid(p.size[0]), mid(p.size[1]), mid(p.size[2])];
  const at: Vec3 = [p.at[0] + fit.shift[0] * (s[0] ?? 0), p.at[1] + fit.shift[1] * (s[1] ?? 0), p.at[2] + fit.shift[2] * (s[2] ?? 0)];
  const size: Vec3 = [(s[0] ?? 0) * fit.grow[0], (s[1] ?? 0) * fit.grow[1], (s[2] ?? 0) * fit.grow[2]];
  const parent = p.id ?? p.parent;
  return { shape: p.shape, at, size, color, surface, tilt: p.tilt, yaw: p.yaw, roll: p.roll, mirror: p.mirror, feature: p.feature, ...(parent ? { parent } : {}) };
}

/** The held item's pieces, gripped at hand part `h`, pointing forward and up. */
function heldParts(h: ArtPart, def: ItemDef): ArtPart[] {
  if (!h.at) return [];
  const { art, dress, colours } = itemRecipe(def);
  const has = new Set(dress.features ?? []);
  const slot = new Map(Object.keys(art.colors).map((k, i) => [k, i + 1]));
  const st = dress.stretch ?? [1, 1, 1];
  const parts = art.parts.filter((p) => p.at && (!p.feature || (p.feature.startsWith('!') ? !has.has(p.feature.slice(1)) : has.has(p.feature))));
  // Its length from foot to tip, in the recipe's own units.
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of parts) {
    const y = (p.at?.[1] ?? 0) * st[1];
    const r = mid(p.size[1]) * st[1];
    lo = Math.min(lo, p.shape === 'cone' ? y : y - r);
    hi = Math.max(hi, y + r);
  }
  if (!(hi > lo)) return [];
  const hold = CONTENT.gear.hand.hold;
  const k = (itemWorldSize(def) * hold.length) / (hi - lo);
  const grip = lo + (hi - lo) * hold.grip;
  const t = (hold.tilt * Math.PI) / 180;
  const parent = h.parent ?? h.id;
  return parts.map((p) => {
    const at = p.at as Vec3;
    const f = at[0] * st[0] * k;
    const u = (at[1] * st[1] - grip) * k;
    const c = p.color.startsWith('#') ? p.color : hexOf(colours[slot.get(p.color) ?? 0] ?? 0xff00ff);
    const size: Vec3 = [mid(p.size[0]) * st[0] * k, mid(p.size[1]) * st[1] * k, mid(p.size[2]) * st[2] * k];
    return {
      shape: p.shape,
      at: [h.at![0] + f * Math.cos(t) + u * Math.sin(t), h.at![1] - f * Math.sin(t) + u * Math.cos(t), h.at![2] + at[2] * st[2] * k],
      size,
      color: c,
      surface: dress.surfaces?.[p.color] ?? p.surface,
      tilt: (p.tilt ?? 0) + hold.tilt,
      yaw: p.yaw,
      roll: p.roll,
      ...(parent ? { parent } : {}),
    };
  });
}

/** Strips the wear count off an item id: the same piece looks the same however worn. */
const base = (id: string): string => id.split('@')[0] ?? id;

/** Recipe `id` dressed in what entity `e` wears and holds (the recipe itself when it shows no gear). */
export function outfitted(id: ArtId, def: ArtDef, e: Entity): Outfitted | null {
  let can = wearable.get(def);
  if (can === undefined) wearable.set(def, (can = def.parts.some((p) => p.wear)));
  const held = e.actor?.weapon ?? null;
  if (!can || (!e.worn && !held)) return null;
  const worn = Object.entries(e.worn ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const key = `${id}|${worn.map(([r, i]) => `${r}=${base(i)}`).join(',')}|${held ? base(held) : ''}`;
  let o = built.get(key);
  if (o) return o;
  const extra: ArtPart[] = [];
  const hides: string[] = [];
  for (const [region, item] of worn) {
    const fit = CONTENT.gear.regions[region]?.fit;
    const d = fresh(item);
    if (!fit || !d) continue;
    const { dress, colours, art } = itemRecipe(d);
    const shellSlot = Object.keys(art.colors).indexOf('shell') + 1;
    const color = hexOf(colours[shellSlot] ?? 0x808080);
    const surface = dress.surfaces?.shell ?? 'cloth';
    for (const p of def.parts) if (p.wear === region) {
      const s = shell(p, fit, color, surface);
      if (s) extra.push(s);
    }
    hides.push(...(fit.hides ?? []));
  }
  const hd = held ? fresh(held) : undefined;
  const hand = def.parts.find((p) => p.wear === HAND_SLOT);
  if (hd && hand) extra.push(...heldParts(hand, hd));
  if (built.size > 400) built.clear();
  o = { id: key, def: extra.length ? { ...def, parts: [...def.parts, ...extra] } : def, hides };
  built.set(key, o);
  return o;
}
