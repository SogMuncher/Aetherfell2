// Upper levels of underworld halls as cells of the 3D layer: a gallery walkway along two walls and the stair up to it
import type { Volume } from '../../types';
import { shapeByte } from '../../types';
import { shapeId } from '../../content/shapes';

const SLAB_HIGH = shapeId('slabHigh');
const STAIR = shapeId('stair');
const CUBE = shapeId('cube');

/**
 * Writes what of a hall's upper level stands over tile (x, y) (`upper` from underRooms.ts `roomTile`): 3 = the gallery,
 * a slab whose top is 3 m over the floor (2.5 m clear beneath); 0..2 = the stair's tiles from its foot, each two half-metre
 * steps climbing toward +x on solid stuff, so the top step meets the gallery beside it. Ordinary cells: they burn, break
 * and hold whoever stands on them like any floor of a house.
 */
export function upperLevels(volume: Volume, x: number, y: number, floor: number, upper: number, mat: number): void {
  if (upper === 3) {
    volume.set(x, y, floor + 2, shapeByte(SLAB_HIGH, 0), mat);
    return;
  }
  for (let k = 0; k < 2; k++) {
    const step = upper * 2 + k;
    const fz = floor * 2 + step;
    for (let fy = y * 2; fy < y * 2 + 2; fy++) {
      volume.setFine(x * 2 + k, fy, fz, shapeByte(STAIR, 0), mat);
      for (let z = floor * 2; z < fz; z++) volume.setFine(x * 2 + k, fy, z, shapeByte(CUBE, 0), mat);
    }
  }
}
