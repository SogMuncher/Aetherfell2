import type { SimContext, SimSystem } from '../../types';

/**
 * Ticks ongoing conditions: counts them down and queues their repeating effects (burning hurts
 * and lights the ground, poison stings). What a status does lives in content/statuses.ts.
 */
export const statusSystem: SimSystem = (ctx: SimContext) => {
  const { state, content } = ctx;
  for (const e of state.entities.values()) {
    if (e.dead) continue;
    if (e.invuln > 0) e.invuln--;
    if (e.freeze !== undefined && --e.freeze <= 0) delete e.freeze;
    for (const id in e.status) {
      const left = (e.status[id] ?? 0) - 1;
      const def = content.statuses[id];
      if (left <= 0 || !def) {
        delete e.status[id];
        continue;
      }
      e.status[id] = left;
      for (const ev of def.every) {
        if (left % ev.ticks !== 0) continue;
        state.queues.effects.push({
          target: ev.at === 'self' ? { kind: 'entity', id: e.id } : { kind: 'tile', x: e.pos.x, y: e.pos.y },
          effects: ev.effects,
          source: null,
          from: null,
        });
      }
    }
  }
};
