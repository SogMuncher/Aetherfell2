// Your own open glider in first person: a cloth canopy that inflates overhead, strains and flutters with airspeed, sags when slow, leans in the wind and banks into turns, its lines held in your two gloved hands
import type { Entity } from '../../types';
import { CONTENT, wornGlider } from '../../content';
import type { Env, LightMap } from '../lighting';
import type { Surface } from '../vfx/glow';
import { fx } from '../vfx/particleKinds';
import type { ViewFrame } from './viewModel';

/**
 * All numbers live here. Lengths are shares of the screen height (`span`, `hands`, `drift`, `lag` of its width), times in seconds.
 * The canopy is an arch of cells across the top of the view: its front edge droops toward the tips, lines run from it
 * down to your fists on the brake toggles, and its back hem glows in the colour of the glider's trail. How it moves
 * comes from the air you fly through (your speed against the wind, over the glider's own cruising and top speeds).
 */
const CANOPY = {
  open: 0.55, close: 0.3, span: 0.62, top: 0.1, droop: 0.36, depth: 0.2, cells: 11, lines: 4, ripple: 0.012,
  bank: 0.09, maxBank: 0.45, look: 0.55,
  /** How fast the cloth answers a change in the air (per second); wind (m/s) that counts as strong. */
  ease: 3, windFull: 10,
  /** Strong wind pushes the wing aside (`drift`) and tips it (`tip`); it shakes it (`buffet`). */
  drift: 0.03, tip: 0.04, buffet: 0.006,
  /** The wing lags behind a turn (per radian/s); diving lifts it away, pulling up swings it down into view. */
  lag: 0.035, dive: 0.05,
  /** Fists: how far apart, how low, how big; how far a brake pulls down; glove and toggle colours. */
  hands: 0.3, handY: 0.97, fist: 0.085, pull: 0.07, glove: 0x7a5536, toggle: 0x9a7a48,
} as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const hash = (a: number, b: number): number => {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
};
/** Eases past 1 and back, so the cloth snaps open. */
const snap = (t: number): number => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const rgb = (r: number, g: number, b: number): number => (0xff000000 | (clamp(b, 0, 255) << 16) | (clamp(g, 0, 255) << 8) | clamp(r, 0, 255)) >>> 0;

