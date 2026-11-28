import type { BodyRegionId, Entity, ItemId, PlayerData, SimContext, WearRequest } from '../../types';
import { bagOf, addItem, HAND_SLOT, removeItem } from '../../types';
import { isFollower, itemDef, thingDef } from '../../content';
import { pickFromView } from './throwing';

/** Putting armour on, taking it off, or putting on what lies in the world: one rule for every body that wears things. */
export function changeClothes(ctx: SimContext, e: Entity, p: PlayerData, req: WearRequest): void {
  if (p.downed > 0) return;
  // Dressing a party member: their body, and a piece from your bag goes into theirs first.
  const body = req.do !== 'wearFrom' && req.on !== undefined ? followerNear(ctx, e, req.on) : e;
  if (!body) return;
  if (req.do === 'wear' && body !== e && !bagOf(body).some((s) => s.id === req.item)) {
    if (!removeItem(bagOf(e), req.item, 1)) return;
    addItem(bagOf(body), req.item, 1);
  }
  if (req.do === 'wear') {
    if (req.slot === HAND_SLOT) hold(ctx, body, req.item);
    else putOn(ctx, body, req.item);
  } else if (req.do === 'remove') {
    if (req.region === HAND_SLOT) letGoOfHeld(ctx, body);
    else takeOff(ctx, body, req.region);
  } else {
    const id = pickFromView(ctx, e, req.entity);
    if (id && itemDef(ctx.content, id)?.armour) putOn(ctx, e, id);
  }
}

/** A party member within arm's reach of this traveller (their bag and body can be seen to), if `id` is one. */
export function followerNear(ctx: SimContext, e: Entity, id: number): Entity | undefined {
  const t = ctx.state.entities.get(id);
  if (!t || !isFollower(ctx.content, t) || Math.hypot(t.pos.x - e.pos.x, t.pos.y - e.pos.y) > 3.5 || Math.abs(t.z - e.z) > 2.5) return undefined;
  return t;
}

/** Takes any item from the pack into the hands (the hand slot); what was held goes into the pack. */
export function hold(ctx: SimContext, e: Entity, id: ItemId): void {
  const a = e.actor;
  const def = itemDef(ctx.content, id);
  if (!a || !def || !removeItem(bagOf(e), id, 1)) return;
  if (a.weapon) addItem(bagOf(e), a.weapon, 1);
  a.weapon = id;
  ctx.emit({ type: 'equip', entity: e.id, item: id });
  ctx.emit({ type: 'notice', player: e.id, text: `You take the ${def.name.toLowerCase()} in hand.` });
}

/** Puts what is in the hands back in the pack. */
function letGoOfHeld(ctx: SimContext, e: Entity): void {
  const a = e.actor;
  if (!a?.weapon) return;
  addItem(bagOf(e), a.weapon, 1);
  a.weapon = null;
  ctx.emit({ type: 'equip', entity: e.id, item: null });
}

/** Puts a piece from the pack on the part of the body it belongs to; what was there goes into the pack. */
export function putOn(ctx: SimContext, e: Entity, id: ItemId): void {
  const def = itemDef(ctx.content, id);
  const armour = def?.armour;
  if (!def || !armour) return;
  if (!thingDef(ctx.content, e.def).wears?.includes(armour.region)) {
    ctx.emit({ type: 'notice', player: e.id, text: `You cannot wear the ${def.name.toLowerCase()}.` });
    return;
  }
  if (!removeItem(bagOf(e), id, 1)) return;
  const worn = (e.worn ??= {});
  const old = worn[armour.region];
  if (old) addItem(bagOf(e), old, 1);
  worn[armour.region] = id;
  ctx.emit({ type: 'armour', entity: e.id, region: armour.region, item: id });
  ctx.emit({ type: 'notice', player: e.id, text: `You put on the ${def.name.toLowerCase()}.` });
}

function takeOff(ctx: SimContext, e: Entity, region: BodyRegionId): void {
  const id = e.worn?.[region];
  if (!e.worn || !id) return;
  delete e.worn[region];
  addItem(bagOf(e), id, 1);
  ctx.emit({ type: 'armour', entity: e.id, region, item: null });
  ctx.emit({ type: 'notice', player: e.id, text: `You take off the ${(itemDef(ctx.content, id)?.name ?? 'armour').toLowerCase()}.` });
}

