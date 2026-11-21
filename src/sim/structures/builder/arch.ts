import { BRACKET, type Info, type Mats, Placer, SLAB, STAIR, between, hash2, plinth } from './placer';
import type { Rng, StructureDef } from '../../../types';


/** A passage through a pair of thick piers with an arched ceiling, and a walkway over the top. */
export function buildArch(def: StructureDef, p: Placer, rng: Rng, m: { wall: number; floor: number; roof: number; base: number }): Info {
  const { W, D } = p;
  const pier = def.pier ?? 2;
  const H = def.opening ? between(rng, def.opening) : 4;
  for (let ly = 0; ly < D; ly++) {
    for (let lx = 0; lx < W; lx++) {
      const inPier = lx < pier || lx >= W - pier;
      if (inPier) {
        plinth(p, lx, ly, -1, m.base);
        for (let lz = 0; lz <= H; lz++) p.cube(lx, ly, lz, m.wall);
        continue;
      }
      p.put(lx, ly, -1, SLAB, 0, m.floor);
      p.cube(lx, ly, H, m.wall);
      // Shoulders that round the corners of the opening.
      if (lx === pier) p.put(lx, ly, H - 1, BRACKET, 0, m.wall);
      if (lx === W - pier - 1) p.put(lx, ly, H - 1, BRACKET, 2, m.wall);
    }
  }
  let stairs: Info['stairs'] = null;
  let height = H + 1;
  if (def.deck) {
    // Battlements along both long edges, and an outside stair up the left side.
    for (let ly = 0; ly < D; ly++) {
      if (ly % 2 === 0) {
        p.cube(0, ly, H + 1, m.wall);
        p.cube(W - 1, ly, H + 1, m.wall);
      }
    }
    const sy = Math.floor(D / 2);
    const rise = def.stairs === false ? 0 : H + 1;
    for (let i = 0; i < rise; i++) {
      const lx = -rise + i;
      p.put(lx, sy, i, STAIR, 0, m.floor);
      for (let lz = 0; lz < i; lz++) p.cube(lx, sy, lz, m.floor);
    }
    if (rise > 0) stairs = { x: -rise, y: sy, z: 0 };
    height = H + 2;
  }
  // The "door" of an arch is its middle, facing the front.
  return { storeys: 1, doorX: Math.floor(W / 2), stairs, height, stairRows: null, floors: 0 };
}

/** A rampart: a thick wall with a walkway on top, merlons along the outer edge and, if asked, a stair up the inner side. */
export function buildWall(def: StructureDef, p: Placer, rng: Rng, m: Mats): Info {
  const { W, D } = p;
  const H = def.height ? between(rng, def.height) : 6;
  const thick = def.stairs ? D - 1 : D;
  for (let lx = 0; lx < W; lx++) {
    for (let ly = 0; ly < thick; ly++) {
      plinth(p, lx, ly, H - 2, m.base);
      p.cube(lx, ly, H - 1, ly === 0 ? m.wall : m.floor);
      for (let lz = 0; lz < H - 1; lz++) p.cube(lx, ly, lz, m.wall);
      if (ly === 0 && lx % 2 === 0) p.cube(lx, ly, H, m.trim);
    }
  }
  let stairs: Info['stairs'] = null;
  if (def.stairs && W > H + 3) {
    // A flight of half-metre steps climbing along the inner face, ending level with the walkway.
    const sy = D - 1;
    for (let i = 0; i < H; i++) {
      const lx = 1 + i;
      p.put(lx, sy, i, STAIR, 0, m.floor);
      plinth(p, lx, sy, i - 1, m.base);
    }
    stairs = { x: 1, y: sy, z: 0 };
  }
  return { storeys: 1, doorX: Math.floor(W / 2), stairs, height: H + 1, stairRows: null, floors: 0 };
}

/** Lets time knock the top off: roofs go first, then walls to uneven heights, with a few holes. */
export function decay(p: Placer, amount: number, seed: number, height: number): void {
  const a = Math.min(1, Math.max(0, amount));
  for (const [k, c] of [...p.cells]) {
    const col = hash2(c.lx, c.ly, seed);
    // How tall this column still stands (column noise, smoothed a little by neighbours).
    const smooth = (col + hash2(c.lx >> 1, c.ly >> 1, seed + 1)) / 2;
    const standing = height * (1 - a * (0.25 + 0.75 * smooth));
    if (c.lz >= standing && c.lz > 0) {
      p.cells.delete(k);
      continue;
    }
    if (c.lz > 1 && hash2(c.lx * 3 + c.lz, c.ly, seed + 2) < a * 0.12) p.cells.delete(k);
  }
}
