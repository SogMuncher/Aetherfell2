// Underworld tiles: tomb masonry, mine rock and ore, flowstone, timber props, bookshelves, iron-bound doors, paving (merged into TILES)
import type { TileEntry } from './tiles';

/**
 * Stuff the underground biomes (content/underBiomes.ts) are dug from and furnished with. Living-rock walls are as tall
 * as the rock (30 m) and have no durability, so no blow opens the roof; what stands in a hall (posts, shelves, doors)
 * burns and breaks like any wall above.
 */
export const UNDER_TILES: Record<string, TileEntry> = {
  cryptWall: { name: 'tomb masonry', floor: 'cryptStone', wall: 'cryptStone', material: 'stone', shape: 'block', solid: true, height: 30, far: [70, 66, 62] },
  cryptFloor: { name: 'worn grave slabs', floor: 'cryptFloor', material: 'stone', far: [74, 70, 66] },
  mineRock: { name: 'hewn rock', floor: 'mineRock', wall: 'mineRock', material: 'stone', shape: 'block', solid: true, height: 30, far: [64, 54, 46] },
  oreVein: { name: 'ore vein', floor: 'ore', wall: 'ore', material: 'stone', shape: 'block', solid: true, height: 30, far: [80, 70, 60] },
  flowstone: { name: 'flowstone', floor: 'flowstone', wall: 'flowstone', material: 'stone', shape: 'block', solid: true, height: 30, far: [96, 86, 74] },
  // Pit props hold up the roof of a mine: wood, so a fire down there runs along them.
  timberProp: { durability: 120, breaksInto: 'rubble', name: 'pit prop', floor: 'planks', wall: 'wood', material: 'wood', shape: 'block', solid: true, flammability: 0.12, fuel: 255, height: 30, far: [92, 64, 40] },
  stalagmite: { name: 'stalagmite', floor: 'rock', material: 'stone', shape: 'billboard', solid: true, sprite: 'boulder', height: 1.3, far: [90, 84, 80] },
  // Shelves of old books: they burn fast and well.
  bookshelf: { durability: 50, breaksInto: 'darkPlanks', name: 'bookshelf', floor: 'darkPlanks', wall: 'bookshelf', material: 'wood', shape: 'block', solid: true, flammability: 0.35, fuel: 200, height: 2.4, far: [84, 56, 40] },
  // A door bound in iron, locked: a ruin key opens it (and is used up), or break it down, or burn it slowly.
  lockedDoor: { durability: 160, breaksInto: 'woodFloor', name: 'locked iron-bound door', floor: 'planks', material: 'wood', shape: 'door', solid: true, wall: 'boundDoor', flammability: 0.04, fuel: 255, height: 2.2, lock: { key: 'ruinKey', into: 'boundDoor' }, far: [80, 64, 50] },
  boundDoor: { durability: 160, breaksInto: 'woodFloor', name: 'iron-bound door', floor: 'planks', material: 'wood', shape: 'door', solid: true, wall: 'boundDoor', flammability: 0.04, fuel: 255, height: 2.2, far: [80, 64, 50] },
  archiveWall: { name: 'vault stone', floor: 'ashlar', wall: 'ashlar', material: 'stone', shape: 'block', solid: true, height: 30, far: [150, 144, 130] },
  greatPaving: { name: 'great paving', floor: 'greatPaving', material: 'stone', far: [92, 88, 84] },
  kerb: { name: 'kerbstone', floor: 'kerb', material: 'stone', far: [70, 68, 70] },
};
