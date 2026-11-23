import type { PartShape, Surface } from '../../types';
import { SHADE_ONE } from '../palette';
import type { Solid } from './artGrow';
import type { Sprite } from './sprites';
import { apply } from './bodyMath';
import { pack, rhash } from '../color';


export interface Prepared {
  s: Solid;
  /** Bounding circle on the picture (metres): pixels outside it cannot hit this solid. */
  bx: number;
  by: number;
  br2: number;
  /** Ray origin in unit-shape space = o0 + sx·ox + sy·oy; direction d. */
  o0: [number, number, number];
  ox: [number, number, number];
  oy: [number, number, number];
  d: [number, number, number];
}

/** Into the solid's unit space: inverse scale × transpose rotation. */
export function toUnit(s: Solid, x: number, y: number, z: number): [number, number, number] {
  const a = s.a;
  const ux = ((a[0] ?? 0) * x + (a[3] ?? 0) * y + (a[6] ?? 0) * z) / s.size[0];
  const uy = ((a[1] ?? 0) * x + (a[4] ?? 0) * y + (a[7] ?? 0) * z) / s.size[1];
  const uz = ((a[2] ?? 0) * x + (a[5] ?? 0) * y + (a[8] ?? 0) * z) / s.size[2];
  return [ux, uy, uz];
}

/** Ray hit distance against a unit shape, or -1. Writes the unit-space normal into n. */
export function intersect(shape: PartShape, o: [number, number, number], d: [number, number, number], n: number[]): number {
  const [ox, oy, oz] = o;
  const [dx, dy, dz] = d;
  if (shape === 'ball') {
    const a = dx * dx + dy * dy + dz * dz;
    const b = 2 * (ox * dx + oy * dy + oz * dz);
    const c = ox * ox + oy * oy + oz * oz - 1;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0) return -1;
    n[0] = ox + dx * t;
    n[1] = oy + dy * t;
    n[2] = oz + dz * t;
    return t;
  }
  if (shape === 'box') {
    let t0 = -Infinity;
    let t1 = Infinity;
    let axis = 0;
    for (let k = 0; k < 3; k++) {
      const ok = k === 0 ? ox : k === 1 ? oy : oz;
      const dk = k === 0 ? dx : k === 1 ? dy : dz;
      if (Math.abs(dk) < 1e-9) {
        if (ok < -1 || ok > 1) return -1;
        continue;
      }
      let ta = (-1 - ok) / dk;
      let tb = (1 - ok) / dk;
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) {
        t0 = ta;
        axis = k;
      }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return -1;
    }
    if (t0 < 0) return -1;
    n[0] = 0;
    n[1] = 0;
    n[2] = 0;
    const dk = axis === 0 ? dx : axis === 1 ? dy : dz;
    n[axis] = dk > 0 ? -1 : 1;
    return t0;
  }
  if (shape === 'drum') {
    // Upright cylinder: radius 1 across forward/side, from y = -1 to 1, with flat ends.
    let best = -1;
    const A = dx * dx + dz * dz;
    if (A > 1e-12) {
      const B = 2 * (ox * dx + oz * dz);
      const C = ox * ox + oz * oz - 1;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return -1;
      const t = (-B - Math.sqrt(disc)) / (2 * A);
      const y = oy + dy * t;
      if (t >= 0 && y >= -1 && y <= 1) {
        best = t;
        n[0] = ox + dx * t;
        n[1] = 0;
        n[2] = oz + dz * t;
      }
    } else if (ox * ox + oz * oz > 1) return -1;
    if (Math.abs(dy) > 1e-9) {
      for (const cap of [-1, 1]) {
        const t = (cap - oy) / dy;
        if (t < 0 || (best >= 0 && t >= best)) continue;
        const x = ox + dx * t;
        const z = oz + dz * t;
        if (x * x + z * z > 1) continue;
        best = t;
        n[0] = 0;
        n[1] = cap;
        n[2] = 0;
      }
    }
    return best;
  }
  // Cone: base disc at y=0 (radius 1), tip at y=1.
  let best = -1;
  const w = 1 - oy;
  const A = dx * dx + dz * dz - dy * dy;
  const B = 2 * (ox * dx + oz * dz + w * dy);
  const C = ox * ox + oz * oz - w * w;
  const tryT = (t: number): void => {
    if (t < 0 || (best >= 0 && t >= best)) return;
    const y = oy + dy * t;
    if (y < 0 || y > 1) return;
    best = t;
    n[0] = ox + dx * t;
    n[1] = 1 - y;
    n[2] = oz + dz * t;
  };
  if (Math.abs(A) > 1e-9) {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      tryT((-B - sq) / (2 * A));
      tryT((-B + sq) / (2 * A));
    }
  } else if (Math.abs(B) > 1e-9) tryT(-C / B);
  if (Math.abs(dy) > 1e-9) {
    const t = -oy / dy;
    const x = ox + dx * t;
    const z = oz + dz * t;
    if (t >= 0 && x * x + z * z <= 1 && (best < 0 || t < best)) {
      best = t;
      n[0] = 0;
      n[1] = -1;
      n[2] = 0;
    }
  }
  return best;
}

