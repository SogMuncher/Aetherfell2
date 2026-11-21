/** Pixels are packed as 0xAABBGGRR (little-endian RGBA in an ImageData buffer). */
export function pack(r: number, g: number, b: number): number {
  const R = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  const G = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  const B = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return (0xff000000 | (B << 16) | (G << 8) | R) >>> 0;
}

export function red(c: number): number {
  return c & 255;
}
export function green(c: number): number {
  return (c >>> 8) & 255;
}
export function blue(c: number): number {
  return (c >>> 16) & 255;
}
export function alpha(c: number): number {
  return c >>> 24;
}

export function hex(rgb: number): number {
  return pack((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
}

export function mixPacked(a: number, b: number, t: number): number {
  return pack(red(a) + (red(b) - red(a)) * t, green(a) + (green(b) - green(a)) * t, blue(a) + (blue(b) - blue(a)) * t);
}

/** Cheap integer hash → 0..1 used by every procedural generator in render. */
export function rhash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function vnoise(x: number, y: number, s = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  let fx = x - ix;
  let fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = rhash(ix, iy, s);
  const b = rhash(ix + 1, iy, s);
  const c = rhash(ix, iy + 1, s);
  const d = rhash(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
