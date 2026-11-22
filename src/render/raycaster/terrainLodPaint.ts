/**
 * Paints what has happened to a loaded chunk (burns, new tiles, flattened houses, and every matter state such as soot
 * or frost) over the seed's picture in a far-land LOD block, or puts the seed's picture back where nothing is left.
 */
import { CHUNK_SIZE, type Chunk, SHOWN_STATES } from '../../types';
import { TILES } from '../../content/tiles';
import { farColours } from './lodLooks';
import { pack } from '../color';
import { STATE_COUNT, tintFar } from '../stateLooks';

export const BLOCK = 64;
const HW = BLOCK + 1;
/** Scratch for painting matter states into far colours. */
const sw = new Float32Array(STATE_COUNT);
const tint: [number, number, number] = [0, 0, 0];

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

export interface ChangedChunk {
  chunk: Chunk;
  version: number;
  natural: Uint8Array;
}

export function paintChunk(b: LodBlock, e: ChangedChunk): void {
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
      let changed = 0; // tiles that differ from the seed's (or carry a state)
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
          for (let s = 0; s < STATE_COUNT; s++) sw[s] = (c[SHOWN_STATES[s] ?? 'wet'][t] ?? 0) / 255;
          tint[0] = tr;
          tint[1] = tg;
          tint[2] = tb;
          if (tintFar(tint, sw)) {
            changed++;
            [tr, tg, tb] = tint;
          }
          r += tr;
          g += tg;
          bl += tb;
        }
      }
      if (changed === 0 && fire === 0) {
        // Back to how the seed made it.
        restore(b, q);
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

function restore(b: LodBlock, q: number): void {
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
