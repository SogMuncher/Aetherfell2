// Creatures and people as thing definitions: bodies, natural weapons, brains, and the outfit (real gear) they are found with
import type { BodyRegionId, ThingDef, ThingId, WeaponStats } from '../types';

/** The body parts that people (and anything else built like them) can wear armour on. */
const HUMANOID: BodyRegionId[] = ['head', 'torso', 'arms', 'legs'];

/** A creature's own weapon (fangs, fists, a staff). Unless told otherwise it only lunges (thrusts). */
export function natural(name: string, damage: number, kind: WeaponStats['kind'], reach: number, more: Partial<WeaponStats> = {}): WeaponStats {
  return { name, damage, kind, reach, speed: 1, push: 1, tint: { r: 200, g: 190, b: 170 }, swings: ['thrust'], ...more };
}

/** Bare hands, the same for everyone built like a person; what they hold comes from their outfit (real gear). */
const FISTS = natural('Fists', 5, 'blunt', 1.4, { swings: ['left', 'right', 'thrust', 'overhead'] });

/** Everything that walks and fights: travellers, people, animals, monsters. */
export const CREATURES: Record<ThingId, ThingDef> = {
  player: {
    name: 'traveller',
    body: { radius: 0.32, height: 1.75, mass: 70, solid: true },
    material: 'flesh',
    health: { hp: 100, armor: 2 },
    faction: 'party',
    wears: HUMANOID,
    actor: { speed: 4.2, weapon: FISTS },
    sprite: 'player',
    bleeds: true,
  },
  wolf: {
    name: 'wolf',
    plural: 'wolves',
    body: { radius: 0.4, height: 0.9, mass: 40, solid: true },
    material: 'fur',
    health: { hp: 34, armor: 1 },
    faction: 'pack',
    actor: { speed: 5.2, weapon: natural('Fangs', 9, 'pierce', 1.5) },
    brain: 'pack',
    onDestroy: { loot: 'wolf' },
    despawn: 140,
    sprite: 'wolf',
    voice: 'howl',
    bleeds: true,
  },
  deer: {
    name: 'deer',
    body: { radius: 0.45, height: 1.3, mass: 60, solid: true },
    material: 'fur',
    health: { hp: 22, armor: 0 },
    faction: 'wild',
    actor: { speed: 6.5, weapon: natural('Antlers', 4, 'blunt', 1.4) },
    brain: 'grazer',
    onDestroy: { loot: 'deer' },
    despawn: 140,
    sprite: 'deer',
    voice: 'bleat',
    bleeds: true,
  },
  villager: {
    name: 'villager',
    body: { radius: 0.32, height: 1.7, mass: 65, solid: true },
    material: 'flesh',
    health: { hp: 40, armor: 0 },
    faction: 'village',
    actor: { speed: 2.4, weapon: FISTS },
    brain: 'villager',
    wears: HUMANOID,
    // Folk keep to cloth and the odd leather jerkin.
    outfit: [
      { chance: 0.7, roll: { region: 'torso', materials: ['linen', 'wool'], qualities: ['crude', 'common'] } },
      { chance: 0.5, roll: { region: 'legs', materials: ['linen', 'wool'], qualities: ['crude', 'common'] } },
      { chance: 0.15, roll: { region: 'head', materials: ['linen', 'wool'], qualities: ['common'] } },
    ],
    talk: true,
    carries: 'villager',
    sprite: 'villager',
    voice: 'grunt',
    bleeds: true,
  },
  /**
   * A hedge-magician who haunts old ruins. Keeps its distance and throws spells written as rune
   * lists in its brain (content/living.ts, brain 'caster'); swings its staff when cornered.
   */
  hexer: {
    name: 'hexer',
    body: { radius: 0.32, height: 1.7, mass: 62, solid: true },
    material: 'flesh',
    health: { hp: 38, armor: 0 },
    faction: 'cabal',
    actor: {
      speed: 3.3,
      weapon: FISTS,
      caster: { mana: 70, regen: 3, power: 1 },
    },
    brain: 'caster',
    wears: HUMANOID,
    outfit: [
      { chance: 1, roll: { region: 'hand', form: 'staff' } },
      { chance: 0.9, roll: { region: 'torso', materials: ['wool', 'linen'], qualities: ['common', 'fine'] } },
      { chance: 0.6, roll: { region: 'head', materials: ['wool', 'linen'], qualities: ['common', 'fine'] } },
      { chance: 0.4, roll: { region: 'legs', materials: ['wool'], qualities: ['common'] } },
    ],
    onDestroy: { loot: 'hexer' },
    despawn: 140,
    sprite: 'hexer',
    voice: 'grunt',
    bleeds: true,
  },
  /** A hard-bitten cutthroat with whatever weapon it took: swings every which way and winds up for the big ones. */
  raider: {
    name: 'raider',
    body: { radius: 0.34, height: 1.75, mass: 80, solid: true },
    material: 'flesh',
    health: { hp: 52, armor: 1 },
    faction: 'cabal',
    actor: {
      speed: 3.9,
      weapon: FISTS,
    },
    brain: 'raider',
    wears: HUMANOID,
    // Cutthroats wear what they have taken: mostly leather, sometimes mismatched iron.
    // Held first: most carry an axe, the rest any blade, hammer or spear they took.
    outfit: [
      { chance: 0.6, roll: { region: 'hand', form: 'axe', materials: ['iron', 'bronze'], qualities: ['crude', 'common'] } },
      { chance: 1, roll: { region: 'hand', materials: ['metal'], qualities: ['crude', 'common'] } },
      { chance: 0.85, roll: { region: 'torso', materials: ['leather', 'iron', 'bronze'], qualities: ['crude', 'common'] } },
      { chance: 0.5, roll: { region: 'head', materials: ['leather', 'iron', 'bronze'], qualities: ['crude', 'common'] } },
      { chance: 0.4, roll: { region: 'arms', materials: ['leather', 'iron'], qualities: ['crude', 'common'] } },
      { chance: 0.45, roll: { region: 'legs', materials: ['leather', 'iron'], qualities: ['crude', 'common'] } },
    ],
    carries: 'raiderBag',
    onDestroy: { loot: 'raider' },
    despawn: 140,
    sprite: 'raider',
    voice: 'grunt',
    bleeds: true,
  },
  /** Squats in fens. Its bite is mildly venomous, and fire sends it hopping away. */
  bogToad: {
    name: 'bog toad',
    body: { radius: 0.35, height: 0.6, mass: 18, solid: true },
    material: 'flesh',
    health: { hp: 16, armor: 0 },
    faction: 'mire',
    // Its bite leaves venom behind: any effect can ride on a natural weapon.
    actor: { speed: 3.6, weapon: { ...natural('Sticky tongue', 6, 'poison', 1.8), effects: [{ type: 'status', id: 'poisoned', ticks: 40 }] } },
    brain: 'lurker',
    onDestroy: { loot: 'bogToad' },
    despawn: 140,
    sprite: 'toad',
    voice: 'grunt',
    bleeds: true,
  },
};
