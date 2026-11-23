import type { Content, GearRoll, Rng } from '../types';
import { HAND_SLOT } from '../types';
import { rollGear } from './gearItems';
import { itemDef } from './itemDefs';

/** The problems with the gear tables (empty when all is well). */
export function gearProblems(c: Content): string[] {
  const out: string[] = [];
  const t = c.gear;
  for (const [id, r] of Object.entries(t.regions)) {
    if (!(r.cover > 0)) out.push(`gear region '${id}': cover must be above 0`);
    if (!r.at.length) out.push(`gear region '${id}': needs at least one box on the paperdoll`);
  }
  if (t.regions[HAND_SLOT]) out.push(`gear region '${HAND_SLOT}': the hands are a slot of their own, not a body part`);
  if (!t.hand.at.length) out.push('gear hand: needs a box on the paperdoll');
  const families = new Set(Object.values(t.materials).map((m) => m.family));
  const slotOk = (s: string): boolean => s === HAND_SLOT || !!t.regions[s];
  for (const [id, f] of Object.entries(t.forms)) {
    const w = `gear form '${id}'`;
    if (!slotOk(f.slot)) out.push(`${w}: unknown slot '${f.slot}'`);
    if (f.slot === HAND_SLOT ? !f.weapon : f.armor === undefined) out.push(`${w}: held forms need a weapon, worn ones armor`);
    if (!f.families.some((fam) => families.has(fam))) out.push(`${w}: no material is made of any of its families`);
    if (!(f.weight >= 0 && f.durability > 0 && (f.armor ?? 0) >= 0 && (f.weapon?.damage ?? 0) >= 0)) out.push(`${w}: numbers must be positive`);
    if (!f.parts.length) out.push(`${w}: needs at least one picture part`);
  }
  for (const [id, m] of Object.entries(t.materials)) {
    if (!(m.material in c.materials)) out.push(`gear material '${id}': unknown material '${m.material}'`);
    if (!(m.power > 0 && m.durability > 0 && m.rarity > 0)) out.push(`gear material '${id}': multipliers and rarity must be above 0`);
  }
  for (const [id, q] of Object.entries(t.qualities)) if (!(q.power > 0 && q.durability > 0 && q.rarity > 0)) out.push(`gear quality '${id}': multipliers and rarity must be above 0`);
  for (const [id, e] of Object.entries(t.enchants)) {
    if (!(e.rarity > 0 && e.value > 0)) out.push(`gear enchantment '${id}': rarity and value must be above 0`);
    for (const s of e.slots ?? []) if (!slotOk(s)) out.push(`gear enchantment '${id}': unknown slot '${s}'`);
    if (!e.hit && !e.resist && e.power === undefined && e.durability === undefined) out.push(`gear enchantment '${id}': does nothing`);
  }
  const rolls: [string, GearRoll][] = [];
  for (const [id, l] of Object.entries(c.loot)) for (const e of l.entries) if (e.gear) rolls.push([`loot '${id}'`, e.gear]);
  for (const [id, th] of Object.entries(c.things)) {
    for (const r of th.wears ?? []) if (!t.regions[r]) out.push(`thing '${id}': unknown body part '${r}'`);
    for (const o of th.outfit ?? []) {
      rolls.push([`thing '${id}' outfit`, o.roll]);
      if (o.roll.region === HAND_SLOT ? !th.actor : o.roll.region && !th.wears?.includes(o.roll.region)) out.push(`thing '${id}': outfit puts '${o.roll.region}' where it has none`);
    }
  }
  // Where gear shows on a body (render/entities/gearArt.ts): top-level fixed parts, known slots.
  for (const [id, d] of Object.entries(c.art)) for (const p of d.parts) if (p.wear && (!slotOk(p.wear) || !p.at)) out.push(`art '${id}': gear slot '${p.wear}' must be a known slot on a fixed part`);
  // Every roll must be able to make something, and with the right words.
  const probe: Rng = { next: () => 0.5, range: (a, b) => (a + b) / 2, int: (n) => Math.floor(n / 2), chance: () => false, pick: (a) => a[Math.floor(a.length / 2)] as never };
  for (const [where, r] of rolls) {
    if (r.region && !slotOk(r.region)) out.push(`${where}: unknown slot '${r.region}'`);
    if (r.form && !t.forms[r.form]) out.push(`${where}: unknown gear form '${r.form}'`);
    for (const q of r.qualities ?? []) if (!t.qualities[q]) out.push(`${where}: unknown quality '${q}'`);
    for (const m of r.materials ?? []) if (!t.materials[m] && !families.has(m)) out.push(`${where}: unknown material '${m}'`);
    if (!rollGear(t, probe, r)) out.push(`${where}: no gear can be made from it`);
  }
  for (const id of c.rules.start.worn) if (!itemDef(c, id)?.armour) out.push(`rules.start.worn: '${id}' is not armour`);
  for (const [id, it] of Object.entries(c.items)) if (it.armour && !t.regions[it.armour.region]) out.push(`item '${id}': unknown body part '${it.armour.region}'`);
  for (const [cat, n] of Object.entries(c.rules.items.durability)) if (!(n >= 1)) out.push(`rules.items.durability '${cat}': must be at least 1`);
  return out;
}
