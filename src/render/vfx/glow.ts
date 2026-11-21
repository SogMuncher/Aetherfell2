/** Light painted straight over the frame: glows, lines, specks. Shared by the held item and its sparks. */

/** Anything with pixels to draw into (the viewport, or a plain buffer in tests). */
export interface Surface {
  width: number;
  height: number;
  pixels: Uint32Array;
}

const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

/** Adds light to one pixel (r, g, b in 0..255 at strength k). */
export function addPixel(s: Surface, x: number, y: number, r: number, g: number, b: number, k: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= s.width || yi >= s.height) return;
  const i = yi * s.width + xi;
  const c = s.pixels[i] ?? 0;
  const R = clamp255((c & 255) + r * k);
  const G = clamp255(((c >>> 8) & 255) + g * k);
  const B = clamp255(((c >>> 16) & 255) + b * k);
  s.pixels[i] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
}

/** Mixes a colour over one pixel (an opaque-ish speck: blood, dust). */
export function blendPixel(s: Surface, x: number, y: number, r: number, g: number, b: number, k: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= s.width || yi >= s.height) return;
  const i = yi * s.width + xi;
  const c = s.pixels[i] ?? 0;
  const R = clamp255((c & 255) * (1 - k) + r * k);
  const G = clamp255(((c >>> 8) & 255) * (1 - k) + g * k);
  const B = clamp255(((c >>> 16) & 255) * (1 - k) + b * k);
  s.pixels[i] = (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
}

/** A soft round glow (additive). `hard` 0 = smooth falloff, 1 = a flat disc. */
export function glowDisc(s: Surface, cx: number, cy: number, radius: number, r: number, g: number, b: number, k: number, hard = 0): void {
  const R = Math.ceil(radius);
  for (let j = -R; j <= R; j++) {
    for (let i = -R; i <= R; i++) {
      const d = Math.hypot(i, j) / radius;
      if (d > 1) continue;
      const f = hard > 0 ? (d < hard ? 1 : 1 - (d - hard) / (1 - hard)) : (1 - d) * (1 - d);
      addPixel(s, cx + i, cy + j, r, g, b, k * f);
    }
  }
}

/** A thin bright line (additive), fading from `k0` at the start to `k1` at the end. */
export function glowLine(s: Surface, x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number, k0: number, k1: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    addPixel(s, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, g, b, k0 + (k1 - k0) * t);
  }
}

/** Fills a triangle with additive light whose strength at each corner is given (smoothly shared between them). */
export function glowTriangle(s: Surface, x0: number, y0: number, k0: number, x1: number, y1: number, k1: number, x2: number, y2: number, k2: number, r: number, g: number, b: number): void {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 0.01) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(s.width - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(s.height - 1, Math.ceil(Math.max(y0, y1, y2)));
  const inv = 1 / area;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * inv;
      const w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * inv;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      addPixel(s, x, y, r, g, b, w0 * k0 + w1 * k1 + w2 * k2);
    }
  }
}
