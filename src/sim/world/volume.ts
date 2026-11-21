import type { BrickMatter, BrickMatterField, Volume, VolumeBrick, VolumeBrickData } from '../../types';
import { BRICK_CELLS, brickKey, cellIndex, spotKey } from '../../types';
import { SHAPE_BOTTOM, SHAPE_SAMPLES, SHAPE_TOP, sampleAt } from '../../content/shapes';

const SAMPLE_CELLS = SHAPE_SAMPLES * SHAPE_SAMPLES;

function columnKey(x: number, y: number): number {
  return (x + 1048576) * 2097152 + (y + 1048576);
}

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

const FIELD_MAX: Record<BrickMatterField, number> = { wet: 255, fire: 255, oil: 255, soot: 255, spent: 65535, wear: 65535 };

function newMatter(): BrickMatter {
  return {
    wet: new Uint8Array(BRICK_CELLS),
    fire: new Uint8Array(BRICK_CELLS),
    oil: new Uint8Array(BRICK_CELLS),
    soot: new Uint8Array(BRICK_CELLS),
    spent: new Uint16Array(BRICK_CELLS),
    wear: new Uint16Array(BRICK_CELLS),
  };
}

/**
 * The 3D layer's store. Cells are 1 m; each holds a shape byte and a material (a tile kind).
 * Beside the bricks it remembers the top of every column, so "is there a roof over me?" is a lookup.
 */
export class VolumeStore implements Volume {
  readonly bricks = new Map<number, VolumeBrick>();
  version = 0;
  /** Cell height (top edge of the highest solid cell) of every column that has anything. */
  private readonly tops = new Map<number, number>();
  private dirtyList = new Set<VolumeBrick>();
  /** Cells with fire / dampness in them (spot keys), kept in step with the bricks so nobody has to scan. */
  readonly burningCells = new Set<number>();
  readonly dampCells = new Set<number>();
  readonly wornCells = new Set<number>();
  private lowBrick = 0;

  shapeAt(x: number, y: number, z: number): number {
    const b = this.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
    return b ? (b.shape[cellIndex(x, y, z)] ?? 0) : 0;
  }

  matAt(x: number, y: number, z: number): number {
    const b = this.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
    return b ? (b.mat[cellIndex(x, y, z)] ?? 0) : 0;
  }

  cellGet(field: BrickMatterField, x: number, y: number, z: number): number {
    const b = this.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
    return b?.matter ? (b.matter[field][cellIndex(x, y, z)] ?? 0) : 0;
  }

  cellSet(field: BrickMatterField, x: number, y: number, z: number, v: number): void {
    const b = this.bricks.get(brickKey(x >> 4, y >> 4, z >> 4));
    if (!b) return;
    const i = cellIndex(x, y, z);
    if ((b.shape[i] ?? 0) === 0) return;
    const nv = Math.max(0, Math.min(FIELD_MAX[field], Math.round(v)));
    if (!b.matter) {
      if (nv === 0) return;
      b.matter = newMatter();
    }
    const arr = b.matter[field];
    if (arr[i] === nv) return;
    arr[i] = nv;
    this.track(field, x, y, z, nv);
    // Fuel burnt is bookkeeping nobody sees: it neither needs sending nor flags the brick as changed.
    if (field !== 'spent') this.touch(b);
  }

  private track(field: BrickMatterField, x: number, y: number, z: number, v: number): void {
    if (field === 'fire') {
      if (v > 0) this.burningCells.add(spotKey(x, y, z));
      else this.burningCells.delete(spotKey(x, y, z));
    } else if (field === 'wet') {
      if (v > 0) this.dampCells.add(spotKey(x, y, z));
      else this.dampCells.delete(spotKey(x, y, z));
    } else if (field === 'wear') {
      if (v > 0) this.wornCells.add(spotKey(x, y, z));
      else this.wornCells.delete(spotKey(x, y, z));
    }
  }

  /** Forgets everything that happened to a cell (it was cleared or made of something else). */
  private wipeCell(b: VolumeBrick, x: number, y: number, z: number, i: number): void {
    const m = b.matter;
    if (!m) return;
    m.wet[i] = 0;
    m.fire[i] = 0;
    m.oil[i] = 0;
    m.soot[i] = 0;
    m.spent[i] = 0;
    m.wear[i] = 0;
    const k = spotKey(x, y, z);
    this.burningCells.delete(k);
    this.dampCells.delete(k);
    this.wornCells.delete(k);
  }

