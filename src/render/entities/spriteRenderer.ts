import type { Entity, ReadonlyTiles, SimState } from '../../types';
import { CONTENT, thingDef } from '../../content';
import type { Env, LightMap } from '../lighting';
import { lerp } from '../lighting';
import { sideFrom, type Projection } from '../raycaster/camera';
import type { Viewport } from '../viewport';
import { TileBillboards } from '../raycaster/tileBillboards';
import { itemSprite, missingSprite } from './sprites';
import type { Sprite } from './sprites';
import { CreatureSprites } from './creatures';
import { PropSprites } from './props';
import { SHADE_ONE } from '../palette';

export interface Billboard {
  x: number;
  y: number;
  z: number;
  sprite: Sprite;
  flip: boolean;
  /** Extra tint for burning/hit. */
  heat: number;
  flash: number;
  scale: number;
  depth: number;
  /** Status colour cast (chilled, poisoned), 0..1 per channel; 1,1,1 = none. */
  tr: number;
  tg: number;
  tb: number;
  /** 0..1 opacity, drawn as a dither so distant trees hand over to the far canopy. */
  fade: number;
  /** This one's colours for the picture's colour regions (null: the picture's own colours). */
  colours: Uint32Array | null;
}

/** 4×4 ordered-dither thresholds 0..15. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Billboards: trees, rocks and other grown world objects near the eye (render/raycaster/tileBillboards.ts), and every
 * entity — creatures, people, props, items. Sorted far to near and depth-tested per pixel against
 * the terrain, lit by the same sun, ambient and light grid as the ground.
 */
export class SpriteRenderer {
  private flora = new TileBillboards();
  private list: Billboard[] = [];
  private light = new Float32Array(3);
  private pool: Billboard[] = [];
  private creatures = new CreatureSprites();
  private props = new PropSprites();

  private add(x: number, y: number, z: number, sprite: Sprite, p: Projection, flip = false, heat = 0, flash = 0, scale = 1, tint: { r: number; g: number; b: number } | null = null, fade = 1, colours: Uint32Array | null = null): void {
    const dx = x - p.cam.x;
    const dy = y - p.cam.y;
    const fwd = dx * p.FX + dy * p.FY;
    if (fwd < 0.25) return;
    const right = dx * p.RX + dy * p.RY;
    if (Math.abs(right) > fwd * 2 + 4) return;
    const b = this.pool.pop() ?? { x: 0, y: 0, z: 0, sprite, flip, heat, flash, scale, depth: 0, tr: 1, tg: 1, tb: 1, fade, colours };
    b.fade = fade;
    b.colours = colours;
    b.tr = tint ? 0.4 + (tint.r / 255) * 0.6 : 1;
    b.tg = tint ? 0.4 + (tint.g / 255) * 0.6 : 1;
    b.tb = tint ? 0.4 + (tint.b / 255) * 0.6 : 1;
    b.x = x;
    b.y = y;
    b.z = z;
    b.sprite = sprite;
    b.flip = flip;
    b.heat = heat;
    b.flash = flash;
    b.scale = scale;
    b.depth = fwd;
    this.list.push(b);
  }

  draw(vp: Viewport, p: Projection, env: Env, lm: LightMap, state: SimState, tiles: ReadonlyTiles, localId: number | null, alpha: number, time: number, hitFlash: Map<number, number>): void {
    this.collect(p, state, tiles, localId, alpha, time, hitFlash);
    this.list.sort((a, c) => c.depth - a.depth);
    for (const bb of this.list) this.blit(vp, p, env, lm, bb);
  }

  /** Everything to draw this frame (trees, props, creatures, items) as billboards; the GPU path draws them itself. */
  collect(p: Projection, state: SimState, tiles: ReadonlyTiles, localId: number | null, alpha: number, time: number, hitFlash: Map<number, number>): readonly Billboard[] {
    for (const b of this.list) this.pool.push(b);
    this.list.length = 0;
    this.flora.each(tiles, p.cam.x, p.cam.y, p.FX, p.FY, p.RX, p.RY, (t, fade, burning) => {
      this.add(t.x, t.y, t.z, t.sprite, p, false, burning ? 0.3 : 0, 0, t.scale, t.tint, fade, t.colours);
    });
    for (const e of state.entities.values()) {
      if (e.id === localId) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      const z = lerp(e.prevZ, e.z, alpha);
      const dx = x - p.cam.x;
      const dy = y - p.cam.y;
      if (dx * dx + dy * dy > 160 * 160) continue;
      // Creatures with a look are built from their parts and drawn from the side the camera sees.
      const def = thingDef(CONTENT, e.def);
      const look = def.sprite !== null ? CONTENT.looks[def.sprite] : undefined;
      let s: Sprite | null;
      let facing = false;
      let scale = 1;
      let sink = 0;
      let colours: Uint32Array | null = null;
      // Props grow from forms (content/props.ts): an opened container shows its `…Open` form if it has one.
      const formId = def.sprite === null ? undefined : e.container?.opened && CONTENT.forms[`${def.sprite}Open`] ? `${def.sprite}Open` : def.sprite;
      const form = formId !== undefined ? CONTENT.forms[formId] : undefined;
      if (look && def.sprite !== null) {
        const c = this.creatures.pick(e, def.sprite, look, p, time);
        s = c.sprite;
        scale = c.scale;
        colours = c.colours;
      } else if (form && formId !== undefined) {
        const c = this.props.pick(e, formId, form, p, time);
        s = c.sprite;
        colours = c.colours;
      } else {
        s = this.spriteFor(e);
        // Face the way it moves, as seen from where the camera stands.
        const { rx, ry } = sideFrom(p, e.pos.x, e.pos.y);
        const vr = e.vel.x * rx + e.vel.y * ry;
        facing = Math.abs(vr) > 0.1 ? vr < 0 : Math.cos(e.angle) * rx + Math.sin(e.angle) * ry < 0;
        if (e.player && e.player.downed > 0) sink = 0.6;
      }
      if (!s) continue;
      const flash = hitFlash.get(e.id) ?? 0;
      // Glowing statuses (burning) make the sprite glow; the others tint it.
      let tint: { r: number; g: number; b: number } | null = null;
      let glow = 0;
      for (const id in e.status) {
        const st = CONTENT.statuses[id];
        if (!st || !((e.status[id] ?? 0) > 0)) continue;
        if (st.light) glow = 0.4;
        else if (st.tint) tint = st.tint;
      }
      this.add(x, y, z - sink, s, p, facing, glow, flash, scale, tint, 1, colours);
    }
    return this.list;
  }

