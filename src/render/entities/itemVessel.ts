import type { Look } from './itemPaint';
import { CLAY, CORK, GLASS, Pix, WHITE, lit, mix, scale } from './itemPaint';
import { rhash } from '../color';
import type { VesselBody } from '../../types';

/** Vessels: one profile shared by flasks, bottles, vials, jugs and pots. */

interface Profile {
  /** Half-width of the vessel at height v (0 top .. 1 bottom), or 0 outside it. */
  half(v: number): number;
  /** Where the neck ends and the body begins. */
  bodyTop: number;
  bottom: number;
  /** Stopper rows. */
  stopTop: number;
  stopBottom: number;
  neck: number;
  glass: boolean;
}

function profile(body: VesselBody, size: number, seed: number): Profile {
  const k = size;
  const j = (rhash(seed, 1, 3) - 0.5) * 0.04;
  switch (body) {
    case 'round': {
      const cy = 0.64;
      const r = 0.31 * k;
      const neck = 0.075 * k;
      const nt = 0.16 + j;
      return {
        half: (v) => (v >= nt && v < cy - r * 0.8 ? neck : Math.sqrt(Math.max(0, r * r - (v - cy) * (v - cy)))),
        bodyTop: cy - r,
        bottom: cy + r,
        stopTop: nt - 0.11,
        stopBottom: nt,
        neck,
        glass: true,
      };
    }
    case 'tall': {
      const neck = 0.07 * k;
      const w = 0.19 * k;
      const nt = 0.14 + j;
      const sh = 0.36;
      return {
        half: (v) => {
          if (v < nt || v > 0.93) return 0;
          if (v < sh - 0.06) return neck;
          if (v < sh + 0.06) return neck + ((v - (sh - 0.06)) / 0.12) * (w - neck);
          return w;
        },
        bodyTop: sh,
        bottom: 0.93,
        stopTop: nt - 0.1,
        stopBottom: nt,
        neck,
        glass: true,
      };
    }
    case 'vial': {
      const w = 0.1 * k;
      const top = 0.2 + j;
      const bot = 0.88;
      return {
        half: (v) => {
          if (v < top || v > bot) return 0;
          const r = bot - w;
          return v > r ? Math.sqrt(Math.max(0, w * w - (v - r) * (v - r))) : w;
        },
        bodyTop: top,
        bottom: bot,
        stopTop: top - 0.11,
        stopBottom: top,
        neck: w,
        glass: true,
      };
    }
    case 'jug': {
      const neck = 0.1 * k;
      const w = 0.27 * k;
      const nt = 0.14 + j;
      return {
        half: (v) => {
          if (v < nt || v > 0.93) return 0;
          if (v < 0.3) return neck + (v < nt + 0.04 ? 0.025 : 0);
          const t = (v - 0.3) / 0.63;
          return neck + (w - neck) * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - (t > 0.85 ? (t - 0.85) * 0.5 : 0);
        },
        bodyTop: 0.3,
        bottom: 0.93,
        stopTop: nt - 0.09,
        stopBottom: nt,
        neck,
        glass: false,
      };
    }
    case 'pot': {
      const neck = 0.14 * k;
      const cy = 0.62;
      const r = 0.31 * k;
      const nt = 0.2 + j;
      return {
        half: (v) => (v >= nt && v < cy - r * 0.85 ? neck : Math.sqrt(Math.max(0, r * r - (v - cy) * (v - cy))) * 1.05),
        bodyTop: cy - r,
        bottom: cy + r,
        stopTop: nt - 0.1,
        stopBottom: nt,
        neck,
        glass: false,
      };
    }
  }
}

export function vessel(c: Pix, L: Look): void {
  const P = profile(L.body, L.size, L.seed);
  const cx = 0.5;
  const shell = L.shell ?? (P.glass ? GLASS : CLAY);
  const liquidTop = P.bottom - L.level * (P.bottom - P.bodyTop);
  const stopper = P.glass ? mix(CORK, scale(CORK, 0.7), rhash(L.seed, 2, 3)) : L.fill;
  c.paint((u, v, x, y) => {
    // Stopper (cork for glass, a rag or wax plug in the vessel's own colour for clay).
    if (v >= P.stopTop && v < P.stopBottom && Math.abs(u - cx) <= P.neck + 0.03) return lit(stopper, (u - cx) / (P.neck + 0.03), -0.3);
    const hw = P.half(v);
    if (hw <= 0 || Math.abs(u - cx) > hw) return null;
    const nx = (u - cx) / hw;
    const edge = hw - Math.abs(u - cx) < 0.055;
    if (P.glass) {
      if (v >= liquidTop) {
        if (L.sparkle && rhash(x, y, L.seed) > 0.86) return mix(L.fill, WHITE, 0.6);
        // Liquid: rounded, a little lighter just under its surface.
        const k = 0.8 + (v - liquidTop < 0.06 ? 0.2 : 0) - nx * 0.2 - Math.max(0, v - 0.8) * 0.5;
        const col = scale(L.fill, k);
        return edge ? mix(col, shell, 0.35) : col;
      }
      // Empty glass shows faintly.
      if (edge) return scale(shell, 0.85);
      return nx < -0.3 && nx > -0.65 ? scale(shell, 0.95) : null;
    }
    // Clay: solid, with a painted band in the contents' colour.
    const band = v > P.bodyTop + (P.bottom - P.bodyTop) * 0.3 && v < P.bodyTop + (P.bottom - P.bodyTop) * 0.42;
    return lit(band ? L.fill : shell, nx, (v - (P.bodyTop + P.bottom) / 2) / (P.bottom - P.bodyTop));
  });
  if (P.glass) {
    // Glint on the glass.
    c.dot(cx - P.half(P.bodyTop + 0.12) * 0.55, P.bodyTop + 0.1, WHITE);
    if (L.glow) c.dot(cx + 0.03, liquidTop + 0.12, L.glow);
  } else if (L.body === 'jug') {
    // A handle on the side.
    const hx = cx + P.half(0.5) + 0.04;
    c.paint((u, v) => {
      const d = Math.hypot((u - (hx - 0.04)) / 0.11, (v - 0.46) / 0.15);
      return d > 0.7 && d < 1.15 && u > hx - 0.04 ? lit(shell, 0.4, (v - 0.46) * 4) : null;
    });
  }
}

