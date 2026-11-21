import { CAP, HIP, type Info, type Mats, Placer, RAMP, RIDGE, SLAB, STAIR, between, key, plinth } from './placer';
import type { Furnish, Furnishing, Rng, StructureDef } from '../../../types';
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
      if (b % 2 === 0 ? ly === rowA && lx >= 1 && lx <= 2 : ly === rowB && lx >= 3 && lx <= 4) return true;
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
          // Door: two cells high in the middle of the front wall.
          if (k === 0 && ly === 0 && lx === doorX && dz < 2) continue;
          // Windows: one cell high, at eye level, evenly spaced and never at a corner.
          if (every > 0 && dz === 1 && !corner && along > 0 && along < len - 1 && (along - mid) % every === 0 && !(k === 0 && ly === 0 && lx === doorX)) continue;
          const framed = def.frame === true && (corner || dz === STOREY - 1);
          p.cube(lx, ly, lz, framed ? m.trim : m.wall);
        }
      }
    }
  }
  // Stairs: flights of three, stacked up through the building.
  let stairs: Info['stairs'] = null;
  if (climbs) {
    for (let b = 0; b < levels; b++) {
      const z0 = b * STOREY;
      const up = b % 2 === 0;
      for (let i = 0; i < STOREY; i++) {
        const lx = up ? 1 + i : 4 - i;
        const ly = up ? rowA : rowB;
        p.put(lx, ly, z0 + i, STAIR, up ? 0 : 2, m.floor);
        for (let lz = z0; lz < z0 + i; lz++) p.cube(lx, ly, lz, m.floor);
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
      for (let lx = 0; lx < W; lx++) for (let ly = 0; ly < D; ly++) if ((lx === 0 || ly === 0 || lx === W - 1 || ly === D - 1) && (lx + ly) % 2 === 0) p.cube(lx, ly, top, m.wall);
      height = top + 1;
    }
  } else if (roofKind === 'gable') {
    height = gable(p, top, m);
  } else {
    height = hip(p, top, m);
  }
  return { storeys: S, doorX, stairs, height, stairRows: climbs ? [rowA, rowB] : null, floors: flatTop ? (def.parapet ? S : S) : S };
}

/** Picks spots for furniture inside a house and gives each the way it faces. */
export function furnishSpots(list: readonly Furnish[], p: Placer, info: Info, rng: Rng): Furnishing[] {
  const { W, D } = p;
  const used = new Set<number>();
  const out: Furnishing[] = [];
  const doorX = info.doorX;
  const blocked = (lx: number, ly: number, k: number): boolean => {
    if (info.stairRows && (ly === info.stairRows[0] || ly === info.stairRows[1]) && lx <= 5) return true;
    if (info.stairRows && ly >= D - 4 && lx <= 5) return true;
    return k === 0 && ly <= 2 && Math.abs(lx - doorX) <= 1;
  };
  for (const f of list) {
    if (f.chance !== undefined && rng.next() > f.chance) continue;
    const n = typeof f.count === 'number' ? f.count : f.count[0] + rng.int(f.count[1] - f.count[0] + 1);
    const floors = f.floors ?? 'ground';
    const ks: number[] = [];
    if (floors !== 'upper') ks.push(0);
    if (floors !== 'ground') for (let k = 1; k < info.storeys; k++) ks.push(k);
    for (let i = 0; i < n; i++) {
      const k = ks.length > 0 ? ks[rng.int(ks.length)] ?? 0 : 0;
      // Candidate cells with the direction (local) the thing faces.
      const cand: { lx: number; ly: number; fx: number; fy: number }[] = [];
      for (let lx = 1; lx <= W - 2; lx++) {
        for (let ly = 1; ly <= D - 2; ly++) {
          if (blocked(lx, ly, k) || used.has(key(lx, ly, k))) continue;
          const nearX = lx === 1 || lx === W - 2;
          const nearY = ly === 1 || ly === D - 2;
          const fy = ly === 1 ? 1 : ly === D - 2 ? -1 : 0;
          const fx = lx === 1 ? 1 : lx === W - 2 ? -1 : 0;
          if (f.at === 'corner' && nearX && nearY) cand.push({ lx, ly, fx: 0, fy });
          else if (f.at === 'wall' && (nearX || nearY) && !(nearX && nearY)) cand.push({ lx, ly, fx: nearY ? 0 : fx, fy: nearY ? fy : 0 });
          else if (f.at === 'back' && ly === D - 2 && !nearX) cand.push({ lx, ly, fx: 0, fy: -1 });
          else if (f.at === 'middle' && !nearX && !nearY) cand.push({ lx, ly, fx: 0, fy: 1 });
        }
      }
      const c = cand.length > 0 ? cand[rng.int(cand.length)] : undefined;
      if (!c) continue;
      used.add(key(c.lx, c.ly, k));
      // Keep a neighbour or two free, so there is room to walk between things.
      used.add(key(c.lx + 1, c.ly, k));
      used.add(key(c.lx - 1, c.ly, k));
      const [wx, wy] = p.world(c.lx, c.ly);
      const r = p.site.rot & 3;
      const vx = r === 0 ? c.fx : r === 1 ? -c.fy : r === 2 ? -c.fx : c.fy;
      const vy = r === 0 ? c.fy : r === 1 ? c.fx : r === 2 ? -c.fy : -c.fx;
      out.push({ thing: f.thing, x: wx + 0.5, y: wy + 0.5, z: p.site.z + k * STOREY, angle: Math.atan2(vy, vx) });
    }
  }
  return out;
}

