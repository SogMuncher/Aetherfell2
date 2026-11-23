import type {
  ArmourStats, BodyRegionId, DamageKind, EnchantDef, GearFormDef, GearMaterialDef, GearQualityDef, GearRoll, GearTables, ItemDef, ItemId, OutfitEntry, Rng, WeaponStats,
} from '../types';
import { HAND_SLOT, joinWear } from '../types';

/** Pieces of gear made from their ids: one generic recipe for weapons and armour alike (tables in content/gear.ts). */

const PREFIX = 'gear:';

export interface GearChoice {
  form: string;
  material: string;
  quality: string;
  enchant?: string;
}

/** The id of a piece of gear (as good as new). */
export function gearId(c: GearChoice): ItemId {
  return `${PREFIX}${c.form}:${c.material}:${c.quality}${c.enchant ? `:${c.enchant}` : ''}`;
}

/** The choice an id stands for, if it is a well-formed gear id of things that exist (without any `@wear`). */
export function parseGear(t: GearTables, id: ItemId): GearChoice | null {
  if (!id.startsWith(PREFIX)) return null;
  const [form, material, quality, enchant, extra] = id.slice(PREFIX.length).split(':');
  if (extra !== undefined || !form || !material || !quality || !t.forms[form] || !t.materials[material] || !t.qualities[quality]) return null;
  if (enchant !== undefined && !t.enchants[enchant]) return null;
  return enchant === undefined ? { form, material, quality } : { form, material, quality, enchant };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lighten(c: number, k: number): number {
  const ch = (shift: number): number => Math.min(255, Math.round(((c >> shift) & 255) * (1 + k)) + Math.round(k * 40));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function resistOf(a: Partial<Record<DamageKind, number>>, b: Partial<Record<DamageKind, number>> | undefined): Partial<Record<DamageKind, number>> {
  if (!b) return a;
  const out: Partial<Record<DamageKind, number>> = { ...a };
  for (const [k, v] of Object.entries(b) as [DamageKind, number][]) out[k] = (out[k] ?? 1) * v;
  return out;
}

function durabilityOf(f: GearFormDef, m: GearMaterialDef, q: GearQualityDef, e: EnchantDef | undefined): number {
  return Math.max(1, Math.round(f.durability * m.durability * q.durability * (e?.durability ?? 1)));
}

const cache = new WeakMap<GearTables, Map<ItemId, ItemDef | null>>();

/** The full definition of a piece of gear, worked out from its id (and remembered). */
export function gearItem(t: GearTables, id: ItemId): ItemDef | null {
  let m = cache.get(t);
  if (!m) cache.set(t, (m = new Map()));
  const hit = m.get(id);
  if (hit !== undefined) return hit;
  const ch = parseGear(t, id);
  let def: ItemDef | null = null;
  if (ch) {
    const f = t.forms[ch.form] as GearFormDef;
    const mat = t.materials[ch.material] as GearMaterialDef;
    const q = t.qualities[ch.quality] as GearQualityDef;
    const en = ch.enchant ? t.enchants[ch.enchant] : undefined;
    const power = mat.power * q.power * (en?.power ?? 1);
    const name = capital([q.name, mat.name, f.name].filter(Boolean).join(' ')) + (en ? ` ${en.name}` : '');
    const tint = { r: (mat.tint >> 16) & 255, g: (mat.tint >> 8) & 255, b: mat.tint & 255 };
    const w = f.weapon;
    const weapon: WeaponStats | undefined = w && {
      name,
      damage: Math.round(w.damage * power * 10) / 10,
      kind: w.kind,
      reach: w.reach,
      speed: w.speed ?? 1,
      push: w.push ?? 1,
      tint,
      ...(w.swings ? { swings: [...w.swings] } : {}),
      ...(w.charge !== undefined ? { charge: w.charge } : {}),
      ...(en?.hit ? { effects: en.hit } : {}),
    };
    const armour: ArmourStats | undefined = f.armor !== undefined && f.slot !== HAND_SLOT ? { region: f.slot, armor: Math.round(f.armor * power * 10) / 10, resist: resistOf(mat.resist, en?.resist) } : undefined;
    const glow = en ? en.glow : q.sheen > 0.2 ? lighten(mat.tint, 0.35 + q.sheen * 0.3) : undefined;
    def = {
      name,
      category: weapon ? 'weapon' : 'armour',
      weight: Math.round(f.weight * mat.weight * 10) / 10,
      value: Math.max(1, Math.round(f.value * mat.value * q.value * (en?.value ?? 1))),
      tint: mat.tint,
      material: mat.material,
      durability: durabilityOf(f, mat, q, en),
      look: { parts: f.parts, shell: mat.tint, glow, sparkle: q.sheen > 0.8 || !!en, plate: Math.min(1, (f.plate + mat.plate) / 2 + 0.05), surface: mat.surface },
      ...(weapon ? { weapon } : {}),
      ...(armour ? { armour } : {}),
    };
  }
  m.set(id, def);
  return def;
}

/** How much of its protection a piece still gives, by how worn it is (1 as new). */
export function gearEffect(t: GearTables, def: Pick<ItemDef, 'wear' | 'durability'>): number {
  const k = (def.wear ?? def.durability ?? 1) / Math.max(1, def.durability ?? 1);
  return t.rules.worn + (1 - t.rules.worn) * k;
}

function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0;
  for (const i of items) total += weight(i);
  if (total <= 0) return undefined;
  let at = rng.next() * total;
  for (const i of items) {
    at -= weight(i);
    if (at <= 0) return i;
  }
  return items[items.length - 1];
}

/** Makes a piece of gear at random: anything the roll leaves open is chosen by how common it is. */
export function rollGear(t: GearTables, rng: Rng, roll: GearRoll, wearShare = 1): ItemId | null {
  const allowed = (m: GearMaterialDef, id: string): boolean => !roll.materials || roll.materials.includes(id) || roll.materials.includes(m.family);
  const forms = Object.entries(t.forms).filter(
    ([id, f]) => (!roll.form || roll.form === id) && (!roll.region || roll.region === f.slot) && Object.entries(t.materials).some(([mid, m]) => f.families.includes(m.family) && allowed(m, mid)),
  );
  const form = forms.length ? forms[rng.int(forms.length)] : undefined;
  if (!form) return null;
  const mats = Object.entries(t.materials).filter(([mid, m]) => form[1].families.includes(m.family) && allowed(m, mid));
  const mat = weighted(rng, mats, ([, m]) => m.rarity);
  const quals = Object.entries(t.qualities).filter(([qid]) => !roll.qualities || roll.qualities.includes(qid));
  const qual = weighted(rng, quals, ([, q]) => q.rarity);
  if (!mat || !qual) return null;
  const choice: GearChoice = { form: form[0], material: mat[0], quality: qual[0] };
  const odds = roll.enchant ?? t.rules.enchantChance;
  if (odds > 0 && rng.chance(odds)) {
    const fits = Object.entries(t.enchants).filter(([, e]) => !e.slots || e.slots.includes(form[1].slot));
    const en = weighted(rng, fits, ([, e]) => e.rarity);
    if (en) choice.enchant = en[0];
  }
  const id = gearId(choice);
  const full = durabilityOf(form[1], mat[1], qual[1], choice.enchant ? t.enchants[choice.enchant] : undefined);
  return wearShare < 1 ? joinWear(id, Math.max(1, Math.round(full * wearShare)), full) : id;
}

/** What a creature of this kind is found wearing, and holding (a HAND_SLOT roll), like a traveller's own gear. */
export function rollOutfit(t: GearTables, rng: Rng, outfit: readonly OutfitEntry[], regions: readonly BodyRegionId[]): { worn: Record<BodyRegionId, ItemId> | null; held: ItemId | null } {
  let worn: Record<BodyRegionId, ItemId> | null = null;
  let held: ItemId | null = null;
  for (const o of outfit) {
    if (!rng.chance(o.chance)) continue;
    // What people are found with is plain unless their outfit asks for magic.
    const id = rollGear(t, rng, { enchant: 0, ...o.roll }, rng.range(t.rules.droppedWear[0], t.rules.droppedWear[1]));
    const slot = id ? t.forms[parseGear(t, id.split('@')[0] ?? '')?.form ?? '']?.slot : undefined;
    if (!id || !slot) continue;
    if (slot === HAND_SLOT) held ??= id;
    else if (regions.includes(slot) && !worn?.[slot]) (worn ??= {})[slot] = id;
  }
  return { worn, held };
}

/** Which part of the body a blow lands on: by how much of the fight lands there, leaning with the way it was swung. */
export function pickRegion(t: GearTables, regions: readonly BodyRegionId[], swing: string | null, rng: Rng): BodyRegionId | null {
  return weighted(rng, regions.filter((r) => t.regions[r]), (r) => (t.regions[r]?.cover ?? 0) * (swing ? (t.regions[r]?.aim?.[swing] ?? 1) : 1)) ?? null;
}
