// How a weapon handles, worked out: its damage kind's profile, its weight, then its own overrides (data in rules.combat.handling).
import type { Content, Entity, Handling, HandlingDef, HandlingTune, ItemId, SwingDir, SwingFeel, ThingDef, WeaponStats } from '../types';
import { SWING_DIRS } from '../types/input';
import { itemDef, itemWeapon, weaponStats } from './itemDefs';
import { thingDef } from './helpers';

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

function apply(h: Handling, d: HandlingDef | undefined): void {
  if (!d) return;
  for (const dir of SWING_DIRS) {
    const a = d.angles?.[dir];
    if (a) Object.assign(h.angles[dir], a);
  }
  if (d.charge !== undefined) h.charge = d.charge;
  if (d.chargeDamage !== undefined) h.chargeDamage = d.chargeDamage;
  if (d.stamina !== undefined) h.stamina = d.stamina;
  if (d.hitstop !== undefined) h.hitstop = d.hitstop;
  if (d.hitstun !== undefined) h.hitstun = d.hitstun;
  if (d.thrown !== undefined) h.thrown = d.thrown;
}

/**
 * Everything about how `w` handles, made fresh each call (cheap), so patching `w.handling` takes effect at once.
 * `kg` = the item's weight (natural weapons: none, counted as `mid`).
 */
export function handlingOf(c: Content, w: WeaponStats, kg?: number): Handling {
  const r = c.rules.combat.handling;
  const feel = (): SwingFeel => ({ windup: 1, swing: 1, damage: 1, knock: 1, stamina: 1 });
  const angles = {} as Record<SwingDir, SwingFeel>;
  for (const d of SWING_DIRS) angles[d] = feel();
  const h: Handling = { angles, charge: 1, chargeDamage: c.rules.combat.charge.damage, stamina: 1, hitstop: 1, hitstun: 1, thrown: 1 };
  apply(h, r.kinds[w.kind]);
  // Weight: heavier = slower to charge and tiring, but lands with more impact; knockback (push) adds impact too.
  const over = clamp((kg ?? r.mid) - r.mid, -r.mid, 8);
  const slow = Math.pow(r.slow, over);
  const heft = Math.pow(r.heft, over) * (0.85 + 0.15 * w.push);
  h.charge *= slow;
  h.stamina *= slow;
  h.hitstop *= heft;
  h.hitstun *= heft;
  apply(h, w.handling);
  for (const d of SWING_DIRS) h.angles[d].damage = Math.min(1, h.angles[d].damage);
  return h;
}

/** Ticks of winding up to a full charge with this handling and angle. */
export function chargeTicks(c: Content, hd: Handling | null, dir: SwingDir): number {
  const ch = c.rules.combat.charge;
  return ch.tap + Math.max(1, Math.round((ch.full - ch.tap) * (hd ? hd.charge * hd.angles[dir].windup : 1)));
}

/** How whatever an actor swings handles (its held item, else its natural weapon). */
export function actorHandling(c: Content, def: ThingDef, held: ItemId | null): Handling | null {
  const w = weaponStats(c, def, held);
  if (!w) return null;
  const fromItem = held !== null && itemWeapon(c, held) === w;
  return handlingOf(c, w, fromItem && held !== null ? itemDef(c, held)?.weight : undefined);
}

/** How much harder (or softer) an item hits when thrown. */
export function thrownDamage(c: Content, id: ItemId): number {
  const w = itemDef(c, id)?.weapon;
  return w ? handlingOf(c, w, itemDef(c, id)?.weight).thrown : c.rules.combat.handling.thrown;
}

/** The handling number `t` of whatever `e` holds (its natural weapon if empty-handed), as it is now. */
export function tunedValue(c: Content, e: Entity, t: HandlingTune): number | undefined {
  const def = thingDef(c, e.def);
  const h = e.actor ? actorHandling(c, def, e.actor.weapon) : null;
  if (!h) return undefined;
  return t.angle ? h.angles[t.angle][t.key] : h[t.key];
}

/**
 * Sets handling number `t` of what `e` holds to `v`, live: it is written into the weapon's own overrides,
 * so every item of that kind handles so until the game is reloaded. Returns the weapon's name, or null.
 */
export function tuneHeld(c: Content, e: Entity, t: HandlingTune, v: number): string | null {
  const def = thingDef(c, e.def);
  const w = e.actor ? weaponStats(c, def, e.actor.weapon) : null;
  if (!w) return null;
  const h = (w.handling ??= {});
  if (t.angle) ((h.angles ??= {})[t.angle] ??= {})[t.key] = v;
  else h[t.key] = v;
  return w.name;
}
