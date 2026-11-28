// Death crumble: a dying body's picture falls apart into its own pixels, which tumble down, blow about, settle and fade
import type { ReadonlyTiles, ReadonlyVolume, Vec2 } from '../../types';
import type { Sprite } from '../entities/sprites';
import { SHADE_ONE } from '../palette';

/** All numbers live here. */
export const CRUMBLE = { max: 24000, hold: 0.3, spread: 0.45, hop: 0.7, gravity: 9.8, windGrip: 1.6, bounce: 0.25, rest: 0.5, life: [1.6, 3.4] } as const;
/** Floats per pixel in `data`, laid out as the motes' vertex (gpuParticles.ts): x y z size, r g b glow, life soft palette solid. */
export const CRUMB_STRIDE = 12;

/** Where and how a body was last drawn: its picture, size, facing and colours (spriteRenderer.ts keeps one per creature). */
export interface DrawnBody {
  x: number;
  y: number;
  z: number;
  sprite: Sprite;
  scale: number;
  flip: boolean;
  colours: Uint32Array | null;
}

/**
 * Every pixel of the body's last picture becomes one crumb, 1:1 in size, colour and place. Crumbs hold still a moment,
 * then fall; in the air the wind carries them; they land on the ground or any 3D floor, bounce once and stop at walls,
 * then fade out in a dither. All crumbs live in flat typed arrays (no object per crumb) and are written straight in
 * the motes' vertex layout, so the GPU draws them with the motes in the same call.
 */
export class Crumble {
  /** Vertex data for the GPU, `count` crumbs long. */
  readonly data = new Float32Array(CRUMBLE.max * CRUMB_STRIDE);
  count = 0;
  private readonly vel = new Float32Array(CRUMBLE.max * 3);
  /** Per crumb: seconds before it lets go (> 0), life left once settled, its life, the floor under it, its cell. */
  private readonly hold = new Float32Array(CRUMBLE.max);
  private readonly life = new Float32Array(CRUMBLE.max);
  private readonly max = new Float32Array(CRUMBLE.max);
  private readonly floor = new Float32Array(CRUMBLE.max);
  private readonly cell = new Int32Array(CRUMBLE.max * 2);
  private readonly resting = new Uint8Array(CRUMBLE.max);

  /** Breaks this drawn body into crumbs, seen from (eyeX, eyeY) as it was drawn. */
  spawn(b: DrawnBody, eyeX: number, eyeY: number, tiles: ReadonlyTiles, volume: ReadonlyVolume): void {
    const s = b.sprite;
    const W = s.worldW * b.scale;
    const H = s.worldH * b.scale;
    const size = W / s.w;
    // The billboard's own sideways axis (it faces the eye's position, as gpuSprites draws it).
    const tx = b.x - eyeX;
    const ty = b.y - eyeY;
    const tl = Math.hypot(tx, ty) || 1;
    const rx = -ty / tl;
    const ry = tx / tl;
    for (let j = 0; j < s.h; j++) {
      for (let i = 0; i < s.w; i++) {
        if (this.count >= CRUMBLE.max) return;
        const k = j * s.w + i;
        const c = colourAt(s, k, b.colours);
        if (c < 0) continue;
        const u = (i + 0.5) / s.w;
        const qx = (b.flip ? 1 - u : u) - 0.5;
        const qy = 1 - (j + 0.5) / s.h;
        const n = this.count++;
        const o = n * CRUMB_STRIDE;
        const d = this.data;
        d[o] = b.x + rx * qx * W;
        d[o + 1] = b.y + ry * qx * W;
        d[o + 2] = b.z + qy * H;
        d[o + 3] = size;
        d[o + 4] = (c & 255) / 255;
        d[o + 5] = ((c >> 8) & 255) / 255;
        d[o + 6] = ((c >> 16) & 255) / 255;
        d[o + 7] = 0;
        d[o + 8] = 1;
        d[o + 9] = 0;
        d[o + 10] = 1;
        d[o + 11] = 1;
        // Out from the middle of the body and a little up; the top lets go last, as if it crumbles from the feet.
        const out = (Math.random() - 0.5) * CRUMBLE.spread;
        this.vel[n * 3] = rx * (qx * 1.5 + out) + (Math.random() - 0.5) * 0.3;
        this.vel[n * 3 + 1] = ry * (qx * 1.5 + out) + (Math.random() - 0.5) * 0.3;
        this.vel[n * 3 + 2] = Math.random() * CRUMBLE.hop;
        this.hold[n] = Math.random() * CRUMBLE.hold + qy * CRUMBLE.hold;
        this.max[n] = this.life[n] = CRUMBLE.life[0] + Math.random() * (CRUMBLE.life[1] - CRUMBLE.life[0]);
        this.resting[n] = 0;
        this.settleFloor(n, d[o] ?? 0, d[o + 1] ?? 0, b.z + 0.1, tiles, volume);
      }
    }
  }

