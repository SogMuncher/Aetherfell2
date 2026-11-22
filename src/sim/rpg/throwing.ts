import type { Entity, ItemId, PlayerData, SimContext, ThrowAim } from '../../types';
import { addItem, removeItem } from '../../types';
import { itemDef } from '../../content';

/** Below this much of the screen height, letting go is a gentle drop instead of a throw. */
const DROP_BELOW = 0.15;

/**
 * An item dragged out of the bag and let go over the view. The cursor point is the direction:
 * left or right of centre turns the throw that way, higher up the screen throws harder and further,
 * and near the bottom you simply set it down in front of you. Any item can be thrown; things with
 * a `thrown` burst still burst where they land.
 */
export function throwFromBag(ctx: SimContext, e: Entity, p: PlayerData, aim: ThrowAim): void {
  if (p.downed > 0 || !itemDef(ctx.content, aim.item) || !removeItem(p.inventory, aim.item, 1)) return;
  letGo(ctx, e, p, aim);
}

/**
 * G: what is in the hands leaves them. Looking down (below `rules.items.dropPitch`) sets it at your
 * feet; otherwise it is thrown hard where you look. The same throw as from the bag.
 */
export function throwHeld(ctx: SimContext, e: Entity, p: PlayerData): void {
  const a = e.actor;
  const item = a?.weapon;
  if (!a || !item || p.downed > 0) return;
  a.weapon = null;
  ctx.emit({ type: 'equip', entity: e.id, item: null });
  const down = p.input.pitch < ctx.content.rules.items.dropPitch;
  letGo(ctx, e, p, { item, yaw: e.angle, lift: p.input.pitch * 0.9, power: down ? 0 : 1 }, down);
}

/** One item leaving a traveller: set down in front (or at the feet), or thrown along the aim. */
function letGo(ctx: SimContext, e: Entity, p: PlayerData, aim: ThrowAim, atFeet = false): void {
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
  // Light things fly further; anything made to be thrown flies at its own speed.
  const full = (def.thrown?.speed ?? Math.max(5, 13 - def.weight * 1.2)) * (1 + p.stats.might * 0.03);
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
 * A loose item dragged from the view into the open bag. It is picked up only if it is still lying
 * there, within reach (rules.pickReach) and not behind a wall, closed door, tree or hillside.
 */
export function pickFromView(ctx: SimContext, e: Entity, p: PlayerData, id: number): ItemId | null {
  const it = ctx.state.entities.get(id);
  if (!it?.item || it.dead || it.heldBy !== null || p.downed > 0) return null;
  const eyeZ = e.z + 1.5;
  const dx = it.pos.x - e.pos.x;
  const dy = it.pos.y - e.pos.y;
  const dz = it.z + 0.1 - eyeZ;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > ctx.content.rules.pickReach) {
    ctx.emit({ type: 'notice', player: e.id, text: 'That is too far away to reach.' });
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
      ctx.emit({ type: 'notice', player: e.id, text: 'You cannot reach it from here.' });
      return null;
    }
  }
  addItem(p.inventory, it.item.id, it.item.count);
  it.dead = true;
  ctx.emit({ type: 'pickup', player: e.id, item: it.item.id, count: it.item.count });
  return it.item.id;
}

