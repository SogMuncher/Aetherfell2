import type { ItemDef } from '../../types';
import { rhash } from '../color';
import type { Look, Rgb } from './itemPaint';
import { scale, mix, clamp, lit, axis, along, Pix, LEATHER, RUST, WHITE } from './itemPaint';

// ---------------------------------------------------------------------------------------------
// Armour: four base shapes (head, body, arms, legs). Material gives the colour, plates make it hard
// and bright-edged, quality adds shine, and a worn piece gets rusty patches and holes.

interface Plate {
  base: Rgb;
  hi: Rgb;
  /** 0 (cloth) .. 1 (plates). */
  plate: number;
  shine: boolean;
  /** 0 (new) .. 1 (about to fall apart). */
  worn: number;
  seed: number;
}

export function plateOf(def: ItemDef, L: Look): Plate {
  const base = L.shell ?? L.fill;
  return {
    base,
    hi: L.glow ?? mix(base, WHITE, 0.3),
    plate: clamp(def.look?.plate ?? 0, 0, 1),
    shine: L.glow !== null,
    worn: clamp(1 - (def.wear ?? 1) / Math.max(1, def.durability ?? 1), 0, 1),
    seed: L.seed,
  };
}

/** One pixel of a piece of armour: lit as a curved surface, with a bright edge when it is plate and wear on top. */
function armourPixel(P: Plate, nx: number, ny: number, x: number, y: number, edge: number): Rgb | null {
  let col = lit(P.base, nx, ny);
  if (P.plate > 0.5 && edge < 0.12) col = mix(col, P.hi, 0.6);
  else if (P.shine && edge < 0.2 && nx + ny < 0) col = mix(col, P.hi, 0.5);
  if (P.worn > 0.2) {
    const r = rhash(x, y, P.seed);
    if (P.worn > 0.7 && r < (P.worn - 0.65) * 0.4) return null;
    // Plate rusts; cloth and leather just go dark and ragged.
    if (r < P.worn * 0.5) col = P.plate > 0.5 ? mix(col, RUST, 0.6) : scale(col, 0.6);
  }
  return col;
}

export function headgear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    const nx = (u - 0.5) / 0.3;
    const ny = (v - 0.46) / 0.3;
    const band = v >= 0.6 && v <= 0.7;
    if (band ? Math.abs(u - 0.5) > 0.33 : nx * nx + ny * ny > 1 || v > 0.7) {
      // Nasal bar of a helm.
      if (P.plate > 0.5 && Math.abs(u - 0.5) < 0.03 && v > 0.7 && v < 0.84) return armourPixel(P, 0, 0, x, y, 0.5);
      return null;
    }
    const edge = band ? 0.05 : 1 - Math.hypot(nx, ny);
    let col = armourPixel(P, nx, ny, x, y, edge);
    if (!col) return null;
    if (band) col = scale(col, 0.82);
    // A ridge along the crown of a helm; a fold in a cap.
    if (P.plate > 0.5 && Math.abs(u - 0.5) < 0.022 && v < 0.6) col = mix(col, P.hi, 0.7);
    // The eye slit of a helm.
    if (P.plate > 0.5 && v > 0.5 && v < 0.55 && Math.abs(u - 0.5) < 0.19 && Math.abs(u - 0.5) > 0.025) col = scale(col, 0.25);
    if (P.plate < 0.4 && Math.abs(v - 0.5 - (u - 0.5) * 0.4) < 0.015) col = scale(col, 0.75);
    return col;
  });
}

export function torsowear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    if (v < 0.16 || v > 0.88) return null;
    const half = 0.27 - (v - 0.16) * 0.1;
    // Cap sleeves, or pauldrons on plate.
    const shoulder = v < 0.36 ? 0.37 - (v - 0.16) * 0.2 : 0;
    const w = Math.max(half, shoulder);
    const d = Math.abs(u - 0.5);
    if (d > w) return null;
    if (Math.hypot(u - 0.5, v - 0.16) < 0.085) return null;
    let col = armourPixel(P, (u - 0.5) / w, (v - 0.5) * 1.6, x, y, (w - d) / w);
    if (!col) return null;
    if (P.plate > 0.5) {
      // Overlapping bands with rivets.
      const k = (v - 0.2) / 0.13;
      if (v > 0.3 && Math.abs(k - Math.round(k)) < 0.07) col = scale(col, 0.62);
      else if (v > 0.3 && Math.abs(Math.abs(u - 0.5) - 0.12) < 0.018 && Math.abs(k - Math.round(k)) < 0.2) col = mix(col, WHITE, 0.45);
    } else {
      if (d < 0.012 && v > 0.22) col = scale(col, 0.75);
      if (v > 0.68 && v < 0.73 && d <= half) col = LEATHER;
    }
    return col;
  });
}

export function armwear(c: Pix, P: Plate): void {
  const limbs = [axis(0.3, 0.18, 0.2, 0.82), axis(0.7, 0.18, 0.8, 0.82)];
  c.paint((u, v, x, y) => {
    for (const a of limbs) {
      const { t, s } = along(a, u, v);
      const w = 0.105 - t * 0.03;
      if (t < 0 || t > 1 || Math.abs(s) > w) continue;
      const col = armourPixel(P, s / w, (t - 0.5) * 1.4, x, y, (w - Math.abs(s)) / w);
      if (!col) continue;
      if (P.plate > 0.5) return Math.abs(t * 4 - Math.round(t * 4)) < 0.1 && t > 0.1 && t < 0.9 ? scale(col, 0.62) : col;
      // Cloth wraps wind round the arm.
      return Math.floor((t + s * 0.8) * 9) % 2 === 0 ? scale(col, 0.82) : col;
    }
    return null;
  });
}

export function legwear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    if (v < 0.12 || v > 0.9) return null;
    for (const cx of [0.36, 0.64]) {
      const w = 0.125 - (v - 0.12) * 0.06;
      const d = Math.abs(u - cx);
      if (d > w) continue;
      const col = armourPixel(P, (u - cx) / w, (v - 0.5) * 1.2, x, y, (w - d) / w);
      if (!col) continue;
      // Boots below the shin.
      if (v > 0.8) return lit(LEATHER, (u - cx) / w, 0.2);
      if (P.plate > 0.5 && Math.hypot(u - cx, v - 0.45) < 0.07) return mix(col, P.hi, 0.7);
      if (P.plate <= 0.5 && Math.abs(u - cx) < 0.012) return scale(col, 0.78);
      return col;
    }
    return null;
  });
}


