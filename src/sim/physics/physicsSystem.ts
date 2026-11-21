import type { Burst, Entity, ReadonlyTiles, ReadonlyVolume, SimContext, SimSystem, ThingDef, TileInfo } from '../../types';
import { thingDef } from '../../content';

const GRAVITY = 22;
const MAX_STEP = 0.55;
/** Knockback left after each tick (it fades in about a third of a second). */
const KB_FADE = 0.8;

function blockedAt(tiles: ReadonlyTiles, x: number, y: number, r: number): boolean {
  return tiles.blocked(x - r, y - r) || tiles.blocked(x + r, y - r) || tiles.blocked(x - r, y + r) || tiles.blocked(x + r, y + r);
}

/**
 * Top of whatever solid thing stands at this point (a tree, rock or wall), or -Infinity where
 * nothing blocks. Things with no height set block at any height.
 */
function solidTop(tiles: ReadonlyTiles, x: number, y: number): number {
  if (!tiles.blocked(x, y)) return -Infinity;
  const h = tiles.info(x, y).height;
  return h > 0 ? tiles.ground(x, y) + h : Infinity;
}

/** Highest solid top under a body's footprint. */
function topAt(tiles: ReadonlyTiles, x: number, y: number, r: number): number {
  return Math.max(solidTop(tiles, x - r, y - r), solidTop(tiles, x + r, y - r), solidTop(tiles, x - r, y + r), solidTop(tiles, x + r, y + r));
}

/** A solid surface resting at water level (ice): you walk on it instead of wading. */
function standsOnWater(info: TileInfo): boolean {
  return info.level && !info.liquid;
}

/** Ground you rest on here: terrain, ice, or the water surface (you wade and swim instead of sinking). */
function floorAt(tiles: ReadonlyTiles, e: Entity, d: ThingDef): number {
  const g = tiles.ground(e.pos.x, e.pos.y);
  // The surface of the water here: sea level, or the height of the river or lake (a bridge or ice rests on it too).
  const lvl = tiles.waterLevel(e.pos.x, e.pos.y);
  if (g >= lvl) return g;
  if (standsOnWater(tiles.info(e.pos.x, e.pos.y))) return lvl;
  // Bodies float with their head above water; small things bob on the surface.
  const float = d.actor ? -Math.min(1.1, d.body.height * 0.62) : -0.1;
  return Math.max(g, lvl + float);
}

/** Highest floor of the 3D layer under a body's footprint that it can reach (at or below its feet plus a step). */
function volumeFloor(vol: ReadonlyVolume, x: number, y: number, r: number, zMax: number): number {
  if (vol.bricks.size === 0) return -Infinity;
  return Math.max(vol.floorBelow(x, y, zMax), vol.floorBelow(x - r, y - r, zMax), vol.floorBelow(x + r, y - r, zMax), vol.floorBelow(x - r, y + r, zMax), vol.floorBelow(x + r, y + r, zMax));
}

/** Is a body at (x, y) with its feet at `z0` and head at `z1` inside something solid in the 3D layer? */
function volumeBlocked(vol: ReadonlyVolume, x: number, y: number, r: number, z0: number, z1: number): boolean {
  if (vol.bricks.size === 0) return false;
  return vol.solidBetween(x - r, y - r, z0, z1) || vol.solidBetween(x + r, y - r, z0, z1) || vol.solidBetween(x - r, y + r, z0, z1) || vol.solidBetween(x + r, y + r, z0, z1);
}

/** Floor under a body: the ground, the top of a tree, rock or wall, or a floor, stair or roof of the 3D layer. */
function floorUnder(tiles: ReadonlyTiles, vol: ReadonlyVolume, e: Entity, d: ThingDef): number {
  const base = floorAt(tiles, e, d);
  const top = topAt(tiles, e.pos.x, e.pos.y, d.body.radius);
  const ground = top > base && top <= e.z + MAX_STEP ? top : base;
  const up = volumeFloor(vol, e.pos.x, e.pos.y, d.body.radius * 0.8, e.z + MAX_STEP);
  return up > ground ? up : ground;
}

