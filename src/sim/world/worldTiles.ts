import type { Chunk, SimState, TileAccess, TileCellData, TileInfo, TileKind } from '../../types';
import { CHUNK_SIZE, TICK_RATE, packKey } from '../../types';
import { TILES } from '../../content/tiles';
import { CONTENT } from '../../content';
import { generateChunk } from './chunkgen';
import { buildSpansChunk } from './crossings';
import { generateLatticeChunk, roofLatticeChunk } from './underworld';
import type { Terrain } from './terrain';

const CS = CHUNK_SIZE;
const HW = CHUNK_SIZE + 1;

/**
 * The tile world: lazily generated chunks held in SimState, with change tracking.
 * Every write marks the chunk dirty (so it is saved) and records the tile (so it is synced).
 */
export class WorldTiles implements TileAccess {
  private lastKey = Number.NaN;
  private last: Chunk | null = null;

  constructor(
    private readonly state: SimState,
    readonly terrain: Terrain,
  ) {}

  chunk(cx: number, cy: number): Chunk {
    const key = packKey(cx, cy);
    if (key === this.lastKey && this.last) return this.last;
    let c = this.state.chunks.get(key);
    if (!c) {
      if (CONTENT.realms[this.state.realm]?.ground === 'lattice') {
        c = generateLatticeChunk(this.state.seed, cx, cy);
        roofLatticeChunk(this.state.volume, this.state.seed, cx, cy);
      } else {
        c = generateChunk(this.terrain, cx, cy);
        // Bridges and piers over water stand in the 3D layer.
        buildSpansChunk(this.state.volume, this.terrain, cx, cy);
      }
      this.state.chunks.set(key, c);
    }
    this.lastKey = key;
    this.last = c;
    return c;
  }

  peekChunk(cx: number, cy: number): Chunk | undefined {
    return this.state.chunks.get(packKey(cx, cy));
  }

  loadedChunks(): Iterable<Chunk> {
    return this.state.chunks.values();
  }

  /** Forget the one-chunk lookup cache (after chunks are unloaded). */
  resetCache(): void {
    this.lastKey = Number.NaN;
    this.last = null;
  }

  private at(x: number, y: number): { c: Chunk; i: number } {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const c = this.chunk(cx, cy);
    return { c, i: (ty - cy * CS) * CS + (tx - cx * CS) };
  }

  kind(x: number, y: number): TileKind {
    const { c, i } = this.at(x, y);
    return (c.kind[i] ?? 0) as TileKind;
  }
  info(x: number, y: number): TileInfo {
    return TILES[this.kind(x, y)];
  }
  wet(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.wet[i] ?? 0;
  }
  fire(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.fire[i] ?? 0;
  }
  fuel(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.fuel[i] ?? 0;
  }
  oil(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.oil[i] ?? 0;
  }
  soot(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.soot[i] ?? 0;
  }
  door(x: number, y: number): number {
    const { c, i } = this.at(x, y);
    return c.door[i] ?? 0;
  }

  ground(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const cx = Math.floor(tx / CS);
    const cy = Math.floor(ty / CS);
    const c = this.chunk(cx, cy);
    const li = tx - cx * CS;
    const lj = ty - cy * CS;
    const fx = x - tx;
    const fy = y - ty;
    const h = c.height;
    const b = lj * HW + li;
    const h00 = h[b] ?? 0;
    const h10 = h[b + 1] ?? 0;
    const h01 = h[b + HW] ?? 0;
    const h11 = h[b + HW + 1] ?? 0;
    return h00 + (h10 - h00) * fx + (h01 - h00) * fy + (h00 - h10 - h01 + h11) * fx * fy;
  }

  surface(x: number, y: number): number {
    const g = this.ground(x, y);
    const inf = this.info(x, y);
    if (inf.shape === 'block') return g + inf.height;
    if (inf.level) return Math.max(g, this.waterLevel(x, y));
    return g;
  }

