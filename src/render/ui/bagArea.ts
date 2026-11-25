// A bag's leather area: one picture per stack lying where you put it, click to name, double-click to use, drag to move or drop elsewhere
import { AREA_H, AREA_W, type Drag, ICON, type Icon, type Spot, clamp01, describe, esc, iconUrl, leatherUrl } from './bagParts';
import { CONTENT, itemDef } from '../../content';
import type { ItemId, ItemStack } from '../../types';
import { rhash } from '../color';

/** Somewhere else a picture can be let go of (another bag, the paperdoll, the view). */
export interface DropTarget {
  /** What letting go at this screen point would do (shown on the picture), or null when the point is not this target's. */
  tag(id: ItemId, x: number, y: number): string | null;
  /** Let go here (only called where `tag` gave a word). */
  drop(id: ItemId, x: number, y: number, shown: number): void;
}

/**
 * The inside of any bag, kept as pictures: your own bag and a ship's hold are the same thing. Where things lie is your
 * own business, so it never reaches the sim; only what is dropped on another target does (through that target).
 */
export class BagArea {
  readonly el: HTMLElement;
  private readonly label: HTMLElement;
  private readonly icons = new Map<ItemId, Icon>();
  /** Things sent off but not yet gone from the stack: hide that many so they leave at once. */
  private readonly pending = new Map<ItemId, { target: number; until: number }>();
  private drag: Drag | null = null;
  private lastClick = { id: '', at: 0 };
  private labelled = '';
  private labelUntil = 0;
  /** Where letting go outside this area may land, checked in order. */
  targets: DropTarget[] = [];

  constructor(
    private readonly host: HTMLElement,
    parent: HTMLElement,
    private readonly spots: Map<ItemId, Spot>,
    private readonly hooks: { use?: (id: ItemId) => void; moved?: () => void },
  ) {
    this.el = document.createElement('div');
    this.el.className = 'bag-area';
    this.el.style.width = `${AREA_W}px`;
    this.el.style.height = `${AREA_H}px`;
    this.el.style.backgroundImage = `url(${leatherUrl()})`;
    this.label = document.createElement('div');
    this.label.className = 'bag-label hidden';
    this.el.appendChild(this.label);
    parent.appendChild(this.el);
  }

