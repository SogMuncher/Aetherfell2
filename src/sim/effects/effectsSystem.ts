import { type EffectRequest, GROUND_Z, type SimContext, type SimSystem } from '../../types';
import { applyToEntity } from './entityEffects';
import { applyToSpot, mendWear, touchesMatter } from './spotEffects';
import { settleTemperatures } from './temperature';
import { thingDef } from '../../content';


/**
 * Applies every effect request in one place, the same way for every source:
 *   1. guard and parry (melee only)
 *   2. material reaction (resistances, catching fire, soaking, chilling, freezing water)
 *   3. status rules (cancels / blocked by)
 *   4. death or destruction (onDestroy effects, loot, credit)
 * Also lets warm and cold spots settle back (sim/effects/temperature.ts). Which status heat, water and cold give a body comes from
 * content.rules.reactions; which tile freezes or melts into which comes from the tile definitions.
 */
export const effectsSystem: SimSystem = (ctx: SimContext) => {
  const { state } = ctx;
  // Applying effects can cause more (a barrel bursts into oil, a dying torch drops its flame).
  // Run a few rounds so chains land this tick; anything left over waits for the next one.
  for (let round = 0; round < 4 && state.queues.effects.length > 0; round++) {
    const list = state.queues.effects;
    state.queues.effects = [];
    for (const r of list) apply(ctx, r);
  }
  settleTemperatures(ctx);
  mendWear(ctx);
};

function apply(ctx: SimContext, r: EffectRequest): void {
  const t = r.target;
  if (t.kind === 'entity') {
    const e = ctx.state.entities.get(t.id);
    if (e) applyToEntity(ctx, e, r);
  } else if (t.kind === 'tile') {
    applyToSpot(ctx, Math.floor(t.x), Math.floor(t.y), GROUND_Z, r);
  } else if (t.kind === 'cell') {
    applyToSpot(ctx, Math.floor(t.x), Math.floor(t.y), Math.floor(t.z), r);
  } else {
    const rad = t.radius;
    if (r.effects.some((e) => touchesMatter(e))) {
      const R = Math.ceil(rad);
      const cx = Math.floor(t.x);
      const cy = Math.floor(t.y);
      for (let j = -R; j <= R; j++) {
        for (let i = -R; i <= R; i++) {
          const dx = cx + i + 0.5 - t.x;
          const dy = cy + j + 0.5 - t.y;
          if (dx * dx + dy * dy > rad * rad + 0.5) continue;
          applyToSpot(ctx, cx + i, cy + j, GROUND_Z, r);
        }
      }
      // The 3D layer is hit by the very same effect: walls, floors and roofs inside the ball.
      if (ctx.state.volume.bricks.size > 0) {
        const cz = Math.floor(t.z);
        for (let k = -R - 1; k <= R + 1; k++) {
          for (let j = -R; j <= R; j++) {
            for (let i = -R; i <= R; i++) {
              const x = cx + i;
              const y = cy + j;
              const z = cz + k;
              const dx = x + 0.5 - t.x;
              const dy = y + 0.5 - t.y;
              const dz = z + 0.5 - t.z;
              if (dx * dx + dy * dy + dz * dz > rad * rad + 0.75) continue;
              if (ctx.matter.solid(x, y, z)) applyToSpot(ctx, x, y, z, r);
            }
          }
        }
      }
    }
    for (const o of ctx.query.near(t.x, t.y, rad + 0.6)) {
      if (Math.hypot(o.pos.x - t.x, o.pos.y - t.y) > rad + thingDef(ctx.content, o.def).body.radius) continue;
      if (t.z < o.z - rad - 0.5 || t.z > o.z + thingDef(ctx.content, o.def).body.height + rad) continue;
      applyToEntity(ctx, o, r);
    }
  }
}
