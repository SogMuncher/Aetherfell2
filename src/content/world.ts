import type { WorldGenDef } from '../types';

/**
 * World-wide generation choices. The land is the sum of its layers (continents, hills, ridged
 * mountains, small bumps); moisture picks wet or dry biomes; woodland patches make forests clump.
 * Salts pick different noise patterns; changing any number reshapes every world.
 */
export const WORLD: WorldGenDef = {
  land: [
    // Continents and seas.
    { noise: 'fbm', salt: 0, scale: 2600, octaves: 4, centre: 0.44, amount: 260 },
    // Rolling hills.
    { noise: 'fbm', salt: 50, scale: 380, octaves: 4, centre: 0.5, amount: 44 },
    // Ridged mountain ranges, only where the range mask rises.
    { noise: 'ridge', salt: 70, scale: 640, octaves: 5, centre: 0, amount: 300, mask: { salt: 90, scale: 1500, octaves: 3, from: 0.5, to: 0.72 } },
    // Small bumps you feel underfoot (close up only).
    { noise: 'fbm', salt: 33, scale: 24, octaves: 2, centre: 0.5, amount: 2.2, nearOnly: 5 },
  ],
  moisture: { salt: 200, scale: 1100, octaves: 3 },
  woods: { salt: 300, scale: 90, from: 0.38, to: 0.66, min: 0.3, gain: 1.6 },
  // Ways join the places of the world: each place keeps a grade (content/sites.ts `way`) and a link is as good as the lesser end.
  roads: {
    above: 0.15,
    reach: 760,
    lowest: 0.8,
    highest: 120,
    wet: 0.05,
    grades: {
      trail: { rank: 1, tile: 'trail', width: 1.6, wander: 0.14, bridge: { deck: 'woodFloor', rail: 'fence', post: 'post' } },
      road: { rank: 2, tile: 'road', width: 3, wander: 0.1, bridge: { deck: 'woodFloor', rail: 'fence', post: 'post' } },
      highroad: { rank: 3, tile: 'cobble', width: 4, wander: 0.06, bridge: { deck: 'flagstone', rail: 'stoneSill', post: 'stoneWall' } },
    },
  },
  // Rivers and lakes carve their beds out of the land (sim/world/water.ts); ways cross them on bridges, ports grow piers (sim/world/crossings.ts).
  water: {
    rivers: { salt: 610, scale: 850, octaves: 3, reject: 0.09, width: [6, 16], widthScale: 450, depth: 3.2, bank: 16, below: 1, lowest: 0.7, highest: 140, wet: { from: 0.22, to: 0.42 } },
    lakes: { salt: 640, cell: 700, chance: 0.38, radius: [45, 150], depth: [3, 6], bank: 20, lowest: 1.2, highest: 95, rimDrop: 22, wetter: 0.42 },
    shore: [
      { within: 1.6, tile: 'sand', chance: 1 },
      { within: 3, tile: 'reeds', chance: 0.12 },
      { within: 3.5, tile: 'sedge', chance: 0.5 },
    ],
    lip: 0.45,
    span: 34,
    harbour: {
      sites: ['megacity', 'city', 'village'],
      reach: 150,
      pier: { deck: 'woodFloor', rail: 'fence', post: 'post', length: [10, 20], width: 3 },
      quay: 'cobble',
      piers: [1, 3],
    },
  },
  far: { rock: [122, 118, 110], steep: 0.78, snow: [228, 234, 244], snowLine: 150, snowJitter: 40, road: [128, 108, 76] },
};
