// The paperdoll's figure: your own body sprite in what you wear and hold, turned with the mouse wheel
import type { ArtDef, Entity } from '../../types';
import { CONTENT, thingDef } from '../../content';
import { ArtSprites } from '../entities/artSprites';
import { VIEW_DIRS } from '../entities/assembler';
import type { Sprite } from '../entities/sprites';
import { SHADE_ONE } from '../palette';

/** The side it is first seen from: facing you. */
const FRONT = 2;

/**
 * The same assembler and gear-on-body pictures everyone else sees you as, painted big and pixel
 * sharp onto the paperdoll canvas. Repainted only when the picture changes (a new idle moment,
 * new gear, a turn).
 */
export class DollFigure {
  private readonly art = new ArtSprites();
  private dir = FRONT;
  private last: Sprite | null = null;
  private lastDir = -1;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  /** One step round (wheel notch); +1 turns it clockwise seen from above. */
  turn(step: number): void {
    this.dir = (((this.dir + step) % VIEW_DIRS) + VIEW_DIRS) % VIEW_DIRS;
  }

  /** Show it facing you again (the window opened). */
  reset(): void {
    this.dir = FRONT;
    this.last = null;
  }

  paint(e: Entity): void {
    const id = thingDef(CONTENT, e.def).sprite;
    const bare = id ? (CONTENT.art[id] as ArtDef | undefined) : undefined;
    if (!id || !bare) return;
    const { sprite: s, colours } = this.art.pick(e, id, bare, { dir: this.dir }, performance.now() / 1000);
    if (s === this.last && this.dir === this.lastDir) return;
    this.last = s;
    this.lastDir = this.dir;
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Whole pixels only, feet on the floor, the body filling the height (a long held item may run off the sides).
    const k = Math.max(1, Math.floor((H - 2) / s.h));
    const ox = Math.floor((W - s.w * k) / 2);
    const oy = H - 1 - s.h * k;
    const img = g.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const o = y * s.w + x;
        let c = s.px[o] ?? 0;
        if (!c) continue;
        const reg = s.regions?.[o] ?? 0;
        let m = 1;
        if (reg) {
          c = colours[reg] ?? c;
          m = (s.shade?.[o] ?? SHADE_ONE) / SHADE_ONE;
        }
        for (let j = 0; j < k; j++) {
          for (let i = 0; i < k; i++) {
            const px = ox + x * k + i;
            const py = oy + y * k + j;
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const q = (py * W + px) * 4;
            d[q] = Math.min(255, (c & 255) * m);
            d[q + 1] = Math.min(255, ((c >>> 8) & 255) * m);
            d[q + 2] = Math.min(255, ((c >>> 16) & 255) * m);
            d[q + 3] = 255;
          }
        }
      }
    }
    g.putImageData(img, 0, 0);
  }
}
