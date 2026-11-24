import type { BodyRegionId, DollBox, Entity, ItemId } from '../../types';
import { HAND_SLOT } from '../../types';
import { CONTENT, itemDef, skillXp } from '../../content';
import { describe, iconUrl } from './bagParts';
import { dollStats, esc } from './paperdollStats';
import { DollFigure } from './paperdollFigure';

export interface PaperdollCallbacks {
  /** Take what is worn on this part of the body off (it goes into the bag). */
  remove(region: BodyRegionId): void;
}

/** The figure is painted at this many pixels and shown 2× as big. */
const FIG_W = 76;
const FIG_H = 112;
const SHOW = 2;

interface Drag {
  region: BodyRegionId;
  pointer: number;
  sx: number;
  sy: number;
  el: HTMLElement;
  ghost: HTMLElement | null;
}

/**
 * The "you" window (C): a figure with a place for every part of the body that can wear armour, and
 * beside it everything about you: health, stamina and aether, how well you are protected, your
 * stats, skills, what you are afflicted with and what is in your hand. Pieces go on by double-clicking
 * them in the bag or dragging them here (from the bag, or from the ground); dragging one off or
 * double-clicking it takes it off again. All of it is read from the sim; the only thing sent back
 * is the request to take something off.
 */
export class PaperdollWindow {
  readonly el: HTMLElement;
  open = false;
  private readonly host: HTMLElement;
  private readonly fig: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly figure: DollFigure;
  private readonly side: HTMLElement;
  private readonly note: HTMLElement;
  private readonly slots: { region: BodyRegionId; el: HTMLElement; img: HTMLImageElement }[] = [];
  private key = '';
  private figKey = '';
  private drag: Drag | null = null;
  private lastClick = { region: '', at: 0 };
  private noteUntil = 0;

