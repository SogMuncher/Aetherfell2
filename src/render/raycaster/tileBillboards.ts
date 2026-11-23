import type { ArtDef, Chunk, ReadonlyTiles } from '../../types';
import { CHUNK_SIZE, packKey } from '../../types';
import { CONTENT } from '../../content';
import { TILES } from '../../content/tiles';
import { rhash } from '../color';
import { missingSprite } from '../entities/sprites';
import type { Sprite } from '../entities/sprites';
import { ArtBank, artVariants, assemble } from '../entities/assembler';
import { artColours } from '../entities/artGrow';

/** Trees and rocks are drawn as pictures out to this distance (m)... */
export const FLORA_RANGE = 90;
/** ...fading out (dithered) from here, while the far terrain's treetops rise in over the same band. */
export const FLORA_FADE = 62;
/** Distance by which the far terrain's canopy is at full height. */
export const CANOPY_FULL = FLORA_RANGE + 14;

export interface TileBillboard {
  x: number;
  y: number;
  z: number;
  /** The picture for the side the camera sees now (set just before each draw). */
  sprite: Sprite;
  scale: number;
  chunk: Chunk;
  idx: number;
  /** Its grown individual (null only for a tile whose form is missing). */
  bank: ArtBank | null;
  /** Which way it was set down (radians). */
  yaw: number;
  /** Its own colours for the picture's colour regions (null for a picture without regions). */
  colours: Uint32Array | null;
  /** Its own light/colour cast, 0..255 per channel (255 = none). */
  tint: { r: number; g: number; b: number };
  /** Drawn out to this distance; small things stop sooner than trees. */
  range: number;
}

interface ChunkFlora {
  chunk: Chunk;
  version: number;
  items: TileBillboard[];
}

/** How far a thing of this height is worth drawing: small plants up close, trees and tall stones to the full range. */
function rangeFor(height: number): number {
  return Math.min(FLORA_RANGE, 26 + height * 22);
}

/**
 * Billboards for tiles that have a sprite (trees, bushes, rocks, standing stones, reeds…), read
 * from live tiles and cached per chunk until the chunk changes. Each is one of several individuals
 * grown from the tile's form (content/forms.ts), set down at its own angle, size and tint, and
 * drawn from the side the camera sees. They fade with distance so trees hand over smoothly to the
 * far terrain's treetops instead of popping in.
 */
export class TileBillboards {
  private cache = new Map<number, ChunkFlora>();
  /** Grown individuals by form, variant and screen handedness. */
  private banks = new Map<string, ArtBank>();
  /** Draw range per form (from the height of its first individual). */
  private ranges = new Map<string, number>();
  private hand = 1;

  private bank(formId: string, form: ArtDef, variant: number): ArtBank {
    const key = `${formId}|${variant}|${this.hand}`;
    let b = this.banks.get(key);
    if (!b) {
      b = new ArtBank(assemble(formId, form, variant), this.hand);
      this.banks.set(key, b);
      if (!this.ranges.has(formId)) this.ranges.set(formId, rangeFor(b.top));
    }
    return b;
  }

