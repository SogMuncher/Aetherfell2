import type { ItemId } from './defs';

export interface ItemStack {
  id: ItemId;
  count: number;
}

/** Inventory helpers shared by every system that touches items. */
export function addItem(inv: ItemStack[], id: ItemId, count: number): void {
  const s = inv.find((x) => x.id === id);
  if (s) s.count += count;
  else inv.push({ id, count });
}

export function removeItem(inv: ItemStack[], id: ItemId, count: number): boolean {
  const i = inv.findIndex((x) => x.id === id);
  const s = inv[i];
  if (!s || s.count < count) return false;
  s.count -= count;
  if (s.count <= 0) inv.splice(i, 1);
  return true;
}

export function countItem(inv: readonly ItemStack[], id: ItemId): number {
  return inv.find((x) => x.id === id)?.count ?? 0;
}

/**
 * Any item id may carry how many blows this one has left: `torch@12`, `gear:sword:iron:fine@40`.
 * A new item carries nothing. These split and join that mark; content/itemDefs.ts reads it.
 */
export function splitWear(id: ItemId): { base: ItemId; wear: number | undefined } {
  const at = id.lastIndexOf('@');
  if (at <= 0) return { base: id, wear: undefined };
  const w = Number(id.slice(at + 1));
  return Number.isFinite(w) ? { base: id.slice(0, at), wear: w } : { base: id, wear: undefined };
}

/** The id of `base` with this many blows left (no mark when it is as good as new). */
export function joinWear(base: ItemId, wear: number | undefined, durability: number): ItemId {
  if (wear === undefined || wear >= durability) return base;
  return `${base}@${Math.max(0, Math.round(wear))}`;
}
