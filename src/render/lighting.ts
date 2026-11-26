import type { Entity, ReadonlyTiles, SimState } from '../types';
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

/** Lights are gathered this far around the eye (m, square); `WALL` = how high walls stand over the ground. */
export const LM_SIZE = 96;
const WALL = 4;

/**
 * Gathers every light near the camera from shared data: a thing's `light`, a bolt's spell light, what an actor holds,
 * the realm's carried lamp, and anything burning (the `fire` matter state's `light`, on ground, cells and bodies).
 * `lights` is that list (the GPU lights each pixel from it); `sample` lights the held item from it.
 */
export class LightMap {
  readonly lights: PointLight[] = [];
  private tiles: ReadonlyTiles | null = null;

  /** `alphaOf` = how far between its last two ticks each thing is drawn (lights stay with their sprites). */
  build(state: SimState, tiles: ReadonlyTiles, camX: number, camY: number, time: number, alphaOf: (e: Entity) => number): void {
    this.tiles = tiles;
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
      const alpha = alphaOf(e);
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      if (!near(x, y, 10)) continue;
      // Between ticks like its sprite, so a lamp on a climbing ship stays where it is drawn.
      const z = lerp(e.prevZ, e.z, alpha);
      if (L) add(L, 1, x, y, z + (L.at ?? 1), e.id, !!d.body.anchored || !!held);
      else if (fire) add(fire, 1, x, y, z + 1, e.id, false);
    }
    // Where the sky is rock, every traveller carries a lamp.
    const glow = CONTENT.realms[state.realm]?.glow;
    if (glow) {
      for (const pid of Object.values(state.players)) {
        const e = state.entities.get(pid);
        if (e) add(glow, 1, lerp(e.prev.x, e.pos.x, alphaOf(e)), lerp(e.prev.y, e.pos.y, alphaOf(e)), e.z + 1.4, e.id, true);
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
        const at = state.volume.placeOf(x, y, z);
        if (!near(at.x - 0.5, at.y - 0.5, 6)) continue;
        add(fire, state.volume.cellGet('fire', x, y, z) / 255, at.x, at.y, at.z + 0.5, x * 1.7 + y * 2.3 + z, false);
        n++;
      }
    }
  }

  /**
   * Light at a world point from every light in reach (the held item): nearer is brighter, and a light that casts
   * shadows is hidden by walls only where both stand down among them, never across the open air (an airship's lamps).
   */
  sample(x: number, y: number, z: number, out: Float32Array): void {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    const tiles = this.tiles;
    for (const l of this.lights) {
      const d = Math.hypot(l.x - x, l.y - y, l.z - z);
      if (d > l.radius) continue;
      if (tiles && l.shadow && d > 1.5 && l.z - tiles.ground(l.x, l.y) < WALL && z - tiles.ground(x, y) < WALL && !visible(tiles, l.x, l.y, x, y)) continue;
      const f = 1 - d / l.radius;
      out[0] += l.r * f * f;
      out[1] += l.g * f * f;
      out[2] += l.b * f * f;
    }
  }
}

/** Is the straight line between two spots on the ground free of walls and shut doors? */
function visible(tiles: ReadonlyTiles, x0: number, y0: number, x1: number, y1: number): boolean {
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

/** Where a thing is drawn between two ticks: its place and, for a craft, its heading. */
export function poseBetween(e: Entity, a: number): { x: number; y: number; z: number; yaw: number } {
  const from = e.craft ? e.craft.prevYaw : e.angle;
  const turn = Math.atan2(Math.sin(e.angle - from), Math.cos(e.angle - from));
  return { x: lerp(e.prev.x, e.pos.x, a), y: lerp(e.prev.y, e.pos.y, a), z: lerp(e.prevZ, e.z, a), yaw: from + turn * a };
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
