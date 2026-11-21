import { CONTENT } from './index';
import type { Content, Creature, Entity, HeldLightDef, ItemId, ItemStack, Rng, ThingDef, WeaponStats } from '../types';
import { itemDef, rollGear } from './gear';


/** Fills {name} slots in a line of text from content ("Kill {count} of them"). Unknown slots stay as they are. */
export function fillText(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** "wolves" for a wolf: the definition's plural, or its name plus s. */
export function pluralName(def: ThingDef): string {
  return def.plural ?? `${def.name}s`;
}

/** The made-up part of a place's name ("Ashford" from "Ruins of Ashford"), read back through its site's name pattern. */
export function siteBaseName(c: Content, kind: string, name: string): string {
  const pattern = c.sites[kind]?.name ?? '{base}';
  const at = pattern.indexOf('{base}');
  if (at < 0) return name;
  const before = pattern.slice(0, at);
  const after = pattern.slice(at + '{base}'.length);
  let out = name;
  if (before && out.startsWith(before)) out = out.slice(before.length);
  if (after && out.endsWith(after)) out = out.slice(0, out.length - after.length);
  return out;
}

/** Fallback for ids that are missing (e.g. from an older save) so nothing crashes. */
export const UNKNOWN_THING: ThingDef = {
  name: 'something',
  body: { radius: 0.3, height: 0.5, mass: 1, solid: false },
  material: 'wood',
  sprite: 'unknown',
};

export function thingDef(c: Content, id: string): ThingDef {
  return c.things[id] ?? UNKNOWN_THING;
}

/** The weapon an actor is swinging: its wielded item, or the natural one from its definition. */
export function weaponStats(c: Content, def: ThingDef, wielded: ItemId | null): WeaponStats | null {
  if (wielded) {
    const w = c.items[wielded]?.weapon;
    if (w) return w;
  }
  return def.actor?.weapon ?? null;
}

/** The light an actor carries because of what it wields (a torch in the hand), if any. */
export function heldLight(c: Content, e: Entity): HeldLightDef | undefined {
  const w = e.actor?.weapon;
  // A worn-out brand is still a brand: it only hits softly.
  return w ? c.items[w]?.light : undefined;
}

/** Walks, fights and thinks for itself: an animal, a monster or a villager, all the same to the systems. */
export function isCreature(e: Entity): e is Creature {
  return e.actor !== undefined && e.ai !== undefined;
}

/**
 * Whether others see this thing as dangerous: a traveller, or a creature whose brain hunts.
 * Skittish creatures keep their distance from these.
 */
export function looksDangerous(c: Content, e: Entity): boolean {
  if (e.player) return true;
  const brain = c.brains[thingDef(c, e.def).brain ?? ''];
  return brain?.behaviours.some((b) => b.do === 'hunt') ?? false;
}

/** Combined movement multiplier from every active status. */
export function moveFactor(c: Content, status: Readonly<Record<string, number>>): number {
  let m = 1;
  for (const id in status) m *= c.statuses[id]?.move ?? 1;
  return m;
}

/** Any active status that stops acting (stagger). */
export function isDisabled(c: Content, status: Readonly<Record<string, number>>): boolean {
  for (const id in status) if (c.statuses[id]?.disables) return true;
  return false;
}

/** Any active status that makes creatures panic (burning). */
export function isPanicking(c: Content, status: Readonly<Record<string, number>>): boolean {
  for (const id in status) if (c.statuses[id]?.panic) return true;
  return false;
}

/** Rolls a drop table with the sim's seeded random numbers. */
export function rollLoot(c: Content, id: string, rng: Rng): ItemStack[] {
  const out: ItemStack[] = [];
  for (const e of c.loot[id]?.entries ?? []) {
    if (!rng.chance(e.chance)) continue;
    const id = e.gear ? rollGear(c.gear, rng, e.gear) : e.item;
    if (id) out.push({ id, count: e.min + rng.int(e.max - e.min + 1) });
  }
  return out;
}

/** Experience a skill needs to go from this level to the next. */
export function skillXp(level: number): number {
  return 20 + level * level * 12;
}

/** Weight of a pile of item stacks (kg). */
export function stackWeight(items: readonly ItemStack[]): number {
  let w = 0;
  for (const s of items) w += (itemDef(CONTENT, s.id)?.weight ?? 0) * s.count;
  return w;
}