/** Pitched roof with a ridge along the longer side; the short ends are filled up into gables. */
export function gable(p: Placer, top: number, m: Mats): number {
  const { W, D } = p;
  const alongY = W <= D;
  const S = alongY ? W : D;
  const L = alongY ? D : W;
  const half = Math.floor(S / 2);
  let peak = top;
  const cell = (across: number, along: number, lz: number, shape: number, turns: number): void => {
    if (alongY) p.put(across, along, lz, shape, turns, m.roof);
    else p.put(along, across, lz, shape, turns + 1, m.roof);
  };
  const fill = (across: number, along: number, lz: number): void => {
    if (alongY) p.cube(across, along, lz, m.wall);
    else p.cube(along, across, lz, m.wall);
  };
  for (let along = 0; along < L; along++) {
    const end = along === 0 || along === L - 1;
    for (let r = 0; r < half; r++) {
      // Two slopes rising toward the middle.
      cell(r, along, top + r, RAMP, 0);
      cell(S - 1 - r, along, top + r, RAMP, 2);
      peak = Math.max(peak, top + r + 1);
      if (end) {
        for (let lz = top; lz < top + r; lz++) {
          fill(r, along, lz);
          fill(S - 1 - r, along, lz);
        }
      }
    }
    if (S % 2 === 1) {
      cell(half, along, top + half, RIDGE, 0);
      peak = Math.max(peak, top + half + 1);
      if (end) for (let lz = top; lz < top + half; lz++) fill(half, along, lz);
    } else if (end) {
      // Even width: the two slopes meet on a line; nothing more to fill.
    }
  }
  return peak;
}

/** Roof sloping down on all four sides, built ring by ring from the eaves inward. */
export function hip(p: Placer, top: number, m: Mats): number {
  const { W, D } = p;
  let peak = top;
  for (let r = 0; ; r++) {
    const wi = W - 2 * r;
    const di = D - 2 * r;
    if (wi <= 0 || di <= 0) break;
    const z = top + r;
    const x0 = r;
    const y0 = r;
    const x1 = W - 1 - r;
    const y1 = D - 1 - r;
    peak = Math.max(peak, z + 1);
    if (wi === 1 && di === 1) {
      p.put(x0, y0, z, CAP, 0, m.roof);
      break;
    }
    if (wi === 1 || di === 1) {
      // A ridge line; the cells at its ends are pyramid tops.
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const endCell = (wi === 1 && (y === y0 || y === y1)) || (di === 1 && (x === x0 || x === x1));
          p.put(x, y, z, endCell ? CAP : RIDGE, wi === 1 ? 0 : 1, m.roof);
        }
      }
      break;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const onX = x === x0 || x === x1;
        const onY = y === y0 || y === y1;
        if (!onX && !onY) continue;
        if (onX && onY) {
          // Outer corner: its high point faces the middle of the roof.
          const turns = x === x0 ? (y === y0 ? 0 : 3) : y === y0 ? 1 : 2;
          p.put(x, y, z, HIP, turns, m.roof);
        } else if (onX) p.put(x, y, z, RAMP, x === x0 ? 0 : 2, m.roof);
        else p.put(x, y, z, RAMP, y === y0 ? 1 : 3, m.roof);
      }
    }
    if (wi === 2 || di === 2) break;
  }
  return peak;
}
