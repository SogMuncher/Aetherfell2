// Finds a walkable way between two points (A* over 1 m cells: ground, walls of the 3D layer, doors, deep water) for creatures that must get somewhere.
import type { SimContext, Vec2 } from '../../types';

/** Largest box of cells one search may cover (side), and how many cells it may open before giving up. */
const SIDE = 160;
const BUDGET = 5000;
const N = SIDE * SIDE;
// Scratch reused by every search, so finding a way makes no garbage.
const walk = new Int8Array(N); // 1 open, 2 blocked (once seen this search)
const high = new Float32Array(N); // standing height in an open cell
const cost = new Float32Array(N);
const from = new Int32Array(N);
const seen = new Uint16Array(N);
let stamp = 0;
const heap: number[] = [];
const heapF: number[] = [];

/** How high a walker steps up onto a floor of the 3D layer (as physics allows), and how far the ground may rise or a floor drop per cell. */
const STEP = 0.55;
const SLOPE = 1;
const DROP = 2.5;

/**
 * Where a creature coming from height `from` would stand in the cell whose corner is (cx, cy), or NaN
 * if it cannot: a tile obstacle, a wall of the 3D layer at body height, too steep, or deep water.
 * Floors of the 3D layer within a step count (house floors, stairs). Shut doors count as open: walkers open them.
 */
export function walkable(ctx: SimContext, cx: number, cy: number, from: number): number {
  const x = cx + 0.5;
  const y = cy + 0.5;
  if (ctx.tiles.blocked(x, y)) return NaN;
  const g = ctx.tiles.ground(x, y);
  const h = Math.max(g, ctx.state.volume.floorBelow(x, y, from + STEP, from - DROP));
  if (h - from > (h === g ? SLOPE : STEP) || from - h > DROP) return NaN;
  if (ctx.state.volume.solidBetween(x, y, h + 0.6, h + 1.5) && ctx.matter.doorOpen(cx, cy, Math.floor(h + 0.3)) === null) return NaN;
  return ctx.tiles.info(x, y).liquid && g < -0.4 ? NaN : h;
}

function push(i: number, f: number): void {
  heap.push(i);
  heapF.push(f);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if ((heapF[p] ?? 0) <= f) break;
    heap[k] = heap[p] ?? 0;
    heapF[k] = heapF[p] ?? 0;
    k = p;
  }
  heap[k] = i;
  heapF[k] = f;
}

function pop(): number {
  const top = heap[0] ?? -1;
  const i = heap.pop() ?? 0;
  const f = heapF.pop() ?? 0;
  if (heap.length === 0) return top;
  let k = 0;
  for (;;) {
    const l = k * 2 + 1;
    if (l >= heap.length) break;
    const r = l + 1;
    const c = r < heap.length && (heapF[r] ?? 0) < (heapF[l] ?? 0) ? r : l;
    if ((heapF[c] ?? 0) >= f) break;
    heap[k] = heap[c] ?? 0;
    heapF[k] = heapF[c] ?? 0;
    k = c;
  }
  heap[k] = i;
  heapF[k] = f;
  return top;
}

/**
 * Cell-centre waypoints from `a` to `b` (the last is `b` itself), straightened where a line is clear.
 * When the budget runs out first, the way to the nearest cell reached (walk it, then search again);
 * null when there is no way that gets meaningfully closer. An unreachable goal cell (furniture,
 * a wall) is swapped for the nearest open cell next to it.
 */
