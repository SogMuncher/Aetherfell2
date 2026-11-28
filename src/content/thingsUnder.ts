// Underworld things: sarcophagi, bone heaps, candles, mine lamps, lecterns, altars, weapon racks and trap plates (merged into THINGS)
import type { ThingDef, ThingId } from '../types';

/**
 * What the underground rooms (content/underBiomes.ts) are furnished with. Ordinary things: they burn, break, light the
 * dark and spring on whatever is heavy enough, by the same rules as everything else. Traps are plates with a `contact`
 * burst: a friend, a wolf or a shoved barrel sets them off alike.
 */
const plate = (name: string, sprite: string, radius: number, effects: NonNullable<ThingDef['contact']>['effects'], cooldown = 60): ThingDef => ({
  name,
  body: { radius: 0.5, height: 0.06, mass: 500, solid: false, anchored: true },
  material: 'stone',
  contact: { minMass: 15, cooldown, reach: 0.6, radius, effects },
  sprite,
});

export const UNDER_THINGS: Record<ThingId, ThingDef> = {
  /** A stone coffin. Prise it open with E, or smash it: the dead were buried with their things. */
  sarcophagus: {
    name: 'sarcophagus',
    body: { radius: 0.6, height: 0.9, mass: 900, solid: true, anchored: true },
    material: 'stone',
    health: { hp: 90, armor: 3 },
    container: { loot: 'tomb' },
    onDestroy: { loot: 'tomb' },
    sprite: 'sarcophagus',
  },
  bonePile: {
    name: 'heap of bones',
    body: { radius: 0.4, height: 0.3, mass: 20, solid: false, anchored: true },
    material: 'bone',
    health: { hp: 6, armor: 0 },
    onDestroy: { loot: 'bones' },
    sprite: 'bonePile',
  },
  /** Candles on a stand: a little light, and a little fire if knocked over. */
  candles: {
    name: 'candles',
    body: { radius: 0.2, height: 1.1, mass: 6, solid: false },
    material: 'metal',
    health: { hp: 6, armor: 0 },
    carry: true,
    light: { r: 1, g: 0.74, b: 0.4, radius: 6, flicker: 0.3, at: 1 },
    onImpact: { minSpeed: 3, radius: 0.6, effects: [{ type: 'heat', amount: 1 }], shatter: false },
    onDestroy: { radius: 0.6, effects: [{ type: 'heat', amount: 1 }] },
    sprite: 'candles',
  },
  /** An oil lamp hung in a mine: break it and the oil goes up. */
  mineLamp: {
    name: 'mine lamp',
    body: { radius: 0.12, height: 0.4, mass: 3, solid: false, anchored: true },
    material: 'metal',
    health: { hp: 8, armor: 0 },
    mount: { height: 1.9, flush: 0.12 },
    light: { r: 1, g: 0.7, b: 0.36, radius: 9, flicker: 0.12, at: 0.2 },
    onDestroy: { radius: 1.4, effects: [{ type: 'coat', liquid: 'oil', amount: 1 }, { type: 'heat', amount: 1 }] },
    sprite: 'shipLamp',
  },
  lectern: {
    name: 'lectern',
    body: { radius: 0.35, height: 1.2, mass: 30, solid: true },
    material: 'wood',
    health: { hp: 14, armor: 0 },
    onDestroy: { loot: 'lectern' },
    container: { loot: 'lectern' },
    sprite: 'lectern',
  },
  /** An old altar: kneel at it (E) and be mended, once in a long while. */
  altar: {
    name: 'altar',
    body: { radius: 0.7, height: 1, mass: 1200, solid: true, anchored: true },
    material: 'stone',
    use: { effects: [{ type: 'heal', amount: 40 }, { type: 'restore', stat: 'mana', amount: 40 }], text: 'You kneel at the old altar. Warmth runs through you.', cooldown: 6000 },
    light: { r: 0.55, g: 0.7, b: 1, radius: 5, flicker: 0.05, at: 1.1 },
    sprite: 'altar',
  },
  weaponRack: {
    name: 'weapon rack',
    body: { radius: 0.45, height: 1.5, mass: 40, solid: true },
    material: 'wood',
    health: { hp: 18, armor: 0 },
    container: { loot: 'rack' },
    onDestroy: { loot: 'rack' },
    sprite: 'weaponRack',
  },
  spikeTrap: plate('spiked plate', 'plateSpike', 0.7, [{ type: 'damage', amount: 12, kind: 'pierce' }], 40),
  frostTrap: plate('rimed plate', 'plateFrost', 2.2, [{ type: 'chill', amount: 1 }, { type: 'damage', amount: 4, kind: 'cold' }]),
  gustTrap: plate('wind plate', 'plateGust', 1.6, [{ type: 'push', force: 9, lift: 4 }], 30),
  oilTrap: plate('greasy plate', 'plateOil', 2.6, [{ type: 'coat', liquid: 'oil', amount: 1 }], 80),
};
