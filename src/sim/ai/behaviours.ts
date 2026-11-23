import type { BehaviourDef, BehaviourKind, NpcData, Vec2 } from '../../types';
import { isPanicking, looksDangerous, spellFor, spellKey, thingDef } from '../../content';
import { type Senses, busy, clearShot, go, isEnemy, runAlong, runFrom } from './senses';
import { grab, throwAt } from './handling';

/**
 * The shared library of behaviours every creature brain picks from (content/living.ts).
 * Each behaviour looks at what the creature senses and either takes charge (sets how it moves and
 * where to, returns true) or passes (returns false) so the next behaviour in the brain's list gets
 * a turn. Behaviours never check what kind of creature they belong to, only what it senses.
 */

function within(p: Vec2, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
  return p.x >= r.x0 && p.x < r.x1 + 1 && p.y >= r.y0 && p.y < r.y1 + 1;
}

/**
 * The next point to head for on the way to `to`. Between inside a house and outside it, the way is
 * through the door: line up in front of it, step through, then carry on.
 */
function viaDoor(from: Vec2, to: Vec2, door: NpcData['door']): Vec2 {
  if (!door) return to;
  const inside = within(from, door.room);
  const goingIn = within(to, door.room);
  if (inside === goingIn) return to;
  // The way out of the door, as a unit step.
  const len = Math.hypot(door.out.x - door.in.x, door.out.y - door.in.y) || 1;
  const nx = (door.out.x - door.in.x) / len;
  const ny = (door.out.y - door.in.y) / len;
  const ahead = (d: number): Vec2 => ({ x: door.out.x + nx * d, y: door.out.y + ny * d });
  if (goingIn) {
    // Far from the door: first a spot a metre and a half out in front of it, in line; then straight in.
    return Math.hypot(from.x - door.out.x, from.y - door.out.y) > 2.2 ? ahead(1.5) : door.in;
  }
  // Inside heading out: to just inside the door first, then out through it.
  return Math.hypot(from.x - door.in.x, from.y - door.in.y) > 1.2 ? door.in : ahead(1);
}

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

  defend(s) {
    const foe = s.seen.find((o) => o.provoked);
    return foe ? go(s, 'chase', null, foe.e.id) : false;
  },

  routine(s, b) {
    const n = s.me.npc;
    if (!n) return false;
    if (busy(s, 'routine', 'goto')) return true;
    const spot = s.night ? n.home : n.work;
    if (Math.hypot(spot.x - s.me.pos.x, spot.y - s.me.pos.y) > 1.2) return go(s, 'goto', viaDoor(s.me.pos, spot, n.door));
    const { rng } = s.ctx;
    if (!s.night && rng.chance(b.chance)) return go(s, 'goto', { x: n.work.x + rng.range(-b.potter, b.potter), y: n.work.y + rng.range(-b.potter, b.potter) });
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