/** What happens when this flies into something: its own onImpact, or a thrown item's burst. */
function impactOf(ctx: SimContext, e: Entity, d: ThingDef): (Burst & { minSpeed: number; shatter: boolean }) | null {
  if (d.onImpact) return d.onImpact;
  if (e.item && e.thrownBy !== null) {
    const t = ctx.content.items[e.item.id]?.thrown;
    if (t) return { radius: t.radius, effects: t.effects, minSpeed: 3, shatter: true };
  }
  return null;
}

/**
 * Moves everything: gravity, ground, ice and water, tile collisions with sliding, steep-slope
 * blocking, pushing solid bodies apart, carried objects, and thrown things that hurt what they hit
 * or burst on impact.
 */
export const physicsSystem: SimSystem = (ctx: SimContext) => {
  const { state, tiles, dt, content } = ctx;
  const vol = state.volume;
  // Bodies far from every player sleep: their ground may not even be loaded, and asking for it would regrow it every tick.
  const watchers: Entity[] = [];
  for (const id of Object.values(state.players)) {
    const p = state.entities.get(id);
    if (p && !p.dead) watchers.push(p);
  }
  const awake2 = content.rules.awake * content.rules.awake;
  for (const e of state.entities.values()) {
    if (e.dead) continue;
    if (watchers.length > 0 && !watchers.some((p) => (p.pos.x - e.pos.x) ** 2 + (p.pos.y - e.pos.y) ** 2 < awake2)) continue;
    const d = thingDef(content, e.def);
    if (e.heldBy !== null) {
      const h = state.entities.get(e.heldBy);
      if (!h || h.dead) {
        e.heldBy = null;
      } else {
        const hr = thingDef(content, h.def).body.radius;
        const tx = h.pos.x + Math.cos(h.angle) * (hr + d.body.radius + 0.35);
        const ty = h.pos.y + Math.sin(h.angle) * (hr + d.body.radius + 0.35);
        if (!blockedAt(tiles, tx, ty, d.body.radius * 0.8)) {
          e.pos.x = tx;
          e.pos.y = ty;
        }
        e.z = h.z + 0.9;
        e.vz = 0;
        e.vel.x = h.vel.x;
        e.vel.y = h.vel.y;
        continue;
      }
    }
    if (d.body.ghost) {
      // Light things drift freely; their own systems decide when they land.
      e.pos.x += e.vel.x * dt;
      e.pos.y += e.vel.y * dt;
      e.z += e.vz * dt;
      continue;
    }
    // Hitstop: held in mid-air for a moment, knockback and all.
    if ((e.freeze ?? 0) > 0) continue;
    if (d.body.anchored && e.vel.x === 0 && e.vel.y === 0 && e.vz === 0) continue;

    const impact = impactOf(ctx, e, d);
    const speed0 = Math.hypot(e.vel.x, e.vel.y, e.vz);
    let struck = false;

    const floor0 = floorUnder(tiles, vol, e, d);
    const onGround0 = e.z <= floor0 + 0.05;
    const r = d.body.radius;
    // Solid things only block below their top; walkers and gliders can step up a little onto them.
    const clear = e.z + (e.actor ? MAX_STEP : 0.05);
    // Horizontal movement with sliding along walls.
    // Knockback rides on top of the body's own velocity.
    const kx = e.kb?.x ?? 0;
    const ky = e.kb?.y ?? 0;
    const nx = e.pos.x + (e.vel.x + kx) * dt;
    if (!(topAt(tiles, nx, e.pos.y, r) > clear) && !volumeBlocked(vol, nx, e.pos.y, r * 0.8, clear, e.z + d.body.height) && !(onGround0 && e.actor && tiles.ground(nx, e.pos.y) - floor0 > MAX_STEP)) {
      e.pos.x = nx;
    } else {
      struck = bounce(ctx, e, d, 'x') || struck;
    }
    const ny = e.pos.y + (e.vel.y + ky) * dt;
    if (!(topAt(tiles, e.pos.x, ny, r) > clear) && !volumeBlocked(vol, e.pos.x, ny, r * 0.8, clear, e.z + d.body.height) && !(onGround0 && e.actor && tiles.ground(e.pos.x, ny) - floor0 > MAX_STEP)) {
      e.pos.y = ny;
    } else {
      struck = bounce(ctx, e, d, 'y') || struck;
    }

    if (e.kb) {
      e.kb.x *= KB_FADE;
      e.kb.y *= KB_FADE;
      if (Math.abs(e.kb.x) + Math.abs(e.kb.y) < 0.2) delete e.kb;
    }

    // Vertical. Gliders sink slowly; the player system sets their fall speed.
    const floor = floorUnder(tiles, vol, e, d);
    // Gliders and flyers (a debug cheat) steer their own climb and fall.
    if (!e.player?.gliding && !e.player?.cheats?.fly) e.vz -= GRAVITY * dt;
    e.z += e.vz * dt;
    if (e.vz > 0 && vol.bricks.size > 0) {
      // Heads bump on ceilings, rafters and the undersides of floors above.
      const rr = r * 0.8;
      const from = e.z + 0.3;
      const roof = Math.min(vol.ceilingAbove(e.pos.x, e.pos.y, from), vol.ceilingAbove(e.pos.x - rr, e.pos.y - rr, from), vol.ceilingAbove(e.pos.x + rr, e.pos.y - rr, from), vol.ceilingAbove(e.pos.x - rr, e.pos.y + rr, from), vol.ceilingAbove(e.pos.x + rr, e.pos.y + rr, from));
      if (e.z + d.body.height > roof) {
        e.z = roof - d.body.height - 0.01;
        e.vz = 0;
      }
    }
    if (e.z <= floor) {
      if (e.vz < -7) {
        ctx.emit({ type: 'land', entity: e.id, speed: -e.vz });
        if (!e.actor && d.body.mass >= 1) ctx.emit({ type: 'impact', entity: e.id, x: e.pos.x, y: e.pos.y, strength: Math.min(1, (-e.vz * d.body.mass) / 300) });
        if (e.actor && e.vz < -14) hurt(ctx, e.id, e.id, Math.round((-e.vz - 14) * 4), 'fall');
      }
      if (e.vz < -3 && tiles.ground(e.pos.x, e.pos.y) < tiles.waterLevel(e.pos.x, e.pos.y) && floor < tiles.waterLevel(e.pos.x, e.pos.y) && !standsOnWater(tiles.info(e.pos.x, e.pos.y))) {
        ctx.emit({ type: 'splash', x: e.pos.x, y: e.pos.y, size: Math.min(1, d.body.mass / 60) });
      }
      if (e.vz < -3 && e.thrownBy !== null) struck = true;
      e.z = floor;
      e.vz = 0;
      if (!e.actor) {
        // Things slide a long way on slick ground (ice).
        const f = Math.pow(tiles.info(e.pos.x, e.pos.y).slide ?? 0.02, dt);
        e.vel.x *= f;
        e.vel.y *= f;
        if (Math.abs(e.vel.x) + Math.abs(e.vel.y) < 0.05) {
          e.vel.x = 0;
          e.vel.y = 0;
          e.thrownBy = null;
        }
      }
    }
    if (e.actor) e.actor.onGround = e.z <= floor + 0.05;

    // In water: soaked, fire out.
    const surf = tiles.waterLevel(e.pos.x, e.pos.y);
    if (tiles.ground(e.pos.x, e.pos.y) < surf - 0.3 && e.z < surf + 0.2 && !standsOnWater(tiles.info(e.pos.x, e.pos.y)) && state.tick % 5 === 0) {
      state.queues.effects.push({ target: { kind: 'entity', id: e.id }, effects: [{ type: 'soak', amount: 1 }], source: null, from: null });
    }

    // Fast-moving loose objects hurt what they hit.
    if (!e.actor && d.body.mass >= 0.4) {
      const speed = Math.hypot(e.vel.x, e.vel.y);
      if (speed > 5) {
        for (const o of ctx.query.near(e.pos.x, e.pos.y, r + 0.6)) {
          if (o === e || !o.actor || o.id === e.heldBy || o.id === e.thrownBy) continue;
          const od = thingDef(content, o.def);
          if (Math.abs(o.z + od.body.height * 0.5 - e.z) > od.body.height) continue;
          const dmg = Math.min(40, Math.round(d.body.mass * speed * 0.06));
          const by = e.thrownBy ?? e.id;
          if (dmg > 0) {
            state.queues.effects.push({
              target: { kind: 'entity', id: o.id },
              effects: [{ type: 'damage', amount: dmg, kind: 'blunt' }, { type: 'push', force: speed * 0.3 }],
              source: by,
              from: { x: e.pos.x - e.vel.x, y: e.pos.y - e.vel.y },
            });
          }
          ctx.emit({ type: 'impact', entity: e.id, x: e.pos.x, y: e.pos.y, strength: Math.min(1, dmg / 30 + 0.2) });
          if (d.health) hurt(ctx, e.id, o.id, Math.round(dmg * 0.6), 'blunt');
          e.vel.x *= -0.2;
          e.vel.y *= -0.2;
          struck = true;
          break;
        }
      }
    }

    if (struck && impact && speed0 >= impact.minSpeed) {
      if (impact.effects.length) {
        state.queues.effects.push({
          target: { kind: 'area', x: e.pos.x, y: e.pos.y, z: e.z, radius: impact.radius },
          effects: impact.effects,
          source: e.thrownBy ?? e.id,
          from: { x: e.pos.x, y: e.pos.y },
          exclude: e.id,
        });
      }
      if (impact.shatter) {
        ctx.emit({ type: 'shatter', entity: e.id, x: e.pos.x, y: e.pos.y });
        if (d.health) hurt(ctx, e.id, e.thrownBy ?? e.id, 9999, 'blunt');
        else e.dead = true;
      }
    }
  }

  separateBodies(ctx);
};

