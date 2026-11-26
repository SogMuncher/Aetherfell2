// Your own open glider in first person: a cloth canopy that snaps open overhead, ripples with your speed and banks as you turn
import type { Entity } from '../../types';
import { CONTENT, wornGlider } from '../../content';
import type { Env, LightMap } from '../lighting';
import type { Surface } from '../vfx/glow';
import { fx } from '../vfx/particleKinds';
import type { ViewFrame } from './viewModel';

/**
 * All numbers live here. Lengths are shares of the screen height (`span` of its width), times in seconds.
 * The canopy is an arch of cells across the top of the view: its front edge droops toward the tips, lines run
 * from it down to your hands, and its back hem glows in the colour of the glider's trail.
 */
const CANOPY = { open: 0.55, close: 0.3, span: 0.62, top: 0.1, droop: 0.36, depth: 0.2, cells: 11, lines: 4, ripple: 0.012, bank: 0.09, maxBank: 0.45, look: 0.55, hands: 0.3 } as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const hash = (a: number, b: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
/** Eases past 1 and back, so the cloth snaps open. */
const snap = (t: number): number => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

export class ViewGlider {
  /** 0 folded … 1 open. */
  private t = 0;
  private roll = 0;
  private lastYaw: number | null = null;
  private tint = 0xd8c8a0;
  private hem = 0x3cf0ff;
  private readonly light = new Float32Array(3);

  draw(vp: Surface, e: Entity, env: Env, lm: LightMap, f: ViewFrame): void {
    const C = CANOPY;
    const dt = clamp(f.dt, 0.0005, 0.1);
    const p = e.player;
    const open = !!p?.gliding && p.downed <= 0;
    const def = wornGlider(CONTENT, e);
    if (def) {
      this.tint = def.tint;
      if (def.glide?.trail) this.hem = fx(def.glide.trail).colour;
    }
    this.t = open ? Math.min(1, this.t + dt / C.open) : Math.max(0, this.t - dt / C.close);
    const dyaw = this.lastYaw === null ? 0 : Math.atan2(Math.sin(f.yaw - this.lastYaw), Math.cos(f.yaw - this.lastYaw)) / dt;
    this.lastYaw = f.yaw;
    if (this.t <= 0) {
      this.roll = 0;
      return;
    }
    // Turning banks the canopy into the turn; it eases there.
    this.roll += (clamp(dyaw * C.bank, -C.maxBank, C.maxBank) - this.roll) * Math.min(1, dt * 4);
    const W = vp.width;
    const H = vp.height;
    const k = open ? snap(this.t) : this.t * this.t;
    const fill = Math.min(1, this.t * 1.6);
    const speed = Math.hypot(e.vel.x, e.vel.y, e.vz);
    const flutter = (0.5 + Math.min(2, speed / 12)) * (1 + (1 - fill) * 3);
    const half = W * C.span * (0.2 + 0.8 * k);
    const cx = W / 2;
    // Looking up brings the canopy down into view; it drops in from above as it opens and breathes as you fly.
    const base = H * (C.top + f.pitch * C.look - (1 - fill) * 0.6 + Math.sin(f.time * 1.3) * 0.006);
    lm.sample(e.pos.x, e.pos.y, e.z + 2, this.light);
    const lit = (amb: number, sun: number, l: number): number => Math.min(1.5, Math.max(0.22, amb * 0.8 + l * 0.55) + sun * 0.45);
    const lr = lit(env.ambR, env.sunR, this.light[0] ?? 0);
    const lg = lit(env.ambG, env.sunG, this.light[1] ?? 0);
    const lb = lit(env.ambB, env.sunB, this.light[2] ?? 0);
    const tr = (this.tint >> 16) & 255;
    const tg = (this.tint >> 8) & 255;
    const tb = this.tint & 255;
    const hr = (this.hem >> 16) & 255;
    const hg = (this.hem >> 8) & 255;
    const hb = this.hem & 255;
    const time = f.time;
    // Front edge (lower on screen) and back hem of the cloth at a point along the span (-1 … 1).
    const front = (u: number, x: number): number => base + H * (C.droop * u * u * (0.4 + 0.6 * k) + Math.sin(time * 8 + u * 10) * C.ripple * flutter) + (x - cx) * this.roll;
    const back = (u: number, fr: number): number => fr - H * C.depth * k * (1 - 0.45 * u * u) + H * Math.sin(time * 11 + u * 7 + 1) * C.ripple * 1.6 * flutter;
    const px = vp.pixels;
    const x0 = Math.max(0, Math.floor(cx - half));
    const x1 = Math.min(W - 1, Math.ceil(cx + half));
    for (let x = x0; x <= x1; x++) {
      const u = (x + 0.5 - cx) / half;
      if (u <= -1 || u >= 1) continue;
      const yf = front(u, x);
      const yb = back(u, yf);
      const ya = Math.max(0, Math.floor(yb));
      const yz = Math.min(H - 1, Math.ceil(yf));
      if (yz < ya) continue;
      const cell = ((u + 1) * C.cells) / 2;
      const ci = Math.floor(cell);
      const cf = cell - ci;
      // Each cell puffs out between its seams; the tips curl away into shadow.
      const puff = (0.62 + 0.38 * Math.sin(Math.PI * cf)) * (1 - 0.35 * u * u * u * u);
      for (let y = ya; y <= yz; y++) {
        const v = (yf - y - 0.5) / Math.max(1, yf - yb);
        if (v < 0 || v > 1) continue;
        let s = puff * (0.72 + 0.28 * (1 - v)) * (0.94 + 0.12 * hash(ci * 7 + Math.floor(v * 14), Math.floor(u * 90)));
        // Open mouths along the front edge, a dark hem at the back with a glowing line inside it.
        if (v < 0.08 && cf > 0.2 && cf < 0.8) s *= 0.3;
        let r = tr * s * lr;
        let g = tg * s * lg;
        let b = tb * s * lb;
        if (v > 0.86) {
          const glow = clamp(1 - Math.abs(v - 0.93) / 0.05, 0, 1) * (0.7 + 0.3 * Math.sin(time * 6 - u * 4));
          r = r * 0.6 + hr * glow;
          g = g * 0.6 + hg * glow;
          b = b * 0.6 + hb * glow;
        }
        px[y * W + x] = (0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255)) >>> 0;
      }
    }
    // Lines from the front edge down to your two hands.
    const lineCol = (0xff000000 | ((tb * 0.25 * lb) << 16) | ((tg * 0.25 * lg) << 8) | (tr * 0.25 * lr)) >>> 0;
    const handY = H * (1.04 - (1 - fill) * 0.3) + Math.sin(f.bob) * H * 0.01;
    for (const side of [-1, 1]) {
      const hx = cx + side * W * C.hands + (side * H * 0.04 + W * 0.04) * this.roll;
      for (let i = 0; i < C.lines; i++) {
        const u = side * (0.2 + (0.75 * i) / Math.max(1, C.lines - 1));
        const lx = cx + u * half;
        line(vp, lx, front(u, lx), hx, handY, lineCol);
      }
    }
  }
}

/** A thin dark line, clipped to the frame. */
function line(vp: Surface, x0: number, y0: number, x1: number, y1: number, col: number): void {
  const n = Math.min(4000, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    if (x >= 0 && y >= 0 && x < vp.width && y < vp.height) vp.pixels[y * vp.width + x] = col;
  }
}
