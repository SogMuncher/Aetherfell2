// The house form: plinth, floors, walls with doors and windows, stairs, columns and a roof
import { ARCH, COLUMN, CUBE, type Info, LEAF, type Mats, PARAPET, Placer, ROUND, SLAB, STAIR, WINDOW, between, key, outward, plinth } from './placer';
import { gable, hip } from './roofs';
import { type Rng, type StructureDef, shapeByte } from '../../../types';
import { tileCode } from '../../../content/tiles';
import { STOREY } from '../builder';


export function buildHouse(def: StructureDef, p: Placer, rng: Rng, m: Mats): Info {
  const { W, D } = p;
  const roofKind = def.roof ?? 'gable';
  let S = def.storeys ? between(rng, def.storeys) : 1;
  const stairsFit = W >= 6 && D >= 5;
  if (!stairsFit) S = 1;
  const flatTop = roofKind === 'flat';
  const top = S * STOREY;
  const doorX = Math.floor(W / 2);
  const every = def.windowEvery ?? 0;
  const door = def.decay ? 0 : tileCode(def.materials.door?.[rng.int(def.materials.door.length)] ?? 'door');
  // Floors: a thin slab whose top is the floor level, one cell below it.
  // Flights of stairs alternate between the two rows by the back wall: even flights climb toward +x
  // along the back row, odd ones come back toward -x along the next row, so they never collide.
  const rowA = D - 2;
  const rowB = D - 3;
  const climbs = !def.open && (S > 1 || (flatTop && def.parapet === true));
  const levels = flatTop && def.parapet ? S : S - 1;
  const hole = (lx: number, ly: number, lz: number): boolean => {
    // The stairwell: cells above a climbing flight are left open so you can stand up on it.
    if (!climbs) return false;
    for (let b = 0; b < levels; b++) {
      if (lz !== (b + 1) * STOREY - 1) continue;
      if (b % 2 === 0 ? ly === rowA && lx >= 1 && lx <= 3 : ly === rowB && lx >= 2 && lx <= 4) return true;
    }
    return false;
  };
  for (let lx = 0; lx < W; lx++) {
    for (let ly = 0; ly < D; ly++) {
      plinth(p, lx, ly, -2, m.base);
      // Under the walls the plinth carries on up to the floor; inside, a thin floor of its own.
      if (lx === 0 || ly === 0 || lx === W - 1 || ly === D - 1) p.cube(lx, ly, -1, m.base);
      else p.put(lx, ly, -1, SLAB, 0, m.floor);
    }
  }
  for (let b = 1; b <= (flatTop ? S : S - 1); b++) {
    if (def.open && b < S) continue;
    for (let lx = 1; lx < W - 1; lx++) {
      for (let ly = 1; ly < D - 1; ly++) {
        const lz = b * STOREY - 1;
        if (hole(lx, ly, lz)) continue;
        p.put(lx, ly, lz, SLAB, 0, b === S ? m.roof : m.floor);
      }
    }
  }
  // Walls, a storey at a time.
  for (let k = 0; k < S; k++) {
    const z0 = k * STOREY;
    for (let lx = 0; lx < W; lx++) {
      for (let ly = 0; ly < D; ly++) {
        const edge = lx === 0 || ly === 0 || lx === W - 1 || ly === D - 1;
        if (!edge) continue;
        const corner = (lx === 0 || lx === W - 1) && (ly === 0 || ly === D - 1);
        const len = ly === 0 || ly === D - 1 ? W : D;
        const along = ly === 0 || ly === D - 1 ? lx : ly;
        const mid = Math.floor(len / 2);
        for (let dz = 0; dz < STOREY; dz++) {
          const lz = z0 + dz;
          // Door: a leaf two cells high in the middle of the front wall (rotted away in a ruin).
          if (k === 0 && ly === 0 && lx === doorX && dz < 2) {
            if (door) p.put(lx, ly, lz, LEAF, 0, door);
            continue;
          }
          // Windows: one cell high, at eye level, evenly spaced and never at a corner; framed on the outer face.
          if (every > 0 && dz === 1 && !corner && along > 0 && along < len - 1 && (along - mid) % every === 0 && !(k === 0 && ly === 0 && lx === doorX)) {
            p.put(lx, ly, lz, WINDOW, outward(lx, ly, W, D), def.frame ? m.trim : m.wall);
            continue;
          }
          const framed = def.frame === true && (corner || dz === STOREY - 1);
          p.cube(lx, ly, lz, framed ? m.trim : m.wall);
        }
      }
    }
  }
  // Stairs: flights of quarter-metre steps (half-metre fine cells) climbing a storey over 3 m, stacked up through the
  // building. Each starts half a metre in from the end wall, so you step onto its foot from the side, and ends beside
  // the next flight's foot; the floor above is open over the flight, so your head clears it all the way.
  let stairs: Info['stairs'] = null;
  if (climbs) {
    for (let b = 0; b < levels; b++) {
      const fz0 = b * STOREY * 2;
      const up = b % 2 === 0;
      const ly = up ? rowA : rowB;
      for (let j = 0; j < STOREY * 2; j++) {
        const fx = up ? 3 + j : 8 - j;
        for (let k = 0; k < 2; k++) {
          p.putFine(fx, ly * 2 + k, fz0 + j, STAIR, up ? 0 : 2, m.floor);
          for (let fz = fz0; fz < fz0 + j; fz++) p.putFine(fx, ly * 2 + k, fz, CUBE, 0, m.floor);
        }
      }
      if (b === 0) stairs = { x: 1, y: rowA, z: 0 };
    }
  }
  // Steps down from the doorstep to the ground, if the ground lies lower.
  if (p.site.ground) {
    const [fx, fy] = p.world(doorX, -1);
    // The lowest ground anywhere in the cell outside the door: you can stand on any part of it.
    const g = p.site.ground;
    const low = Math.min(g(fx + 0.5, fy + 0.5), g(fx + 0.1, fy + 0.1), g(fx + 0.9, fy + 0.1), g(fx + 0.1, fy + 0.9), g(fx + 0.9, fy + 0.9));
    const need = p.site.z - low;
    // Each step cell drops a metre in two half-metre treads; build cells until the last tread is within a stride of the ground.
    for (let j = 0; j < 6 && (j === 0 ? need : need - (j - 1) - 0.5) > 0.45; j++) {
      const lz = -1 - j;
      p.put(doorX, -1 - j, lz, STAIR, 1, m.base);
      plinth(p, doorX, -1 - j, lz - 1, m.base);
    }
  }
  // Roof.
  let height = top;
  if (roofKind === 'flat') {
    if (def.parapet) {
      // Battlements: a merlon on every other edge cell, a low wall between.
      for (let lx = 0; lx < W; lx++) for (let ly = 0; ly < D; ly++) {
        if (!(lx === 0 || ly === 0 || lx === W - 1 || ly === D - 1)) continue;
        if ((lx + ly) % 2 === 0) p.cube(lx, ly, top, m.wall);
        else p.put(lx, ly, top, PARAPET, outward(lx, ly, W, D), m.wall);
      }
      height = top + 1;
    }
  } else if (roofKind === 'gable') {
    height = gable(p, top, m);
  } else {
    height = hip(p, top, m);
  }
  const pillars = def.open && def.columns ? colonnade(p, def.columns, top, m) : undefined;
  if (def.round) roundCorners(p);
  return { storeys: S, doorX, stairs, height, stairRows: climbs ? [rowA, rowB] : null, floors: S, ...(pillars ? { pillars } : {}) };
}