export class ViewGlider {
  /** 0 folded … 1 open. */
  private t = 0;
  private roll = 0;
  private lastYaw: number | null = null;
  private tint = 0xd8c8a0;
  private hem = 0x3cf0ff;
  private readonly light = new Float32Array(3);
  /** The air on the cloth, eased: taut (airspeed over top speed), slack (too slow to hold its shape), wind across the view and its strength, diving (+) or climbing (−). */
  private taut = 0;
  private slack = 0;
  private cross = 0;
  private gust = 0;
  private dive = 0;
  /** Sideways lag behind a turn (screen widths) and the flutter's phase (it runs faster the faster you fly). */
  private lagX = 0;
  private phase = 0;

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
      this.roll = this.lagX = 0;
      return;
    }
    // The air on the cloth: your speed through it (against the wind), over this glider's own speeds.
    const cruise = Math.max(1, def?.glide?.speed ?? 8);
    const topSpeed = Math.max(cruise, def?.glide?.top ?? cruise * 2);
    const air = Math.hypot(e.vel.x - f.wind.x, e.vel.y - f.wind.y, e.vz);
    const across = f.wind.y * Math.cos(f.yaw) - f.wind.x * Math.sin(f.yaw);
    const ease = Math.min(1, dt * C.ease);
    this.taut += (clamp(air / topSpeed, 0, 1.3) - this.taut) * ease;
    this.slack += (clamp(1 - air / (cruise * 0.6), 0, 1) - this.slack) * ease;
    this.cross += (clamp(across / C.windFull, -1, 1) - this.cross) * ease;
    this.gust += (clamp(Math.hypot(f.wind.x, f.wind.y) / C.windFull, 0, 1.5) - this.gust) * ease;
    this.dive += (clamp(-e.vz / cruise, -1, 1) - this.dive) * ease;
    this.phase += dt * (5 + air * 0.5);
    // Turning banks the canopy into the turn and leaves it trailing a little behind; both ease there.
    this.roll += (clamp(dyaw * C.bank, -C.maxBank, C.maxBank) - this.roll) * Math.min(1, dt * 4);
    this.lagX += (clamp(-dyaw * C.lag, -0.08, 0.08) - this.lagX) * Math.min(1, dt * 5);
    const W = vp.width;
    const H = vp.height;
    const k = open ? snap(this.t) : this.t * this.t;
    const fill = Math.min(1, this.t * 1.6);
    const time = f.time;
    const taut = Math.min(1.2, this.taut);
    const slack = this.slack;
    const gust = this.gust;
    const ph = this.phase;
    const half = W * C.span * (0.2 + 0.8 * k) * (1 + 0.04 * taut);
    const cx = W / 2 + W * (this.lagX + this.cross * C.drift);
    const roll = this.roll - this.cross * C.tip;
    // Strong wind and a slack wing shake the whole thing.
    const shake = H * C.buffet * (gust + slack * 0.6) * (Math.sin(time * 13.1) + 0.6 * Math.sin(time * 7.7 + 1));
    // Looking up brings the canopy down into view; it drops in from above as it opens and breathes as you fly;
    // diving lifts it away, pulling up swings it down in front of you.
    const base = H * (C.top + f.pitch * C.look - (1 - fill) * 0.6 + Math.sin(time * 1.3) * 0.006 - this.dive * C.dive) + shake;
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
    // Each cell fills from the middle out as the wing opens (all fold together as it closes).
    const cellOpen = (u: number): number => (open ? snap(clamp(this.t * 1.8 - Math.abs(u) * 0.8, 0, 1)) : k);
    // The front edge flutters more when slow or in gusts; the back hem whips harder the faster you fly.
    const frontWave = C.ripple * (0.6 + slack * 2.5 + gust * 0.8);
    const backWave = C.ripple * 1.6 * (0.5 + taut * taut * 1.5 + gust + slack * 2);
    const droop = C.droop * (1.15 - 0.3 * Math.min(1, taut));
    const depth = C.depth * (0.8 + 0.35 * taut) * (1 - 0.45 * slack) * (1 - 0.3 * Math.max(0, this.dive));
    // Front edge (lower on screen) and back hem of the cloth at a point along the span (-1 … 1).
    const front = (u: number, x: number): number => {
      const kc = cellOpen(u);
      return base + H * (droop * u * u * (0.4 + 0.6 * kc) + slack * 0.12 * u ** 4 + (Math.sin(ph * 1.6 + u * 10) + 0.4 * Math.sin(ph * 2.9 - u * 17)) * frontWave) + (x - cx) * roll;
    };
    const back = (u: number, fr: number): number =>
      fr - H * depth * cellOpen(u) * (1 - 0.45 * u * u) + H * (Math.sin(ph * 2.2 + u * 7 + 1) + 0.5 * Math.sin(ph * 3.7 - u * 13)) * backWave;
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
      // Each cell puffs out between its seams (more when the air fills it hard, crumpling when it goes slack); the tips curl away into shadow.
      const luff = 1 - slack * 0.35 * (0.5 + 0.5 * Math.sin(time * 3 + ci * 1.7));
      const puff = (0.62 + 0.38 * Math.sin(Math.PI * cf) * (0.6 + 0.4 * Math.min(1, taut))) * (1 - 0.35 * u ** 4) * luff;
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
        px[y * W + x] = rgb(r, g, b);
      }
    }
    // Your fists on the brakes: they come up as the wing opens, pull down when you climb, and the inside one pulls into a turn.
    const lineCol = rgb(tr * 0.25 * lr, tg * 0.25 * lg, tb * 0.25 * lb);
    const fist = H * C.fist;
    for (const side of [-1, 1]) {
      const brake = clamp(-this.dive, 0, 1) * 0.5 + clamp(side * this.roll / C.maxBank, 0, 1) * 0.6 + slack * 0.3;
      const hx = cx + side * W * C.hands + (side * H * 0.04 + W * 0.04) * roll;
      const hy = H * (C.handY + (1 - fill) * 0.25 + Math.min(1, brake) * C.pull) + Math.sin(f.bob) * H * 0.01 + shake * 0.5;
      // Lines from the front edge down to the top of the fist: straight when the wing pulls hard, bowing when slack or in a side wind.
      const bow = H * 0.03 * slack;
      const lean = W * 0.012 * this.cross;
      for (let i = 0; i < C.lines; i++) {
        const u = side * (0.2 + (0.75 * i) / Math.max(1, C.lines - 1));
        const lx = cx + u * half;
        const ly = front(u, lx);
        curve(vp, lx, ly, (lx + hx) / 2 + lean, (ly + hy - fist) / 2 + bow, hx, hy - fist * 0.8, lineCol);
      }
      paintFist(vp, hx, hy, fist, side, lr, lg, lb);
    }
  }
}