export function surfaceK(surface: Surface, lit: number, ux: number, uy: number, uz: number, spec: number): number {
  const h = rhash(Math.floor(ux), Math.floor(uy) * 7 + Math.floor(uz) * 13, 5);
  switch (surface) {
    case 'glow':
      return 1.15;
    case 'fur':
      return lit * (0.84 + h * 0.3);
    case 'cloth':
      return lit * (((Math.floor(ux) + Math.floor(uy) + Math.floor(uz)) & 1) === 0 ? 0.95 : 1.03);
    case 'scales': {
      const fx = ux * 0.8 - Math.floor(ux * 0.8);
      const fy = uy * 0.8 - Math.floor(uy * 0.8);
      return lit * (fx < 0.25 || fy < 0.25 ? 0.82 : 1.02 + h * 0.08);
    }
    case 'shell':
      return lit * ((Math.floor(uy * 0.7) & 1) === 0 ? 0.92 : 1.05) + spec * 0.25;
    case 'metal':
      return lit * 0.85 + spec * 0.9;
    case 'skin':
      return lit * (0.96 + h * 0.06) + spec * 0.08;
    case 'leaves':
      return lit * (0.78 + h * 0.4);
    case 'bark': {
      // Streaks running along the piece, broken now and then.
      const sx = Math.floor(ux * 0.7 + uz * 0.7);
      const streak = rhash(sx, Math.floor(uy * 0.18), 9);
      return lit * (streak < 0.3 ? 0.78 : 0.95 + h * 0.08);
    }
    case 'stone': {
      const blot = rhash(Math.floor(ux * 0.4), Math.floor(uy * 0.4) * 5 + Math.floor(uz * 0.4) * 11, 6);
      return lit * (0.86 + blot * 0.16 + h * 0.06) + spec * 0.05;
    }
    case 'thatch':
      return lit * ((Math.floor(uy * 0.5) & 1) === 0 ? 0.9 : 1.04) * (0.94 + h * 0.1);
    case 'wood': {
      const ring = Math.sin(ux * 0.9 + uz * 0.9 + rhash(Math.floor(uy * 0.2), 0, 3) * 3);
      return lit * (0.92 + ring * 0.06 + h * 0.04);
    }
    default:
      return lit * (0.97 + h * 0.04) + spec * 0.15;
  }
}

/**
 * Ray-casts solids into a sprite seen from view angle `psi` (radians around the body; 0 = side-on
 * with its head to the viewer's right). `hand` is +1 or -1 to match the world's screen handedness.
 */
