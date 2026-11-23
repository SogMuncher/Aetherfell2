import type { BrainDef, BrainId, FactionDef, FactionId, HabitatDef } from '../types';
import { Tile } from '../types';

/**
 * Creature minds. Each brain lists behaviours from the shared library (sim/ai/behaviours.ts) in
 * order of importance; the creature does the first one that applies. Animals, monsters and
 * villagers are all built the same way, so a new creature is a new mix of the same pieces.
 */
export const BRAINS: Record<BrainId, BrainDef> = {
  /** Hunts in the open, bolder by night; runs when badly hurt or when fire gets close. */
  pack: {
    sense: 16,
    nightSense: 1.5,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 0.7, distance: 14 },
      { do: 'retreat', below: 0.3, distance: 16 },
      { do: 'hunt', growl: 0.15 },
      { do: 'wander', roam: 20, chance: 0.08 },
    ],
  },
  /** Skittish: keeps clear of people and hunters, runs from any hurt, grazes in between. */
  grazer: {
    sense: 14,
    nightSense: 1,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 1, distance: 14 },
      { do: 'avoid', within: 0.8, distance: 16, trust: 0.1 },
      { do: 'retreat', below: 1, distance: 16 },
      { do: 'graze', chance: 0.5, ticks: [40, 100] },
      { do: 'wander', roam: 20, chance: 0.08 },
    ],
  },
  /** Sits still in its patch and lunges at whatever comes close, day or night. */
  lurker: {
    sense: 7,
    nightSense: 1,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 1, distance: 14 },
      { do: 'retreat', below: 0.2, distance: 16 },
      { do: 'hunt', growl: 0.15 },
      { do: 'lurk', roam: 3, chance: 0.04 },
    ],
  },
  /**
   * A caster: stays well back and throws spells (rune lists, the same ones the runebook makes), gathering
   * the magic visibly first. Close in and it swings its staff; badly hurt it runs.
   */
  caster: {
    sense: 18,
    nightSense: 1.3,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 0.6, distance: 14 },
      { do: 'retreat', below: 0.25, distance: 18 },
      {
        do: 'cast',
        spells: [
          { runes: ['ember'], range: [5, 18], chance: 0.55 },
          { runes: ['frost', 'nova'], range: [0, 5], chance: 0.8 },
          { runes: ['gust'], range: [0, 6], chance: 0.45 },
        ],
        keep: 6,
        telegraph: 8,
        cooldown: [24, 50],
      },
      { do: 'hunt', growl: 0.1 },
      { do: 'wander', roam: 10, chance: 0.06 },
    ],
  },
  /** Charges in and fights with whatever it carries, winding up the heavy blows. */
  raider: {
    sense: 16,
    nightSense: 1.3,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 0.5, distance: 14 },
      { do: 'retreat', below: 0.2, distance: 16 },
      { do: 'throw', range: [4, 12], chance: 0.35, anything: false },
      { do: 'hunt', growl: 0.2 },
      { do: 'grab', within: 8, keep: 8, chance: 0.6 },
      { do: 'wander', roam: 14, chance: 0.06 },
    ],
  },
  /** Keeps a daily routine and steers clear of danger, but fights back once someone attacks them. */
  villager: {
    sense: 10,
    nightSense: 1,
    hate: -0.3,
    behaviours: [
      { do: 'panic' },
      { do: 'fleeFire', chance: 0.9, distance: 14 },
      { do: 'retreat', below: 0.3, distance: 16 },
      { do: 'avoid', within: 0.8, distance: 16, trust: 0.1, untilProvoked: true },
      { do: 'defend' },
      { do: 'routine', potter: 4, chance: 0.03 },
      { do: 'wander', roam: 4, chance: 0.08 },
    ],
  },
};

/** Who likes whom at the start of the world. The ecology system shifts these as the party acts. */
export const FACTIONS: Record<FactionId, FactionDef> = {
  party: { name: 'the party', feels: { party: 1, village: 0.2, pack: -1 } },
  village: { name: 'villagers', feels: { party: 0.2, village: 1, pack: -1 } },
  wild: { name: 'wild animals', friendlyFire: true, feels: {} },
  pack: { name: 'wolf packs', feels: { party: -1, village: -1, wild: -0.6, pack: 1 } },
  cabal: { name: 'hedge-mages and raiders', feels: { party: -1, village: -0.8, pack: -0.2, cabal: 1 } },
  mire: { name: 'fen creatures', feels: { party: -1, village: -0.5, pack: -0.3 } },
};

/** What lives where, by ground and time of day. */
export const HABITATS: HabitatDef[] = [
  { thing: 'deer', tiles: [Tile.Grass, Tile.Brush, Tile.Snow], day: 4, night: 2, group: [1, 2], nightGroup: [1, 2] },
  { thing: 'wolf', tiles: [Tile.Grass, Tile.Snow, Tile.Brush], day: 1, night: 4, group: [1, 1], nightGroup: [1, 3] },
  { thing: 'bogToad', tiles: [Tile.Peat], day: 2, night: 3, group: [1, 2], nightGroup: [1, 3] },
  // Under the land (realm 'underworld'): what lurks on its flagstones. It is always night down there.
  { realm: 'underworld', thing: 'wolf', tiles: [Tile.Flagstone], day: 3, night: 3, group: [1, 2], nightGroup: [1, 2] },
  { realm: 'underworld', thing: 'hexer', tiles: [Tile.Flagstone], day: 1, night: 1, group: [1, 1], nightGroup: [1, 1] },
  { realm: 'underworld', thing: 'raider', tiles: [Tile.Flagstone], day: 2, night: 2, group: [1, 2], nightGroup: [1, 2] },
];