  /** Puts a cell in (shape 0 clears it). Returns whether anything changed. */
  set(x: number, y: number, z: number, shape: number, mat: number): boolean {
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    const key = brickKey(x >> 4, y >> 4, z >> 4);
    let b = this.bricks.get(key);
    const i = cellIndex(x, y, z);
    const old = b ? (b.shape[i] ?? 0) : 0;
    const oldMat = b ? (b.mat[i] ?? 0) : 0;
    if (old === shape && (shape === 0 || oldMat === mat)) return false;
    if (!b) {
      if (shape === 0) return false;
      b = { bx: x >> 4, by: y >> 4, bz: z >> 4, shape: new Uint8Array(BRICK_CELLS), mat: new Uint8Array(BRICK_CELLS), matter: null, count: 0, dirty: false, box: new Uint8Array([15, 15, 15, 0, 0, 0]) };
      this.bricks.set(key, b);
      this.lowBrick = Math.min(this.lowBrick, b.bz);
    }
    // New stuff in a cell starts clean; a changed shape of the same stuff keeps what has happened to it.
    if (shape === 0 || (old !== 0 && oldMat !== mat) || old === 0) this.wipeCell(b, x, y, z, i);
    b.shape[i] = shape;
    b.mat[i] = shape === 0 ? 0 : mat;
    if (old === 0) b.count++;
    if (shape === 0) b.count--;
    if (shape !== 0) {
      const box = b.box;
      const lx = x & 15;
      const ly = y & 15;
      const lz = z & 15;
      if (lx < (box[0] ?? 15)) box[0] = lx;
      if (ly < (box[1] ?? 15)) box[1] = ly;
      if (lz < (box[2] ?? 15)) box[2] = lz;
      if (lx + 1 > (box[3] ?? 0)) box[3] = lx + 1;
      if (ly + 1 > (box[4] ?? 0)) box[4] = ly + 1;
      if (lz + 1 > (box[5] ?? 0)) box[5] = lz + 1;
    }
    if (b.count === 0) this.bricks.delete(key);
    this.touch(b);
    this.version++;
    // Column tops.
    const ck = columnKey(x, y);
    const top = this.tops.get(ck);
    if (shape !== 0) {
      if (top === undefined || z + 1 > top) this.tops.set(ck, z + 1);
    } else if (top !== undefined && z + 1 >= top) {
      this.rescanColumn(x, y, z);
    }
    return true;
  }

  private touch(b: VolumeBrick): void {
    b.dirty = true;
    this.dirtyList.add(b);
  }

  private rescanColumn(x: number, y: number, from: number): void {
    const low = this.lowBrick * 16;
    for (let z = from - 1; z >= low; z--) {
      if (this.shapeAt(x, y, z) !== 0) {
        this.tops.set(columnKey(x, y), z + 1);
        return;
      }
    }
    this.tops.delete(columnKey(x, y));
  }

  clearAll(): void {
    for (const b of this.bricks.values()) this.touch({ ...b, shape: new Uint8Array(BRICK_CELLS), mat: new Uint8Array(BRICK_CELLS), matter: null, count: 0 });
    this.bricks.clear();
    this.tops.clear();
    this.burningCells.clear();
    this.dampCells.clear();
    this.wornCells.clear();
    this.version++;
  }

  takeDirty(): VolumeBrick[] {
    const out = [...this.dirtyList];
    this.dirtyList.clear();
    for (const b of out) b.dirty = false;
    return out;
  }

  topAt(x: number, y: number): number {
    return this.tops.get(columnKey(Math.floor(x), Math.floor(y))) ?? -Infinity;
  }

  openSky(x: number, y: number, z: number): boolean {
    return this.topAt(x, y) <= z + 0.01;
  }

  floorBelow(x: number, y: number, zMax: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const top = this.tops.get(columnKey(cx, cy));
    if (top === undefined) return -Infinity;
    const s = sampleAt(x - cx, y - cy);
    const low = this.lowBrick * 16;
    for (let z = Math.min(Math.floor(zMax), top - 1); z >= low; z--) {
      const b = this.shapeAt(cx, cy, z);
      if (b === 0) continue;
      const t = SHAPE_TOP[b * SAMPLE_CELLS + s] ?? Number.NaN;
      if (Number.isNaN(t)) continue;
      if (z + t <= zMax + 1e-4) return z + t;
    }
    return -Infinity;
  }

