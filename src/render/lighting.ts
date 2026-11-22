import type { ReadonlyTiles, SimState } from '../types';
import { unpackKey, unpackSpot } from '../types';
import type { LightDef } from '../types';
import { CONTENT, heldLight, thingDef, spellFor } from '../content';

export { computeEnv } from './env';
export type { Env } from './env';

/** One light in the world this frame (a torch, a flame, a spell, a lamp): the one list every renderer lights from. */
export interface PointLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
  radius: number;
  shadow: boolean;
}

export const LM_SIZE = 96;

/**
 * Gathers every light near the camera from shared data: a thing's `light`, a bolt's spell light, what an actor holds,
 * the realm's carried lamp, and anything burning (the `fire` matter state's `light`, on ground, cells and bodies).
 * `lights` is that list (the GPU lights each pixel from it). It is also splatted into a 1 m grid (`grid`) that lights the held item.
 */
export class LightMap {
  readonly r = new Float32Array(LM_SIZE * LM_SIZE);
  readonly g = new Float32Array(LM_SIZE * LM_SIZE);
  readonly b = new Float32Array(LM_SIZE * LM_SIZE);
  ox = 0;
  oy = 0;
  readonly lights: PointLight[] = [];

  build(state: SimState, tiles: ReadonlyTiles, camX: number, camY: number, time: number, alpha: number, grid = true): void {
    this.ox = Math.floor(camX) - LM_SIZE / 2;
    this.oy = Math.floor(camY) - LM_SIZE / 2;
    const lights = this.lights;
    lights.length = 0;
    const fire = CONTENT.matterStates.fire.light;
    const near = (x: number, y: number, pad: number): boolean => Math.abs(x - camX) <= LM_SIZE / 2 + pad && Math.abs(y - camY) <= LM_SIZE / 2 + pad;
    const add = (L: LightDef, k: number, x: number, y: number, z: number, seed: number, shadow: boolean): void => {
      const fl = k * (1 - L.flicker * 0.5 + Math.sin(time * 17 + seed * 3.1) * L.flicker * 0.25 + Math.sin(time * 29 + seed) * L.flicker * 0.25);
      lights.push({ x, y, z, r: L.r * fl, g: L.g * fl, b: L.b * fl, radius: L.radius, shadow });
    };
    for (const e of state.entities.values()) {
      const d = thingDef(CONTENT, e.def);
      // A thing's own light, a bolt's, or the light of what an actor holds in its hand.
      const held = e.projectile || d.light ? undefined : heldLight(CONTENT, e);
      const L = e.projectile ? spellFor(CONTENT, e.projectile.spell)?.light : d.light ?? held;
      const burning = (e.status.burning ?? 0) > 0;
      if (!L && !(burning && fire)) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      if (!near(x, y, 10)) continue;
      if (L) add(L, 1, x, y, e.z + 1, e.id, !!d.body.anchored || !!held);
      else if (fire) add(fire, 1, x, y, e.z + 1, e.id, false);
    }
    // Where the sky is rock, every traveller carries a lamp.
    const glow = CONTENT.realms[state.realm]?.glow;
    if (glow) {
      for (const pid of Object.values(state.players)) {
        const e = state.entities.get(pid);
        if (e) add(glow, 1, lerp(e.prev.x, e.pos.x, alpha), lerp(e.prev.y, e.pos.y, alpha), e.z + 1.4, e.id, true);
      }
    }
    let n = 0;
    if (fire) {
      for (const key of state.burning) {
        if (n > 400) break;
        const { x, y } = unpackKey(key);
        if (!near(x, y, 6)) continue;
        add(fire, tiles.fire(x, y) / 255, x + 0.5, y + 0.5, tiles.ground(x + 0.5, y + 0.5) + 1, x * 1.7 + y * 2.3, false);
        n++;
      }
      // Fire in the walls, floors and roofs of the 3D layer lights the room like any other fire.
      for (const key of state.volume.burningCells) {
        if (n > 400) break;
        const { x, y, z } = unpackSpot(key);
        if (!near(x, y, 6)) continue;
        add(fire, state.volume.cellGet('fire', x, y, z) / 255, x + 0.5, y + 0.5, z + 1, x * 1.7 + y * 2.3 + z, false);
        n++;
      }
    }
    if (!grid) return;
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    for (const l of lights) this.splat(l, tiles);
  }

  private splat(l: PointLight, tiles: ReadonlyTiles): void {
    const R = Math.ceil(l.radius);
    const cx = Math.floor(l.x);
    const cy = Math.floor(l.y);
    for (let j = -R; j <= R; j++) {
      const gy = cy + j - this.oy;
      if (gy < 0 || gy >= LM_SIZE) continue;
      for (let i = -R; i <= R; i++) {
        const gx = cx + i - this.ox;
        if (gx < 0 || gx >= LM_SIZE) continue;
        const dx = cx + i + 0.5 - l.x;
        const dy = cy + j + 0.5 - l.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > l.radius) continue;
        if (l.shadow && d > 1.5 && !this.visible(tiles, l.x, l.y, cx + i + 0.5, cy + j + 0.5)) continue;
        const f = 1 - d / l.radius;
        const k = f * f;
        const idx = gy * LM_SIZE + gx;
        this.r[idx] = (this.r[idx] ?? 0) + l.r * k;
        this.g[idx] = (this.g[idx] ?? 0) + l.g * k;
        this.b[idx] = (this.b[idx] ?? 0) + l.b * k;
      }
    }
  }

  private visible(tiles: ReadonlyTiles, x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.5);
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      if (Math.floor(x) === Math.floor(x1) && Math.floor(y) === Math.floor(y1)) return true;
      const inf = tiles.info(x, y);
      if (inf.shape === 'block' || (inf.shape === 'door' && tiles.door(x, y) < 128)) return false;
    }
    return true;
  }

  /** Bilinear light at a world point; writes into out[0..2]. */
  sample(x: number, y: number, out: Float32Array): void {
    const fx = x - this.ox - 0.5;
    const fy = y - this.oy - 0.5;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= LM_SIZE - 1 || iy >= LM_SIZE - 1) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
      return;
    }
    const tx = fx - ix;
    const ty = fy - iy;
    const i = iy * LM_SIZE + ix;
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    const R = this.r;
    const G = this.g;
    const B = this.b;
    out[0] = (R[i] ?? 0) * w00 + (R[i + 1] ?? 0) * w10 + (R[i + LM_SIZE] ?? 0) * w01 + (R[i + LM_SIZE + 1] ?? 0) * w11;
    out[1] = (G[i] ?? 0) * w00 + (G[i + 1] ?? 0) * w10 + (G[i + LM_SIZE] ?? 0) * w01 + (G[i + LM_SIZE + 1] ?? 0) * w11;
    out[2] = (B[i] ?? 0) * w00 + (B[i + 1] ?? 0) * w10 + (B[i + LM_SIZE] ?? 0) * w01 + (B[i + LM_SIZE + 1] ?? 0) * w11;
  }
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