  /** Loose items (painted from their definitions), or the missing-picture checks for an unknown sprite name. */
  private spriteFor(e: Entity): Sprite | null {
    const name = thingDef(CONTENT, e.def).sprite;
    if (name === null) return null;
    if (name === 'item') return e.item ? itemSprite(e.item.id) : null;
    return missingSprite();
  }

  private blit(vp: Viewport, p: Projection, env: Env, lm: LightMap, bb: Billboard): void {
    const { W, H, F, HOR } = p;
    const s = bb.sprite;
    const fwd = bb.depth;
    const right = (bb.x - p.cam.x) * p.RX + (bb.y - p.cam.y) * p.RY;
    const scale = F / fwd;
    const ww = s.worldW * bb.scale * scale;
    const hh = s.worldH * bb.scale * scale;
    if (ww < 0.6 || hh < 0.6) return;
    const cx = W * 0.5 + right * scale + p.cam.shakeX;
    const by = HOR - (bb.z - p.cam.z) * scale;
    const x0 = Math.floor(cx - ww / 2);
    const y0 = Math.floor(by - hh);
    const x1 = Math.min(W, Math.ceil(cx + ww / 2));
    const y1 = Math.min(H, Math.ceil(by));
    if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) return;
    lm.sample(bb.x, bb.y, this.light);
    const sunK = 0.25 + Math.max(0, env.lz) * 0.55;
    let lr = env.ambR + env.sunR * sunK + (this.light[0] ?? 0) + bb.heat;
    let lg = env.ambG + env.sunG * sunK + (this.light[1] ?? 0) + bb.heat * 0.45;
    let lb = env.ambB + env.sunB * sunK + (this.light[2] ?? 0) + bb.heat * 0.1;
    if (bb.flash > 0) {
      lr += bb.flash * 2;
      lg += bb.flash * 0.4;
      lb += bb.flash * 0.4;
    }
    const fog = Math.min(0.97, 1 - Math.exp(-fwd / env.fogDist));
    const fr = env.fog[0] * fog;
    const fg = env.fog[1] * fog;
    const fb = env.fog[2] * fog;
    const kr = lr * (1 - fog) * bb.tr;
    const kg = lg * (1 - fog) * bb.tg;
    const kb = lb * (1 - fog) * bb.tb;
    const px = vp.pixels;
    const depth = vp.depth;
    const sw = s.w;
    const sh = s.h;
    const invW = sw / ww;
    const invH = sh / hh;
    // Fading sprites skip a growing share of pixels in a fixed 4×4 pattern (a retro dissolve).
    const fadeCut = bb.fade >= 1 ? 16 : Math.round(bb.fade * 16);
    if (fadeCut <= 0) return;
    // Colour regions are filled from this one's own colours, at the brightness the picture painted.
    const regs = bb.colours ? s.regions : undefined;
    const shade = s.shade;
    const pal = bb.colours;
    for (let x = Math.max(0, x0); x < x1; x++) {
      let u = Math.floor((x - (cx - ww / 2)) * invW);
      if (u < 0 || u >= sw) continue;
      if (bb.flip) u = sw - 1 - u;
      for (let y = Math.max(0, y0); y < y1; y++) {
        const o = y * W + x;
        if (fadeCut < 16 && (BAYER4[((y & 3) << 2) | (x & 3)] ?? 0) >= fadeCut) continue;
        if ((depth[o] ?? 0) <= fwd) continue;
        const v = Math.floor((y - (by - hh)) * invH);
        if (v < 0 || v >= sh) continue;
        const si = v * sw + u;
        let c = s.px[si] ?? 0;
        if (c >>> 24 === 0) continue;
        let k = 1;
        if (regs && pal && shade) {
          const reg = regs[si] ?? 0;
          if (reg) {
            c = pal[reg] ?? c;
            k = (shade[si] ?? SHADE_ONE) / SHADE_ONE;
          }
        }
        const r = (c & 255) * k * kr + fr;
        const g = ((c >>> 8) & 255) * k * kg + fg;
        const b = ((c >>> 16) & 255) * k * kb + fb;
        px[o] = (0xff000000 | ((b > 255 ? 255 : b) << 16) | ((g > 255 ? 255 : g) << 8) | (r > 255 ? 255 : r)) >>> 0;
        depth[o] = fwd;
      }
    }
  }
}
