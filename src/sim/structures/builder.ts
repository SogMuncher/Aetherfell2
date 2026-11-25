// buildStructure entry: recipe -> cells
import type { CellWriter, Furnishing, Rng, StructureDef, StructureReport, StructureSite } from '../../types';
import { Placer, type Site, between, hash2, key, pick, turn } from './builder/placer';
import { buildArch, buildWall, decay } from './builder/arch';
import { buildHouse } from './builder/house';
import { furnishSpots } from './builder/furnish';


/** Metres between one floor and the next. */
export const STOREY = 3;

/**
 * Builds a structure from a recipe: picks a size and materials, snaps shapes into walls, floors,
 * stairs and a roof on a 1 m grid, optionally lets time knock bits down, and writes the result.
 */
export function buildStructure(def: StructureDef, out: CellWriter, site: StructureSite, rng: Rng): StructureReport {
  const W = site.size ? site.size[0] : between(rng, def.width);
  const D = site.size ? site.size[1] : between(rng, def.depth);
  // Settle where the corner goes and how high the floor is.
  let sx = site.x;
  let sy = site.y;
  if (site.anchor === 'door') {
    const [rx, ry] = turn(Math.floor(W / 2), -1, W, D, site.rot);
    sx -= rx;
    sy -= ry;
  }
  let sz = site.z;
  if (sz === undefined) {
    let hi = -Infinity;
    for (let lx = 0; lx < W; lx++) for (let ly = 0; ly < D; ly++) {
      const [rx, ry] = turn(lx, ly, W, D, site.rot);
      hi = Math.max(hi, site.ground ? site.ground(sx + rx, sy + ry) : 0);
    }
    sz = Math.max(0, Math.ceil(hi - 0.05));
  }
  const resolved: Site = { x: sx, y: sy, z: sz, rot: site.rot, ...(site.ground ? { ground: site.ground } : {}) };
  const p = new Placer(resolved, W, D);
  const wall = pick(rng, def.materials.wall, def.materials.wall);
  const trim = pick(rng, def.materials.trim, [def.materials.wall[0] ?? 'stoneWall']);
  const hasTrim = !!def.materials.trim && def.materials.trim.length > 0;
  const floor = pick(rng, def.materials.floor, def.materials.floor);
  const roofMat = pick(rng, def.materials.roof, def.materials.roof);
  const base = pick(rng, def.materials.foundation, [def.materials.wall[0] ?? 'stoneWall']);
  const info = def.form === 'arch' ? buildArch(def, p, rng, { wall, floor, roof: roofMat, base }) : def.form === 'wall' ? buildWall(def, p, rng, { wall, trim: hasTrim ? trim : wall, floor, roof: roofMat, base }) : buildHouse(def, p, rng, { wall, trim: hasTrim ? trim : wall, floor, roof: roofMat, base });
  if (def.decay && def.decay > 0) decay(p, def.decay, resolved.rot + W * 7 + D * 13, info.height);
  let furnishings: Furnishing[] = def.form === 'house' && def.furnish ? furnishSpots(def.furnish, p, info, rng) : [];
  if (def.decay && def.decay > 0) furnishings = furnishings.filter((f) => hash2(Math.floor(f.x), Math.floor(f.y), 91) >= def.decay!);
  // Write it all out.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const c of p.cells.values()) {
    // Eaves and verges only reach where nothing stands (a neighbour's wall keeps its blocks).
    if (p.soft.has(key(c.lx, c.ly, c.lz)) && out.shapeAt(c.x, c.y, c.z) !== 0) continue;
    out.set(c.x, c.y, c.z, c.shape, c.mat);
    if (c.x < x0) x0 = c.x;
    if (c.x > x1) x1 = c.x;
    if (c.y < y0) y0 = c.y;
    if (c.y > y1) y1 = c.y;
    if (c.z < z0) z0 = c.z;
    if (c.z > z1) z1 = c.z;
  }
  for (const c of p.fine.values()) out.setFine(c.x, c.y, c.z, c.shape, c.mat);
  // The cell in front of the door (outside the front wall, in the structure's own frame).
  const [dx, dy] = p.world(info.doorX, -1);
  const stairsAt = info.stairs ? p.world(info.stairs.x, info.stairs.y) : null;
  const [inX, inY] = p.world(info.doorX, 1);
  const [homeX, homeY] = p.world(info.doorX, Math.min(2, D - 2));
  const ia = p.world(1, 1);
  const ib = p.world(W - 2, D - 2);
  return {
    door: { outX: dx, outY: dy, inX, inY },
    home: { x: homeX, y: homeY },
    interior: { x0: Math.min(ia[0], ib[0]), y0: Math.min(ia[1], ib[1]), x1: Math.max(ia[0], ib[0]), y1: Math.max(ia[1], ib[1]) },
    furnishings,
    x0,
    y0,
    x1,
    y1,
    z0,
    z1,
    cells: p.cells.size,
    floor: sz,
    storeys: info.storeys,
    doorX: dx,
    doorY: dy,
    stairs: stairsAt && info.stairs ? { x: stairsAt[0], y: stairsAt[1], z: sz + info.stairs.z } : null,
    width: W,
    depth: D,
  };
}
