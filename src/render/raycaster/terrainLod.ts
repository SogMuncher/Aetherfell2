import { type BiomeId, CHUNK_SIZE, type Chunk, type ReadonlyTiles, type WorldSampler, packKey } from '../../types';
import { CONTENT } from '../../content';
import { TILES } from '../../content/tiles';
import { biomeLook, farColours, key } from './lodLooks';
import { pack, rhash, vnoise } from '../color';


/** Cell size (metres) per level. Level 0 is drawn straight from live tiles, so it is not cached here. */
export const LEVEL_CELL = [1, 2, 4, 8, 16, 32, 64, 128] as const;
export const TOP_LEVEL = LEVEL_CELL.length - 1;
export const BLOCK = 64;
const HW = BLOCK + 1;
/** Levels whose cells fit inside one chunk get real tile changes painted in (burns, frozen lakes, soot). */
const OVERLAY_MAX_CELL = CHUNK_SIZE;

export interface LodBlock {
  level: number;
  cs: number;
  ox: number;
  oy: number;
  h: Float32Array;
  col: Uint32Array;
  /** Packed normal: nx, ny, nz as Int8 * 127. */
  nrm: Int8Array;
  /** 1 = water surface. */
  water: Uint8Array;
  /** Canopy height in decimetres (ramped in by distance at draw time). */
  canopy: Uint8Array;
  /** Height of buildings and walls in decimetres, drawn as raised cells. */
  lift: Uint8Array;
  /** 0..255 fire glow from burning tiles. */
  glow: Uint8Array;
  maxH: number;
  used: number;
  /** What the seed alone gives, kept so tile changes can be painted on and taken off again. */
  base: {
    ground: Uint32Array;
    tree: Uint32Array;
    cover: Uint8Array;
    canopy: Uint8Array;
    lift: Uint8Array;
    water: Uint8Array;
  };
}

interface ChangedChunk {
  chunk: Chunk;
  version: number;
  natural: Uint8Array;
}

/**
 * Distant land as a pyramid of 64×64 height/colour blocks, coarser with distance. Blocks are built
 * from the seed's world sampler a few per frame; anything not ready yet falls back to a coarser level,
 * so the horizon is always there and detail streams in. Chunks that have changed since they were
 * generated (burnt, frozen, scorched) are painted over the seed's picture, so changes stay visible
 * at any distance.
 */
export class TerrainLod {
  private blocks = new Map<number, LodBlock>();
  private frame = 0;
  private budgetEnd = 0;
  private exhausted = false;
  /** Changed chunks already painted into the blocks, by chunk key. */
  private changed = new Map<number, ChangedChunk>();
  private pending: Chunk[] = [];
  built = 0;

  constructor(
    private readonly sampler: WorldSampler,
    private readonly tiles: ReadonlyTiles,
  ) {}

  beginFrame(budgetMs: number): void {
    this.frame++;
    this.budgetEnd = performance.now() + budgetMs;
    this.exhausted = false;
    if (this.blocks.size > 700) this.evict();
    if (this.frame % 6 === 0) this.findChanges();
    this.paintChanges(performance.now() + Math.min(2, budgetMs * 0.3));
  }

  /** Forget every cached block (the party went to another realm, whose far ground is different). */
  forgetAll(): void {
    this.blocks.clear();
    this.changed.clear();
    this.pending = [];
  }

  get size(): number {
    return this.blocks.size;
  }