  ceilingAbove(x: number, y: number, z: number): number {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const top = this.tops.get(columnKey(cx, cy));
    if (top === undefined) return Infinity;
    const s = sampleAt(x - cx, y - cy);
    for (let zc = Math.floor(z); zc < top; zc++) {
      const b = this.shapeAt(cx, cy, zc);
      if (b === 0) continue;
      const bot = SHAPE_BOTTOM[b * SAMPLE_CELLS + s] ?? Number.NaN;
      if (Number.isNaN(bot)) continue;
      if (zc + bot >= z - 1e-3) return zc + bot;
    }
    return Infinity;
  }

  solidBetween(x: number, y: number, z0: number, z1: number): boolean {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const top = this.tops.get(columnKey(cx, cy));
    if (top === undefined || z0 >= top) return false;
    const s = sampleAt(x - cx, y - cy);
    const last = Math.min(Math.floor(z1 - 1e-6), top - 1);
    for (let z = Math.floor(z0); z <= last; z++) {
      const b = this.shapeAt(cx, cy, z);
      if (b === 0) continue;
      const bot = SHAPE_BOTTOM[b * SAMPLE_CELLS + s] ?? Number.NaN;
      if (Number.isNaN(bot)) continue;
      const tp = SHAPE_TOP[b * SAMPLE_CELLS + s] ?? Number.NaN;
      if (z + bot < z1 && z + tp > z0) return true;
    }
    return false;
  }

  exportBrick(b: VolumeBrick): VolumeBrickData {
    const m = b.matter;
    const out: VolumeBrickData = { bx: b.bx, by: b.by, bz: b.bz, shape: pack(b.shape), mat: pack(b.mat) };
    if (m) out.state = { wet: pack(m.wet), fire: pack(m.fire), oil: pack(m.oil), soot: pack(m.soot), spent: pack(m.spent), wear: pack(m.wear) };
    return out;
  }

  /** Lays a received brick over whatever was there (an empty brick removes it). */
  importBrick(d: VolumeBrickData): void {
    const key = brickKey(d.bx, d.by, d.bz);
    const old = this.bricks.get(key);
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
    // Column tops over this brick's footprint are recomputed from scratch.
    if (old) this.forColumns(old, (x, y, z) => this.set(x, y, z, 0, 0));
    // The old brick's burning/damp cells are gone with it (set() wiped them); the new state is read below.
    if (count === 0) {
      this.version++;
      return;
    }
    let matter: BrickMatter | null = null;
    if (d.state) {
      matter = newMatter();
      unpack(d.state.wet, matter.wet);
      unpack(d.state.fire, matter.fire);
      unpack(d.state.oil, matter.oil);
      unpack(d.state.soot, matter.soot);
      unpack(d.state.spent, matter.spent);
      unpack(d.state.wear, matter.wear);
    }
    const b: VolumeBrick = { bx: d.bx, by: d.by, bz: d.bz, shape, mat, matter, count, dirty: false, box };
    this.bricks.set(key, b);
    if (matter) {
      for (let i = 0; i < BRICK_CELLS; i++) {
        if (shape[i] === 0) continue;
        const x = (d.bx << 4) + (i & 15);
        const y = (d.by << 4) + ((i >> 4) & 15);
        const z = (d.bz << 4) + (i >> 8);
        if ((matter.fire[i] ?? 0) > 0) this.burningCells.add(spotKey(x, y, z));
        if ((matter.wet[i] ?? 0) > 0) this.dampCells.add(spotKey(x, y, z));
        if ((matter.wear[i] ?? 0) > 0) this.wornCells.add(spotKey(x, y, z));
      }
    }
    this.lowBrick = Math.min(this.lowBrick, d.bz);
    for (let i = 0; i < BRICK_CELLS; i++) {
      if (shape[i] === 0) continue;
      const x = (d.bx << 4) + (i & 15);
      const y = (d.by << 4) + ((i >> 4) & 15);
      const z = (d.bz << 4) + (i >> 8);
      const ck = columnKey(x, y);
      const top = this.tops.get(ck);
      if (top === undefined || z + 1 > top) this.tops.set(ck, z + 1);
    }
    this.version++;
  }

  private forColumns(b: VolumeBrick, fn: (x: number, y: number, z: number) => void): void {
    for (let i = 0; i < BRICK_CELLS; i++) if (b.shape[i] !== 0) fn((b.bx << 4) + (i & 15), (b.by << 4) + ((i >> 4) & 15), (b.bz << 4) + (i >> 8));
  }

  allBricks(): VolumeBrickData[] {
    return [...this.bricks.values()].map((b) => this.exportBrick(b));
  }
}
