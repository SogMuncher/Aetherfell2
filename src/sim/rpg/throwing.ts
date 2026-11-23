import type { Entity, ItemId, PlayerData, SimContext, ThrowAim } from '../../types';
import { bagOf, addItem, removeItem } from '../../types';
import { itemDef, throwSpeed } from '../../content';

/** Below this much of the screen height, letting go is a gentle drop instead of a throw. */
const DROP_BELOW = 0.15;

/** A traveller who is down can do nothing with their hands. */
const down = (e: Entity): boolean => (e.player?.downed ?? 0) > 0;

/**
 * An item thrown from the bag: by a player (dragged out and let go over the view) or a creature
 * (its brain's `throw` behaviour). The aim's yaw turns the throw, `lift` raises it, `power` 0..1 is
 * how hard; very gentle simply sets it down in front. Any item can be thrown; things with a
 * `thrown` burst still burst where they land.
 */
export function throwFromBag(ctx: SimContext, e: Entity, aim: ThrowAim): void {
  if (down(e) || !itemDef(ctx.content, aim.item) || !removeItem(bagOf(e), aim.item, 1)) return;
  letGo(ctx, e, aim);
}

/**
 * G: what is in the hands leaves them. Looking down (below `rules.items.dropPitch`) sets it at your
 * feet; otherwise it is thrown hard where you look. The same throw as from the bag.
 */
export function throwHeld(ctx: SimContext, e: Entity, p: PlayerData): void {
  const a = e.actor;
  const item = a?.weapon;
  if (!a || !item || down(e)) return;
  a.weapon = null;
  ctx.emit({ type: 'equip', entity: e.id, item: null });
  const atFeet = p.input.pitch < ctx.content.rules.items.dropPitch;
  letGo(ctx, e, { item, yaw: e.angle, lift: p.input.pitch * 0.9, power: atFeet ? 0 : 1 }, atFeet);
}

/** One item leaving someone's hands: set down in front (or at the feet), or thrown along the aim. */
function letGo(ctx: SimContext, e: Entity, aim: ThrowAim, atFeet = false): void {
  const def = itemDef(ctx.content, aim.item);
  if (!def) return;
  const yaw = Number.isFinite(aim.yaw) ? aim.yaw : e.angle;
  const lift = Math.max(-1.2, Math.min(1.2, Number.isFinite(aim.lift) ? aim.lift : 0));
  const power = Math.max(0, Math.min(1, Number.isFinite(aim.power) ? aim.power : 0));
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  if (power < DROP_BELOW) {
    const z = e.z + 0.9;
    const near = atFeet ? 0.35 : 0.7;
    ctx.spawn('looseItem', e.pos.x + cos * near, e.pos.y + sin * near, {
      z,
      prevZ: z,
      vel: { x: cos * near * 1.7, y: sin * near * 1.7 },
      vz: 0.6,
      item: { id: aim.item, count: 1 },
    });
    return;
  }
  const full = throwSpeed(def, e.player?.stats.might ?? 5);
  const t = (power - DROP_BELOW) / (1 - DROP_BELOW);
  const sp = 2.5 + (full - 2.5) * t;
  const z = e.z + 1.4;
  const it = ctx.spawn('looseItem', e.pos.x + cos * 0.5, e.pos.y + sin * 0.5, {
    z,
    prevZ: z,
    vel: { x: cos * Math.cos(lift) * sp + e.vel.x, y: sin * Math.cos(lift) * sp + e.vel.y },
    vz: 1 + Math.sin(lift) * sp,
    item: { id: aim.item, count: 1 },
    thrownBy: e.id,
  });
  ctx.emit({ type: 'thrown', entity: it.id, x: it.pos.x, y: it.pos.y });
}

/**
 * A loose item taken into the bag: a player drags it from the view, a creature's `grab` behaviour
 * reaches for it. Only if it is still lying there, within reach (rules.pickReach) and not behind a
 * wall, closed door, tree or hillside.
 */
export function pickFromView(ctx: SimContext, e: Entity, id: number): ItemId | null {
  const it = ctx.state.entities.get(id);
  const tell = (text: string): void => {
    if (e.player) ctx.emit({ type: 'notice', player: e.id, text });
  };
  if (!it?.item || it.dead || it.heldBy !== null || !e.actor || down(e)) return null;
  const eyeZ = e.z + 1.5;
  const dx = it.pos.x - e.pos.x;
  const dy = it.pos.y - e.pos.y;
  const dz = it.z + 0.1 - eyeZ;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > ctx.content.rules.pickReach) {
    tell('That is too far away to reach.');
    return null;
  }
  const { tiles } = ctx;
  const ix = Math.floor(it.pos.x);
  const iy = Math.floor(it.pos.y);
  const steps = Math.ceil(Math.hypot(dx, dy) / 0.25);
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    const x = e.pos.x + dx * k;
    const y = e.pos.y + dy * k;
    if (Math.floor(x) === ix && Math.floor(y) === iy) continue;
    const z = eyeZ + dz * k;
    const g = tiles.ground(x, y);
    if (z < g - 0.05 || (tiles.blocked(x, y) && z < g + tiles.info(x, y).height)) {
      tell('You cannot reach it from here.');
      return null;
    }
  }
  addItem(bagOf(e), it.item.id, it.item.count);
  it.dead = true;
  ctx.emit({ type: 'pickup', player: e.id, item: it.item.id, count: it.item.count });
  return it.item.id;
}

