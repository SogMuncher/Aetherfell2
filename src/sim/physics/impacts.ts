import type { Entity, SimContext, ThingDef } from '../../types';
import { takeBlows, thingDef } from '../../content';

/**
 * Things that fly into something: fast loose objects hurt whoever they hit, a thing with its own
 * `onImpact` bursts, and a thrown item takes a blow like one swung (with nothing left it breaks
 * there, by its `onBreak`). Returns whether it struck something.
 */
export function impacts(ctx: SimContext, e: Entity, d: ThingDef, hit: boolean, speed0: number, thrower: number | null): boolean {
  const { state, content } = ctx;
  const r = d.body.radius;
  let struck = hit;
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

    if (struck && e.item && thrower !== null && speed0 >= content.rules.items.impactSpeed) itemImpact(ctx, e, thrower);
    const impact = d.onImpact;
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
  return struck;
}

/** A thrown item that flies into something takes a blow, like one swung; with nothing left it breaks there. */
function itemImpact(ctx: SimContext, e: Entity, by: number): void {
  if (!e.item) return;
  const next = takeBlows(ctx.content, e.item.id, 1);
  if (next) {
    e.item.id = next;
    return;
  }
  ctx.breakItem(e.item.id, e.pos.x, e.pos.y, e.z, by);
  e.dead = true;
}

function hurt(ctx: SimContext, target: number, source: number, amount: number, kind: 'blunt' | 'fall'): void {
  if (amount <= 0) return;
  ctx.state.queues.effects.push({ target: { kind: 'entity', id: target }, effects: [{ type: 'damage', amount, kind }], source, from: null });
}
