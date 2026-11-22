import type { BodyRegionId, Entity, ItemId, PlayerData, SimContext, WearRequest } from '../../types';
import { addItem, HAND_SLOT, removeItem } from '../../types';
import { itemDef, thingDef } from '../../content';
import { pickFromView } from './throwing';

/** Putting armour on, taking it off, or putting on what lies in the world: one rule for every body that wears things. */
export function changeClothes(ctx: SimContext, e: Entity, p: PlayerData, req: WearRequest): void {
  if (p.downed > 0) return;
  if (req.do === 'wear') {
    if (req.slot === HAND_SLOT) hold(ctx, e, p, req.item);
    else putOn(ctx, e, p, req.item);
  } else if (req.do === 'remove') {
    if (req.region === HAND_SLOT) letGoOfHeld(ctx, e, p);
    else takeOff(ctx, e, p, req.region);
  } else {
    const id = pickFromView(ctx, e, p, req.entity);
    if (id && itemDef(ctx.content, id)?.armour) putOn(ctx, e, p, id);
  }
}

/** Takes any item from the pack into the hands (the hand slot); what was held goes into the pack. */
export function hold(ctx: SimContext, e: Entity, p: PlayerData, id: ItemId): void {
  const a = e.actor;
  const def = itemDef(ctx.content, id);
  if (!a || !def || !removeItem(p.inventory, id, 1)) return;
  if (a.weapon) addItem(p.inventory, a.weapon, 1);
  a.weapon = id;
  ctx.emit({ type: 'equip', entity: e.id, item: id });
  ctx.emit({ type: 'notice', player: e.id, text: `You take the ${def.name.toLowerCase()} in hand.` });
}

/** Puts what is in the hands back in the pack. */
function letGoOfHeld(ctx: SimContext, e: Entity, p: PlayerData): void {
  const a = e.actor;
  if (!a?.weapon) return;
  addItem(p.inventory, a.weapon, 1);
  a.weapon = null;
  ctx.emit({ type: 'equip', entity: e.id, item: null });
}

/** Puts a piece from the pack on the part of the body it belongs to; what was there goes into the pack. */
export function putOn(ctx: SimContext, e: Entity, p: PlayerData, id: ItemId): void {
  const def = itemDef(ctx.content, id);
  const armour = def?.armour;
  if (!def || !armour) return;
  if (!thingDef(ctx.content, e.def).wears?.includes(armour.region)) {
    ctx.emit({ type: 'notice', player: e.id, text: `You cannot wear the ${def.name.toLowerCase()}.` });
    return;
  }
  if (!removeItem(p.inventory, id, 1)) return;
  const worn = (e.worn ??= {});
  const old = worn[armour.region];
  if (old) addItem(p.inventory, old, 1);
  worn[armour.region] = id;
  ctx.emit({ type: 'armour', entity: e.id, region: armour.region, item: id });
  ctx.emit({ type: 'notice', player: e.id, text: `You put on the ${def.name.toLowerCase()}.` });
}

function takeOff(ctx: SimContext, e: Entity, p: PlayerData, region: BodyRegionId): void {
  const id = e.worn?.[region];
  if (!e.worn || !id) return;
  delete e.worn[region];
  addItem(p.inventory, id, 1);
  ctx.emit({ type: 'armour', entity: e.id, region, item: null });
  ctx.emit({ type: 'notice', player: e.id, text: `You take off the ${(itemDef(ctx.content, id)?.name ?? 'armour').toLowerCase()}.` });
}

