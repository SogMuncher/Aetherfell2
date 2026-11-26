import type { BodyRegionId, BreakDef, Content, Entity, HeldLightDef, ItemDef, ItemId, ThingDef, WeaponStats } from '../types';
import { joinWear, splitWear } from '../types';
import { gearItem } from './gearItems';

/**
 * One way to read any item id: a table entry or a piece of gear, plus how worn this one is
 * (`id@wear`). Every item has durability (its own, else its category's), can be swung (its own
 * weapon, else as it is: `rules.items.improvised`) and can break (its `onBreak`).
 */

type ItemContent = Pick<Content, 'items' | 'gear' | 'rules'>;

const cache = new WeakMap<object, Map<ItemId, ItemDef | null>>();

/** The definition of any item, with `durability` always filled in and `wear` for a worn one. */
export function itemDef(c: ItemContent, id: ItemId): ItemDef | undefined {
  let m = cache.get(c.items);
  if (!m) cache.set(c.items, (m = new Map()));
  const hit = m.get(id);
  if (hit !== undefined) return hit ?? undefined;
  const { base, wear } = splitWear(id);
  const def = c.items[base] ?? gearItem(c.gear, base);
  let out: ItemDef | null = null;
  if (def) {
    const durability = Math.max(1, def.durability ?? c.rules.items.durability[def.category] ?? 1);
    const w = wear === undefined ? durability : Math.max(0, Math.min(durability, wear));
    // A worn item is worth less.
    const value = w < durability ? Math.max(1, Math.round(def.value * (0.4 + (0.6 * w) / durability))) : def.value;
    out = { ...def, durability, wear: w, value, material: def.material ?? c.rules.items.material[def.category] };
  }
  m.set(id, out);
  return out ?? undefined;
}

/** The same item with this many blows left. */
export function withWear(c: ItemContent, id: ItemId, wear: number): ItemId {
  const def = itemDef(c, id);
  return joinWear(splitWear(id).base, wear, def?.durability ?? 1);
}

/** The same item as good as new (mended). */
export function mended(id: ItemId): ItemId {
  return splitWear(id).base;
}

/** How sound an item is, in words. */
export function gearCondition(def: Pick<ItemDef, 'wear' | 'durability'>): string {
  const k = (def.wear ?? 1) / Math.max(1, def.durability ?? 1);
  return k >= 0.8 ? 'sound' : k >= 0.5 ? 'worn' : k >= 0.2 ? 'battered' : 'nearly broken';
}

/** What it does where it breaks: its own reaction, else nothing but the pieces. */
export function breakOf(c: ItemContent, id: ItemId): BreakDef {
  return itemDef(c, id)?.onBreak ?? {};
}

const swung = new WeakMap<object, Map<ItemId, WeaponStats | null>>();

/** How an item fights in the hands: its own weapon, else swung as it is (heavier hits harder and slower). */
export function itemWeapon(c: ItemContent, id: ItemId): WeaponStats | null {
  let m = swung.get(c.items);
  if (!m) swung.set(c.items, (m = new Map()));
  const hit = m.get(id);
  if (hit !== undefined) return hit;
  const def = itemDef(c, id);
  let w: WeaponStats | null = def?.weapon ?? null;
  if (def && !w) {
    const r = c.rules.items.improvised;
    w = {
      name: def.name,
      damage: Math.round((r.damage + r.perKg * def.weight) * 10) / 10,
      kind: r.kind,
      reach: r.reach,
      speed: r.speed + r.slowPerKg * def.weight,
      push: r.push + r.pushPerKg * def.weight,
      tint: { r: (def.tint >> 16) & 255, g: (def.tint >> 8) & 255, b: def.tint & 255 },
    };
  }
  m.set(id, w);
  return w;
}

/** The weapon an actor is swinging: whatever is in its hands, or the natural one from its definition. */
export function weaponStats(c: Content, def: ThingDef, held: ItemId | null): WeaponStats | null {
  return (held ? itemWeapon(c, held) : null) ?? def.actor?.weapon ?? null;
}

/** The light an actor carries because of what it holds (a torch in the hand), if any. */
export function heldLight(c: Content, e: Entity): HeldLightDef | undefined {
  const w = e.actor?.weapon;
  return w ? itemDef(c, w)?.light : undefined;
}

/** The glider worn on the body, if any (the one that soars best, should several be worn). */
export function wornGlider(c: ItemContent, e: Entity): ItemDef | undefined {
  let best: ItemDef | undefined;
  for (const id of Object.values(e.worn ?? {})) {
    const d = itemDef(c, id);
    if (d?.glide && !(best?.glide && best.glide.soar >= d.glide.soar)) best = d;
  }
  return best;
}

/** Total weight of what is worn (kg). */
export function wornWeight(c: ItemContent, worn: Readonly<Record<BodyRegionId, ItemId>> | undefined): number {
  let w = 0;
  if (worn) for (const id of Object.values(worn)) w += itemDef(c, id)?.weight ?? 0;
  return w;
}

/** The item after taking `n` blows, or null when that breaks it. */
export function takeBlows(c: ItemContent, id: ItemId, n: number): ItemId | null {
  const def = itemDef(c, id);
  if (!def) return null;
  const left = (def.wear ?? def.durability ?? 1) - n;
  return left > 0 ? withWear(c, id, left) : null;
}