  private chunkFlora(tiles: ReadonlyTiles, cx: number, cy: number): ChunkFlora {
    const c = tiles.chunk(cx, cy);
    const k = packKey(cx, cy);
    const hit = this.cache.get(k);
    if (hit && hit.chunk === c && hit.version === c.version) return hit;
    const items: TileBillboard[] = [];
    for (let j = 0; j < CHUNK_SIZE; j++) {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const idx = j * CHUNK_SIZE + i;
        const info = TILES[c.kind[idx] ?? 0];
        if (!info?.sprite) continue;
        const x = cx * CHUNK_SIZE + i;
        const y = cy * CHUNK_SIZE + j;
        const jx = (rhash(x, y, 1) - 0.5) * 0.4;
        const jy = (rhash(x, y, 2) - 0.5) * 0.4;
        const form = CONTENT.art[info.sprite];
        let bank: ArtBank | null = null;
        let sprite: Sprite | undefined;
        let scale = 1;
        let range = FLORA_RANGE;
        let colours: Uint32Array | null = null;
        if (form) {
          colours = artColours(form, Math.floor(rhash(x, y, 9) * 0x7fffffff));
          bank = this.bank(info.sprite, form, Math.floor(rhash(x, y, 3) * artVariants(form)));
          scale = 1 + (rhash(x, y, 4) - 0.5) * 2 * (form.vary ?? 0.12);
          range = this.ranges.get(info.sprite) ?? FLORA_RANGE;
        } else sprite = missingSprite();
        // Each one a touch warmer, cooler, lighter or darker than its neighbours.
        const tint = { r: 255 - rhash(x, y, 6) * 26, g: 255 - rhash(x, y, 7) * 18, b: 255 - rhash(x, y, 8) * 30 };
        items.push({ x: x + 0.5 + jx, y: y + 0.5 + jy, z: tiles.ground(x + 0.5, y + 0.5), sprite: sprite ?? missingSprite(), scale, chunk: c, idx, bank, yaw: rhash(x, y, 5) * Math.PI * 2, colours, tint, range });
      }
    }
    const entry = { chunk: c, version: c.version, items };
    this.cache.set(k, entry);
    if (this.cache.size > 400) this.cache.clear();
    return entry;
  }

  /**
   * Calls `fn` for every tile billboard within its range of the camera and in front of it, with its
   * fade (1 = solid, towards 0 = mostly see-through) and whether it is burning. (rx, ry) is the
   * camera's right vector: it says which way round the screen is, so each object shows the right side.
   */
  each(tiles: ReadonlyTiles, camX: number, camY: number, fx: number, fy: number, rx: number, ry: number, fn: (b: TileBillboard, fade: number, burning: boolean) => void): void {
    const hand = -ry * fx + rx * fy < 0 ? -1 : 1;
    if (hand !== this.hand) {
      // Mirrored screen: the cached objects point at pictures painted the other way round.
      this.hand = hand;
      this.cache.clear();
    }
    if (this.banks.size > 1500) this.banks.clear();
    // Which way the right vector turns from forward: the same turn gives each object's own "right".
    const turn = fx * ry - fy * rx > 0 ? 1 : -1;
    const camCx = Math.floor(camX / CHUNK_SIZE);
    const camCy = Math.floor(camY / CHUNK_SIZE);
    const R = Math.ceil(FLORA_RANGE / CHUNK_SIZE);
    const span = FLORA_RANGE - FLORA_FADE;
    for (let cy = camCy - R; cy <= camCy + R; cy++) {
      for (let cx = camCx - R; cx <= camCx + R; cx++) {
        // Skip whole chunks behind the camera.
        const mx = (cx + 0.5) * CHUNK_SIZE - camX;
        const my = (cy + 0.5) * CHUNK_SIZE - camY;
        if (mx * fx + my * fy < -CHUNK_SIZE) continue;
        if (mx * mx + my * my > (FLORA_RANGE + CHUNK_SIZE) * (FLORA_RANGE + CHUNK_SIZE)) continue;
        for (const t of this.chunkFlora(tiles, cx, cy).items) {
          const dx = t.x - camX;
          const dy = t.y - camY;
          if (dx * fx + dy * fy < 0.25) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 > t.range * t.range) continue;
          // Trees hand over to the far canopy over the fixed band; smaller things fade over the last part of their range.
          const fadeFrom = t.range >= FLORA_RANGE ? FLORA_FADE : t.range * 0.7;
          const fade = d2 <= fadeFrom * fadeFrom ? 1 : 1 - (Math.sqrt(d2) - fadeFrom) / (t.range >= FLORA_RANGE ? span : t.range - fadeFrom);
          if (t.bank) {
            if (t.bank.nviews === 1) t.sprite = t.bank.sprite('idle', 0, 0);
            else {
              // The side seen: the object's facing measured against the line from the camera to it.
              const d = Math.sqrt(d2) || 1;
              const vx = dx / d;
              const vy = dy / d;
              const ox = turn > 0 ? -vy : vy;
              const oy = turn > 0 ? vx : -vx;
              const ca = Math.cos(t.yaw);
              const sa = Math.sin(t.yaw);
              const psi = Math.atan2(-ox * sa + oy * ca, ox * ca + oy * sa);
              t.sprite = t.bank.sprite('idle', 0, Math.round((psi / (Math.PI * 2)) * t.bank.nviews));
            }
          }
          fn(t, fade, (t.chunk.fire[t.idx] ?? 0) > 0);
        }
      }
    }
  }
}