  constructor(
    host: HTMLElement,
    private readonly cb: PaperdollCallbacks,
  ) {
    this.host = host;
    this.el = document.createElement('div');
    this.el.className = 'panel doll hidden';
    this.el.innerHTML = `<div class="doll-title"><h2>You</h2><button data-close title="Close (C)">×</button></div>
      <div class="doll-body"><div class="doll-fig"><canvas></canvas></div><div class="doll-side"></div></div>
      <div class="doll-note dim"></div>
      <div class="hint">Double-click armour in the bag, or drag it here from the bag or from the ground, to wear it · drag anything onto the hands to hold it · double-click a worn piece, or drag it off, to take it off · scroll over the figure to turn it</div>`;
    host.appendChild(this.el);
    const fig = this.el.querySelector<HTMLElement>('.doll-fig');
    const canvas = this.el.querySelector<HTMLCanvasElement>('canvas');
    const side = this.el.querySelector<HTMLElement>('.doll-side');
    const note = this.el.querySelector<HTMLElement>('.doll-note');
    if (!fig || !canvas || !side || !note) throw new Error('paperdoll markup');
    this.fig = fig;
    this.canvas = canvas;
    this.side = side;
    this.note = note;
    this.canvas.width = FIG_W;
    this.canvas.height = FIG_H;
    this.figure = new DollFigure(canvas);
    // The wheel over the figure turns it round, to see it from every side.
    this.fig.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.figure.turn(ev.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    this.fig.style.width = `${FIG_W * SHOW}px`;
    this.fig.style.height = `${FIG_H * SHOW}px`;
    this.el.querySelector('button[data-close]')?.addEventListener('click', () => this.toggle(false));
    // One slot over every box of every body part the content names, and one for the hands.
    const places: [string, { name: string; at: readonly DollBox[] }][] = [...Object.entries(CONTENT.gear.regions), [HAND_SLOT, CONTENT.gear.hand]];
    for (const [region, def] of places) {
      for (const b of def.at) {
        const el = document.createElement('div');
        el.className = region === HAND_SLOT ? 'doll-slot doll-hand' : 'doll-slot';
        el.dataset.region = region;
        el.title = def.name;
        el.style.left = `${b.x * 100}%`;
        el.style.top = `${b.y * 100}%`;
        el.style.width = `${b.w * 100}%`;
        el.style.height = `${b.h * 100}%`;
        const img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        el.appendChild(img);
        this.fig.appendChild(el);
        this.slots.push({ region, el, img });
        el.addEventListener('pointerdown', (ev) => this.down(ev, region, el));
        el.addEventListener('pointermove', (ev) => this.move(ev));
        el.addEventListener('pointerup', (ev) => this.up(ev));
        el.addEventListener('pointercancel', () => this.cancelDrag());
      }
    }
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (!this.open) this.cancelDrag();
    this.key = '';
    this.figKey = '';
    this.figure.reset();
  }

  /** Is this screen point over the open window? (The bag asks, to know where things are being dropped.) */
  contains(x: number, y: number): boolean {
    if (!this.open) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /** Called every frame. */
  update(e: Entity): void {
    if (!this.open) return;
    // The hands are one more slot: whatever is held shows there.
    const worn: Record<BodyRegionId, ItemId> = { ...(e.worn ?? {}) };
    if (e.actor?.weapon) worn[HAND_SLOT] = e.actor.weapon;
    this.lastWorn = worn;
    const wornKey = Object.entries(worn).map(([r, id]) => `${r}=${id}`).join(',');
    if (wornKey !== this.figKey) {
      this.figKey = wornKey;
      for (const s of this.slots) {
        const id = worn[s.region];
        s.el.classList.toggle('full', !!id);
        if (id) {
          s.img.src = iconUrl(id);
          s.el.title = itemDef(CONTENT, id)?.name ?? s.region;
        } else {
          s.img.style.display = 'none';
          s.el.title = this.slotName(s.region);
        }
      }
    }
    this.figure.paint(e);
    if (this.noteUntil && performance.now() > this.noteUntil) {
      this.note.textContent = '';
      this.noteUntil = 0;
    }
    const p = e.player;
    if (!p) return;
    const a = e.actor;
    const key = [
      Math.ceil(e.hp), e.maxHp, Math.floor(p.stamina), Math.floor(p.mana), wornKey,
      Object.entries(p.skills).map(([k, v]) => `${k}${v.level}.${Math.floor((v.xp * 20) / skillXp(v.level))}`).join(','),
      Object.entries(e.status).filter(([, t]) => t > 0).map(([k, t]) => `${k}${Math.ceil(t / 20)}`).join(','),
      a?.weapon ?? '', p.stats.might, p.stats.grace, p.stats.will,
    ].join('|');
    if (key === this.key) return;
    this.key = key;
    this.side.innerHTML = dollStats(e);
  }

  // -------------------------------------------------------------------------------------------
  // Worn pieces: click to look, double-click or drag off to take off.

  private down(ev: PointerEvent, region: BodyRegionId, el: HTMLElement): void {
    if (ev.button !== 0 || this.drag) return;
    ev.preventDefault();
    el.setPointerCapture(ev.pointerId);
    this.drag = { region, pointer: ev.pointerId, sx: ev.clientX, sy: ev.clientY, el, ghost: null };
  }

  private move(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointer !== ev.pointerId) return;
    if (!d.ghost) {
      if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
      const id = this.wornId(d.region);
      if (!id) return;
      const g = document.createElement('div');
      g.className = 'bag-item bag-ghost';
      g.style.setProperty('--icon', '40px');
      g.innerHTML = `<img alt="" src="${iconUrl(id)}"><span class="tag">take off</span>`;
      this.host.appendChild(g);
      d.ghost = g;
      d.el.classList.add('lifted');
    }
    d.ghost.style.left = `${ev.clientX - 20}px`;
    d.ghost.style.top = `${ev.clientY - 20}px`;
    const t = d.ghost.querySelector<HTMLElement>('.tag');
    const text = this.contains(ev.clientX, ev.clientY) ? '' : 'take off';
    if (t && t.textContent !== text) t.textContent = text;
  }

  private up(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointer !== ev.pointerId) return;
    const region = d.region;
    if (!d.ghost) {
      this.cancelDrag();
      this.click(region);
      return;
    }
    const inside = this.contains(ev.clientX, ev.clientY);
    this.cancelDrag();
    if (!inside) this.cb.remove(region);
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('lifted');
    if (d.el.hasPointerCapture(d.pointer)) d.el.releasePointerCapture(d.pointer);
    this.drag = null;
  }

  private wornId(region: BodyRegionId): ItemId | undefined {
    return this.lastWorn?.[region];
  }

  private lastWorn: Readonly<Record<BodyRegionId, ItemId>> | undefined;

  private slotName(region: string): string {
    return region === HAND_SLOT ? CONTENT.gear.hand.name : (CONTENT.gear.regions[region]?.name ?? region);
  }

  /** The slot (body part or hands) under this screen point, if any (the bag asks where a piece is dropped). */
  slotAt(x: number, y: number): string | null {
    for (const s of this.slots) {
      const r = s.el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return s.region;
    }
    return null;
  }

  private click(region: BodyRegionId): void {
    const now = performance.now();
    if (this.lastClick.region === region && now - this.lastClick.at < 380) {
      this.lastClick = { region: '', at: 0 };
      if (this.wornId(region)) this.cb.remove(region);
      return;
    }
    this.lastClick = { region, at: now };
    const id = this.wornId(region);
    const def = id ? itemDef(CONTENT, id) : undefined;
    this.note.innerHTML = def ? `<b>${esc(def.name)}</b> — ${describe(def).map(esc).join(' ')}` : esc(`${this.slotName(region)}: ${region === HAND_SLOT ? 'empty' : 'nothing worn'}.`);
    this.noteUntil = now + 6000;
  }
}
