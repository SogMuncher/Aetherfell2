// The hold window: what a store keeps (a ship's hold) beside what is in your bag; click a stack to move it across
import type { Entity, ItemId, ItemStack, SimState } from '../../types';
import { bagOf } from '../../types';
import { CONTENT, itemDef, thingDef } from '../../content';
import { esc, iconUrl } from './bagParts';

export class StoreWindow {
  private readonly el: HTMLDivElement;
  /** The store being shown (entity id), or null while closed. */
  private entity: number | null = null;
  private key = '';

  constructor(host: HTMLElement, private readonly stow: (entity: number, item: ItemId, put: boolean) => void) {
    this.el = document.createElement('div');
    this.el.className = 'panel store hidden';
    this.el.style.cssText = 'left:50%;top:18%;transform:translateX(-50%);max-width:560px';
    host.appendChild(this.el);
    this.el.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('button');
      if (!b || this.entity === null) return;
      if (b.dataset.close) this.toggle(null);
      else if (b.dataset.item) this.stow(this.entity, b.dataset.item, b.dataset.put === '1');
    });
  }

  get open(): boolean {
    return this.entity !== null;
  }

  toggle(entity: number | null): void {
    this.entity = entity;
    this.key = '';
    this.el.classList.toggle('hidden', entity === null);
  }

  /** Redraws when either side changes; closes when you walk away from the store. */
  update(state: SimState, me: Entity): void {
    if (this.entity === null) return;
    const t = state.entities.get(this.entity);
    if (!t?.stored || t.dead || Math.hypot(t.pos.x - me.pos.x, t.pos.y - me.pos.y) > 3.5 || Math.abs(t.z - me.z) > 2.5) {
      this.toggle(null);
      return;
    }
    const bag = bagOf(me);
    const key = JSON.stringify([t.stored, bag]);
    if (key === this.key) return;
    this.key = key;
    const name = esc(thingDef(CONTENT, t.def).name);
    const row = (stacks: readonly ItemStack[], put: boolean): string =>
      stacks.length
        ? stacks.map((s) => `<button data-item="${esc(s.id)}" data-put="${put ? 1 : 0}" title="${esc(itemDef(CONTENT, s.id)?.name ?? s.id)}"><img src="${iconUrl(s.id)}" width="40" height="40" style="image-rendering:pixelated;display:block">${s.count > 1 ? `×${s.count}` : ''}</button>`).join('')
        : '<span style="color:var(--dim)">empty</span>';
    this.el.innerHTML = `<h2>The ${name}</h2><div>${row(t.stored, false)}</div><h3>Your bag (click to put it in)</h3><div>${row(bag, true)}</div><button data-close="1">Close</button>`;
  }
}
