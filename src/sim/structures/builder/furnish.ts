// Furniture spots inside a house: corners, walls, the back wall, the middle, each facing away from its wall
import { type Info, Placer, key } from './placer';
import type { Furnish, Furnishing, Rng } from '../../../types';
import { STOREY } from '../builder';

/** Picks spots for furniture inside a house and gives each the way it faces. */
export function furnishSpots(list: readonly Furnish[], p: Placer, info: Info, rng: Rng): Furnishing[] {
  const { W, D } = p;
  const used = new Set<number>();
  const out: Furnishing[] = [];
  const doorX = info.doorX;
  const blocked = (lx: number, ly: number, k: number): boolean => {
    if (info.pillars?.has(key(lx, ly, 0))) return true;
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
