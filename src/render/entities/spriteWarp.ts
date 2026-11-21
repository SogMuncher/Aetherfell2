import { paintItem, ITEM_ART } from './itemArt';
import type { ItemDef } from '../../types';
import type { Surface } from '../vfx/glow';

/**
 * Flat sprites made to read as 3D motion. A held item is just its item picture (itemArt.ts); a
 * `Warp` tilts it, foreshortens it along its length, narrows its flat, shears it and shrinks its
 * far end, so one picture can swing, thrust and chop with perspective. Used for every held item.
 * Item pictures are painted with the grip at the lower left and the tip at the upper right.
 */

/** An item picture ready to be warped: its pixels and how far its tip is from the grip. */
export interface HeldSprite {
  px: Uint32Array;
  /** Distance from grip to farthest pixel, in picture widths. */
  tipLen: number;
}

const GRIP_U = 0.1;
const GRIP_V = 0.9;
const R2 = Math.SQRT1_2;
const sprites = new Map<string, HeldSprite>();

/** The picture of an item, with its tip measured once. */
export function heldSprite(id: string, def: ItemDef | undefined): HeldSprite {
  let s = sprites.get(id);
  if (!s) {
    const px = paintItem(def);
    let tipLen = 0.3;
    for (let y = 0; y < ITEM_ART; y++) {
      for (let x = 0; x < ITEM_ART; x++) {
        if ((px[y * ITEM_ART + x] as number) >>> 24 < 128) continue;
        tipLen = Math.max(tipLen, ((x + 0.5) / ITEM_ART - GRIP_U - ((y + 0.5) / ITEM_ART - GRIP_V)) * R2);
      }
    }
    s = { px, tipLen };
    sprites.set(id, s);
  }
  return s;
}

/** How a picture is placed on screen. */
export interface Warp {
  /** Where the grip is, in pixels. */
  x: number;
  y: number;
  /** Pixels per picture width. */
  side: number;
  /** Direction of the length, radians clockwise from straight up. */
  angle: number;
  /** Stretch along the length: 1 = side-on, small = pointing at or away from you, negative = flipped over. */
  along: number;
  /** Width of the flat: 1 = face-on, small = edge-on. */
  across: number;
  /** Slant of the width along the length. */
  shear: number;
  /** How much the far end shrinks. */
  taper: number;
  /** Light on it, 0..1+ per colour, and a flare of extra light (charging). */
  r: number;
  g: number;
  b: number;
  flare: number;
}

export interface WarpPoints {
  tip: { x: number; y: number };
  mid: { x: number; y: number };
}

/** Where the picture's middle and tip land on screen under `w` (no painting). */
export function warpPoints(s: HeldSprite, w: Warp, out: WarpPoints): void {
  place(s, w, out);
}

type Place = (along: number, across: number, o: { x: number; y: number }) => void;

function place(s: HeldSprite, w: Warp, out?: WarpPoints): Place {
  const ax = Math.sin(w.angle);
  const ay = -Math.cos(w.angle);
  const px = -ay;
  const py = ax;
  const persp = (along: number): number => 1 / (1 + w.taper * Math.max(0, Math.min(1.2, along / s.tipLen)));
  // Picture coordinates (along, across) of a picture point, and the screen point they land on.
  const fwd = (along: number, across: number, o: { x: number; y: number }): void => {
    const k = persp(along) * w.side;
    const l = along * k * w.along;
    const c = (across * w.across + along * w.shear) * k;
    o.x = w.x + ax * l + px * c;
    o.y = w.y + ay * l + py * c;
  };
  if (out) {
    fwd(s.tipLen, 0, out.tip);
    fwd(s.tipLen * 0.4, 0, out.mid);
  }
  return fwd;
}

/** Paints a sprite warped by `w` over the frame and says where its middle and tip landed. */
export function blitWarped(vp: Surface, s: HeldSprite, w: Warp, out: WarpPoints): void {
  const fwd = place(s, w, out);
  const ax = Math.sin(w.angle);
  const ay = -Math.cos(w.angle);
  const px = -ay;
  const py = ax;
  const persp = (along: number): number => 1 / (1 + w.taper * Math.max(0, Math.min(1.2, along / s.tipLen)));
  // Screen box of the picture's four corners.
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  const q = { x: 0, y: 0 };
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    fwd((u - GRIP_U - (v - GRIP_V)) * R2, (u - GRIP_U + (v - GRIP_V)) * R2, q);
    x0 = Math.min(x0, q.x);
    x1 = Math.max(x1, q.x);
    y0 = Math.min(y0, q.y);
    y1 = Math.max(y1, q.y);
  }
  const bx0 = Math.max(0, Math.floor(x0) - 1);
  const bx1 = Math.min(vp.width - 1, Math.ceil(x1) + 1);
  const by0 = Math.max(0, Math.floor(y0) - 1);
  const by1 = Math.min(vp.height - 1, Math.ceil(y1) + 1);
  const along = Math.abs(w.along) < 0.12 ? (w.along < 0 ? -0.12 : 0.12) : w.along;
  const across = Math.max(0.12, w.across);
  const flare = w.flare * 70;
  // Each screen pixel looks at four picture points, so the outline stays smooth when the picture is turned.
  const OFF = [0.25, 0.75] as const;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      let n = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (const oy of OFF) {
        for (const ox of OFF) {
          const dx = x + ox - w.x;
          const dy = y + oy - w.y;
          const dl = dx * ax + dy * ay;
          const dc = dx * px + dy * py;
          // Undo the shrink and the slant (a few passes is plenty), then find the picture pixel.
          let a = 0;
          let c = 0;
          let p = 1;
          for (let i = 0; i < 3; i++) {
            a = dl / (w.side * p * along);
            c = (dc / (w.side * p) - a * w.shear) / across;
            p = persp(a);
          }
          const u = GRIP_U + (a + c) * R2;
          const v = GRIP_V + (c - a) * R2;
          if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
          const t = s.px[Math.floor(v * ITEM_ART) * ITEM_ART + Math.floor(u * ITEM_ART)] as number;
          if (t >>> 24 < 128) continue;
          n++;
          sr += t & 255;
          sg += (t >>> 8) & 255;
          sb += (t >>> 16) & 255;
        }
      }
      if (n < 2) continue;
      const r = Math.min(255, (sr / n) * w.r + flare);
      const g = Math.min(255, (sg / n) * w.g + flare);
      const b = Math.min(255, (sb / n) * w.b + flare);
      vp.pixels[y * vp.width + x] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
    }
  }
}
