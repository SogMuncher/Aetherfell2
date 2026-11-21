/**
 * The simple shapes every 3D structure is snapped together from. A shape is one or more convex
 * pieces; each piece is a box, optionally sliced by flat planes (a ramp is a cube cut along a slope).
 * Coordinates are inside a 1 m cell, 0..1. Every shape can face four ways (turned in quarter turns).
 *
 * A new shape is a new entry here (and a line at the end of SHAPE_LEDGER); the renderer, physics and
 * builder all read this table and need no changes.
 */

/** A flat plane slicing a piece: the solid side is where nx·x + ny·y + nz·z ≤ d. */
export type Cut = readonly [nx: number, ny: number, nz: number, d: number];

export interface ShapePiece {
  /** x0, y0, z0, x1, y1, z1 */
  readonly box: readonly [number, number, number, number, number, number];
  readonly cuts?: readonly Cut[];
}

export interface ShapeDef {
  readonly name: string;
  readonly pieces: readonly ShapePiece[];
}

export const SHAPES: Record<string, ShapeDef> = {
  cube: { name: 'block', pieces: [{ box: [0, 0, 0, 1, 1, 1] }] },
  // Lower half: a thin floor seen from above is `slabHigh` (its top is flush with the cell above).
  slabLow: { name: 'low slab', pieces: [{ box: [0, 0, 0, 1, 1, 0.5] }] },
  slabHigh: { name: 'high slab', pieces: [{ box: [0, 0, 0.5, 1, 1, 1] }] },
  // Rises one metre over one metre toward +x (turn it to face other ways).
  ramp: { name: 'ramp', pieces: [{ box: [0, 0, 0, 1, 1, 1], cuts: [[-1, 0, 1, 0]] }] },
  // A little roof ridge: two slopes meeting in a point half a metre up.
  ridge: { name: 'ridge', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-1, 0, 1, 0], [1, 0, 1, 1]] }] },
  // Two half-metre steps rising toward +x.
  stair: { name: 'stair', pieces: [{ box: [0, 0, 0, 0.5, 1, 0.5] }, { box: [0.5, 0, 0, 1, 1, 1] }] },
  // Outer corner of a hip roof: rises toward the +x,+y corner.
  hip: { name: 'hip corner', pieces: [{ box: [0, 0, 0, 1, 1, 1], cuts: [[-1, 0, 1, 0], [0, -1, 1, 0]] }] },
  // The top of a pyramid roof: four slopes meeting half a metre up.
  cap: { name: 'roof cap', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-1, 0, 1, 0], [1, 0, 1, 1], [0, -1, 1, 0], [0, 1, 1, 1]] }] },
  // Solid above a slope, open below it: the shoulder of an arch (left side; turn it for the right).
  bracket: { name: 'arch shoulder', pieces: [{ box: [0, 0, 0, 1, 1, 1], cuts: [[1, 0, -1, 0]] }] },
  post: { name: 'post', pieces: [{ box: [0.3, 0.3, 0, 0.7, 0.7, 1] }] },
  // A thin wall along the -y edge of the cell.
  panel: { name: 'panel', pieces: [{ box: [0, 0, 0, 1, 0.3, 1] }] },
};

/** Lasting numbers of shapes (a shape's place in this list + 1). Never reorder; add at the end. */
export const SHAPE_LEDGER: readonly string[] = ['cube', 'slabLow', 'slabHigh', 'ramp', 'ridge', 'stair', 'post', 'panel', 'hip', 'cap', 'bracket'];

export function shapeId(id: string): number {
  const i = SHAPE_LEDGER.indexOf(id);
  if (i < 0) throw new Error(`unknown shape '${id}'`);
  return i + 1;
}

export const SHAPE_CUBE = shapeId('cube');

// ---------------------------------------------------------------------------------------------
// Compiled form: flat arrays for the hot loops (ray casting and standing on things).
// ---------------------------------------------------------------------------------------------

const MAX_CUTS = 4;
const PIECE_FLOATS = 7 + MAX_CUTS * 4; // box(6) + cut count(1) + cuts (4 each)
const SAMPLES = 8;

/** Where each shape byte's pieces start in SHAPE_PIECES, and how many there are. */
export const SHAPE_START = new Uint16Array(256);
export const SHAPE_COUNT = new Uint8Array(256);
export const SHAPE_PIECES: Float32Array = compilePieces();
/** Bottom and top of the solid at an 8 × 8 grid of points across the cell (NaN where there is none). */
export const SHAPE_BOTTOM = new Float32Array(256 * SAMPLES * SAMPLES).fill(Number.NaN);
export const SHAPE_TOP = new Float32Array(256 * SAMPLES * SAMPLES).fill(Number.NaN);
export const SHAPE_SAMPLES = SAMPLES;

function rotateCut(c: Cut): Cut {
  // A quarter turn about the cell's middle: (x, y) → (1 − y, x). Normals turn with it.
  const nx = -c[1];
  const ny = c[0];
  const d = c[3] - (c[0] * 0.5 + c[1] * 0.5) + (nx * 0.5 + ny * 0.5);
  return [nx, ny, c[2], d];
}

function rotatePiece(p: ShapePiece): ShapePiece {
  const [x0, y0, z0, x1, y1, z1] = p.box;
  // (x, y) → (1 − y, x)
  const box: ShapePiece['box'] = [1 - y1, x0, z0, 1 - y0, x1, z1];
  return p.cuts ? { box, cuts: p.cuts.map(rotateCut) } : { box };
}