export function paintSolids(solids: readonly Solid[], ppm: number, psi: number, hand: number, radius: number, top: number): Sprite {
  const w = Math.max(2, Math.ceil(radius * 2 * ppm) + 2);
  const h = Math.max(2, Math.ceil(top * ppm) + 1);
  // View axes in the creature's [forward, up, side] space.
  const R: [number, number, number] = [Math.cos(psi), 0, Math.sin(psi)];
  const F: [number, number, number] = [-Math.sin(psi) * hand, 0, Math.cos(psi) * hand];
  // Light from above, a little left of and in front of the viewer.
  const lx = -0.45;
  const ly = 0.75;
  const lz = -0.5;
  const L: [number, number, number] = [R[0] * lx + F[0] * lz, ly, R[2] * lx + F[2] * lz];
  const ll = Math.hypot(L[0], L[1], L[2]);
  L[0] /= ll;
  L[1] /= ll;
  L[2] /= ll;
  const prep: Prepared[] = solids.map((s) => {
    const back = 20;
    // Middle of the solid and a sphere around it (a cone's middle is halfway up its length).
    const half = s.shape === 'cone' ? s.size[1] * 0.5 : 0;
    const mx = s.c[0] + (s.a[1] ?? 0) * half;
    const my = s.c[1] + (s.a[4] ?? 0) * half;
    const mz = s.c[2] + (s.a[7] ?? 0) * half;
    const br = s.shape === 'cone' ? Math.hypot(Math.max(s.size[0], s.size[2]), half) : Math.hypot(s.size[0], s.size[1], s.size[2]);
    return {
      s,
      bx: mx * R[0] + my * R[1] + mz * R[2],
      by: my,
      br2: (br + 1 / ppm) * (br + 1 / ppm),
      o0: toUnit(s, -F[0] * back - s.c[0], -F[1] * back - s.c[1], -F[2] * back - s.c[2]),
      ox: toUnit(s, R[0], R[1], R[2]),
      oy: toUnit(s, 0, 1, 0),
      d: toUnit(s, F[0], F[1], F[2]),
    };
  });
  const px = new Uint32Array(w * h);
  const depth = new Float32Array(w * h).fill(Infinity);
  const coloured = solids.some((s) => s.region > 0);
  const regions = coloured ? new Uint8Array(w * h) : undefined;
  const shade = coloured ? new Uint8Array(w * h) : undefined;
  const n = [0, 0, 0];
  const o: [number, number, number] = [0, 0, 0];
  for (let j = 0; j < h; j++) {
    const sy = (h - j - 0.5) / ppm;
    for (let i = 0; i < w; i++) {
      const sx = (i + 0.5 - w / 2) / ppm;
      let best = Infinity;
      let col = 0;
      let reg = 0;
      let kk = 1;
      for (let pi = 0; pi < prep.length; pi++) {
        const p = prep[pi] as Prepared;
        const ex = sx - p.bx;
        const ey = sy - p.by;
        if (ex * ex + ey * ey > p.br2) continue;
        o[0] = p.o0[0] + p.ox[0] * sx + p.oy[0] * sy;
        o[1] = p.o0[1] + p.ox[1] * sx + p.oy[1] * sy;
        o[2] = p.o0[2] + p.ox[2] * sx + p.oy[2] * sy;
        const t = intersect(p.s.shape, o, p.d, n);
        if (t < 0 || t >= best) continue;
        const s = p.s;
        // Normal back to creature space (inverse-transpose of rotation × scale).
        const nx = (n[0] ?? 0) / s.size[0];
        const ny = (n[1] ?? 0) / s.size[1];
        const nz = (n[2] ?? 0) / s.size[2];
        const wn = apply(s.a, nx, ny, nz);
        const nl = Math.hypot(wn[0], wn[1], wn[2]) || 1;
        const dot = (wn[0] * L[0] + wn[1] * L[1] + wn[2] * L[2]) / nl;
        const lit = 0.5 + 0.62 * Math.max(0, dot);
        // Highlight: light reflected toward the viewer.
        const towardViewer = -(wn[0] * F[0] + wn[1] * F[1] + wn[2] * F[2]) / nl;
        // Foliage: the edges that turn away from the viewer are full of gaps you see through.
        if (s.surface === 'leaves') {
          const edge = 1 - Math.abs(towardViewer);
          if (rhash(i, j, 31 + pi) < 0.06 + edge * edge * 0.85) continue;
        }
        best = t;
        const spec = Math.pow(Math.max(0, dot * towardViewer), 6);
        // Texture follows the part (in pixels of its own surface), so it does not swim as it moves.
        const k = surfaceK(s.surface, lit, (o[0] + p.d[0] * t) * s.size[0] * ppm, (o[1] + p.d[1] * t) * s.size[1] * ppm, (o[2] + p.d[2] * t) * s.size[2] * ppm, spec);
        kk = k * s.tone;
        reg = s.region;
        col = pack((s.color & 255) * kk, ((s.color >>> 8) & 255) * kk, ((s.color >>> 16) & 255) * kk);
      }
      if (best < Infinity) {
        px[j * w + i] = col;
        depth[j * w + i] = best;
        if (regions && shade && reg > 0) {
          regions[j * w + i] = reg;
          shade[j * w + i] = Math.min(255, Math.round(kk * SHADE_ONE));
        }
      }
    }
  }
  outline(px, depth, w, h, shade);
  return regions && shade ? { w, h, px, worldW: w / ppm, worldH: h / ppm, regions, shade } : { w, h, px, worldW: w / ppm, worldH: h / ppm };
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
