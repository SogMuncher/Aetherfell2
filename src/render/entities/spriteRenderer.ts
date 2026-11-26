import type { Entity, ReadonlyTiles, SimState, ThingDef } from '../../types';
import { CONTENT, thingDef } from '../../content';
import { lerp, poseBetween } from '../lighting';
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
  /** Turn so far of each spinning fitting (a propeller) and when it was last drawn. */
  private spins = new Map<number, { turn: number; at: number }>();
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
  collect(p: Projection, state: SimState, tiles: ReadonlyTiles, localId: number | null, alphaOf: (e: Entity) => number, time: number, hitFlash: Map<number, number>): readonly Billboard[] {
    for (const b of this.list) this.pool.push(b);
    this.list.length = 0;
    // One painting budget for the whole frame, opened before anything picks a picture: opened later,
    // creatures always found it spent and kept one picture per side (no walking, no swings).
    artPaintBudget(PAINT_BUDGET_MS);
    for (const e of state.entities.values()) {
      if (e.id === localId) continue;
      const alpha = alphaOf(e);
      const x = lerp(e.prev.x, e.pos.x, alpha);
      const y = lerp(e.prev.y, e.pos.y, alpha);
      const z = lerp(e.prevZ, e.z, alpha);
      const dx = x - p.cam.x;
      const dy = y - p.cam.y;
      if (dx * dx + dy * dy > 160 * 160) continue;
      // Creatures, people and props are built from their art recipe: an opened container shows its `…Open` recipe if it has one.
      const def = thingDef(CONTENT, e.def);
      // A chain or rope ladder hangs from its tie aboard a craft, drawn where the craft is drawn (even with no picture of its own).
      const tie = e.tether ? tieBetween(state, e.tether, alphaOf) : undefined;
      if (tie) this.chain(tie, x, y, z, p, def.links);
      let s: Sprite | null;
      let facing = false;
      let scale = 1;
      let sink = 0;
      let colours: Uint32Array | null = null;
      const artId = def.sprite === null ? undefined : stateArt(def, e, def.sprite, this.spun(state, e, def, time));
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

  /** A chain from its tie aboard down to the ring of the thing at (x, y, z): links every 0.15 m, sagging a little when slack. */
  private chain(top: { x: number; y: number; z: number }, x: number, y: number, z: number, p: Projection, look?: { art: string; every: number }): void {
    const link = this.art.still(look?.art ?? 'chainLink');
    if (!link) return;
    const bz = z + 0.5;
    const len = Math.hypot(x - top.x, y - top.y, bz - top.z);
    const n = Math.min(400, Math.ceil(len / (look?.every ?? 0.15)));
    const sag = Math.min(1.5, Math.hypot(x - top.x, y - top.y) * 0.04);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.add(top.x + (x - top.x) * t, top.y + (y - top.y) * t, top.z + (bz - top.z) * t - sag * 4 * t * (1 - t) - 0.08, link.sprite, p, false, 0, 0, 1, null, 1, link.colours);
    }
  }

  /** A spinning fitting's turn so far (frames), run on by the speed of the craft it is fitted to since the last picture. */
  private spun(state: SimState, e: Entity, def: ThingDef, time: number): number {
    if (!def.spin) return 0;
    const c = e.ride ? state.entities.get(e.ride.craft)?.craft : undefined;
    const s = this.spins.get(e.id) ?? { turn: 0, at: time };
    s.turn += Math.hypot(c?.vel.x ?? 0, c?.vel.y ?? 0) * def.spin.turn * Math.max(0, Math.min(0.25, time - s.at));
    s.at = time;
    this.spins.set(e.id, s);
    return Math.floor(s.turn);
  }

  /** Loose items (painted from their definitions), or the missing-picture checks for an unknown sprite name. */
  private spriteFor(e: Entity): Sprite | null {
    const name = thingDef(CONTENT, e.def).sprite;
    if (name === null) return null;
    if (name === 'item') return e.item ? itemSprite(e.item.id) : null;
    return missingSprite();
  }
}

/** A tether's tie in the world between two ticks, turned and moved with the craft it is made fast to. */
function tieBetween(state: SimState, t: NonNullable<Entity['tether']>, alphaOf: (e: Entity) => number): { x: number; y: number; z: number } | undefined {
  const c = state.entities.get(t.craft);
  const cd = c ? thingDef(CONTENT, c.def).craft : undefined;
  if (!c || !cd) return t.top;
  const at = poseBetween(c, alphaOf(c));
  const dx = t.x - cd.pivot[0];
  const dy = t.y - cd.pivot[1];
  return { x: at.x + dx * Math.cos(at.yaw) - dy * Math.sin(at.yaw), y: at.y + dx * Math.sin(at.yaw) + dy * Math.cos(at.yaw), z: at.z + t.z };
}

/** The picture that shows a thing's state: an opened container's `…Open`, a station's gauge frame `<sprite>N`, a spinning fitting's frame. */
function stateArt(def: ThingDef, e: Entity, sprite: string, spun: number): string {
  if (def.spin) {
    const id = `${sprite}${spun % def.spin.frames}`;
    if (CONTENT.art[id]) return id;
  }
  const st = def.station;
  if (st?.gauge && e.control) {
    const f = st.feed ? e.control.v / st.feed.max : (e.control.v + 1) / 2;
    const id = `${sprite}${Math.round(Math.max(0, Math.min(1, f)) * (st.gauge - 1))}`;
    if (CONTENT.art[id]) return id;
  }
  return e.container?.opened && CONTENT.art[`${sprite}Open`] ? `${sprite}Open` : sprite;
}
