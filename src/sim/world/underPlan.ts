import type { SiteLayout } from './sites';
import { REGION_SIZE } from './sites';
import { CONTENT } from '../../content';
import { landOf } from './terrain';

/**
 * What the land above asks of the rock under one 256 m region (see underworld.ts): read from the places of the land and
 * their `under` data, never from anything of the underworld's own, so a better land makes a better underworld.
 */

/** Distance between hall centres. */
export const PITCH = 16;
/** Nodes across one 256 m region of the land. */
const NODES = REGION_SIZE / PITCH;

/** An open cave under a place: its middle, radius, clear height at the rim and the middle, and the place itself. */
export interface Cavern {
  cx: number;
  cy: number;
  r: number;
  lo: number;
  hi: number;
  site: SiteLayout;
  /** The place's own buildings stand in it, this far fallen. */
  ruin: number;
}

export interface UnderPlan {
  /** Great halls: node → half-size and the kind of place above. */
  boost: Map<number, { hall: number; site: string }>;
  /** Nodes where tunnels are likelier to be open: node → chance. */
  dense: Map<number, number>;
  /** Caverns that reach into this region. */
  caverns: Cavern[];
}

export const nodeKey = (i: number, j: number): number => (i + 4096) * 8192 + (j + 4096);
const plans = new Map<number, Map<number, UnderPlan>>();
let lastSeed = Number.NaN;
let lastRx = 0;
let lastRy = 0;
let lastPlan: UnderPlan | null = null;

/** The plan for the region holding node (i, j). */
export function planFor(seed: number, i: number, j: number): UnderPlan {
  return regionPlan(seed, Math.floor(i / NODES), Math.floor(j / NODES));
}

/** The plan for region (rx, ry). */
export function regionPlan(seed: number, rx: number, ry: number): UnderPlan {
  if (lastPlan && seed === lastSeed && rx === lastRx && ry === lastRy) return lastPlan;
  let bySeed = plans.get(seed);
  if (!bySeed) {
    if (plans.size > 4) plans.clear();
    bySeed = new Map();
    plans.set(seed, bySeed);
  }
  const k = (rx + 32768) * 65536 + (ry + 32768);
  let plan = bySeed.get(k);
  if (!plan) {
    if (bySeed.size > 256) bySeed.clear();
    plan = buildPlan(seed, rx, ry);
    bySeed.set(k, plan);
  }
  lastSeed = seed;
  lastRx = rx;
  lastRy = ry;
  lastPlan = plan;
  return plan;
}

/** The places whose caverns or tunnels could reach region (rx, ry): two regions round it, as a megacity's cave is that wide. */
function placesAround(seed: number, rx: number, ry: number): SiteLayout[] {
  const land = landOf(seed);
  const out: SiteLayout[] = [];
  for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (const s of land.sitesNear((rx + i) * REGION_SIZE, (ry + j) * REGION_SIZE)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

function buildPlan(seed: number, rx: number, ry: number): UnderPlan {
  const plan: UnderPlan = { boost: new Map(), dense: new Map(), caverns: [] };
  const i0 = rx * NODES;
  const j0 = ry * NODES;
  const x0 = rx * REGION_SIZE;
  const y0 = ry * REGION_SIZE;
  for (const site of placesAround(seed, rx, ry)) {
    const u = CONTENT.sites[site.kind]?.under;
    if (!u) continue;
    if (u.cavern) {
      // Its noisy rim reaches 1.2 × the radius at most (underSpot.ts).
      const r = site.radius * u.cavern.size;
      const dx = Math.max(x0 - site.cx, 0, site.cx - (x0 + REGION_SIZE));
      const dy = Math.max(y0 - site.cy, 0, site.cy - (y0 + REGION_SIZE));
      if (Math.hypot(dx, dy) < r * 1.2) plan.caverns.push({ cx: site.cx, cy: site.cy, r, lo: u.cavern.height[0], hi: u.cavern.height[1], site, ruin: u.ruin ?? 0 });
    }
    // A great hall under the middle, a knot of tunnels round it.
    const ci = Math.floor(site.cx / PITCH);
    const cj = Math.floor(site.cy / PITCH);
    if (ci >= i0 && ci < i0 + NODES && cj >= j0 && cj < j0 + NODES) plan.boost.set(nodeKey(ci, cj), { hall: u.hall, site: site.kind });
    const span = Math.ceil(u.reach / PITCH);
    for (let j = Math.max(j0, cj - span); j <= Math.min(j0 + NODES - 1, cj + span); j++) {
      for (let i = Math.max(i0, ci - span); i <= Math.min(i0 + NODES - 1, ci + span); i++) {
        if (Math.hypot(i * PITCH + 8 - site.cx, j * PITCH + 8 - site.cy) > u.reach) continue;
        const nk = nodeKey(i, j);
        plan.dense.set(nk, Math.max(plan.dense.get(nk) ?? 0, u.density));
      }
    }
  }
  return plan;
}