function hurt(ctx: SimContext, target: number, source: number, amount: number, kind: 'blunt' | 'fall'): void {
  if (amount <= 0) return;
  ctx.state.queues.effects.push({ target: { kind: 'entity', id: target }, effects: [{ type: 'damage', amount, kind }], source, from: null });
}

/** Returns true when the bump was hard enough to count as a strike. */
function bounce(ctx: SimContext, e: Entity, d: ThingDef, axis: 'x' | 'y'): boolean {
  const v = axis === 'x' ? e.vel.x : e.vel.y;
  let hard = false;
  if (!e.actor && Math.abs(v) > 6) {
    hard = true;
    ctx.emit({ type: 'impact', entity: e.id, x: e.pos.x, y: e.pos.y, strength: Math.min(1, (Math.abs(v) * d.body.mass) / 250) });
    if (d.health && d.carry) hurt(ctx, e.id, e.thrownBy ?? e.id, Math.round(Math.abs(v) * 3), 'blunt');
  }
  if (!e.actor && Math.abs(v) > 3 && e.thrownBy !== null) hard = true;
  if (axis === 'x') e.vel.x = e.actor ? 0 : -e.vel.x * 0.3;
  else e.vel.y = e.actor ? 0 : -e.vel.y * 0.3;
  return hard;
}