/** A gloved fist round a wooden brake toggle (lit like the cloth), its thumb toward the middle of the view. */
function paintFist(vp: Surface, hx: number, hy: number, size: number, side: number, lr: number, lg: number, lb: number): void {
  const C = CANOPY;
  const W = vp.width;
  const H = vp.height;
  const px = vp.pixels;
  const gr = (C.glove >> 16) & 255, gg = (C.glove >> 8) & 255, gb = C.glove & 255;
  const wr = (C.toggle >> 16) & 255, wg = (C.toggle >> 8) & 255, wb = C.toggle & 255;
  // The toggle: a short bar through the fist, poking out on both sides.
  const bw = size * 1.25;
  const bh = Math.max(1, size * 0.22);
  for (let y = Math.max(0, Math.floor(hy - size * 0.35 - bh)); y <= Math.min(H - 1, Math.ceil(hy - size * 0.35 + bh)); y++) {
    const ny = (y + 0.5 - (hy - size * 0.35)) / bh;
    if (ny < -1 || ny > 1) continue;
    for (let x = Math.max(0, Math.floor(hx - bw)); x <= Math.min(W - 1, Math.ceil(hx + bw)); x++) {
      const s = (0.55 + 0.45 * (1 - Math.abs(ny))) * (Math.abs(x + 0.5 - hx) > bw - 1 ? 0.5 : 1);
      px[y * W + x] = rgb(wr * s * lr, wg * s * lg, wb * s * lb);
    }
  }
  // The fist: a rounded block with a row of knuckles on top and a thumb wrapped over the bar.
  const blob = (ox: number, oy: number, rx: number, ry: number, bright: number, knuckles: boolean): void => {
    for (let y = Math.max(0, Math.floor(oy - ry)); y <= Math.min(H - 1, Math.ceil(oy + ry)); y++) {
      const ny = (y + 0.5 - oy) / ry;
      for (let x = Math.max(0, Math.floor(ox - rx)); x <= Math.min(W - 1, Math.ceil(ox + rx)); x++) {
        const nx = (x + 0.5 - ox) / rx;
        const d = nx * nx + ny * ny * ny * ny;
        if (d > 1) continue;
        let s = bright * (0.45 + 0.5 * (1 - (ny + 1) / 2) + 0.15 * (1 - Math.abs(nx)));
        if (knuckles && ny < -0.35) s *= 0.82 + 0.18 * Math.cos(nx * Math.PI * 4);
        if (d > 0.8) s *= 0.45;
        px[y * W + x] = rgb(gr * s * lr, gg * s * lg, gb * s * lb);
      }
    }
  };
  blob(hx, hy, size * 0.8, size, 1, true);
  blob(hx - side * size * 0.62, hy - size * 0.3, size * 0.32, size * 0.42, 1.12, false);
}

/** A thin dark curve from (x0, y0) bending toward (cx, cy) to (x1, y1), clipped to the frame. */
function curve(vp: Surface, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, col: number): void {
  const n = Math.min(4000, Math.ceil(Math.abs(x1 - x0) + Math.abs(y1 - y0) + Math.abs(cx - (x0 + x1) / 2) + Math.abs(cy - (y0 + y1) / 2)));
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const x = Math.round(a * x0 + b * cx + c * x1);
    const y = Math.round(a * y0 + b * cy + c * y1);
    if (x >= 0 && y >= 0 && x < vp.width && y < vp.height) vp.pixels[y * vp.width + x] = col;
  }
}
