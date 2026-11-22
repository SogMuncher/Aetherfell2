import type { Creature, SimContext, SimSystem, Vec2 } from '../../types';
import { SWING_DIRS } from '../../types';
import { isCreature, isDark, isDisabled, isPanicking, moveFactor, thingDef, weaponStats } from '../../content';
import { decide, sense } from './behaviours';

/**
 * Every creature (animal, monster or villager) thinks the same way: now and then it senses what is
 * around and lets its brain pick a behaviour from the shared library (behaviours.ts). In between,
 * this system carries the choice out: steering around walls and trees with short feeler probes,
 * and biting or swinging when a chased target is in reach.
 */
export const aiSystem: SimSystem = (ctx: SimContext) => {
  const { state, rng } = ctx;
  const night = isDark(ctx.content, state.realm, state.weather.time);
  for (const e of state.entities.values()) {
    if (!isCreature(e) || e.dead || e.heldBy !== null) continue;
    const ai = e.ai;
    const a = e.actor;
    if (isDisabled(ctx.content, e.status)) {
      // Stunned or frozen: no thinking, no coasting, and any spell being gathered is lost.
      e.vel.x *= 0.7;
      e.vel.y *= 0.7;
      if (ai.cast) {
        delete ai.cast;
        ai.mode = 'idle';
        ai.think = 0;
      }
      continue;
    }
    // Hitstop: held in the moment of the blow.
    if ((e.freeze ?? 0) > 0) continue;
    const def = thingDef(ctx.content, e.def);
    const brain = def.brain ? ctx.content.brains[def.brain] : undefined;
    if (!brain) continue;
    const reach = weaponStats(ctx.content, def, a.weapon)?.reach ?? 1.4;
    const base = (def.actor?.speed ?? 3) * moveFactor(ctx.content, e.status);

    if (--ai.think <= 0) {
      ai.think = 6 + rng.int(8);
      decide(sense(ctx, e, brain, night));
    }

    let target = ai.target !== null ? state.entities.get(ai.target) : undefined;
    if (target && (target.dead || (target.player && target.player.downed > 0))) {
      ai.target = null;
      target = undefined;
      delete ai.cast;
      if (ai.mode === 'chase' || ai.mode === 'attack' || ai.mode === 'cast') {
        ai.mode = 'idle';
        ai.think = 0;
      }
    }

    let goal: Vec2 | null = null;
    let speed = base;
    switch (ai.mode) {
      case 'idle':
      case 'graze':
        speed = 0;
        break;
      case 'wander':
      case 'goto':
        goal = ai.goal;
        speed = ai.mode === 'wander' ? base * 0.35 : base * 0.6;
        break;
      case 'chase':
      case 'attack':
        if (target) goal = target.pos;
        break;
      case 'flee':
        goal = ai.goal;
        speed = base * 1.1;
        break;
      case 'cast': {
        // Gather the spell facing the target, stepping back if it is too close; let it go at the telegraph.
        const rule = brain.behaviours.find((b) => b.do === 'cast');
        if (!target || !ai.cast || rule?.do !== 'cast') {
          delete ai.cast;
          ai.mode = 'idle';
          ai.think = 0;
          break;
        }
        const dx = target.pos.x - e.pos.x;
        const dy = target.pos.y - e.pos.y;
        e.angle = Math.atan2(dy, dx);
        if (ai.cast.t === 0) ctx.emit({ type: 'charge', entity: e.id, stage: 'start', x: e.pos.x, y: e.pos.y });
        ai.cast.t++;
        if (Math.hypot(dx, dy) < rule.keep) {
          const dir = steer(ctx, e, e.angle + Math.PI);
          e.vel.x += (Math.cos(dir) * base * 0.6 - e.vel.x) * 0.3;
          e.vel.y += (Math.sin(dir) * base * 0.6 - e.vel.y) * 0.3;
        } else {
          e.vel.x *= 0.6;
          e.vel.y *= 0.6;
        }
        if (ai.cast.t >= rule.telegraph) {
          a.wantCast = ai.cast.spell;
          a.castCooldown = rule.cooldown[0] + rng.int(rule.cooldown[1] - rule.cooldown[0] + 1);
          ctx.emit({ type: 'charge', entity: e.id, stage: 'full', x: e.pos.x, y: e.pos.y });
          delete ai.cast;
          ai.mode = 'idle';
          ai.think = 4;
        }
        continue;
      }
    }
    if (isPanicking(ctx.content, e.status)) speed = base * 1.2;
    if (a.charge) speed *= ctx.content.rules.combat.charge.slow;

    if (goal) {
      const dx = goal.x - e.pos.x;
      const dy = goal.y - e.pos.y;
      const d = Math.hypot(dx, dy);
      const tr = target ? thingDef(ctx.content, target.def).body.radius : 0;
      const stop = target ? reach * 0.7 + tr : 0.4;
      if (d > stop) {
        const dir = steer(ctx, e, Math.atan2(dy, dx));
        e.vel.x += (Math.cos(dir) * speed - e.vel.x) * 0.3;
        e.vel.y += (Math.sin(dir) * speed - e.vel.y) * 0.3;
        e.angle = dir;
      } else {
        e.vel.x *= 0.5;
        e.vel.y *= 0.5;
        if (target) e.angle = Math.atan2(dy, dx);
        if (ai.mode === 'goto' || ai.mode === 'wander') ai.goal = null;
      }
      if (target && (ai.mode === 'chase' || ai.mode === 'attack') && d < reach + tr && !a.swing && !a.charge) {
        const wp = weaponStats(ctx.content, def, a.weapon);
        const dirs = wp?.swings && wp.swings.length ? wp.swings : SWING_DIRS;
        // Far reach favours the thrust, close quarters the sweeps; now and then an overhead chop.
        const w = dirs.map((s) => (s === 'thrust' ? (d > reach * 0.75 ? 3 : 1) : s === 'overhead' ? 1.2 : 2.5));
        let roll = rng.range(0, w.reduce((x, y) => x + y, 0));
        let pick = dirs[0] ?? 'thrust';
        for (let i = 0; i < dirs.length; i++) {
          roll -= w[i] ?? 0;
          if (roll <= 0) {
            pick = dirs[i] ?? pick;
            break;
          }
        }
        a.wantSwing = pick;
        const ch = ctx.content.rules.combat.charge;
        if (wp?.charge && rng.chance(wp.charge)) a.wantCharge = ch.tap + 3 + rng.int(Math.max(1, ch.full - ch.tap - 2));
        e.vel.x *= 0.5;
        e.vel.y *= 0.5;
        const growl = ai.doing === 'hunt' ? brain.behaviours.find((b) => b.do === 'hunt') : undefined;
        if (growl?.do === 'hunt' && rng.chance(growl.growl)) ctx.emit({ type: 'growl', entity: e.id, x: e.pos.x, y: e.pos.y });
      }
    } else {
      e.vel.x *= 0.6;
      e.vel.y *= 0.6;
    }
  }
};

/** Feel ahead; if the way is blocked, try angles either side. */
function steer(ctx: SimContext, e: Creature, want: number): number {
  const probe = Math.max(1.2, thingDef(ctx.content, e.def).body.radius * 3);
  const offsets = [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4];
  for (const o of offsets) {
    const a = want + o;
    const x = e.pos.x + Math.cos(a) * probe;
    const y = e.pos.y + Math.sin(a) * probe;
    if (ctx.tiles.blocked(x, y)) continue;
    // Walls, pillars and beams in the 3D layer, at about waist to head height.
    if (ctx.state.volume.solidBetween(x, y, e.z + 0.6, e.z + 1.5)) continue;
    // Creatures avoid deep water (but happily cross ice).
    if (ctx.tiles.info(x, y).liquid && ctx.tiles.ground(x, y) < -0.4 && !ctx.tiles.info(e.pos.x, e.pos.y).liquid) continue;
    return a;
  }
  return want + Math.PI;
}