  /** Moves every crumb one frame on; `wind` in metres a second. */
  update(dt: number, wind: Vec2, tiles: ReadonlyTiles, volume: ReadonlyVolume): void {
    const d = this.data;
    let w = 0;
    for (let n = 0; n < this.count; n++) {
      if (this.resting[n]) {
        this.life[n] = (this.life[n] ?? 0) - dt;
        if ((this.life[n] ?? 0) <= 0) continue;
      } else if ((this.hold[n] ?? 0) > 0) this.hold[n] = (this.hold[n] ?? 0) - dt;
      else this.fall(n, dt, wind, tiles, volume);
      if (w !== n) this.move(n, w);
      const o = w * CRUMB_STRIDE;
      d[o + 8] = (this.life[w] ?? 0) / (this.max[w] || 1);
      w++;
    }
    this.count = w;
  }

  private fall(n: number, dt: number, wind: Vec2, tiles: ReadonlyTiles, volume: ReadonlyVolume): void {
    const d = this.data;
    const v = this.vel;
    const o = n * CRUMB_STRIDE;
    const g = Math.min(1, CRUMBLE.windGrip * dt);
    let vx = (v[n * 3] ?? 0) + (wind.x - (v[n * 3] ?? 0)) * g;
    let vy = (v[n * 3 + 1] ?? 0) + (wind.y - (v[n * 3 + 1] ?? 0)) * g;
    let vz = (v[n * 3 + 2] ?? 0) - CRUMBLE.gravity * dt;
    const x = (d[o] ?? 0) + vx * dt;
    const y = (d[o + 1] ?? 0) + vy * dt;
    let z = (d[o + 2] ?? 0) + vz * dt;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    // Into a new 1 m cell: a wall there stops it sideways; the floor under it is looked up again.
    if (cx !== this.cell[n * 2] || cy !== this.cell[n * 2 + 1]) {
      if (tiles.blocked(cx, cy) || volume.solidBetween(x, y, z, z + 0.05)) {
        vx *= -0.2;
        vy *= -0.2;
      } else {
        d[o] = x;
        d[o + 1] = y;
        this.settleFloor(n, x, y, z + 0.05, tiles, volume);
      }
    } else {
      d[o] = x;
      d[o + 1] = y;
    }
    const fl = Math.max(this.floor[n] ?? 0, tiles.ground(d[o] ?? 0, d[o + 1] ?? 0));
    if (z <= fl) {
      z = fl;
      vz = -vz * CRUMBLE.bounce;
      vx *= 0.4;
      vy *= 0.4;
      if (vz < CRUMBLE.rest) this.resting[n] = 1;
    }
    d[o + 2] = z;
    v[n * 3] = vx;
    v[n * 3 + 1] = vy;
    v[n * 3 + 2] = vz;
  }

  private settleFloor(n: number, x: number, y: number, z: number, tiles: ReadonlyTiles, volume: ReadonlyVolume): void {
    this.cell[n * 2] = Math.floor(x);
    this.cell[n * 2 + 1] = Math.floor(y);
    this.floor[n] = Math.max(tiles.ground(x, y), volume.floorBelow(x, y, z));
  }

  /** Copies crumb `from` into slot `to` (the list stays packed). */
  private move(from: number, to: number): void {
    this.data.copyWithin(to * CRUMB_STRIDE, from * CRUMB_STRIDE, (from + 1) * CRUMB_STRIDE);
    this.vel.copyWithin(to * 3, from * 3, from * 3 + 3);
    this.cell.copyWithin(to * 2, from * 2, from * 2 + 2);
    this.hold[to] = this.hold[from] ?? 0;
    this.life[to] = this.life[from] ?? 0;
    this.max[to] = this.max[from] ?? 0;
    this.floor[to] = this.floor[from] ?? 0;
    this.resting[to] = this.resting[from] ?? 0;
  }
}

/** The colour (0xAABBGGRR) a body's pixel was drawn in, or -1 where the picture is empty. */
function colourAt(s: Sprite, k: number, colours: Uint32Array | null): number {
  const px = s.px[k] ?? 0;
  if (px >>> 24 < 128) return -1;
  const reg = s.regions?.[k] ?? 0;
  if (!reg || !colours) return px;
  const c = colours[reg] ?? px;
  const sh = (s.shade?.[k] ?? SHADE_ONE) / SHADE_ONE;
  const ch = (shift: number): number => Math.min(255, Math.round(((c >> shift) & 255) * sh));
  return (ch(0) | (ch(8) << 8) | (ch(16) << 16) | 0xff000000) >>> 0;
}
