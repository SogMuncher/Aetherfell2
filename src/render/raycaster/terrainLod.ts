// Distant land as a pyramid of cached height/colour blocks, built a row at a time in the background, with changed chunks painted on.
import { CHUNK_SIZE, type Chunk, type ReadonlyTiles, type WorldSampler, packKey } from '../../types';
import { key } from './lodLooks';
import { BLOCK, type ChangedChunk, type LodBlock, paintChunk } from './terrainLodPaint';
import { LEVEL_CELL, blockRows } from './terrainLodBuild';

export { BLOCK, type LodBlock } from './terrainLodPaint';
export { LEVEL_CELL } from './terrainLodBuild';
export const TOP_LEVEL = LEVEL_CELL.length - 1;

/** Levels whose cells fit inside one chunk get real tile changes painted in (burns, frozen lakes, and every matter state: soot, frost…). */
const OVERLAY_MAX_CELL = CHUNK_SIZE;
/** A wanted block nobody has asked for in this many frames is dropped half built (the eye moved on). */
const FORGET_AFTER = 90;

interface Job {
  level: number;
  asked: number;
  rows: Generator<void, LodBlock>;
}

/**
 * Distant land as a pyramid of 64×64 height/colour blocks, coarser with distance. A missing block is wanted,
 * then built a row at a time inside each frame's budget (finest first); until then it falls back to a coarser
 * level. The coarsest blocks around the eye are built ahead, so the horizon is always there without a stall. Chunks that have changed since they were
 * generated (burnt, frozen, scorched) are painted over the seed's picture, so changes stay visible
 * at any distance.
 */
export class TerrainLod {
  private blocks = new Map<number, LodBlock>();
  private frame = 0;
  private jobs = new Map<number, Job>();
  /** Changed chunks already painted into the blocks, by chunk key. */
  private changed = new Map<number, ChangedChunk>();
  private pending: Chunk[] = [];
  built = 0;
  /** Counts chunks painted over the blocks, so a drawer can refill from them once changes landed. */
  painted = 0;

  constructor(
    private readonly sampler: WorldSampler,
    private readonly tiles: ReadonlyTiles,
  ) {}

  /** Paints changed chunks, wants the coarsest blocks around the eye, then builds wanted blocks until the budget is spent. */
  beginFrame(budgetMs: number, ex: number, ey: number): void {
    this.frame++;
    const end = performance.now() + budgetMs;
    if (this.blocks.size > 700) this.evict();
    if (this.frame % 6 === 0) this.findChanges();
    this.paintChanges(performance.now() + Math.min(2, budgetMs * 0.3));
    const span = (LEVEL_CELL[TOP_LEVEL] ?? 128) * BLOCK;
    const bx = Math.floor(ex / span);
    const by = Math.floor(ey / span);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const k = key(TOP_LEVEL, bx + dx, by + dy);
        if (!this.blocks.has(k)) this.want(TOP_LEVEL, bx + dx, by + dy, k);
      }
    this.work(end);
  }

  /** Forget every cached block (the party went to another realm, whose far ground is different). */
  forgetAll(): void {
    this.blocks.clear();
    this.changed.clear();
    this.pending = [];
    this.jobs.clear();
  }

  get size(): number {
    return this.blocks.size;
  }

  /** Block covering (x, y) at `level`, or the nearest coarser one that exists (a missing one is wanted). */
  get(level: number, x: number, y: number): LodBlock {
    for (let L = level; L <= TOP_LEVEL; L++) {
      const span = (LEVEL_CELL[L] ?? 128) * BLOCK;
      const bx = Math.floor(x / span);
      const by = Math.floor(y / span);
      const k = key(L, bx, by);
      const b = this.blocks.get(k);
      if (b) {
        b.used = this.frame;
        return b;
      }
      // The horizon is never missing: a top block the look-ahead did not reach yet (a new world, a jump) is finished at once.
      if (L === TOP_LEVEL) return this.finish(k, this.want(L, bx, by, k));
      this.want(L, bx, by, k);
    }
    throw new Error('unreachable: top level is always built');
  }

  private want(level: number, bx: number, by: number, k: number): Job {
    let j = this.jobs.get(k);
    if (!j) {
      j = { level, asked: this.frame, rows: blockRows(this.sampler, level, bx, by) };
      this.jobs.set(k, j);
    }
    j.asked = this.frame;
    return j;
  }

  /** Works wanted blocks a row at a time until `until`, finest level first. */
  private work(until: number): void {
    while (performance.now() < until) {
      let best: [number, Job] | null = null;
      for (const e of this.jobs) {
        if (this.frame - e[1].asked > FORGET_AFTER) this.jobs.delete(e[0]);
        else if (!best || e[1].level < best[1].level) best = e;
      }
      if (!best) return;
      const [k, j] = best;
      while (performance.now() < until) {
        const r = j.rows.next();
        if (r.done) {
          this.store(k, r.value);
          break;
        }
      }
    }
  }

  /** Runs a job to its end and stores its block. */
  private finish(k: number, j: Job): LodBlock {
    let r = j.rows.next();
    while (!r.done) r = j.rows.next();
    return this.store(k, r.value);
  }

  /** Keeps a finished block, with the changed chunks it covers painted on. */
  private store(k: number, block: LodBlock): LodBlock {
    this.jobs.delete(k);
    block.used = this.frame;
    if (block.cs <= OVERLAY_MAX_CELL) {
      const span = block.cs * BLOCK;
      for (const e of this.changed.values()) {
        const tx = e.chunk.cx * CHUNK_SIZE;
        const ty = e.chunk.cy * CHUNK_SIZE;
        if (tx >= block.ox && tx < block.ox + span && ty >= block.oy && ty < block.oy + span) paintChunk(block, e);
      }
    }
    this.blocks.set(k, block);
    this.built++;
    return block;
  }

  private evict(): void {
    const old = [...this.blocks.entries()].sort((a, b) => a[1].used - b[1].used);
    for (let i = 0; i < old.length - 500; i++) {
      const e = old[i];
      if (e) this.blocks.delete(e[0]);
    }
  }

  /** Queues chunks that changed since we last painted them. */
  private findChanges(): void {
    for (const c of this.tiles.loadedChunks()) {
      if (!c.dirty && c.version === 0) continue;
      const seen = this.changed.get(packKey(c.cx, c.cy));
      if (seen && seen.chunk === c && seen.version === c.version) continue;
      if (!this.pending.includes(c)) this.pending.push(c);
    }
  }

  private paintChanges(until: number): void {
    while (this.pending.length > 0 && performance.now() < until) {
      const c = this.pending.shift();
      if (!c) break;
      const k = packKey(c.cx, c.cy);
      const prev = this.changed.get(k);
      const natural = prev?.natural ?? this.sampler.naturalKinds(c.cx, c.cy);
      const entry: ChangedChunk = { chunk: c, version: c.version, natural };
      this.changed.set(k, entry);
      this.painted++;
      for (let L = 0; L <= TOP_LEVEL; L++) {
        const cs = LEVEL_CELL[L] ?? 128;
        if (cs > OVERLAY_MAX_CELL) break;
        const span = cs * BLOCK;
        const b = this.blocks.get(key(L, Math.floor((c.cx * CHUNK_SIZE) / span), Math.floor((c.cy * CHUNK_SIZE) / span)));
        if (b) paintChunk(b, entry);
      }
    }
  }


  /** Paints one changed chunk's real tiles over a block's cells (or restores cells that are back to normal). */
}
