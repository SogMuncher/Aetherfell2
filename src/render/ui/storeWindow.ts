// The hold window: a store (a ship's hold, a party member's bag) shown as a bag of its own; drag things between it and your bag
import type { Entity, ItemId, ItemStack, SimState } from '../../types';
import { bagOf } from '../../types';
import { CONTENT, isFollower, thingDef } from '../../content';
import type { Spot } from './bagParts';
import { BagArea } from './bagArea';
import type { BagWindow } from './bag';
import { makeMovable } from './movable';

/**
 * A store is a bag that stays where it is: the same leather area, pictures and dragging as your own bag. Opening it
 * opens your bag beside it; drag a thing from one to the other to put it in or take it out.
 */
export class StoreWindow {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLElement;
  private readonly area: BagArea;
  /** The store being shown (entity id), or null while closed. */
  private entity: number | null = null;
  /** Where things lie in each store you have opened (this screen only). */
  private readonly layouts = new Map<number, Map<ItemId, Spot>>();
  private readonly spots = new Map<ItemId, Spot>();

  constructor(
    host: HTMLElement,
    private readonly stow: (entity: number, item: ItemId, put: boolean) => void,
    private readonly bag: BagWindow,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'panel bag store hidden';
    this.el.style.cssText = 'left:16px;right:auto;top:44px';
    this.el.innerHTML = `<div class="bag-title"><h2></h2><button data-close title="Close">×</button></div><div class="hint">Drag things between this and your bag to stow them or take them out</div>`;
    host.appendChild(this.el);
    const title = this.el.querySelector<HTMLElement>('.bag-title');
    const h2 = this.el.querySelector<HTMLElement>('h2');
    if (!title || !h2) throw new Error('store markup');
    this.title = h2;
    this.area = new BagArea(host, this.el, this.spots, {});
    this.el.insertBefore(this.area.el, this.el.querySelector('.hint'));
    this.el.querySelector('button[data-close]')?.addEventListener('click', () => this.toggle(null));
    makeMovable(this.el, title, null, () => {});
    // Out of the store into the bag, and from the bag into the store.
    this.area.targets.push({
      tag: (_id, x, y) => (this.bag.open && this.bag.area.contains(x, y) ? 'take' : null),
      drop: (id, x, y) => {
        if (this.entity === null) return;
        this.stow(this.entity, id, false);
        this.area.sent(id);
        this.bag.area.landAt(id, x, y);
      },
    });
    this.bag.area.targets.unshift({
      tag: (_id, x, y) => (this.entity !== null && this.area.contains(x, y) ? 'stow' : null),
      drop: (id, x, y) => {
        if (this.entity === null) return;
        this.stow(this.entity, id, true);
        this.bag.area.sent(id);
        this.area.landAt(id, x, y);
      },
    });
  }

  get open(): boolean {
    return this.entity !== null;
  }

  toggle(entity: number | null): void {
    this.area.cancel();
    if (this.entity !== null) this.layouts.set(this.entity, new Map(this.spots));
    this.entity = entity;
    this.spots.clear();
    if (entity !== null) {
      let lay = this.layouts.get(entity);
      if (!lay) this.layouts.set(entity, (lay = new Map()));
      for (const [k, v] of lay) this.spots.set(k, v);
      this.bag.toggle(true);
    }
    this.el.classList.toggle('hidden', entity === null);
  }

  /** The party member whose bag is open (their paperdoll shows beside it), if it is one. */
  mate(state: SimState): Entity | undefined {
    const t = this.entity === null ? undefined : state.entities.get(this.entity);
    return t && isFollower(CONTENT, t) ? t : undefined;
  }

  /** Keeps the pictures in step with what the store holds; closes when you walk away from it. */
  update(state: SimState, me: Entity): void {
    if (this.entity === null) return;
    const t = state.entities.get(this.entity);
    const mate = this.mate(state);
    const kept: ItemStack[] | undefined = mate ? bagOf(mate) : t?.stored;
    if (!t || !kept || t.dead || Math.hypot(t.pos.x - me.pos.x, t.pos.y - me.pos.y) > 3.5 || Math.abs(t.z - me.z) > 2.5) {
      this.toggle(null);
      return;
    }
    const name = mate?.npc ? `${mate.npc.name}'s bag` : `The ${thingDef(CONTENT, t.def).name}`;
    if (this.title.textContent !== name) this.title.textContent = name;
    this.area.sync(kept);
  }
}
