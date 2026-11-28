import type { RealmDef, RealmId } from '../types';
import { UNDER_BIOMES } from './underBiomes';

/**
 * The spaces the world is made of. A realm is a place with its own ground, light and sky; the whole
 * game's systems (fire, rain, blows, creatures, light, saving) work the same in every one. Travelling
 * swaps the loaded tiles, cells, things and places for another set — see docs/ARCHITECTURE.md, Realms.
 * A new realm is an entry here plus (only if its ground is a new kind) a ground generator in sim/world.
 */
export const REALMS: Record<RealmId, RealmDef> = {
  overworld: {
    name: 'the surface',
    sky: true,
    ground: 'surface',
    floor: 0,
    ambient: 1,
    fog: [0, 0, 0],
    fogDist: 2600,
    gather: 8,
    arrival: { thing: 'descent' },
  },
  /**
   * The Underworld: a lattice of halls, galleries and corridors laid out exactly beneath the land, one
   * metre below every metre above. The ways down on the surface are ways into it at the same spot.
   */
  underworld: {
    name: 'the underworld',
    sky: false,
    ground: 'lattice',
    floor: 2,
    ambient: 0.07,
    fog: [5, 4, 8],
    fogDist: 46,
    air: { count: 180, colour: [150, 140, 120], alpha: 0.5, drift: [0.05, 0.03, -0.04], box: 14, size: 1 },
    // In every hall; each biome (content/underBiomes.ts) and each room adds its own.
    scatter: [
      { thing: 'chest', chance: 0.25, at: 'middle' },
      { thing: 'oilBarrel', chance: 0.15, at: 'corner' },
      { thing: 'crate', chance: 0.2, at: 'wall' },
      // Under the places above: the greater halls hold more, and are guarded. Risk and reward.
      { thing: 'chest', chance: 0.8, at: 'middle', under: ['ruin', 'stones', 'city', 'hamlet'] },
      { thing: 'urn', chance: 0.7, at: 'wall', under: ['village', 'farmstead', 'hamlet', 'city'] },
      { thing: 'crate', chance: 0.6, at: 'wall', under: ['village', 'city', 'watchtower'] },
      { thing: 'hexer', chance: 0.55, at: 'corner', under: ['ruin', 'stones', 'city'] },
      { thing: 'raider', chance: 0.5, at: 'corner', under: ['ruin', 'hamlet', 'city'] },
      { thing: 'wolf', chance: 0.4, at: 'wall', under: ['village', 'watchtower'] },
    ],
    glow: { r: 0.95, g: 0.66, b: 0.32, radius: 12, flicker: 0.12 },
    lattice: {
      tile: 'caveRock',
      shell: 2,
      corridor: 4,
      hall: 7,
      way: { widen: 1, height: [4, 6, 9], floor: ['gravel', 'setts', 'greatPaving'], kerb: 'kerb', lamp: { thing: 'wallTorch', every: 14 } },
      water: { bank: 3, height: 6, rise: 0.4, max: 18, sink: 0.35, depth: 2.4 },
      biomes: UNDER_BIOMES,
      zone: 112,
      streams: { scale: 150, width: 0.012, share: 0.45 },
    },
    places: { name: 'the depths beneath {name}' },
    arrival: { thing: 'ascent' },
    wipe: 'overworld',
    gather: 8,
    mood: { murk: 1, ruin: 0.6 },
  },
};
