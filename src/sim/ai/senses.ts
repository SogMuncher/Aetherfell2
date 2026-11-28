// What a creature notices when it stops to think, and the small moves every behaviour shares.
import type { AiMode, BehaviourKind, BrainDef, Creature, Entity, FactionId, SimContext, Vec2 } from '../../types';
import { unpackSpot } from '../../types';
import { thingDef } from '../../content';
import { findPath } from './paths';

/** Someone the creature can see (in range in 3D, with a clear line from eye to eye). */
export interface Seen {
  e: Entity;
  d: number;
  /** How its side feels about their side, -1..1. */
  feeling: number;
  /** They hurt this creature. */
  provoked: boolean;
}

/** Everything a creature notices when it stops to think, gathered once and shared by every behaviour. */
export interface Senses {
  ctx: SimContext;
  me: Creature;
  brain: BrainDef;
  night: boolean;
  /** Metres it can notice things right now. */
  range: number;
  /** Average direction to fire nearby, and how many burning spots it saw. */
  fire: { x: number; y: number; count: number };
  /** Every other actor in range, nearest first. */
  seen: Seen[];
  /** Loose items lying in view, nearest first (only gathered for brains that `grab`). */
  items: { e: Entity; d: number }[];
  /** Other things in view that are not creatures or items (crates, pots), nearest first (for brains that `lift` or `smash`). */
  props: { e: Entity; d: number }[];
}

export function sense(ctx: SimContext, me: Creature, brain: BrainDef, night: boolean): Senses {
  const { tiles, state } = ctx;
  const range = brain.sense * (night ? brain.nightSense : 1);
  const fire = { x: 0, y: 0, count: 0 };
  for (let j = -4; j <= 4; j += 2) {
    for (let i = -4; i <= 4; i += 2) {
      if (tiles.fire(me.pos.x + i, me.pos.y + j) > 0) {
        fire.x += i;
        fire.y += j;
        fire.count++;
      }
    }
  }
  // Burning walls, roofs and floors scare them just like burning grass.
  for (const key of state.volume.burningCells) {
    const c = unpackSpot(key);
    const i = c.x + 0.5 - me.pos.x;
    const j = c.y + 0.5 - me.pos.y;
    if (Math.abs(i) <= 4.5 && Math.abs(j) <= 4.5 && Math.abs(c.z + 0.5 - me.z) <= 3) {
      fire.x += i;
      fire.y += j;
      fire.count++;
    }
  }
  const feels: Readonly<Record<FactionId, number>> = state.factions[me.faction] ?? {};
  const seen: Seen[] = [];
  const items: { e: Entity; d: number }[] = [];
  const props: { e: Entity; d: number }[] = [];
  const looks = brain.behaviours.some((b) => b.do === 'grab');
  const handles = brain.behaviours.some((b) => b.do === 'lift' || b.do === 'smash');
  const eye = me.z + thingDef(ctx.content, me.def).body.height * 0.85;
  for (const o of ctx.query.near(me.pos.x, me.pos.y, range)) {
    if (looks && o.item && !o.dead && o.heldBy === null) {
      const d = Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y, o.z - me.z);
      if (d <= range && ctx.matter.clearLine(me.pos.x, me.pos.y, eye, o.pos.x, o.pos.y, o.z + 0.1)) items.push({ e: o, d });
      continue;
    }
    if (handles && o !== me && !o.actor && !o.item && !o.dead && o.heldBy === null) {
      const d = Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y, o.z - me.z);
      if (d <= range && ctx.matter.clearLine(me.pos.x, me.pos.y, eye, o.pos.x, o.pos.y, o.z + 0.3)) props.push({ e: o, d });
      continue;
    }
    if (o === me || o.dead || !o.actor) continue;
    if (o.player && o.player.downed > 0) continue;
    // Height counts (a foe on a rampart above is farther than its shadow), and walls, floors and hills hide
    // what is behind them. Whoever just hurt it is noticed anyway.
    const oz = o.z + thingDef(ctx.content, o.def).body.height * 0.85;
    const d = Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y, oz - eye);
    if (d > range) continue;
    const provoked = me.actor.lastAttacker === o.id;
    if (!provoked && !ctx.matter.clearLine(me.pos.x, me.pos.y, eye, o.pos.x, o.pos.y, oz)) continue;
    seen.push({ e: o, d, feeling: o.faction === me.faction ? 1 : (feels[o.faction] ?? 0), provoked });
  }
  seen.sort((a, b) => a.d - b.d);
  items.sort((a, b) => a.d - b.d);
  props.sort((a, b) => a.d - b.d);
  return { ctx, me, brain, night, range, fire, seen, items, props };
}

/** Sets how the creature moves and where to. Anything but a chase drops its target. */
export function go(s: Senses, mode: AiMode, goal: Vec2 | null, target: number | null = null): true {
  const ai = s.me.ai;
  ai.mode = mode;
  ai.goal = goal;
  ai.target = target;
  delete ai.path;
  delete ai.aim;
  return true;
}

/** Like `go`, but walks a found way there (round houses, in through doors); straight at it when none is found. */
export function goVia(s: Senses, mode: AiMode, to: Vec2): true {
  const path = findPath(s.ctx, s.me.pos, to, s.me.z);
  const first = path?.[0];
  if (!path || !first) return go(s, mode, to);
  go(s, mode, first);
  s.me.ai.path = path.slice(1);
  s.me.ai.aim = { x: to.x, y: to.y };
  return true;
}

/** Runs `distance` metres along (dx, dy), or in a random direction if that is zero. */
export function runAlong(s: Senses, dx: number, dy: number, distance: number): true {
  const { rng } = s.ctx;
  let ax = dx;
  let ay = dy;
  if (ax === 0 && ay === 0) {
    ax = rng.range(-1, 1);
    ay = rng.range(-1, 1);
  }
  const l = Math.hypot(ax, ay) || 1;
  return go(s, 'flee', { x: s.me.pos.x + (ax / l) * distance, y: s.me.pos.y + (ay / l) * distance });
}

export function runFrom(s: Senses, from: Entity, distance: number): true {
  return runAlong(s, s.me.pos.x - from.pos.x, s.me.pos.y - from.pos.y, distance);
}

export function isEnemy(s: Senses, o: Seen): boolean {
  return o.provoked || (o.e.faction !== s.me.faction && o.feeling < s.brain.hate);
}

/** Still on its way somewhere it chose earlier with the same behaviour. */
export function busy(s: Senses, kind: BehaviourKind, mode: AiMode): boolean {
  const ai = s.me.ai;
  return ai.doing === kind && ai.mode === mode && ai.goal !== null;
}

/** Nothing solid between the creature and the other (probed every metre). */
export function clearShot(s: Senses, o: Entity): boolean {
  const { me, ctx } = s;
  const dx = o.pos.x - me.pos.x;
  const dy = o.pos.y - me.pos.y;
  const n = Math.ceil(Math.hypot(dx, dy));
  for (let i = 1; i < n; i++) if (ctx.tiles.blocked(me.pos.x + (dx * i) / n, me.pos.y + (dy * i) / n)) return false;
  return true;
}
