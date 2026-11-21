import type { RealmDef, RealmId } from '../types';

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
    scatter: [
      { thing: 'chest', chance: 0.35, at: 'middle' },
      { thing: 'urn', chance: 0.5, at: 'wall' },
      { thing: 'urn', chance: 0.3, at: 'wall' },
      { thing: 'torch', chance: 0.3, at: 'corner' },
      { thing: 'wallTorch', chance: 0.7, at: 'wall' },
      { thing: 'wallTorch', chance: 0.5, at: 'wall' },
      { thing: 'wallTorch', chance: 0.35, at: 'wall' },
      { thing: 'oilBarrel', chance: 0.25, at: 'corner' },
      { thing: 'crate', chance: 0.3, at: 'wall' },
      // Under the places above: the greater halls hold more, and are guarded. Risk and reward.
      { thing: 'chest', chance: 0.8, at: 'middle', under: ['ruin', 'stones', 'city', 'hamlet'] },
      { thing: 'urn', chance: 0.7, at: 'wall', under: ['village', 'farmstead', 'hamlet', 'city'] },
      { thing: 'crate', chance: 0.6, at: 'wall', under: ['village', 'city', 'watchtower'] },
      { thing: 'hexer', chance: 0.55, at: 'corner', under: ['ruin', 'stones', 'city'] },
      { thing: 'raider', chance: 0.5, at: 'corner', under: ['ruin', 'hamlet', 'city'] },
      { thing: 'wolf', chance: 0.4, at: 'wall', under: ['village', 'watchtower'] },
    ],
    glow: { r: 0.95, g: 0.66, b: 0.32, radius: 12, flicker: 0.12 },
    ceiling: { corridor: 4, hall: 7, tile: 'ruinWall' },
    arrival: { thing: 'ascent' },
    wipe: 'overworld',
    gather: 8,
    mood: { murk: 1, ruin: 0.6 },
  },
};
