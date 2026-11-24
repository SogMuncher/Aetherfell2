import type { Entity, ReadonlyTiles, SimState } from '../../types';
import { CONTENT, thingDef } from '../../content';
import { lerp } from '../lighting';
import { sideFrom, type Projection } from '../raycaster/camera';
import { TileBillboards } from '../raycaster/tileBillboards';
import { itemSprite, missingSprite } from './sprites';
import type { Sprite } from './sprites';
import { ArtSprites } from './artSprites';
import { artPaintBudget } from './assembler';

/** Time each frame may spend painting pictures it has not drawn before (creatures first, then trees). */
const PAINT_BUDGET_MS = 4;

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

/**
 * Billboards: trees, rocks and other grown world objects near the eye (render/raycaster/tileBillboards.ts), and every
 * entity — creatures, people, props, items. Gathered each frame for the GPU to draw and light.
 */
export class SpriteRenderer {
  private flora = new TileBillboards();
  private list: Billboard[] = [];
  private pool: Billboard[] = [];
  private art = new ArtSprites();

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

  /** Someone threw an item: their body plays the throw. */
  thrown(id: number): void {
    this.art.thrown(id);
  }

  /** Everything to draw this frame (trees, props, creatures, items) as billboards; the GPU path draws them itself. */
  collect(p: Projection, state: SimState, tiles: ReadonlyTiles, localId: number | null, alpha: number, time: number, hitFlash: Map<number, number>): readonly Billboard[] {
    for (const b of this.list) this.pool.push(b);
    this.list.length = 0;
    // One painting budget for the whole frame, opened before anything picks a picture: opened later,
    // creatures always found it spent and kept one picture per side (no walking, no swings).
    artPaintBudget(PAINT_BUDGET_MS);
    for (const e of state.entities.values()) {
      if (e.id === localId) continue;
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      const z = lerp(e.prevZ, e.z, alpha);
      const dx = x - p.cam.x;
      const dy = y - p.cam.y;
      if (dx * dx + dy * dy > 160 * 160) continue;
      // Creatures, people and props are built from their art recipe: an opened container shows its `…Open` recipe if it has one.
      const def = thingDef(CONTENT, e.def);
      let s: Sprite | null;
      let facing = false;
      let scale = 1;
      let sink = 0;
      let colours: Uint32Array | null = null;
      const artId = def.sprite === null ? undefined : e.container?.opened && CONTENT.art[`${def.sprite}Open`] ? `${def.sprite}Open` : def.sprite;
      const art = artId !== undefined ? CONTENT.art[artId] : undefined;
      if (art && artId !== undefined) {
        const c = this.art.pick(e, artId, art, p, time);
        s = c.sprite;
        scale = c.scale;
        colours = c.colours;
      } else {
        s = this.spriteFor(e);
        // Face the way it moves, as seen from where the camera stands. Items never turn: each has
        // exactly one picture (its edge stays on the left).
        const { rx, ry } = sideFrom(p, e.pos.x, e.pos.y);
        const vr = e.vel.x * rx + e.vel.y * ry;
        facing = !e.item && (Math.abs(vr) > 0.1 ? vr < 0 : Math.cos(e.angle) * rx + Math.sin(e.angle) * ry < 0);
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
    // Flora last: when a dense forest passes the GPU's billboard cap, trees drop out, never creatures or items.
    this.flora.each(tiles, p.cam.x, p.cam.y, p.FX, p.FY, p.RX, p.RY, (t, fade, burning) => {
      this.add(t.x, t.y, t.z, t.sprite, p, false, burning ? 0.3 : 0, 0, t.scale, t.tint, fade, t.colours);
    });
    return this.list;
  }

  /** Loose items (painted from their definitions), or the missing-picture checks for an unknown sprite name. */
  private spriteFor(e: Entity): Sprite | null {
    const name = thingDef(CONTENT, e.def).sprite;
    if (name === null) return null;
    if (name === 'item') return e.item ? itemSprite(e.item.id) : null;
    return missingSprite();
  }
}
