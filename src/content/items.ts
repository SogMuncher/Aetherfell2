import type { ItemDef, ItemId, ItemStack, RuneId, WeaponStats } from '../types';
import { RUNES } from './runes';

/** Gliders are worn on the back: they turn nothing aside, it is just where they go. */
const BACK = { region: 'back', armor: 0, resist: {} };

function weapon(name: string, p: Partial<WeaponStats> & Pick<WeaponStats, 'damage' | 'kind' | 'reach'>): WeaponStats {
  return { name, speed: 1, push: 1, tint: { r: 180, g: 186, b: 196 }, ...p };
}

/** Inventory goods. A new potion, food, throwable or tool is just a new entry here; weapons and armour are gear (content/gear.ts). */
export const ITEMS: Record<ItemId, ItemDef> = {
  coin: { name: 'Silver coin', category: 'currency', weight: 0.01, value: 1, tint: 0xd8d8e8 },
  healingDraught: { name: 'Healing draught', category: 'potion', weight: 0.3, value: 12, tint: 0xd04040, use: [{ type: 'heal', amount: 45 }] },
  manaTonic: { name: 'Aether tonic', category: 'potion', weight: 0.3, value: 14, tint: 0x4070e0, look: { sparkle: true, glow: 0xb0d0ff }, use: [{ type: 'restore', stat: 'mana', amount: 45 }] },
  antidote: { name: 'Bitterroot antidote', category: 'potion', weight: 0.2, value: 10, tint: 0x60b050, use: [{ type: 'cure', tag: 'poison' }, { type: 'heal', amount: 5 }] },
  vigourTonic: { name: 'Vigour tonic', category: 'potion', weight: 0.3, value: 10, tint: 0xe0c040, use: [{ type: 'restore', stat: 'stamina', amount: 80 }] },
  bread: { name: 'Bread', category: 'food', weight: 0.2, value: 2, tint: 0xc09050, use: [{ type: 'heal', amount: 10 }, { type: 'restore', stat: 'stamina', amount: 30 }] },
  venison: { name: 'Venison', category: 'food', weight: 1, value: 6, tint: 0x9a3a2a, use: [{ type: 'heal', amount: 16 }, { type: 'restore', stat: 'stamina', amount: 30 }] },
  oilFlask: {
    name: 'Lamp-oil flask',
    category: 'throwable',
    weight: 0.6,
    value: 5,
    tint: 0x806020,
    look: { level: 0.55 },
    thrown: { speed: 13 },
    onBreak: { radius: 1.6, effects: [{ type: 'coat', liquid: 'oil', amount: 4 }] },
  },
  frostFlask: {
    name: 'Rimewater flask',
    category: 'throwable',
    weight: 0.6,
    value: 18,
    tint: 0xa0e0ff,
    look: { body: 'round', sparkle: true },
    thrown: { speed: 13 },
    onBreak: { radius: 2.4, effects: [{ type: 'chill', amount: 1 }, { type: 'damage', amount: 4, kind: 'cold' }] },
  },
  nightshade: {
    name: 'Nightshade vial',
    category: 'throwable',
    weight: 0.3,
    value: 15,
    tint: 0x704090,
    thrown: { speed: 14 },
    onBreak: { radius: 2.2, effects: [{ type: 'status', id: 'poisoned', ticks: 200 }] },
  },
  firePot: {
    name: 'Fire pot',
    category: 'throwable',
    weight: 0.9,
    value: 16,
    tint: 0xe06020,
    thrown: { speed: 12 },
    onBreak: { radius: 1.8, effects: [{ type: 'coat', liquid: 'oil', amount: 2 }, { type: 'heat', amount: 1 }, { type: 'damage', amount: 8, kind: 'fire' }] },
  },
  // A burning brand: lights the way while it is in your hand, hits for little but sets what it touches alight.
  torch: {
    name: 'Torch',
    category: 'weapon',
    weight: 0.8,
    value: 3,
    tint: 0xe8a040,
    look: { form: 'torch', glow: 0xffb050 },
    light: { r: 1, g: 0.62, b: 0.28, radius: 9, flicker: 0.25, flame: true },
    durability: 90,
    material: 'wood',
    // A broken brand scatters its fire.
    onBreak: { radius: 1.2, effects: [{ type: 'heat', amount: 2 }, { type: 'damage', amount: 3, kind: 'fire' }] },
    weapon: weapon('Torch', {
      damage: 6,
      kind: 'blunt',
      reach: 1.8,
      speed: 0.95,
      push: 0.8,
      tint: { r: 232, g: 160, b: 64 },
      effects: [{ type: 'heat', amount: 1 }, { type: 'damage', amount: 2, kind: 'fire' }],
    }),
  },
  // Gliders, worst to best: worn on the back, the cloth decides how they fly (`GlideDef`). Burlap only slows your fall; wyvern hide soars.
  burlapGlider: { name: 'Burlap glider', category: 'tool', material: 'cloth', weight: 2.5, value: 25, tint: 0x9a8058, armour: BACK, glide: { sink: 2.4, speed: 6.5, soar: 0, drag: 1, top: 8, grip: 0.05, trail: 'glideTrail' } },
  glider: { name: 'Sailcloth glider', category: 'tool', material: 'cloth', weight: 2, value: 60, tint: 0xd8c8a0, armour: BACK, glide: { sink: 1.7, speed: 8.5, soar: 0.3, drag: 0.8, top: 16, grip: 0.07, trail: 'glideTrail' } },
  silkGlider: { name: 'Silk glider', category: 'tool', material: 'cloth', weight: 1.2, value: 150, tint: 0xe8d8f0, armour: BACK, glide: { sink: 1.3, speed: 11, soar: 0.65, drag: 0.4, top: 28, grip: 0.12, trail: 'glideTrail' } },
  wyvernGlider: { name: 'Wyvern-hide glider', category: 'tool', weight: 1.8, value: 340, tint: 0x5a7860, armour: BACK, glide: { sink: 0.9, speed: 14, soar: 1, drag: 0.12, top: 46, grip: 0.22, trail: 'glideTrail' } },
  ruinKey: { name: 'Ruin key', category: 'key', weight: 0.1, value: 0, tint: 0x60e0d0 },
  wolfPelt: { name: 'Wolf pelt', category: 'material', weight: 1.5, value: 9, tint: 0x6a6a70 },
  runeShard: { name: 'Rune shard', category: 'material', weight: 0.1, value: 30, tint: 0x60e0d0 },
  /** Blow it to call the airship to you (it is built the first time); blow it again to send it somewhere new. */
  skyHorn: { name: 'Sky horn', category: 'tool', weight: 0.6, value: 40, tint: 0xd8c8a0, material: 'wood', look: { form: 'horn' }, calls: 'airship' },
  ...runeStones(),
  spicedCider: { name: 'Spiced cider', category: 'food', weight: 0.4, value: 4, tint: 0xc07028, look: { form: 'vessel', body: 'jug' }, use: [{ type: 'status', id: 'warmed', ticks: 1200 }, { type: 'cure', tag: 'cold' }, { type: 'restore', stat: 'stamina', amount: 15 }] },
};

/**
 * One carved stone per rune, id `rune:<rune id>`. Picking one up teaches you the rune; stones of
 * runes you already know stay in the satchel and sell well.
 */
function runeStones(): Record<ItemId, ItemDef> {
  const out: Record<ItemId, ItemDef> = {};
  for (const [id, r] of Object.entries(RUNES) as [RuneId, (typeof RUNES)[string]][]) {
    if (!r) continue;
    out[`rune:${id}`] = { name: `${r.name} rune stone`, category: 'rune', weight: 0.2, value: 45, tint: 0x60e0d0, teaches: id };
  }
  return out;
}

export function stackWeight(items: readonly ItemStack[], defs: Readonly<Record<ItemId, ItemDef>> = ITEMS): number {
  let w = 0;
  for (const s of items) w += (defs[s.id]?.weight ?? 0) * s.count;
  return w;
}