/** Two rows of round columns down a nave, `every` metres apart, with round arches between them just under the roof. */
function colonnade(p: Placer, every: number, top: number, m: Mats): Set<number> {
  const { W, D } = p;
  const taken = new Set<number>();
  if (W < 7) return taken;
  for (const lx of [2, W - 3]) {
    for (let ly = 3; ly <= D - 4; ly += every) {
      for (let lz = 0; lz <= top - 2; lz++) p.put(lx, ly, lz, COLUMN, 0, m.trim);
      taken.add(key(lx, ly, 0));
      // Two halves of a round arch reach to the next column when it stands three metres on.
      if (every === 3 && ly + every <= D - 4) {
        p.put(lx, ly + 1, top - 2, ARCH, 1, m.trim);
        p.put(lx, ly + 2, top - 2, ARCH, 3, m.trim);
      }
    }
  }
  return taken;
}

/** Round towers: every block in the four corner columns (walls, plinth, merlons) becomes a quarter round. */
function roundCorners(p: Placer): void {
  const { W, D } = p;
  const turns = (lx: number, ly: number): number => (lx === 0 ? (ly === 0 ? 2 : 1) : ly === 0 ? 3 : 0);
  for (const c of p.cells.values()) {
    if ((c.lx !== 0 && c.lx !== W - 1) || (c.ly !== 0 && c.ly !== D - 1) || (c.shape & 63) !== CUBE) continue;
    c.shape = shapeByte(ROUND, turns(c.lx, c.ly) + p.site.rot);
  }
}