  /** Is this screen point inside the area? */
  contains(x: number, y: number): boolean {
    const r = this.el.getBoundingClientRect();
    return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** Keeps one picture per stack, with a count when there is more than one. */
  sync(inv: readonly ItemStack[]): void {
    const now = performance.now();
    const present = new Set<ItemId>();
    for (const s of inv) {
      present.add(s.id);
      let shown = s.count;
      const pend = this.pending.get(s.id);
      if (pend) {
        if (s.count <= pend.target || now > pend.until) this.pending.delete(s.id);
        else shown = Math.min(shown, pend.target);
      }
      const icon = this.icons.get(s.id) ?? this.addIcon(s.id);
      if (icon.shown !== shown) {
        icon.shown = shown;
        icon.count.textContent = shown > 1 ? String(shown) : '';
        icon.el.classList.toggle('hidden', shown <= 0);
      }
    }
    for (const [id, icon] of this.icons) {
      if (present.has(id)) continue;
      if (this.drag?.id === id) this.cancel();
      icon.el.remove();
      this.icons.delete(id);
      this.pending.delete(id);
    }
    if (this.labelUntil && now > this.labelUntil) {
      this.labelled = '';
      this.label.classList.add('hidden');
      this.labelUntil = 0;
    }
  }

  /** One of this stack has been sent off: show it gone until the sim agrees (or a moment passes). */
  sent(id: ItemId): void {
    const icon = this.icons.get(id);
    if (icon && icon.shown > 0) this.pending.set(id, { target: icon.shown - 1, until: performance.now() + 1500 });
  }

  /** Something arriving from elsewhere lands where it was let go (a picture centred on the point). */
  landAt(id: ItemId, x: number, y: number): void {
    const r = this.el.getBoundingClientRect();
    const s = { x: clamp01((x - ICON / 2 - r.left) / (AREA_W - ICON)), y: clamp01((y - ICON / 2 - r.top) / (AREA_H - ICON)) };
    this.spots.set(id, s);
    const icon = this.icons.get(id);
    if (icon) {
      this.placeIcon(icon.el, s);
      this.el.appendChild(icon.el);
    }
    this.hooks.moved?.();
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  /** The item last clicked, while its label shows. */
  picked(): ItemId | null {
    return this.labelled !== '' && !this.label.classList.contains('hidden') ? this.labelled : null;
  }

  cancel(): void {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('lifted');
    if (d.el.hasPointerCapture(d.pointer)) d.el.releasePointerCapture(d.pointer);
    this.drag = null;
  }

  private addIcon(id: ItemId): Icon {
    const el = document.createElement('div');
    el.className = 'bag-item';
    el.innerHTML = `<img alt="" draggable="false" src="${iconUrl(id)}"><span class="n"></span>`;
    const count = el.querySelector<HTMLElement>('.n') ?? el;
    this.el.appendChild(el);
    const spot = this.spots.get(id) ?? this.freeSpot(id);
    this.spots.set(id, spot);
    this.placeIcon(el, spot);
    const icon: Icon = { el, count, shown: -1 };
    this.icons.set(id, icon);
    el.addEventListener('pointerdown', (ev) => this.down(ev, id, el));
    el.addEventListener('pointermove', (ev) => this.move(ev));
    el.addEventListener('pointerup', (ev) => this.up(ev));
    el.addEventListener('pointercancel', () => this.cancel());
    return icon;
  }

  /** New things land somewhere in the bag that is not already covered. */
  private freeSpot(id: ItemId): Spot {
    const taken = [...this.icons.keys()].map((k) => this.spots.get(k)).filter((s): s is Spot => !!s);
    let seed = 0;
    for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
    for (let tries = 0; tries < 60; tries++) {
      const s = { x: rhash(seed, tries, 11), y: rhash(seed, tries, 12) };
      const minGap = tries < 40 ? 0.16 : 0.08;
      if (taken.every((t) => Math.hypot(t.x - s.x, (t.y - s.y) * (AREA_H / AREA_W)) > minGap)) return s;
    }
    return { x: rhash(seed, 99, 11), y: rhash(seed, 99, 12) };
  }

  private placeIcon(el: HTMLElement, s: Spot): void {
    el.style.left = `${Math.round(s.x * (AREA_W - ICON))}px`;
    el.style.top = `${Math.round(s.y * (AREA_H - ICON))}px`;
  }

  private down(ev: PointerEvent, id: ItemId, el: HTMLElement): void {
    if (ev.button !== 0 || this.drag) return;
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    const r = el.getBoundingClientRect();
    this.drag = { id, el, pointer: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: ev.clientX - r.left, oy: ev.clientY - r.top, ghost: null };
  }

  private target(id: ItemId, x: number, y: number): { t: DropTarget; tag: string } | null {
    for (const t of this.targets) {
      const tag = t.tag(id, x, y);
      if (tag !== null) return { t, tag };
    }
    return null;
  }

  private move(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointer !== ev.pointerId) return;
    if (!d.ghost) {
      if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
      const g = document.createElement('div');
      g.className = 'bag-item bag-ghost';
      g.style.setProperty('--icon', `${ICON}px`);
      g.innerHTML = `<img alt="" src="${iconUrl(d.id)}"><span class="tag"></span>`;
      this.host.appendChild(g);
      d.ghost = g;
      d.el.classList.add('lifted');
      this.label.classList.add('hidden');
    }
    d.ghost.style.left = `${ev.clientX - d.ox}px`;
    d.ghost.style.top = `${ev.clientY - d.oy}px`;
    // Tell the player what letting go here will do.
    const tag = this.contains(ev.clientX, ev.clientY) ? '' : (this.target(d.id, ev.clientX, ev.clientY)?.tag ?? '✕');
    const t = d.ghost.querySelector<HTMLElement>('.tag');
    if (t && t.textContent !== tag) t.textContent = tag;
  }

  private up(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointer !== ev.pointerId) return;
    if (!d.ghost) {
      this.drag = null;
      this.click(d.id);
      return;
    }
    if (this.contains(ev.clientX, ev.clientY)) {
      const r = this.el.getBoundingClientRect();
      const s = { x: clamp01((ev.clientX - d.ox - r.left) / (AREA_W - ICON)), y: clamp01((ev.clientY - d.oy - r.top) / (AREA_H - ICON)) };
      this.spots.set(d.id, s);
      this.placeIcon(d.el, s);
      // The last thing you touched sits on top.
      this.el.appendChild(d.el);
      this.hooks.moved?.();
    } else {
      const hit = this.target(d.id, ev.clientX, ev.clientY);
      const icon = this.icons.get(d.id);
      if (hit && icon && icon.shown > 0) hit.t.drop(d.id, ev.clientX, ev.clientY, icon.shown);
    }
    this.cancel();
  }

  /** One click names the item; a second quick click uses it. */
  private click(id: ItemId): void {
    const now = performance.now();
    if (this.lastClick.id === id && now - this.lastClick.at < 380 && this.hooks.use) {
      this.lastClick = { id: '', at: 0 };
      this.hooks.use(id);
      return;
    }
    this.lastClick = { id, at: now };
    this.labelled = id;
    const def = itemDef(CONTENT, id);
    const icon = this.icons.get(id);
    const spot = this.spots.get(id);
    if (!def || !icon || !spot) return;
    const n = icon.shown > 1 ? ` ×${icon.shown}` : '';
    this.label.innerHTML = `<b>${esc(def.name)}${n}</b>${describe(def).map((l) => `<div>${esc(l)}</div>`).join('')}`;
    const x = spot.x * (AREA_W - ICON) + ICON / 2;
    this.label.style.left = `${Math.round(Math.max(90, Math.min(AREA_W - 90, x)))}px`;
    this.label.style.top = `${Math.round(spot.y * (AREA_H - ICON))}px`;
    this.label.classList.remove('hidden');
    this.el.appendChild(this.label);
    this.labelUntil = now + 4000;
  }
}
