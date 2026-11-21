import type { ItemId } from '../types';

const STORE = 'aetherfell2.quick';
export const QUICK_SLOTS = 4;

/**
 * The quick-use keys 1..4 (H and G still work as keys 1 and 2). Each holds an item id, or
 * '@throwable' for whatever flask you carry, or '' for nothing. Kept per computer.
 */
export class QuickSlots {
  readonly slots: string[];

  constructor(defaults: readonly string[]) {
    this.slots = Array.from({ length: QUICK_SLOTS }, (_, i) => defaults[i] ?? '');
    try {
      const raw: unknown = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (Array.isArray(raw)) raw.slice(0, QUICK_SLOTS).forEach((v, i) => typeof v === 'string' && (this.slots[i] = v));
    } catch {
      // No storage: the defaults stand.
    }
  }

  get(i: number): string {
    return this.slots[i] ?? '';
  }

  /** Put an item on key i+1 (taking it off any other key first). */
  set(i: number, id: ItemId): void {
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k] === id) this.slots[k] = '';
    this.slots[i] = id;
    try {
      localStorage.setItem(STORE, JSON.stringify(this.slots));
    } catch {
      // Not saved; it still works until the page closes.
    }
  }
}
