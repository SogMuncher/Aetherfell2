// Last touches on a painted body picture: dark outlines, and flat item pictures (held items) stamped facing the viewer
import { pack } from '../color';
import type { Solid } from './artGrow';

/** A flat picture to stamp: `n`×`n` pixels covering `size` metres, gripped at `grip` (pixels), pointing along `axis` (unit; y down). */
export interface CardPic {
  px: Uint32Array;
  n: number;
  size: number;
  grip: readonly [number, number];
  axis: readonly [number, number];
}
/** Finds the picture for a card part's item id. */
export type CardSource = (id: string) => CardPic | undefined;

/** The picture being painted, as `paintSolids` lays it out (view axes R, F in the thing's space). */
export interface Canvas {
  px: Uint32Array;
  depth: Float32Array;
  regions?: Uint8Array;
  w: number;
  h: number;
  ppm: number;
  R: readonly [number, number, number];
  F: readonly [number, number, number];
}

/**
 * Each card solid becomes its item's own bag picture, never turned in depth: gripped where the solid
 * sits and rotated in the picture plane to point where the solid's up axis points on screen, so it
 * swings with its joint. Hidden only where the body is nearer than the grip.
 */
export function stampCards(cards: readonly Solid[], source: CardSource, c: Canvas): void {
  const { w, h, ppm, R, F } = c;
  for (const s of cards) {
    const pic = s.card ? source(s.card) : undefined;
    if (!pic) continue;
    const gx = (s.c[0] * R[0] + s.c[1] * R[1] + s.c[2] * R[2]) * ppm + w / 2;
    const gy = h - s.c[1] * ppm;
    const d = s.c[0] * F[0] + s.c[1] * F[1] + s.c[2] * F[2] + 20;
    // Where its up axis points on the picture (y down); straight at the viewer reads as up.
    let ax = (s.a[1] ?? 0) * R[0] + (s.a[4] ?? 0) * R[1] + (s.a[7] ?? 0) * R[2];
    let ay = -(s.a[4] ?? 0);
    const al = Math.hypot(ax, ay);
    if (al < 1e-3) [ax, ay] = [0, -1];
    else [ax, ay] = [ax / al, ay / al];
    // Rotation taking the picture's own axis onto it, run backwards per target pixel.
    const cos = ax * pic.axis[0] + ay * pic.axis[1];
    const sin = pic.axis[0] * ay - pic.axis[1] * ax;
    const k = pic.n / (pic.size * ppm);
    const reach = Math.ceil((pic.size * ppm) * 1.5);
    const i0 = Math.max(0, Math.floor(gx - reach));
    const i1 = Math.min(w - 1, Math.ceil(gx + reach));
    const j0 = Math.max(0, Math.floor(gy - reach));
    const j1 = Math.min(h - 1, Math.ceil(gy + reach));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const qx = (i + 0.5 - gx) * k;
        const qy = (j + 0.5 - gy) * k;
        const u = Math.floor(pic.grip[0] + qx * cos + qy * sin);
        const v = Math.floor(pic.grip[1] - qx * sin + qy * cos);
        if (u < 0 || v < 0 || u >= pic.n || v >= pic.n) continue;
        const col = pic.px[v * pic.n + u] ?? 0;
        if (!col) continue;
        const o = j * w + i;
        if (c.px[o] && (c.depth[o] ?? Infinity) < d) continue;
        c.px[o] = col;
        c.depth[o] = d;
        if (c.regions) c.regions[o] = 0;
      }
    }
  }
}

/** Darkens the silhouette edge and places where a near part overlaps a far one, for readability. */
export function outline(px: Uint32Array, depth: Float32Array, w: number, h: number, shade?: Uint8Array): void {
  const dark = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = j * w + i;
      if (px[o] === 0) continue;
      const d = depth[o] ?? 0;
      let edge = 0;
      const look = (ii: number, jj: number): void => {
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) {
          if (jj < h) edge = Math.max(edge, 1);
          return;
        }
        const q = jj * w + ii;
        if (px[q] === 0) edge = Math.max(edge, 1);
        else if ((depth[q] ?? 0) < d - 0.12) edge = Math.max(edge, 2);
      };
      look(i - 1, j);
      look(i + 1, j);
      look(i, j - 1);
      look(i, j + 1);
      dark[o] = edge;
    }
  }
  for (let o = 0; o < w * h; o++) {
    const e = dark[o] ?? 0;
    if (!e) continue;
    const c = px[o] ?? 0;
    const k = e === 1 ? 0.62 : 0.75;
    px[o] = pack((c & 255) * k, ((c >>> 8) & 255) * k, ((c >>> 16) & 255) * k);
    if (shade) shade[o] = Math.round((shade[o] ?? 0) * k);
  }
}