export function findPath(ctx: SimContext, a: Vec2, b: Vec2, z: number): Vec2[] | null {
  let fromH = z;
  const ax = Math.floor(a.x);
  const ay = Math.floor(a.y);
  let bx = Math.floor(b.x);
  let by = Math.floor(b.y);
  const ox = Math.floor((ax + bx) / 2) - SIDE / 2;
  const oy = Math.floor((ay + by) / 2) - SIDE / 2;
  const inBox = (x: number, y: number): boolean => x >= ox && y >= oy && x < ox + SIDE && y < oy + SIDE;
  if (!inBox(ax, ay) || !inBox(bx, by)) return null;
  stamp = (stamp + 1) & 0xffff;
  if (stamp === 0) {
    seen.fill(0);
    stamp = 1;
  }
  const idx = (x: number, y: number): number => (y - oy) * SIDE + (x - ox);
  const open = (x: number, y: number): boolean => {
    if (!inBox(x, y)) return false;
    const i = idx(x, y);
    if (seen[i] !== stamp) {
      seen[i] = stamp;
      const h = walkable(ctx, x, y, fromH);
      walk[i] = Number.isNaN(h) ? 2 : 1;
      high[i] = h;
      cost[i] = Infinity;
      from[i] = -1;
    }
    return walk[i] === 1;
  };
  // The start cell is where the walker already stands.
  if (inBox(ax, ay)) {
    const i0 = (ay - oy) * SIDE + (ax - ox);
    seen[i0] = stamp;
    walk[i0] = 1;
    high[i0] = z;
    cost[i0] = Infinity;
    from[i0] = -1;
  }
  heap.length = 0;
  heapF.length = 0;
  const start = idx(ax, ay);
  let goal = idx(bx, by);
  cost[start] = 0;
  push(start, 0);
  let opened = 0;
  let found = false;
  // The cell nearest the goal reached so far: when the way is too long for one search, walk that far and look again.
  let best = start;
  let bestH = Math.hypot(bx - ax, by - ay);
  while (heap.length > 0 && opened++ < BUDGET) {
    const i = pop();
    const x = (i % SIDE) + ox;
    const y = Math.floor(i / SIDE) + oy;
    // There, or next to a goal nobody can stand in (furniture, a wall): close enough.
    if (i === goal || (seen[goal] === stamp && walk[goal] === 2 && Math.abs(x - bx) <= 1 && Math.abs(y - by) <= 1)) {
      found = true;
      goal = i;
      break;
    }
    const c = cost[i] ?? 0;
    fromH = high[i] ?? z;
    const hh = Math.hypot(bx - x, by - y);
    if (hh < bestH) {
      bestH = hh;
      best = i;
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || !open(x + dx, y + dy)) continue;
        // No cutting corners past a wall.
        if (dx !== 0 && dy !== 0 && (!open(x + dx, y) || !open(x, y + dy))) continue;
        const j = idx(x + dx, y + dy);
        const nc = c + (dx !== 0 && dy !== 0 ? 1.414 : 1);
        if (nc >= (cost[j] ?? Infinity)) continue;
        cost[j] = nc;
        from[j] = i;
        push(j, nc + Math.hypot(bx - x - dx, by - y - dy));
      }
    }
  }
  if (!found) {
    // No progress worth walking for: give up.
    if (Math.hypot(bx - ax, by - ay) - bestH < 3) return null;
    goal = best;
  }
  const cells: Vec2[] = [];
  for (let i = goal; i !== start && i >= 0; i = from[i] ?? -1) cells.push({ x: (i % SIDE) + ox + 0.5, y: Math.floor(i / SIDE) + oy + 0.5 });
  cells.reverse();
  if (goal === idx(bx, by)) cells[cells.length - 1] = { x: b.x, y: b.y };
  // Straighten: from each kept point, skip ahead to the furthest point in clear sight.
  const out: Vec2[] = [];
  let here: Vec2 = a;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = Math.min(cells.length - 1, k + 24); m > k; m--) {
      const c = cells[m];
      if (c && clear(here, c, open, (x, y) => high[idx(x, y)] ?? z)) {
        far = m;
        break;
      }
    }
    const p = cells[far];
    if (!p) break;
    out.push(p);
    here = p;
    k = far + 1;
  }
  return out;
}

/** Every cell a body (about 0.35 m either side) touches along the line is open, with no step up or down bigger than a stair. */
function clear(a: Vec2, b: Vec2, open: (x: number, y: number) => boolean, height: (x: number, y: number) => number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const n = Math.ceil(len / 0.25);
  const px = len > 0 ? (-dy / len) * 0.35 : 0;
  const py = len > 0 ? (dx / len) * 0.35 : 0;
  let was = height(Math.floor(a.x), Math.floor(a.y));
  for (let i = 1; i <= n; i++) {
    const x = a.x + (dx * i) / n;
    const y = a.y + (dy * i) / n;
    if (!open(Math.floor(x), Math.floor(y)) || !open(Math.floor(x + px), Math.floor(y + py)) || !open(Math.floor(x - px), Math.floor(y - py))) return false;
    const h = height(Math.floor(x), Math.floor(y));
    if (Math.abs(h - was) > STEP) return false;
    was = h;
  }
  return true;
}
