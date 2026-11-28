import type { BehaviourDef, BehaviourKind, Entity } from '../../types';
import { hauntNow, isPanicking, looksDangerous, spellFor, spellKey, thingDef } from '../../content';
import { type Senses, busy, clearShot, go, goVia, isEnemy, runAlong, runFrom } from './senses';
import { grab, throwAt } from './handling';
import { heaveAt, liftUp, smash } from './carrying';

/**
 * The shared library of behaviours every creature brain picks from (content/living.ts).
 * Each behaviour looks at what the creature senses and either takes charge (sets how it moves and
 * where to, returns true) or passes (returns false) so the next behaviour in the brain's list gets
 * a turn. Behaviours never check what kind of creature they belong to, only what it senses.
 */

type Behaviour<K extends BehaviourKind> = (s: Senses, b: Extract<BehaviourDef, { do: K }>) => boolean;

/** The library. Adding a behaviour: add its shape to BehaviourDef in types/defs.ts, then one entry here. */
export const BEHAVIOURS: { [K in BehaviourKind]: Behaviour<K> } = {
  panic(s) {
    if (!isPanicking(s.ctx.content, s.me.status)) return false;
    return runAlong(s, -s.fire.x, -s.fire.y, 14);
  },

  fleeFire(s, b) {
    if (s.fire.count === 0 || !s.ctx.rng.chance(b.chance)) return false;
    return runAlong(s, -s.fire.x, -s.fire.y, b.distance);
  },

  retreat(s, b) {
    if (s.me.hp >= s.me.maxHp * b.below) return false;
    const enemy = s.seen.find((o) => isEnemy(s, o));
    return enemy ? runFrom(s, enemy.e, b.distance) : false;
  },

  avoid(s, b) {
    if (b.untilProvoked && s.me.actor.lastAttacker !== null) return false;
    const reach = s.range * b.within;
    const scary = s.seen.find((o) => o.d < reach && o.e.faction !== s.me.faction && o.feeling < b.trust && looksDangerous(s.ctx.content, o.e));
    return scary ? runFrom(s, scary.e, b.distance) : false;
  },

  hunt(s) {
    const prey = s.seen.find((o) => isEnemy(s, o));
    return prey ? go(s, 'chase', null, prey.e.id) : false;
  },

  cast(s, b) {
    const ai = s.me.ai;
    const a = s.me.actor;
    // Already gathering a spell: stay with it until aiSystem lets it go.
    if (ai.cast && ai.mode === 'cast') return true;
    if ((a.castCooldown ?? 0) > 0) return false;
    const foe = s.seen.find((o) => isEnemy(s, o) && clearShot(s, o.e));
    if (!foe) return false;
    const caster = thingDef(s.ctx.content, s.me.def).actor?.caster;
    const mana = a.mana ?? caster?.mana ?? 0;
    const { rng } = s.ctx;
    for (const sp of b.spells) {
      if (foe.d < sp.range[0] || foe.d > sp.range[1]) continue;
      const key = spellKey(sp.runes);
      const def = spellFor(s.ctx.content, key);
      if (!def || mana < def.cost || !rng.chance(sp.chance)) continue;
      ai.cast = { spell: key, t: 0 };
      return go(s, 'cast', null, foe.e.id);
    }
    return false;
  },

  follow(s, b) {
    const { me, ctx } = s;
    let lead: Entity | undefined;
    let ld = Infinity;
    for (const id of Object.values(ctx.state.players)) {
      const p = ctx.state.entities.get(id);
      const d = p && p.faction === me.faction ? Math.hypot(p.pos.x - me.pos.x, p.pos.y - me.pos.y) : Infinity;
      if (p && d < ld) [lead, ld] = [p, d];
    }
    if (!lead) return false;
    const by = lead;
    // Whatever their side hates, or anything going for one of their own, near the one they follow.
    const foe = s.seen.find((o) => {
      const aim = o.e.ai?.target;
      const theirs = aim !== null && aim !== undefined && ctx.state.entities.get(aim)?.faction === me.faction;
      return (isEnemy(s, o) || theirs) && Math.hypot(o.e.pos.x - by.pos.x, o.e.pos.y - by.pos.y) < b.guard;
    });
    if (foe) return go(s, 'chase', null, foe.e.id);
    // A spot a little short of them, on this side (not into their back).
    const k = ld > 0 ? (b.near * 0.6) / ld : 0;
    const spot = { x: by.pos.x + (me.pos.x - by.pos.x) * k, y: by.pos.y + (me.pos.y - by.pos.y) * k };
    if (ld > b.far || (ld > b.near && busy(s, 'follow', 'run'))) {
      // Keep the way found while it still leads close to them.
      const end = me.ai.aim ?? me.ai.goal;
      if (busy(s, 'follow', 'run') && end && Math.hypot(end.x - by.pos.x, end.y - by.pos.y) < b.near) return true;
      return goVia(s, 'run', spot);
    }
    if (ld > b.near) return go(s, 'goto', spot);
    me.angle = Math.atan2(by.pos.y - me.pos.y, by.pos.x - me.pos.x);
    return go(s, 'idle', null);
  },

  defend(s) {
    const foe = s.seen.find((o) => o.provoked);
    return foe ? go(s, 'chase', null, foe.e.id) : false;
  },

  routine(s, b) {
    const n = s.me.npc;
    if (!n) return false;
    const { rng } = s.ctx;
    const ai = s.me.ai;
    const at = hauntNow(s.ctx.content, s.ctx.state.weather, s.me);
    const spot = n.haunts[at] ?? n.home;
    // Under a roof they keep to a step or two; in the open they potter about more.
    const roofed = s.ctx.state.volume.topAt(spot.x, spot.y) > s.ctx.tiles.ground(spot.x, spot.y) + 2;
    const reach = roofed ? 1 : b.potter;
    // On the way somewhere: keep going, unless the day moved on and that is no longer the place.
    const end = ai.aim ?? ai.goal;
    // (Heading straight at it because no way was found: now and then look for one again.)
    const lost = ai.path === undefined && rng.chance(0.05);
    if (busy(s, 'routine', 'goto') && end && !lost && Math.hypot(end.x - spot.x, end.y - spot.y) < reach + 0.7) return true;
    if (Math.hypot(spot.x - s.me.pos.x, spot.y - s.me.pos.y) > 1.2) return goVia(s, 'goto', spot);
    // There: now and then potter off a little way (and come back), or stop and face whoever else is about, as if talking.
    if (rng.chance(b.chance)) return goVia(s, 'goto', { x: spot.x + rng.range(-reach, reach), y: spot.y + rng.range(-reach, reach) });
    const friend = s.seen.find((o) => o.d < 3.5 && o.e.npc && o.feeling >= 0);
    if (friend) s.me.angle = Math.atan2(friend.e.pos.y - s.me.pos.y, friend.e.pos.x - s.me.pos.x);
    return go(s, 'idle', null);
  },

  graze(s, b) {
    if (busy(s, 'wander', 'wander') || !s.ctx.rng.chance(b.chance)) return false;
    const [lo, hi] = b.ticks;
    s.me.ai.think = lo + s.ctx.rng.int(hi - lo + 1);
    return go(s, 'graze', null);
  },

  lurk(s, b) {
    if (busy(s, 'lurk', 'wander')) return true;
    const { rng } = s.ctx;
    const home = s.me.ai.home;
    if (rng.chance(b.chance)) return go(s, 'wander', { x: home.x + rng.range(-b.roam, b.roam), y: home.y + rng.range(-b.roam, b.roam) });
    return go(s, 'idle', null);
  },

  grab,

  throw: throwAt,
  lift: liftUp,
  heave: heaveAt,
  smash,

  wander(s, b) {
    const { rng } = s.ctx;
    if (busy(s, 'wander', 'wander') && !rng.chance(b.chance)) return true;
    const home = s.me.ai.home;
    return go(s, 'wander', { x: home.x + rng.range(-b.roam, b.roam), y: home.y + rng.range(-b.roam, b.roam) });
  },
};

/** Runs one behaviour with its settings. */
export function attempt(s: Senses, b: BehaviourDef): boolean {
  const run = BEHAVIOURS[b.do] as unknown as (s: Senses, b: BehaviourDef) => boolean;
  return run(s, b);
}

/** Goes down the brain's list and lets the first behaviour that applies take charge. */
export function decide(s: Senses): void {
  const ai = s.me.ai;
  for (const b of s.brain.behaviours) {
    if (attempt(s, b)) {
      ai.doing = b.do;
      return;
    }
  }
  go(s, 'idle', null);
  delete ai.doing;
}