  waterLevel(x: number, y: number): number {
    // Only water, and what rests on it (ice), stands at the water's height; other ground is just ground, even on a river's bed.
    const { c, i } = this.at(x, y);
    return TILES[c.kind[i] ?? 0]?.level ? (c.level[i] ?? 0) : 0;
  }

  blocked(x: number, y: number): boolean {
    const inf = this.info(x, y);
    if (inf.shape === 'door') return this.door(x, y) < 160;
    return inf.solid;
  }

  cell(x: number, y: number): TileCellData {
    const { c, i } = this.at(x, y);
    return {
      kind: (c.kind[i] ?? 0) as TileKind,
      wet: c.wet[i] ?? 0,
      fire: c.fire[i] ?? 0,
      fuel: c.fuel[i] ?? 0,
      oil: c.oil[i] ?? 0,
      soot: c.soot[i] ?? 0,
      door: c.door[i] ?? 0,
    };
  }

  private touch(c: Chunk, x: number, y: number): void {
    c.dirty = true;
    c.version++;
    this.state.tileChanges.add(packKey(Math.floor(x), Math.floor(y)));
  }

  private write(field: 'wet' | 'fire' | 'oil' | 'soot' | 'door', x: number, y: number, v: number): void {
    const { c, i } = this.at(x, y);
    const nv = Math.max(0, Math.min(255, Math.round(v)));
    if (c[field][i] === nv) return;
    c[field][i] = nv;
    this.touch(c, x, y);
  }

  setKind(x: number, y: number, kind: TileKind): void {
    const { c, i } = this.at(x, y);
    if (c.kind[i] === kind) return;
    c.kind[i] = kind;
    c.fuel[i] = TILES[kind].fuel;
    this.touch(c, x, y);
    // Tiles that change by themselves get their moment now (picked from the spot and the hour, so
    // every replay of the same world agrees).
    const key = packKey(Math.floor(x), Math.floor(y));
    const later = TILES[kind]?.later;
    if (later) {
      const [lo, hi] = later.minutes;
      const r = spotHash(key, this.state.tick);
      this.state.later.set(key, this.state.tick + Math.round((lo + (hi - lo) * r) * 60 * TICK_RATE));
    } else this.state.later.delete(key);
  }
  setWet(x: number, y: number, v: number): void {
    this.write('wet', x, y, v);
  }
  setFire(x: number, y: number, v: number): void {
    const before = this.fire(x, y);
    this.write('fire', x, y, v);
    const k = packKey(Math.floor(x), Math.floor(y));
    if (v > 0 && before === 0) this.state.burning.add(k);
    if (v <= 0) this.state.burning.delete(k);
  }
  setFuel(x: number, y: number, v: number): void {
    const { c, i } = this.at(x, y);
    c.fuel[i] = Math.max(0, Math.min(65535, Math.round(v)));
  }
  setOil(x: number, y: number, v: number): void {
    this.write('oil', x, y, v);
  }
  setSoot(x: number, y: number, v: number): void {
    this.write('soot', x, y, v);
  }
  setDoor(x: number, y: number, v: number): void {
    this.write('door', x, y, v);
  }
  setCell(x: number, y: number, cell: TileCellData): void {
    const { c, i } = this.at(x, y);
    c.kind[i] = cell.kind;
    c.wet[i] = cell.wet;
    c.fire[i] = cell.fire;
    c.fuel[i] = cell.fuel;
    c.oil[i] = cell.oil;
    c.soot[i] = cell.soot;
    c.door[i] = cell.door;
    c.dirty = true;
    c.version++;
    const k = packKey(Math.floor(x), Math.floor(y));
    if (cell.fire > 0) this.state.burning.add(k);
    else this.state.burning.delete(k);
  }
}

/** 0..1 from a tile key and a tick. */
function spotHash(key: number, tick: number): number {
  let h = Math.imul((key % 2147483647) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(tick, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
