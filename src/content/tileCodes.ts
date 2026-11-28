/**
 * The tile ledger: the lasting number of each tile kind, which chunks and saves store.
 * A tile's number is its place in this list. Never reorder or remove a line (a retired tile keeps
 * its place, so its number is never handed to something else).
 *
 * You do not have to add new tiles here: a tile missing from the list is given the next free
 * number automatically. Adding it at the end only matters once saves must keep working across
 * versions, and the content checks list any tile that is not here yet.
 */
export const TILE_LEDGER: readonly string[] = [
  'grass', 'brush', 'oak', 'water', 'sand', 'road', 'stoneWall', 'woodWall', 'door', 'woodFloor',
  'flagstone', 'ruinWall', 'ash', 'burntTree', 'rock', 'bush', 'standingStone', 'snow', 'pine', 'ice',
  'peat', 'sedge', 'birch', 'willow', 'deadTree', 'log', 'stump', 'fern', 'mushrooms', 'flowers',
  'reeds', 'cairn', 'crystals', 'haystack', 'woodpile', 'well', 'rubble', 'fence', 'hedge', 'window',
  'post', 'towerWall', 'stoneSill', 'thatch', 'roofTile', 'slate', 'plaster', 'caveRock',
  'trail', 'cobble', 'caveFloor',
  'hullPlank', 'sailcloth',
  'brickWall', 'ashlar', 'sandstone', 'basalt', 'fieldstone', 'marble', 'halfTimber', 'daub', 'logWall', 'ochrePlaster',
  'rosePlaster', 'shingles', 'copperRoof', 'turfRoof', 'tiledFloor', 'darkPlanks', 'rushFloor', 'setts', 'gravel', 'mud',
  'cryptWall', 'cryptFloor', 'mineRock', 'oreVein', 'flowstone', 'timberProp', 'stalagmite', 'bookshelf', 'lockedDoor', 'boundDoor',
  'greatPaving', 'kerb', 'archiveWall',
];
