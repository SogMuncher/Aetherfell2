import type { Vec3 } from '../../types';


export const DEG = Math.PI / 180;

/** Row-major 3×3 matrix in [forward, up, side] space. */
export type M3 = number[];

export function mul(a: M3, b: M3): M3 {
  const o: M3 = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = (a[r * 3] ?? 0) * (b[c] ?? 0) + (a[r * 3 + 1] ?? 0) * (b[3 + c] ?? 0) + (a[r * 3 + 2] ?? 0) * (b[6 + c] ?? 0);
  return o;
}
export function apply(a: M3, x: number, y: number, z: number): [number, number, number] {
  return [(a[0] ?? 0) * x + (a[1] ?? 0) * y + (a[2] ?? 0) * z, (a[3] ?? 0) * x + (a[4] ?? 0) * y + (a[5] ?? 0) * z, (a[6] ?? 0) * x + (a[7] ?? 0) * y + (a[8] ?? 0) * z];
}
/** Tips the top forward (about the side axis). */
export function tiltM(deg: number): M3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}
/** Turns the front to the left (about the up axis). */
export function yawM(deg: number): M3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}
/** Leans the top to the left (about the forward axis). */
export function rollM(deg: number): M3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
export const IDENT: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface Xform {
  a: M3;
  b: [number, number, number];
}
export function compose(outer: Xform, inner: Xform): Xform {
  const ib = apply(outer.a, inner.b[0], inner.b[1], inner.b[2]);
  return { a: mul(outer.a, inner.a), b: [ib[0] + outer.b[0], ib[1] + outer.b[1], ib[2] + outer.b[2]] };
}
/** Rotation `m` about point p. */
export function about(m: M3, p: Vec3): Xform {
  const mp = apply(m, p[0], p[1], p[2]);
  return { a: m, b: [p[0] - mp[0], p[1] - mp[1], p[2] - mp[2]] };
}
