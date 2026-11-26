import type { LootDef, LootId } from '../types';

/** Drop tables: each entry rolls on its own. */
export const LOOT: Record<LootId, LootDef> = {
  wolf: { entries: [{ item: 'wolfPelt', min: 1, max: 1, chance: 1 }] },
  deer: { entries: [{ item: 'venison', min: 2, max: 2, chance: 1 }] },
  villager: { entries: [{ item: 'coin', min: 5, max: 14, chance: 1 }] },
  // Hedge-mages carry a little magic with them: a tonic, now and then a rune stone.
  hexer: { entries: [{ item: 'coin', min: 4, max: 16, chance: 0.9 }, { item: 'manaTonic', min: 1, max: 1, chance: 0.4 }, { item: 'rune:frost', min: 1, max: 1, chance: 0.12 }, { item: 'rune:gust', min: 1, max: 1, chance: 0.12 }] },
  // What raiders carry in their bag (all of it drops when they die), including things to throw.
  raiderBag: {
    entries: [
      { item: 'coin', min: 3, max: 12, chance: 0.9 },
      { item: 'healingDraught', min: 1, max: 1, chance: 0.2 },
      { item: 'firePot', min: 1, max: 2, chance: 0.35 },
      { item: 'oilFlask', min: 1, max: 1, chance: 0.25 },
    ],
  },
  raider: {
    entries: [
      { item: '', gear: { region: 'hand', qualities: ['crude'] }, min: 1, max: 1, chance: 0.3 },
      { item: '', gear: { region: 'hand', qualities: ['common', 'fine'] }, min: 1, max: 1, chance: 0.08 },
      // What they wear drops with them (gear rules); this is a spare piece they carried.
      { item: '', gear: { qualities: ['crude', 'common'] }, min: 1, max: 1, chance: 0.12 },
    ],
  },
  crate: {
    entries: [
      { item: 'burlapGlider', min: 1, max: 1, chance: 0.04 },
      { item: 'torch', min: 1, max: 2, chance: 0.2 },
      { item: 'bread', min: 1, max: 3, chance: 0.25 },
      { item: 'oilFlask', min: 1, max: 2, chance: 0.2 },
      { item: 'coin', min: 1, max: 6, chance: 0.25 },
    ],
  },
  pantry: {
    entries: [
      { item: 'torch', min: 1, max: 1, chance: 0.2 },
      { item: 'bread', min: 1, max: 3, chance: 0.7 },
      { item: 'coin', min: 1, max: 8, chance: 0.5 },
      { item: 'oilFlask', min: 1, max: 1, chance: 0.2 },
      { item: 'healingDraught', min: 1, max: 1, chance: 0.12 },
    ],
  },
  chest: {
    entries: [
      { item: 'torch', min: 1, max: 2, chance: 0.35 },
      { item: 'coin', min: 3, max: 12, chance: 1 },
      { item: 'healingDraught', min: 1, max: 2, chance: 0.7 },
      { item: 'manaTonic', min: 1, max: 1, chance: 0.4 },
      { item: 'oilFlask', min: 1, max: 2, chance: 0.5 },
      { item: 'bread', min: 2, max: 2, chance: 0.3 },
      { item: 'antidote', min: 1, max: 1, chance: 0.2 },
      { item: 'frostFlask', min: 1, max: 1, chance: 0.2 },
      { item: '', gear: { form: 'axe', materials: ['bronze', 'iron'] }, min: 1, max: 1, chance: 0.15 },
      { item: '', gear: { materials: ['linen', 'wool', 'leather'] }, min: 1, max: 1, chance: 0.25 },
    ],
  },
  ruinChest: {
    entries: [
      { item: 'coin', min: 10, max: 40, chance: 1 },
      { item: 'silkGlider', min: 1, max: 1, chance: 0.08 },
      { item: 'wyvernGlider', min: 1, max: 1, chance: 0.03 },
      { item: 'healingDraught', min: 1, max: 3, chance: 0.8 },
      { item: 'manaTonic', min: 1, max: 2, chance: 0.6 },
      { item: 'runeShard', min: 1, max: 1, chance: 0.7 },
      { item: '', gear: { region: 'hand', qualities: ['common', 'fine', 'masterwork'], enchant: 0.35 }, min: 1, max: 1, chance: 0.7 },
      { item: '', gear: { region: 'hand' }, min: 1, max: 1, chance: 0.3 },
      { item: '', gear: { materials: ['leather', 'bronze', 'iron', 'steel'], qualities: ['common', 'fine', 'masterwork'] }, min: 1, max: 1, chance: 0.5 },
      { item: '', gear: { materials: ['bronze', 'iron', 'steel'] }, min: 1, max: 1, chance: 0.3 },
      { item: 'frostFlask', min: 1, max: 2, chance: 0.4 },
      { item: 'firePot', min: 1, max: 2, chance: 0.4 },
      { item: 'nightshade', min: 1, max: 1, chance: 0.3 },
      // Ruins are where forgotten runes are found.
      { item: 'rune:mend', min: 1, max: 1, chance: 0.25 },
      { item: 'rune:venom', min: 1, max: 1, chance: 0.2 },
      { item: 'rune:nova', min: 1, max: 1, chance: 0.2 },
      { item: 'rune:arc', min: 1, max: 1, chance: 0.2 },
      { item: 'rune:grand', min: 1, max: 1, chance: 0.15 },
      { item: 'rune:wide', min: 1, max: 1, chance: 0.15 },
      { item: 'rune:quake', min: 1, max: 1, chance: 0.15 },
    ],
  },
  /** Left at the foot of standing stones. */
  stoneCache: {
    entries: [
      { item: 'runeShard', min: 1, max: 1, chance: 0.6 },
      { item: 'rune:lance', min: 1, max: 1, chance: 0.3 },
      { item: 'rune:wave', min: 1, max: 1, chance: 0.3 },
      { item: 'rune:swift', min: 1, max: 1, chance: 0.25 },
      { item: 'rune:mend', min: 1, max: 1, chance: 0.2 },
      { item: 'rune:venom', min: 1, max: 1, chance: 0.15 },
    ],
  },
  // What can be had from a wall bracket once it is struck down.
  wallTorch: { entries: [{ item: 'torch', min: 1, max: 1, chance: 0.85 }] },
  urn: {
    entries: [
      { item: 'coin', min: 1, max: 8, chance: 0.6 },
      { item: 'oilFlask', min: 1, max: 1, chance: 0.2 },
      { item: 'antidote', min: 1, max: 1, chance: 0.1 },
      { item: 'rune:lance', min: 1, max: 1, chance: 0.05 },
      { item: 'rune:wave', min: 1, max: 1, chance: 0.05 },
    ],
  },
  keyUrn: {
    entries: [
      { item: 'ruinKey', min: 1, max: 1, chance: 1 },
      { item: 'coin', min: 1, max: 5, chance: 0.5 },
    ],
  },
  bogToad: { entries: [{ item: 'antidote', min: 1, max: 1, chance: 0.35 }, { item: 'coin', min: 0, max: 3, chance: 0.4 }] },
};