function separateBodies(ctx: SimContext): void {
  const { tiles, content } = ctx;
  for (const a of ctx.state.entities.values()) {
    const ad = thingDef(content, a.def);
    if (!ad.body.solid || a.dead || a.heldBy !== null) continue;
    for (const b of ctx.query.near(a.pos.x, a.pos.y, ad.body.radius + 1)) {
      if (b === a || b.dead || b.id < a.id || b.heldBy !== null) continue;
      const bd = thingDef(content, b.def);
      if (!bd.body.solid) continue;
      if (Math.abs(a.z - b.z) > Math.max(ad.body.height, bd.body.height)) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const dist = Math.hypot(dx, dy) || 0.001;
      const overlap = ad.body.radius + bd.body.radius - dist;
      if (overlap <= 0) continue;
      const total = ad.body.mass + bd.body.mass;
      const pa = (bd.body.mass / total) * overlap;
      const pb = (ad.body.mass / total) * overlap;
      const ux = dx / dist;
      const uy = dy / dist;
      const ax = a.pos.x - ux * pa;
      const ay = a.pos.y - uy * pa;
      if (!tiles.blocked(ax, ay)) {
        a.pos.x = ax;
        a.pos.y = ay;
      }
      const bx = b.pos.x + ux * pb;
      const by = b.pos.y + uy * pb;
      if (!tiles.blocked(bx, by)) {
        b.pos.x = bx;
        b.pos.y = by;
      }
    }
  }
}