function compilePieces(): Float32Array {
  const out: number[] = [];
  SHAPE_LEDGER.forEach((id, i) => {
    const def = SHAPES[id];
    if (!def) throw new Error(`shape '${id}' is in the ledger but not defined`);
    let pieces = def.pieces;
    for (let rot = 0; rot < 4; rot++) {
      const byte = (i + 1) | (rot << 6);
      SHAPE_START[byte] = out.length / PIECE_FLOATS;
      SHAPE_COUNT[byte] = pieces.length;
      for (const p of pieces) {
        out.push(...p.box);
        const cuts = p.cuts ?? [];
        if (cuts.length > MAX_CUTS) throw new Error(`shape '${id}' has too many cuts`);
        out.push(cuts.length);
        for (let k = 0; k < MAX_CUTS; k++) {
          const c = cuts[k];
          out.push(c ? c[0] : 0, c ? c[1] : 0, c ? c[2] : 0, c ? c[3] : 0);
        }
      }
      pieces = pieces.map(rotatePiece);
    }
  });
  return new Float32Array(out);
}

/** Result of `rayShape`: distance along the ray and the surface direction there (0,0,0 = started inside). */
export const SHAPE_HIT = { t: 0, nx: 0, ny: 0, nz: 0 };

/**
 * Where a ray first meets a shape. The origin is in the cell's own 0..1 coordinates. Returns false if
 * it misses. On a hit, SHAPE_HIT holds the distance and the outward surface direction.
 */
export function rayShape(byte: number, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): boolean {
  const n = SHAPE_COUNT[byte] ?? 0;
  let s = (SHAPE_START[byte] ?? 0) * PIECE_FLOATS;
  let best = Infinity;
  let bnx = 0;
  let bny = 0;
  let bnz = 0;
  const P = SHAPE_PIECES;
  for (let k = 0; k < n; k++, s += PIECE_FLOATS) {
    let t0 = 0;
    let t1 = Infinity;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let miss = false;
    // Box sides.
    for (let a = 0; a < 3 && !miss; a++) {
      const o = a === 0 ? ox : a === 1 ? oy : oz;
      const d = a === 0 ? dx : a === 1 ? dy : dz;
      const lo = P[s + a] ?? 0;
      const hi = P[s + 3 + a] ?? 1;
      if (d > -1e-9 && d < 1e-9) {
        if (o < lo || o > hi) miss = true;
        continue;
      }
      let ta = (lo - o) / d;
      let tb = (hi - o) / d;
      if (ta > tb) {
        const x = ta;
        ta = tb;
        tb = x;
      }
      if (ta > t0) {
        t0 = ta;
        nx = a === 0 ? (d > 0 ? -1 : 1) : 0;
        ny = a === 1 ? (d > 0 ? -1 : 1) : 0;
        nz = a === 2 ? (d > 0 ? -1 : 1) : 0;
      }
      if (tb < t1) t1 = tb;
    }
    if (miss) continue;
    // Slanting cuts.
    const cuts = P[s + 6] ?? 0;
    for (let c = 0; c < cuts && !miss; c++) {
      const b = s + 7 + c * 4;
      const cx = P[b] ?? 0;
      const cy = P[b + 1] ?? 0;
      const cz = P[b + 2] ?? 0;
      const cd = P[b + 3] ?? 0;
      const denom = cx * dx + cy * dy + cz * dz;
      const num = cd - (cx * ox + cy * oy + cz * oz);
      if (denom > -1e-9 && denom < 1e-9) {
        if (num < 0) miss = true;
        continue;
      }
      const t = num / denom;
      if (denom < 0) {
        if (t > t0) {
          t0 = t;
          const len = Math.hypot(cx, cy, cz);
          nx = cx / len;
          ny = cy / len;
          nz = cz / len;
        }
      } else if (t < t1) t1 = t;
    }
    if (miss || t0 > t1 || t1 <= 0) continue;
    if (t0 < best) {
      best = t0;
      bnx = nx;
      bny = ny;
      bnz = nz;
    }
  }
  if (best === Infinity) return false;
  SHAPE_HIT.t = best;
  SHAPE_HIT.nx = bnx;
  SHAPE_HIT.ny = bny;
  SHAPE_HIT.nz = bnz;
  return true;
}

// Heights across each shape, found once by casting straight down and straight up.
for (let i = 0; i < SHAPE_LEDGER.length; i++) {
  for (let rot = 0; rot < 4; rot++) {
    const byte = (i + 1) | (rot << 6);
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const fx = (sx + 0.5) / SAMPLES;
        const fy = (sy + 0.5) / SAMPLES;
        const idx = byte * SAMPLES * SAMPLES + sy * SAMPLES + sx;
        // Top: look down from above. Bottom: look up from below.
        if (rayShape(byte, fx, fy, 1.5, 0, 0, -1)) {
          SHAPE_TOP[idx] = 1.5 - SHAPE_HIT.t;
          if (rayShape(byte, fx, fy, -0.5, 0, 0, 1)) SHAPE_BOTTOM[idx] = -0.5 + SHAPE_HIT.t;
        }
      }
    }
  }
}

/** Index of the sample under a point inside a cell (fx, fy in 0..1). */
export function sampleAt(fx: number, fy: number): number {
  const sx = Math.min(SAMPLES - 1, Math.max(0, Math.floor(fx * SAMPLES)));
  const sy = Math.min(SAMPLES - 1, Math.max(0, Math.floor(fy * SAMPLES)));
  return sy * SAMPLES + sx;
}

export function validateShapes(): string[] {
  const problems: string[] = [];
  for (const id of Object.keys(SHAPES)) if (!SHAPE_LEDGER.includes(id)) problems.push(`shape '${id}' is not in SHAPE_LEDGER`);
  return problems;
}