  /** Block covering (x, y) at `level`, or the nearest coarser one that exists. */
  get(level: number, x: number, y: number): LodBlock {
    for (let L = level; L <= TOP_LEVEL; L++) {
      const cs = LEVEL_CELL[L] ?? 128;
      const span = cs * BLOCK;
      const bx = Math.floor(x / span);
      const by = Math.floor(y / span);
      const k = key(L, bx, by);
      let b = this.blocks.get(k);
      if (!b && (L === TOP_LEVEL || !this.exhausted)) {
        b = this.build(L, bx, by);
        this.blocks.set(k, b);
        if (performance.now() > this.budgetEnd) this.exhausted = true;
      }
      if (b) {
        b.used = this.frame;
        return b;
      }
    }
    throw new Error('unreachable: top level is always built');
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
      for (let L = 1; L <= TOP_LEVEL; L++) {
        const cs = LEVEL_CELL[L] ?? 128;
        if (cs > OVERLAY_MAX_CELL) break;
        const span = cs * BLOCK;
        const b = this.blocks.get(key(L, Math.floor((c.cx * CHUNK_SIZE) / span), Math.floor((c.cy * CHUNK_SIZE) / span)));
        if (b) this.overlay(b, entry);
      }
    }
  }

  private build(level: number, bx: number, by: number): LodBlock {
    this.built++;
    const cs = LEVEL_CELL[level] ?? 128;
    const ox = bx * BLOCK * cs;
    const oy = by * BLOCK * cs;
    const N = BLOCK * BLOCK;
    const h = new Float32Array(HW * HW);
    const col = new Uint32Array(N);
    const nrm = new Int8Array(N * 3);
    const water = new Uint8Array(N);
    const canopy = new Uint8Array(N);
    const lift = new Uint8Array(N);
    const glow = new Uint8Array(N);
    const base = { ground: new Uint32Array(N), tree: new Uint32Array(N), cover: new Uint8Array(N), canopy: new Uint8Array(N), lift: new Uint8Array(N), water: new Uint8Array(N) };
    const biomes: BiomeId[] = new Array<BiomeId>(HW * HW);
    const trees = new Float32Array(HW * HW);
    const road = new Float32Array(HW * HW);
    const built = new Uint16Array(HW * HW);
    /** How far a river's or lake's surface lies over the bed at each corner (0 = none; the sea is told by the ground sinking under 0). */
    const wdep = new Float32Array(HW * HW);
    const farW = CONTENT.world.far;
    const far = farColours();
    let maxH = -Infinity;
    for (let j = 0; j < HW; j++) {
      for (let i = 0; i < HW; i++) {
        const s = this.sampler.sample(ox + i * cs, oy + j * cs, cs);
        const k = j * HW + i;
        const g = s.ground;
        biomes[k] = s.biome;
        trees[k] = s.trees;
        road[k] = s.road;
        built[k] = s.built === null ? 0 : s.built + 1;
        let top = g < 0 ? 0 : g;
        if (s.water !== undefined && s.water > g) {
          top = s.water;
          wdep[k] = s.water - g;
        }
        h[k] = top;
        if (top > maxH) maxH = top;
      }
    }
    for (let j = 0; j < BLOCK; j++) {
      for (let i = 0; i < BLOCK; i++) {
        const k = j * HW + i;
        const q = j * BLOCK + i;
        const x = ox + i * cs;
        const y = oy + j * cs;
        const hc = h[k] ?? 0;
        const gx = ((h[k + 1] ?? hc) - hc) / cs;
        const gy = ((h[k + HW] ?? hc) - hc) / cs;
        const il = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        const nz = il;
        nrm[q * 3] = Math.round(-gx * il * 127);
        nrm[q * 3 + 1] = Math.round(-gy * il * 127);
        nrm[q * 3 + 2] = Math.round(nz * 127);
        const look = biomeLook(biomes[k] ?? 'meadow');
        const bfar = look.far;
        let r = bfar[0];
        let g = bfar[1];
        let b = bfar[2];
        const vary = vnoise(x * 0.013, y * 0.013, 5) * 0.5 + vnoise(x * 0.06, y * 0.06, 6) * 0.3 + rhash(x, y, 7) * 0.2;
        const m = 0.82 + vary * 0.36;
        r *= m;
        g *= m;
        b *= m;
        let cover = 0;
        let can = 0;
        const inland = (wdep[k] ?? 0) > 0;
        if ((hc <= 0 && look.water) || inland) {
          // Deeper water is darker and bluer.
          const depth = inland ? Math.min(1, (wdep[k] ?? 0) / 8) : Math.min(1, -this.sampler.sample(x, y, cs * 4).ground / 30);
          r = 46 - depth * 26;
          g = 104 - depth * 50;
          b = 120 - depth * 30;
          water[q] = 1;
          nrm[q * 3] = 0;
          nrm[q * 3 + 1] = 0;
          nrm[q * 3 + 2] = 127;
        } else {
          if (nz < farW.steep && look.bareSlopes) {
            // Steep slopes show bare rock.
            const t = Math.min(1, (farW.steep - nz) * 4);
            r += (farW.rock[0] - r) * t;
            g += (farW.rock[1] - g) * t;
            b += (farW.rock[2] - b) * t;
          }
          if (hc > farW.snowLine + vnoise(x * 0.01, y * 0.01, 8) * farW.snowJitter && nz > 0.7) {
            r = farW.snow[0];
            g = farW.snow[1];
            b = farW.snow[2];
          }
          const rd = road[k] ?? 0;
          if (rd > CONTENT.world.roads.above && cs <= 8) {
            r += (farW.road[0] - r) * 0.8;
            g += (farW.road[1] - g) * 0.8;
            b += (farW.road[2] - b) * 0.8;
          }
          // Buildings and walls: their tile's far colour, standing as tall as the tile is.
          const bt = built[k] ?? 0;
          if (bt > 0) {
            const code = bt - 1;
            r = far[code * 3] ?? 110;
            g = far[code * 3 + 1] ?? 100;
            b = far[code * 3 + 2] ?? 100;
            lift[q] = Math.min(255, Math.round((TILES[code]?.height ?? 2.8) * 10));
          }
          const tr = trees[k] ?? 0;
          if (tr > 0.01) {
            const clump = vnoise(x * 0.09, y * 0.09, 9);
            const raw = Math.min(1, tr * 4) * (0.6 + clump * 0.6);
            cover = Math.min(1, raw);
            can = Math.min(255, Math.round(raw * look.canopy * (0.6 + clump * 0.8)));
          }
        }
        const tree = look.tree;
        base.ground[q] = pack(r, g, b);
        base.tree[q] = pack(tree[0], tree[1], tree[2]);
        base.cover[q] = Math.round(cover * 255);
        base.canopy[q] = can;
        base.lift[q] = lift[q] ?? 0;
        base.water[q] = water[q] ?? 0;
        canopy[q] = can;
        col[q] = pack(r + (tree[0] - r) * cover, g + (tree[1] - g) * cover, b + (tree[2] - b) * cover);
        const top = hc + (lift[q] ?? 0) * 0.1;
        if (top > maxH) maxH = top;
      }
    }
    const block: LodBlock = { level, cs, ox, oy, h, col, nrm, water, canopy, lift, glow, maxH, used: this.frame, base };
    if (cs <= OVERLAY_MAX_CELL) {
      const span = cs * BLOCK;
      for (const e of this.changed.values()) {
        const tx = e.chunk.cx * CHUNK_SIZE;
        const ty = e.chunk.cy * CHUNK_SIZE;
        if (tx >= ox && tx < ox + span && ty >= oy && ty < oy + span) this.overlay(block, e);
      }
    }
    return block;
  }

  /** Paints one changed chunk's real tiles over a block's cells (or restores cells that are back to normal). */
  private overlay(b: LodBlock, e: ChangedChunk): void {
    const c = e.chunk;
    const nat = e.natural;
    const cs = b.cs;
    const far = farColours();
    const per = CHUNK_SIZE / cs;
    const n = cs * cs;
    const i0 = (c.cx * CHUNK_SIZE - b.ox) / cs;
    const j0 = (c.cy * CHUNK_SIZE - b.oy) / cs;
    const B = b.base;
    for (let cj = 0; cj < per; cj++) {
      for (let ci = 0; ci < per; ci++) {
        const q = (j0 + cj) * BLOCK + (i0 + ci);
        let changed = 0; // tiles that differ from the seed's (or carry soot)
        let unchanged = 0;
        let fire = 0;
        let liquid = 0;
        let natCrown = 0;
        let crown = 0;
        let block = 0;
        let r = 0;
        let g = 0;
        let bl = 0;
        let treeR = 0;
        let treeG = 0;
        let treeB = 0;
        const groundC = B.ground[q] ?? 0;
        const gr = groundC & 255;
        const gg = (groundC >>> 8) & 255;
        const gb = (groundC >>> 16) & 255;
        for (let tj = 0; tj < cs; tj++) {
          for (let ti = 0; ti < cs; ti++) {
            const t = (cj * cs + tj) * CHUNK_SIZE + ci * cs + ti;
            const kind = c.kind[t] ?? 0;
            const nk = nat[t] ?? 0;
            const soot = (c.soot[t] ?? 0) / 255;
            const burning = (c.fire[t] ?? 0) > 0;
            const info = TILES[kind];
            if (burning) fire++;
            if (info?.liquid) liquid++;
            natCrown += TILES[nk]?.crown ?? 0;
            const cr = info?.crown ?? 0;
            crown += cr;
            let tr: number;
            let tg: number;
            let tb: number;
            if (kind === nk) {
              unchanged++;
              tr = gr;
              tg = gg;
              tb = gb;
            } else {
              changed++;
              tr = far[kind * 3] ?? 100;
              tg = far[kind * 3 + 1] ?? 100;
              tb = far[kind * 3 + 2] ?? 100;
              if (cr > 0) {
                treeR += tr;
                treeG += tg;
                treeB += tb;
              }
            }
            if (info && (info.shape === 'block' || info.shape === 'door')) block = Math.max(block, info.height);
            if (soot > 0) {
              changed++;
              const s = 1 - soot * 0.75;
              tr *= s;
              tg *= s;
              tb *= s;
            }
            r += tr;
            g += tg;
            bl += tb;
          }
        }
        if (changed === 0 && fire === 0) {
          // Back to how the seed made it.
          this.restore(b, q);
          continue;
        }
        const baseCover = (B.cover[q] ?? 0) / 255;
        let cover: number;
        let treeCol = B.tree[q] ?? 0;
        if (natCrown > 0) cover = baseCover * Math.min(1.5, crown / natCrown);
        else if (crown > 0) {
          // Trees where none grew before.
          cover = Math.min(1, (crown / n) * 4) * 0.8;
          treeCol = pack(treeR / Math.max(1, crown), treeG / Math.max(1, crown), treeB / Math.max(1, crown));
        } else cover = baseCover * (unchanged / n);
        cover = Math.min(1, cover);
        if ((B.water[q] ?? 0) && liquid * 2 >= n) {
          b.water[q] = 1;
          r = gr * n;
          g = gg * n;
          bl = gb * n;
        } else b.water[q] = 0;
        r /= n;
        g /= n;
        bl /= n;
        const tr = treeCol & 255;
        const tg = (treeCol >>> 8) & 255;
        const tb = (treeCol >>> 16) & 255;
        b.col[q] = pack(r + (tr - r) * cover, g + (tg - g) * cover, bl + (tb - bl) * cover);
        const bc = B.canopy[q] ?? 0;
        b.canopy[q] = baseCover > 0 ? Math.round((bc * cover) / baseCover) : Math.round(cover * 60);
        const baseLift = B.lift[q] ?? 0;
        // Buildings stay standing while walls remain or most of the cell is untouched; burnt-out ones flatten.
        const standing = block > 0 || unchanged * 2 >= n;
        const lift = baseLift > 0 && standing ? baseLift : Math.round(block * 10);
        b.lift[q] = Math.min(255, lift);
        b.glow[q] = Math.min(255, Math.round((fire / n) * 255 * 1.5));
        const hk = (j0 + cj) * HW + (i0 + ci);
        const top = (b.h[hk] ?? 0) + Math.max(b.lift[q] ?? 0, 0) * 0.1;
        if (top > b.maxH) b.maxH = top;
      }
    }
  }

  private restore(b: LodBlock, q: number): void {
    const B = b.base;
    const ground = B.ground[q] ?? 0;
    const tree = B.tree[q] ?? 0;
    const cover = (B.cover[q] ?? 0) / 255;
    const r = ground & 255;
    const g = (ground >>> 8) & 255;
    const bl = (ground >>> 16) & 255;
    b.col[q] = pack(r + ((tree & 255) - r) * cover, g + (((tree >>> 8) & 255) - g) * cover, bl + (((tree >>> 16) & 255) - bl) * cover);
    b.canopy[q] = B.canopy[q] ?? 0;
    b.lift[q] = B.lift[q] ?? 0;
    b.water[q] = B.water[q] ?? 0;
    b.glow[q] = 0;
  }
}
