import type { GearTables } from '../types';

/**
 * Gear as data: everything worn or made to be held and swung. Forms (garments and weapons),
 * materials, grades of work and enchantments are small tables; a piece is one entry from each, so
 * "Fine steel axe of embers" is not written anywhere. Its id carries the choice
 * (`gear:axe:steel:fine:embers`) and, once it has taken blows, how many it has left (`…@41`), so a
 * bag, a drop, a save and a message over the network all carry it as a plain string, like every
 * other item. content/gearItems.ts turns the id back into a full definition.
 *
 * Adding a metal, a garment, a weapon, a grade of work, an enchantment or a body part is a new
 * entry below and nothing else. A form's picture is its list of `parts` (art pieces 'item.<name>', content/itemGearArt.ts).
 */
export const GEAR: GearTables = {
  regions: {
    head: { name: 'Head', cover: 0.2, aim: { overhead: 2.4, left: 0.8, right: 0.8, thrust: 0.9 }, at: [{ x: 0.34, y: 0.02, w: 0.32, h: 0.2 }] },
    torso: { name: 'Torso', cover: 0.45, aim: { thrust: 1.5, overhead: 0.8 }, at: [{ x: 0.28, y: 0.24, w: 0.44, h: 0.34 }] },
    arms: { name: 'Arms', cover: 0.15, aim: { left: 1.7, right: 1.7, thrust: 0.6, overhead: 0.5 }, at: [{ x: 0.08, y: 0.25, w: 0.18, h: 0.34 }, { x: 0.74, y: 0.25, w: 0.18, h: 0.34 }] },
    legs: { name: 'Legs', cover: 0.2, aim: { left: 1.3, right: 1.3, thrust: 0.9 }, at: [{ x: 0.3, y: 0.6, w: 0.18, h: 0.38 }, { x: 0.52, y: 0.6, w: 0.18, h: 0.38 }] },
  },
  hand: { name: 'Hands', at: [{ x: 0.74, y: 0.62, w: 0.22, h: 0.22 }] },
  forms: {
    cap: { name: 'cap', slot: 'head', families: ['cloth', 'hide'], armor: 1, weight: 0.3, value: 6, durability: 30, parts: ['headgear'], plate: 0 },
    helm: { name: 'helm', slot: 'head', families: ['hide', 'metal'], armor: 2.2, weight: 1.5, value: 25, durability: 60, parts: ['headgear'], plate: 0.8 },
    tunic: { name: 'tunic', slot: 'torso', families: ['cloth', 'hide'], armor: 1.5, weight: 1.2, value: 12, durability: 40, parts: ['torsowear'], plate: 0.1 },
    cuirass: { name: 'cuirass', slot: 'torso', families: ['hide', 'metal'], armor: 3.5, weight: 5.5, value: 55, durability: 90, parts: ['torsowear'], plate: 0.9 },
    wraps: { name: 'arm wraps', slot: 'arms', families: ['cloth', 'hide'], armor: 0.7, weight: 0.3, value: 5, durability: 30, parts: ['armwear'], plate: 0 },
    bracers: { name: 'bracers', slot: 'arms', families: ['hide', 'metal'], armor: 1.6, weight: 1.1, value: 20, durability: 60, parts: ['armwear'], plate: 0.7 },
    leggings: { name: 'leggings', slot: 'legs', families: ['cloth', 'hide'], armor: 1, weight: 0.6, value: 8, durability: 35, parts: ['legwear'], plate: 0.05 },
    greaves: { name: 'greaves', slot: 'legs', families: ['hide', 'metal'], armor: 2, weight: 2.4, value: 30, durability: 70, parts: ['legwear'], plate: 0.8 },
    // Held: numbers before the material's and quality's power (iron ×1.6).
    sword: { name: 'sword', slot: 'hand', families: ['metal'], weapon: { damage: 9, kind: 'cut', reach: 2.1 }, weight: 1.9, value: 8, durability: 70, parts: ['grip', 'guard', 'blade', 'pommel'], plate: 1 },
    axe: { name: 'axe', slot: 'hand', families: ['metal'], weapon: { damage: 13, kind: 'cut', reach: 1.9, speed: 1.3, push: 1.2, swings: ['left', 'right', 'overhead'], charge: 0.5 }, weight: 2.7, value: 10, durability: 90, parts: ['haft', 'axeBit'], plate: 1 },
    hammer: { name: 'war hammer', slot: 'hand', families: ['metal'], weapon: { damage: 15.6, kind: 'blunt', reach: 2, speed: 1.5, push: 2.4, swings: ['left', 'right', 'overhead'], charge: 0.7 }, weight: 4.6, value: 21, durability: 130, parts: ['haft', 'hammerHead'], plate: 1 },
    spear: { name: 'spear', slot: 'hand', families: ['metal'], weapon: { damage: 9.4, kind: 'pierce', reach: 2.9, speed: 0.9, push: 0.8, swings: ['thrust', 'overhead'], charge: 0.3 }, weight: 1.9, value: 12, durability: 82, parts: ['haft', 'spearHead'], plate: 1 },
  },
  materials: {
    linen: { name: 'linen', family: 'cloth', material: 'cloth', tint: 0xe2d6b8, power: 0.5, weight: 0.6, durability: 0.6, value: 0.6, resist: { fire: 1.25 }, rarity: 4, plate: 0 },
    wool: { name: 'wool', family: 'cloth', material: 'cloth', tint: 0x8d8068, power: 0.7, weight: 1, durability: 0.8, value: 0.9, resist: { cold: 0.7, fire: 1.2 }, rarity: 4, plate: 0 },
    leather: { name: 'leather', family: 'hide', material: 'fur', tint: 0x8a5a32, power: 1, weight: 1, durability: 1.2, value: 1.2, resist: {}, rarity: 4, plate: 0.15 },
    bronze: { name: 'bronze', family: 'metal', material: 'metal', tint: 0xb88a4a, power: 1.3, weight: 1.2, durability: 1.4, value: 2, resist: { fire: 0.9 }, rarity: 2, plate: 1 },
    iron: { name: 'iron', family: 'metal', material: 'metal', tint: 0x9aa0a8, power: 1.6, weight: 1.3, durability: 1.7, value: 2.6, resist: { fire: 0.9 }, rarity: 2, plate: 1 },
    steel: { name: 'steel', family: 'metal', material: 'metal', tint: 0xc4ccd8, power: 2, weight: 1.2, durability: 2.2, value: 4.5, resist: { fire: 0.85, cold: 1.05 }, rarity: 0.7, plate: 1 },
  },
  qualities: {
    crude: { name: 'Crude', power: 0.75, durability: 0.6, value: 0.5, sheen: 0, rarity: 2 },
    common: { name: '', power: 1, durability: 1, value: 1, sheen: 0.1, rarity: 6 },
    fine: { name: 'Fine', power: 1.2, durability: 1.3, value: 1.8, sheen: 0.45, rarity: 2 },
    masterwork: { name: 'Masterwork', power: 1.45, durability: 1.7, value: 3.5, sheen: 0.9, rarity: 0.4 },
  },
  enchants: {
    embers: { name: 'of embers', hit: [{ type: 'heat', amount: 0.6 }, { type: 'damage', amount: 3, kind: 'fire' }], resist: { fire: 0.6 }, value: 2.5, glow: 0xff8a30, rarity: 2 },
    rime: { name: 'of rime', hit: [{ type: 'chill', amount: 0.6 }, { type: 'damage', amount: 3, kind: 'cold' }], resist: { cold: 0.6 }, value: 2.5, glow: 0x9ad8ff, rarity: 2 },
    venom: { name: 'of venom', slots: ['hand'], hit: [{ type: 'status', id: 'poisoned', ticks: 60 }], value: 2.2, glow: 0x7ad050, rarity: 1.5 },
    warding: { name: 'of warding', resist: { magic: 0.7 }, power: 1.2, value: 2, glow: 0xc8b8ff, rarity: 1.5 },
    enduring: { name: 'of enduring', durability: 1.8, value: 1.6, glow: 0xe8d890, rarity: 2 },
  },
  rules: { worn: 0.5, heavyBlow: 12, dropChance: 0.55, droppedWear: [0.35, 0.9], enchantChance: 0.12 },
};
