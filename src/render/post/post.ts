import type { Viewport } from '../viewport';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface PostParams {
  /** 0..1 red pain flash. */
  hurt: number;
  /** 0..1 drowned blue tint. */
  underwater: number;
  /** 0..1 grey "downed" desaturation. */
  downed: number;
}

/**
 * Retro finishing: ordered dithering into a reduced colour depth (the chunky 90s look without
 * harsh banding), soft vignette, and full-screen tints for pain, water and being knocked down.
 */
export function postProcess(vp: Viewport, params: PostParams, levels = 24): void {
  const W = vp.width;
  const H = vp.height;
  const px = vp.pixels;
  const step = 255 / (levels - 1);
  const cx = W / 2;
  const cy = H / 2;
  const inv = 1 / (cx * cx + cy * cy);
  const hurt = params.hurt;
  const uw = params.underwater;
  const dn = params.downed;
  for (let y = 0; y < H; y++) {
    const dy = y - cy;
    for (let x = 0; x < W; x++) {
      const o = y * W + x;
      const c = px[o] ?? 0;
      let r = c & 255;
      let g = (c >>> 8) & 255;
      let b = (c >>> 16) & 255;
      const dx = x - cx;
      const v = 1 - (dx * dx + dy * dy) * inv * 0.45;
      r *= v;
      g *= v;
      b *= v;
      if (hurt > 0) {
        const edge = (dx * dx + dy * dy) * inv;
        r += (200 - r) * hurt * edge;
        g *= 1 - hurt * edge * 0.6;
        b *= 1 - hurt * edge * 0.6;
      }
      if (uw > 0) {
        r = r * (1 - uw * 0.6);
        g = g * (1 - uw * 0.3) + 20 * uw;
        b = b * (1 - uw * 0.1) + 40 * uw;
      }
      if (dn > 0) {
        const l = r * 0.3 + g * 0.59 + b * 0.11;
        r += (l - r) * dn;
        g += (l - g) * dn;
        b += (l - b) * dn;
      }
      const d = ((BAYER[((y & 3) << 2) | (x & 3)] ?? 0) / 16 - 0.5) * step;
      r = Math.round((r + d) / step) * step;
      g = Math.round((g + d) / step) * step;
      b = Math.round((b + d) / step) * step;
      px[o] = (0xff000000 | ((b < 0 ? 0 : b > 255 ? 255 : b) << 16) | ((g < 0 ? 0 : g > 255 ? 255 : g) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r)) >>> 0;
    }
  }
}
