// Motes over the held item: flames at a burning head, sparks, drops and puffs, advanced and painted each frame.
import { CONTENT } from '../../content';
import { addPixel, blendPixel, glowDisc, glowLine } from '../vfx/glow';
import type { Surface } from '../vfx/glow';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rgbR = (c: number): number => (c >> 16) & 255;
const rgbG = (c: number): number => (c >> 8) & 255;
const rgbB = (c: number): number => c & 255;

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  r: number;
  g: number;
  b: number;
  /** 'flame' and 'spark' add light; 'drop' and 'puff' cover what is behind. */
  kind: 'flame' | 'spark' | 'drop' | 'puff' | 'ember';
}

export class ViewMotes {
  private readonly motes: Mote[] = [];
  private spawnFlame = 0;

  /** Flames at the head of a brand: motes that rise from where it is, and are left behind when it moves. */
  flame(vp: Surface, fx: number, fy: number, size: number, light: { r: number; g: number; b: number }, f: { time: number }, dt: number, H: number): void {
    const scale = (H / 200) * size * 1.15;
    this.spawnFlame += dt * 110;
    const em = CONTENT.effects['torchFlame'];
    const c0 = em?.colour ?? 0xff9632;
    const c1 = em?.colourTo ?? 0xffdc32;
    while (this.spawnFlame >= 1) {
      this.spawnFlame -= 1;
      const k = Math.random();
      this.motes.push({
        x: fx + (Math.random() - 0.5) * 5 * scale,
        y: fy + (Math.random() - 0.3) * 3 * scale,
        vx: (Math.random() - 0.5) * 14 * scale,
        vy: -(30 + Math.random() * 40) * scale,
        life: 0.3 + Math.random() * 0.3,
        age: 0,
        size: (3.4 + Math.random() * 3.4) * scale,
        r: lerp(rgbR(c0), rgbR(c1), k) * (0.55 + light.r * 0.45),
        g: lerp(rgbG(c0), rgbG(c1), k) * (0.55 + light.g * 0.45),
        b: lerp(rgbB(c0), rgbB(c1), k) * (0.55 + light.b * 0.45),
        kind: 'flame',
      });
    }
    // Rising smoke is left to the world; the glow round the flame lights the hand and the air.
    const flick = 0.85 + Math.sin(f.time * 23) * 0.08 + Math.sin(f.time * 41) * 0.07;
    glowDisc(vp, fx, fy, 26 * scale * flick, light.r * 255, light.g * 190, light.b * 100, 0.22);
    glowDisc(vp, fx, fy, 9 * scale * flick, 255, 210, 130, 0.55);
  }

  /** Motes, flashes and sparks: advance them and paint them. */
  fx(vp: Surface, dt: number, H: number): void {
    const g = CONTENT.viewmodel.impact.gravity * H;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i] as Mote;
      m.age += dt;
      if (m.age >= m.life) {
        this.motes.splice(i, 1);
        continue;
      }
      const t = m.age / m.life;
      const px = m.x;
      const py = m.y;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.kind === 'spark' || m.kind === 'drop' || m.kind === 'ember') {
        m.vy += g * dt;
        m.vx *= 1 - dt * 1.2;
      } else if (m.kind === 'puff') {
        m.vx *= 1 - dt * 3;
        m.vy = m.vy * (1 - dt * 3) - H * 0.02 * dt;
      } else {
        m.vx *= 1 - dt * 1.5;
      }
      if (m.kind === 'flame') {
        // Hot white-yellow at birth, orange, then deep red as it dies; and smaller.
        const heat = 1 - t;
        const sz = m.size * (1 - t * 0.55);
        glowDisc(vp, m.x, m.y, sz, m.r, m.g * (0.45 + 0.55 * heat), m.b * heat * heat, 0.7 * (1 - t * t), 0.4);
      } else if (m.kind === 'spark') {
        glowLine(vp, m.x, m.y, px - (m.x - px) * 1.2, py - (m.y - py) * 1.2, m.r, m.g, m.b, 0.95 * (1 - t), 0.1);
        addPixel(vp, m.x, m.y, 255, 255, 255, 0.7 * (1 - t));
      } else if (m.kind === 'ember') {
        addPixel(vp, m.x, m.y, m.r, m.g, m.b, 0.9 * (1 - t));
        addPixel(vp, m.x, m.y - 1, m.r, m.g * 0.7, m.b * 0.4, 0.5 * (1 - t));
      } else if (m.kind === 'drop') {
        blendPixel(vp, m.x, m.y, m.r, m.g, m.b, 0.9 * (1 - t * 0.5));
        blendPixel(vp, m.x, m.y + 1, m.r, m.g, m.b, 0.55 * (1 - t));
      } else {
        const rr = (m.size + t * 4) * (H / 200);
        for (let j = -2; j <= 2; j++) {
          for (let k = -2; k <= 2; k++) {
            if (j * j + k * k > rr) continue;
            blendPixel(vp, m.x + k, m.y + j, m.r, m.g, m.b, 0.38 * (1 - t));
          }
        }
      }
    }
  }
}
