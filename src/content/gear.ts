import type {
  ArmourStats, BodyRegionId, Content, GearFormDef, GearMaterialDef, GearQualityDef, GearRoll, GearTables, ItemDef, ItemId, OutfitEntry, Rng,
} from '../types';

/**
 * Armour as data. Body parts, garments, materials and qualities are four small tables; a piece of
 * armour is one entry from each, so "Fine iron helm" is not written anywhere. Its id carries the
 * choice (`gear:helm:iron:fine`) and, once it has taken blows, how many it has left
 * (`gear:helm:iron:fine:41`), so a bag, a drop, a save and a message over the network all carry it
 * as a plain string, like every other item. `gearItem` turns the id back into a full definition
 * (name, weight, value, picture hints, protection) whenever something asks.
 *
 * Adding a metal, a garment, a grade of work or a body part is a new entry below and nothing else.
 */
export const GEAR: GearTables = {
  regions: {
    head: { name: 'Head', cover: 0.2, aim: { overhead: 2.4, left: 0.8, right: 0.8, thrust: 0.9 }, at: [{ x: 0.34, y: 0.02, w: 0.32, h: 0.2 }] },
    torso: { name: 'Torso', cover: 0.45, aim: { thrust: 1.5, overhead: 0.8 }, at: [{ x: 0.28, y: 0.24, w: 0.44, h: 0.34 }] },
    arms: { name: 'Arms', cover: 0.15, aim: { left: 1.7, right: 1.7, thrust: 0.6, overhead: 0.5 }, at: [{ x: 0.08, y: 0.25, w: 0.18, h: 0.34 }, { x: 0.74, y: 0.25, w: 0.18, h: 0.34 }] },
    legs: { name: 'Legs', cover: 0.2, aim: { left: 1.3, right: 1.3, thrust: 0.9 }, at: [{ x: 0.3, y: 0.6, w: 0.18, h: 0.38 }, { x: 0.52, y: 0.6, w: 0.18, h: 0.38 }] },
  },
  forms: {
    cap: { name: 'cap', region: 'head', families: ['cloth', 'hide'], armor: 1, weight: 0.3, value: 6, durability: 30, shape: 'headgear', plate: 0 },
    helm: { name: 'helm', region: 'head', families: ['hide', 'metal'], armor: 2.2, weight: 1.5, value: 25, durability: 60, shape: 'headgear', plate: 0.8 },
    tunic: { name: 'tunic', region: 'torso', families: ['cloth', 'hide'], armor: 1.5, weight: 1.2, value: 12, durability: 40, shape: 'torsowear', plate: 0.1 },
    cuirass: { name: 'cuirass', region: 'torso', families: ['hide', 'metal'], armor: 3.5, weight: 5.5, value: 55, durability: 90, shape: 'torsowear', plate: 0.9 },
    wraps: { name: 'arm wraps', region: 'arms', families: ['cloth', 'hide'], armor: 0.7, weight: 0.3, value: 5, durability: 30, shape: 'armwear', plate: 0 },
    bracers: { name: 'bracers', region: 'arms', families: ['hide', 'metal'], armor: 1.6, weight: 1.1, value: 20, durability: 60, shape: 'armwear', plate: 0.7 },
    leggings: { name: 'leggings', region: 'legs', families: ['cloth', 'hide'], armor: 1, weight: 0.6, value: 8, durability: 35, shape: 'legwear', plate: 0.05 },
    greaves: { name: 'greaves', region: 'legs', families: ['hide', 'metal'], armor: 2, weight: 2.4, value: 30, durability: 70, shape: 'legwear', plate: 0.8 },
  },
  materials: {
    linen: { name: 'linen', family: 'cloth', material: 'cloth', tint: 0xe2d6b8, armor: 0.5, weight: 0.6, durability: 0.6, value: 0.6, resist: { fire: 1.25 }, rarity: 4, plate: 0 },
    wool: { name: 'wool', family: 'cloth', material: 'cloth', tint: 0x8d8068, armor: 0.7, weight: 1, durability: 0.8, value: 0.9, resist: { cold: 0.7, fire: 1.2 }, rarity: 4, plate: 0 },
    leather: { name: 'leather', family: 'hide', material: 'fur', tint: 0x8a5a32, armor: 1, weight: 1, durability: 1.2, value: 1.2, resist: {}, rarity: 4, plate: 0.15 },
    bronze: { name: 'bronze', family: 'metal', material: 'metal', tint: 0xb88a4a, armor: 1.3, weight: 1.2, durability: 1.4, value: 2, resist: { fire: 0.9 }, rarity: 2, plate: 1 },
    iron: { name: 'iron', family: 'metal', material: 'metal', tint: 0x9aa0a8, armor: 1.6, weight: 1.3, durability: 1.7, value: 2.6, resist: { fire: 0.9 }, rarity: 2, plate: 1 },
    steel: { name: 'steel', family: 'metal', material: 'metal', tint: 0xc4ccd8, armor: 2, weight: 1.2, durability: 2.2, value: 4.5, resist: { fire: 0.85, cold: 1.05 }, rarity: 0.7, plate: 1 },
  },
  qualities: {
    crude: { name: 'Crude', armor: 0.75, durability: 0.6, value: 0.5, sheen: 0, rarity: 2 },
    common: { name: '', armor: 1, durability: 1, value: 1, sheen: 0.1, rarity: 6 },
    fine: { name: 'Fine', armor: 1.2, durability: 1.3, value: 1.8, sheen: 0.45, rarity: 2 },
    masterwork: { name: 'Masterwork', armor: 1.45, durability: 1.7, value: 3.5, sheen: 0.9, rarity: 0.4 },
  },
  rules: { worn: 0.5, heavyBlow: 12, dropChance: 0.55, droppedWear: [0.35, 0.9] },
};

