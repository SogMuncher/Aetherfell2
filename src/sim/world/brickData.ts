import type { BrickMatter, BrickMatterField, VolumeBrick, VolumeBrickData } from '../../types';
import { BRICK_CELLS } from '../../types';

/** A brick of the 3D layer as data: run-packed for saves and the network, and the fresh state arrays of a brick. */

/** Packs a list into runs: [count, value, count, value…]. */
function pack(a: ArrayLike<number>): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i] ?? 0;
    let n = 1;
    while (i + n < a.length && a[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return out;
}

function unpack(runs: readonly number[], into: Uint8Array | Uint16Array): void {
  let at = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) {
    const n = runs[i] ?? 0;
    const v = runs[i + 1] ?? 0;
    into.fill(v, at, Math.min(into.length, at + n));
    at += n;
  }
}

export const FIELD_MAX: Record<BrickMatterField, number> = { wet: 255, fire: 255, oil: 255, soot: 255, frost: 255, spent: 65535, wear: 65535 };

export function newMatter(): BrickMatter {
  return {
    wet: new Uint8Array(BRICK_CELLS),
    fire: new Uint8Array(BRICK_CELLS),
    oil: new Uint8Array(BRICK_CELLS),
    soot: new Uint8Array(BRICK_CELLS),
    frost: new Uint8Array(BRICK_CELLS),
    spent: new Uint16Array(BRICK_CELLS),
    wear: new Uint16Array(BRICK_CELLS),
  };
}

export function packBrick(b: VolumeBrick): VolumeBrickData {
  const m = b.matter;
  const out: VolumeBrickData = { bx: b.bx, by: b.by, bz: b.bz, shape: pack(b.shape), mat: pack(b.mat) };
  if (m) out.state = { wet: pack(m.wet), fire: pack(m.fire), oil: pack(m.oil), soot: pack(m.soot), frost: pack(m.frost), spent: pack(m.spent), wear: pack(m.wear) };
  return out;
}

/** A received brick's cells: shapes, materials, how many are filled and the box (cells within the brick, end exclusive) holding them. */
export function unpackShape(d: VolumeBrickData): { shape: Uint8Array; mat: Uint8Array; count: number; box: Uint8Array } {
  const shape = new Uint8Array(BRICK_CELLS);
  const mat = new Uint8Array(BRICK_CELLS);
  unpack(d.shape, shape);
  unpack(d.mat, mat);
  let count = 0;
  const box = new Uint8Array([15, 15, 15, 0, 0, 0]);
  for (let i = 0; i < BRICK_CELLS; i++) {
    if (shape[i] === 0) continue;
    count++;
    const lx = i & 15;
    const ly = (i >> 4) & 15;
    const lz = i >> 8;
    box[0] = Math.min(box[0] ?? 15, lx);
    box[1] = Math.min(box[1] ?? 15, ly);
    box[2] = Math.min(box[2] ?? 15, lz);
    box[3] = Math.max(box[3] ?? 0, lx + 1);
    box[4] = Math.max(box[4] ?? 0, ly + 1);
    box[5] = Math.max(box[5] ?? 0, lz + 1);
  }
  return { shape, mat, count, box };
}

/** A received brick's cell state, or null when nothing has happened to it. */
export function unpackMatter(d: VolumeBrickData): BrickMatter | null {
  if (!d.state) return null;
  const matter = newMatter();
  unpack(d.state.wet, matter.wet);
  unpack(d.state.fire, matter.fire);
  unpack(d.state.oil, matter.oil);
  unpack(d.state.soot, matter.soot);
  if (d.state.frost) unpack(d.state.frost, matter.frost);
  unpack(d.state.spent, matter.spent);
  unpack(d.state.wear, matter.wear);
  return matter;
}
