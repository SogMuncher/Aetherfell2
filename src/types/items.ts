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