const PREFIX = 'gear:';

export interface GearChoice {
  form: string;
  material: string;
  quality: string;
  /** Blows left, or undefined for a piece as good as new. */
  wear?: number;
}

/** The id of a piece of armour. */
export function gearId(c: GearChoice): ItemId {
  return `${PREFIX}${c.form}:${c.material}:${c.quality}${c.wear !== undefined ? `:${Math.max(0, Math.round(c.wear))}` : ''}`;
}

/** The choice an id stands for, if it is a well-formed gear id of things that exist. */
export function parseGear(t: GearTables, id: ItemId): GearChoice | null {
  if (!id.startsWith(PREFIX)) return null;
  const [form, material, quality, wear] = id.slice(PREFIX.length).split(':');
  if (!form || !material || !quality || !t.forms[form] || !t.materials[material] || !t.qualities[quality]) return null;
  const w = wear === undefined ? undefined : Number(wear);
  if (w !== undefined && !Number.isFinite(w)) return null;
  return w === undefined ? { form, material, quality } : { form, material, quality, wear: w };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lighten(c: number, k: number): number {
  const ch = (shift: number): number => Math.min(255, Math.round(((c >> shift) & 255) * (1 + k)) + Math.round(k * 40));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

const cache = new WeakMap<GearTables, Map<ItemId, ItemDef | null>>();

/** The full definition of a generated piece of armour, worked out from its id (and remembered). */
export function gearItem(t: GearTables, id: ItemId): ItemDef | null {
  let m = cache.get(t);
  if (!m) cache.set(t, (m = new Map()));
  const hit = m.get(id);
  if (hit !== undefined) return hit;
  const ch = parseGear(t, id);
  let def: ItemDef | null = null;
  if (ch) {
    const f: GearFormDef = t.forms[ch.form] as GearFormDef;
    const mat: GearMaterialDef = t.materials[ch.material] as GearMaterialDef;
    const q: GearQualityDef = t.qualities[ch.quality] as GearQualityDef;
    const durability = Math.max(1, Math.round(f.durability * mat.durability * q.durability));
    const wear = Math.max(0, Math.min(durability, ch.wear ?? durability));
    const stats: ArmourStats = {
      region: f.region,
      armor: Math.round(f.armor * mat.armor * q.armor * 10) / 10,
      resist: mat.resist,
      durability,
      wear,
    };
    def = {
      name: capital([q.name, mat.name, f.name].filter(Boolean).join(' ')),
      category: 'armour',
      weight: Math.round(f.weight * mat.weight * 10) / 10,
      value: Math.max(1, Math.round(f.value * mat.value * q.value * (0.4 + (0.6 * wear) / durability))),
      tint: mat.tint,
      look: { form: f.shape, shell: mat.tint, glow: q.sheen > 0.2 ? lighten(mat.tint, 0.35 + q.sheen * 0.3) : undefined, sparkle: q.sheen > 0.8, plate: Math.min(1, (f.plate + mat.plate) / 2 + 0.05) },
      armour: stats,
    };
  }
  m.set(id, def);
  return def;
}

/** The definition of any item: a table entry, or a generated piece of armour. */
export function itemDef(c: Pick<Content, 'items' | 'gear'>, id: ItemId): ItemDef | undefined {
  return c.items[id] ?? gearItem(c.gear, id) ?? undefined;
}

/** The same piece with this many blows left (an id for a hand-made piece stays as it is: those never wear). */
export function withWear(t: GearTables, id: ItemId, wear: number): ItemId {
  const ch = parseGear(t, id);
  return ch ? gearId({ ...ch, wear }) : id;
}

/** How sound a piece is, in words. */
export function gearCondition(a: ArmourStats): string {
  const k = a.wear / Math.max(1, a.durability);
  return k >= 0.8 ? 'sound' : k >= 0.5 ? 'worn' : k >= 0.2 ? 'battered' : 'nearly broken';
}

/** How much of its protection a piece still gives, by how worn it is (1 as new). */
export function gearEffect(t: GearTables, a: ArmourStats): number {
  return t.rules.worn + (1 - t.rules.worn) * (a.wear / Math.max(1, a.durability));
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

/** Makes a piece of armour at random: anything the roll leaves open is chosen by how common it is. */
export function rollGear(t: GearTables, rng: Rng, roll: GearRoll, wearShare = 1): ItemId | null {
  const allowed = (m: GearMaterialDef, id: string): boolean => !roll.materials || roll.materials.includes(id) || roll.materials.includes(m.family);
  const forms = Object.entries(t.forms).filter(
    ([id, f]) => (!roll.form || roll.form === id) && (!roll.region || roll.region === f.region) && Object.entries(t.materials).some(([mid, m]) => f.families.includes(m.family) && allowed(m, mid)),
  );
  const form = forms.length ? forms[rng.int(forms.length)] : undefined;
  if (!form) return null;
  const mats = Object.entries(t.materials).filter(([mid, m]) => form[1].families.includes(m.family) && allowed(m, mid));
  const mat = weighted(rng, mats, ([, m]) => m.rarity);
  const quals = Object.entries(t.qualities).filter(([qid]) => !roll.qualities || roll.qualities.includes(qid));
  const qual = weighted(rng, quals, ([, q]) => q.rarity);
  if (!mat || !qual) return null;
  const choice: GearChoice = { form: form[0], material: mat[0], quality: qual[0] };
  if (wearShare < 1) {
    const durability = Math.round(form[1].durability * mat[1].durability * qual[1].durability);
    choice.wear = Math.max(1, Math.round(durability * wearShare));
  }
  return gearId(choice);
}

/** What a creature of this kind is found wearing. Null when nothing was put on. */
export function rollOutfit(t: GearTables, rng: Rng, outfit: readonly OutfitEntry[], regions: readonly BodyRegionId[]): Record<BodyRegionId, ItemId> | null {
  let worn: Record<BodyRegionId, ItemId> | null = null;
  for (const o of outfit) {
    if (!rng.chance(o.chance)) continue;
    const id = rollGear(t, rng, o.roll, rng.range(t.rules.droppedWear[0], t.rules.droppedWear[1]));
    const region = id ? gearItem(t, id)?.armour?.region : undefined;
    if (!id || !region || !regions.includes(region) || worn?.[region]) continue;
    (worn ??= {})[region] = id;
  }
  return worn;
}

/** Which part of the body a blow lands on: by how much of the fight lands there, leaning with the way it was swung. */
export function pickRegion(t: GearTables, regions: readonly BodyRegionId[], swing: string | null, rng: Rng): BodyRegionId | null {
  return weighted(rng, regions.filter((r) => t.regions[r]), (r) => (t.regions[r]?.cover ?? 0) * (swing ? (t.regions[r]?.aim?.[swing] ?? 1) : 1)) ?? null;
}

/** Total weight of what is worn (kg). */
export function wornWeight(c: Pick<Content, 'items' | 'gear'>, worn: Readonly<Record<BodyRegionId, ItemId>> | undefined): number {
  let w = 0;
  if (worn) for (const id of Object.values(worn)) w += itemDef(c, id)?.weight ?? 0;
  return w;
}

/** The problems with the armour tables (empty when all is well). */
export function gearProblems(c: Content): string[] {
  const out: string[] = [];
  const t = c.gear;
  for (const [id, r] of Object.entries(t.regions)) {
    if (!(r.cover > 0)) out.push(`gear region '${id}': cover must be above 0`);
    if (!r.at.length) out.push(`gear region '${id}': needs at least one box on the paperdoll`);
  }
  const families = new Set(Object.values(t.materials).map((m) => m.family));
  for (const [id, f] of Object.entries(t.forms)) {
    const w = `gear form '${id}'`;
    if (!t.regions[f.region]) out.push(`${w}: unknown body part '${f.region}'`);
    if (!f.families.some((fam) => families.has(fam))) out.push(`${w}: no material is made of any of its families`);
    if (!(f.armor >= 0 && f.weight >= 0 && f.durability > 0)) out.push(`${w}: armor, weight and durability must be positive`);
  }
  for (const [id, m] of Object.entries(t.materials)) {
    if (!(m.material in c.materials)) out.push(`gear material '${id}': unknown material '${m.material}'`);
    if (!(m.armor > 0 && m.durability > 0 && m.rarity > 0)) out.push(`gear material '${id}': multipliers and rarity must be above 0`);
  }
  for (const [id, q] of Object.entries(t.qualities)) if (!(q.armor > 0 && q.durability > 0 && q.rarity > 0)) out.push(`gear quality '${id}': multipliers and rarity must be above 0`);
  const rolls: [string, GearRoll][] = [];
  for (const [id, l] of Object.entries(c.loot)) for (const e of l.entries) if (e.gear) rolls.push([`loot '${id}'`, e.gear]);
  for (const [id, th] of Object.entries(c.things)) {
    for (const r of th.wears ?? []) if (!t.regions[r]) out.push(`thing '${id}': unknown body part '${r}'`);
    if (th.outfit && !th.wears?.length) out.push(`thing '${id}': has an outfit but wears nothing`);
    for (const o of th.outfit ?? []) rolls.push([`thing '${id}' outfit`, o.roll]);
  }
  // Every roll must be able to make something, and with the right words.
  const probe: Rng = { next: () => 0.5, range: (a, b) => (a + b) / 2, int: (n) => Math.floor(n / 2), chance: () => true, pick: (a) => a[Math.floor(a.length / 2)] as never };
  for (const [where, r] of rolls) {
    if (r.region && !t.regions[r.region]) out.push(`${where}: unknown body part '${r.region}'`);
    if (r.form && !t.forms[r.form]) out.push(`${where}: unknown garment '${r.form}'`);
    for (const q of r.qualities ?? []) if (!t.qualities[q]) out.push(`${where}: unknown quality '${q}'`);
    for (const m of r.materials ?? []) if (!t.materials[m] && !families.has(m)) out.push(`${where}: unknown material '${m}'`);
    if (!rollGear(t, probe, r)) out.push(`${where}: no armour can be made from it`);
  }
  for (const id of c.rules.start.worn) {
    const a = itemDef(c, id)?.armour;
    if (!a) out.push(`rules.start.worn: '${id}' is not armour`);
  }
  for (const [id, it] of Object.entries(c.items)) if (it.armour && !t.regions[it.armour.region]) out.push(`item '${id}': unknown body part '${it.armour.region}'`);
  return out;
}
