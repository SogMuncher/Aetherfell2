// Brain behaviours for hands: grabbing loose items into the bag and throwing them at enemies (the player's own pick-up and throw).
import type { BehaviourDef, ItemDef } from '../../types';
import { itemDef, throwSpeed } from '../../content';
import { type Senses, clearShot, go, isEnemy } from './senses';

type Def<K extends BehaviourDef['do']> = Extract<BehaviourDef, { do: K }>;

/** Goes to a loose item it can see and, once in reach, asks for it (actor.wantPick; sim/rpg picks it up). */
export function grab(s: Senses, b: Def<'grab'>): boolean {
  const { me, ctx } = s;
  const carried = me.actor.inventory.reduce((n, st) => n + st.count, 0);
  if (carried >= b.keep) return false;
  const want = s.items.find((o) => o.d <= b.within && o.e.item && (!b.throwables || !!itemDef(ctx.content, o.e.item.id)?.thrown));
  if (!want) return false;
  // Already on its way to this one: keep going without rolling again.
  const onIt = me.ai.doing === 'grab' && me.ai.goal !== null && Math.hypot(me.ai.goal.x - want.e.pos.x, me.ai.goal.y - want.e.pos.y) < 0.5;
  if (!onIt && !ctx.rng.chance(b.chance)) return false;
  if (Math.hypot(want.e.pos.x - me.pos.x, want.e.pos.y - me.pos.y) <= 1) {
    me.actor.wantPick = want.e.id;
    return go(s, 'idle', null);
  }
  return go(s, 'goto', { x: want.e.pos.x, y: want.e.pos.y });
}

/** Throws from the bag at an enemy in range with a clear line, aimed in an arc to land on them (actor.wantThrow). */
export function throwAt(s: Senses, b: Def<'throw'>): boolean {
  const { me, ctx } = s;
  const foe = s.seen.find((o) => isEnemy(s, o) && o.d >= b.range[0] && o.d <= b.range[1] && clearShot(s, o.e));
  if (!foe) return false;
  let pick: { id: string; def: ItemDef } | null = null;
  for (const st of me.actor.inventory) {
    const def = itemDef(ctx.content, st.id);
    if (!def) continue;
    if (def.thrown) {
      pick = { id: st.id, def };
      break;
    }
    if (b.anything && !pick) pick = { id: st.id, def };
  }
  if (!pick || !ctx.rng.chance(b.chance)) return false;
  const dx = foe.e.pos.x - me.pos.x;
  const dy = foe.e.pos.y - me.pos.y;
  const flat = Math.hypot(dx, dy);
  // The lower of the two arcs that carry this far at full speed; a bit higher for a foe up a slope.
  const v = throwSpeed(pick.def, 5);
  const lift = 0.5 * Math.asin(Math.min(1, (ctx.content.rules.gravity * flat) / (v * v))) + Math.atan2(foe.e.z - me.z, Math.max(1, flat)) * 0.5;
  const yaw = Math.atan2(dy, dx);
  me.angle = yaw;
  me.actor.wantThrow = { item: pick.id, yaw, lift, power: 1 };
  return go(s, 'idle', null, foe.e.id);
}
