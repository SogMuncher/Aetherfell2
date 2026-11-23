import { AREA_H, AREA_W, DROP_BELOW, type Drag, ICON, type Icon, PICK_PAD, STORE, type Spot, type WorldDrag, clamp01, describe, esc, iconUrl, leatherUrl, readStore } from './bagParts';
import { CONTENT, itemDef, stackWeight, thingDef, weaponStats, wornWeight } from '../../content';
import type { Entity, ItemId, ItemStack, SimState, ThrowAim } from '../../types';
import { bagOf, HAND_SLOT } from '../../types';
import { type Projection, toScreen } from '../raycaster/camera';
import { itemWorldSize } from '../entities/itemArt';
import { rhash } from '../color';


export interface BagCallbacks {
  /** Double-click: drink, eat, wield or use. */
  use(id: ItemId): void;
  /** Let go over the view: throw (or set down) toward that point. */
  throwItem(aim: ThrowAim): void;
  /** A loose item (entity id) in the view was dragged into the bag. */
  pickUp(entity: number): void;
  /** An item was dragged from the bag onto the paperdoll: armour onto the body, anything onto the hands. */
  wear(id: ItemId, slot?: string): void;
  /** A piece of armour lying in the view was dragged onto the paperdoll. */
  wearFrom(entity: number): void;
}

/**
 * The bag: a window you open with I where everything you carry lies as a picture you can push
 * around. Click an item to identify it, double-click to use it, and drag it out over the world to
 * throw it at that point (higher up the screen throws harder; near the bottom just sets it down).
 * Where things lie in the bag is your own business, so it stays on this screen and never reaches
 * the sim; only uses and throws do, as input.
 */
export class BagWindow {
  readonly el: HTMLElement;
  open = false;
  private readonly area: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly label: HTMLElement;
  private readonly icons = new Map<ItemId, Icon>();
  private readonly spots: Map<ItemId, Spot>;
  private win: Spot | null;
  /** Throws sent but not yet seen in the inventory: hide that many so the item leaves your hand at once. */
  private readonly pending = new Map<ItemId, { target: number; until: number }>();
  private proj: Projection | null = null;
  private drag: Drag | null = null;
  private worldDrag: WorldDrag | null = null;
  private state: SimState | null = null;
  private me: Entity | null = null;
  private readonly hit = { sx: 0, sy: 0, depth: 0 };
  private lastClick = { id: '', at: 0 };
  /** The item named by the last click while its label shows. */
  private labelled = '';
  private labelUntil = 0;
  private footKey = '';
  /** Set by the interface: is this screen point over the paperdoll window, and is it open (it also lets things be dragged out of the world). */
  dollAt: (x: number, y: number) => boolean = () => false;
  dollOpen: () => boolean = () => false;
  /** Set by the interface: the paperdoll slot (body part or hands) under this screen point. */
  dollSlotAt: (x: number, y: number) => string | null = () => null;

  constructor(
    private readonly host: HTMLElement,
    private readonly cb: BagCallbacks,
  ) {
    const stored = readStore();
    this.spots = stored.spots;
    this.win = stored.win;
    this.el = document.createElement('div');
    this.el.className = 'panel bag hidden';
    this.el.innerHTML = `<div class="bag-title"><h2>Bag</h2><button data-close title="Close (I)">×</button></div><div class="bag-area"></div><div class="bag-foot"></div>
      <div class="hint">Click: identify · double-click: use · drag onto the world: throw (higher up = further, bottom = set down) · drag things lying nearby into the bag to pick them up</div>`;
    host.appendChild(this.el);
    const area = this.el.querySelector<HTMLElement>('.bag-area');
    const foot = this.el.querySelector<HTMLElement>('.bag-foot');
    const title = this.el.querySelector<HTMLElement>('.bag-title');
    if (!area || !foot || !title) throw new Error('bag markup');
    this.area = area;
    this.foot = foot;
    this.area.style.width = `${AREA_W}px`;
    this.area.style.height = `${AREA_H}px`;
    this.area.style.backgroundImage = `url(${leatherUrl()})`;
    this.label = document.createElement('div');
    this.label.className = 'bag-label hidden';
    this.area.appendChild(this.label);
    this.el.style.setProperty('--icon', `${ICON}px`);
    this.el.querySelector('button[data-close]')?.addEventListener('click', () => this.toggle(false));
    this.makeMovable(title);
    this.placeWindow();
    this.listenToView();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (!this.open) {
      this.cancelDrag();
      this.cancelWorldDrag();
      const canvas = document.getElementById('screen');
      if (canvas) canvas.style.cursor = '';
    }
    this.footKey = '';
  }

  /** Called every frame. */
  update(e: Entity, proj: Projection | null, state: SimState): void {
    this.proj = proj;
    this.state = state;
    this.me = e;
    const p = e.player;
    if (!this.open || !p) return;
    const now = performance.now();
    this.sync(bagOf(e), now);
    if (this.labelUntil && now > this.labelUntil) {
      this.labelled = '';
      this.label.classList.add('hidden');
      this.labelUntil = 0;
    }
    const a = e.actor;
    const wpn = a ? weaponStats(CONTENT, thingDef(CONTENT, e.def), a.weapon) : null;
    const load = stackWeight(bagOf(e)) + wornWeight(CONTENT, e.worn);
    const key = `${load.toFixed(1)}|${p.stats.might}|${a?.weapon ?? ''}|${Object.values(p.skills).map((s) => s.level).join(',')}`;
    if (key === this.footKey) return;
    this.footKey = key;
    const limit = 30 + p.stats.might * 4;
    const held = a?.weapon ? itemDef(CONTENT, a.weapon) : undefined;
    const edge = held ? `, ${held.wear}/${held.durability} blows left` : '';
    const skills = Object.entries(p.skills).map(([k, v]) => `${k} ${v.level}`).join(' · ');
    this.foot.innerHTML = `<div${load > limit ? ' class="heavy"' : ''}>Load ${load.toFixed(1)} / ${limit} kg${load > limit ? ' — too heavy, you are slowed' : ''}</div>
      ${wpn ? `<div>In hand: ${esc(wpn.name)} (${wpn.kind}${edge})</div>` : ''}
      <div class="dim">${esc(skills)}</div>
      <div class="dim">Might ${p.stats.might} · Grace ${p.stats.grace} · Will ${p.stats.will}</div>`;
  }

  /** Keeps one picture per stack, with a count when there is more than one. */
  private sync(inv: readonly ItemStack[], now: number): void {
    const present = new Set<ItemId>();
    for (const s of inv) {
      present.add(s.id);
      let shown = s.count;
      const pend = this.pending.get(s.id);
      if (pend) {
        if (s.count <= pend.target || now > pend.until) this.pending.delete(s.id);
        else shown = Math.min(shown, pend.target);
      }
      let icon = this.icons.get(s.id);
      if (!icon) icon = this.addIcon(s.id);
      if (icon.shown !== shown) {
        icon.shown = shown;
        icon.count.textContent = shown > 1 ? String(shown) : '';
        icon.el.classList.toggle('hidden', shown <= 0);
      }
    }
    for (const [id, icon] of this.icons) {
      if (present.has(id)) continue;
      if (this.drag?.id === id) this.cancelDrag();
      icon.el.remove();
      this.icons.delete(id);
      this.pending.delete(id);
    }
  }

  private addIcon(id: ItemId): Icon {
    const el = document.createElement('div');
    el.className = 'bag-item';
    el.innerHTML = `<img alt="" draggable="false" src="${iconUrl(id)}"><span class="n"></span>`;
    const count = el.querySelector<HTMLElement>('.n') ?? el;
    this.area.appendChild(el);
    const spot = this.spots.get(id) ?? this.freeSpot(id);
    this.spots.set(id, spot);
    this.placeIcon(el, spot);
    const icon: Icon = { el, count, shown: -1 };
    this.icons.set(id, icon);
    el.addEventListener('pointerdown', (ev) => this.down(ev, id, el));
    el.addEventListener('pointermove', (ev) => this.move(ev));
    el.addEventListener('pointerup', (ev) => this.up(ev));
    el.addEventListener('pointercancel', () => this.cancelDrag());
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

  private move(ev: PointerEvent): void {
    const d = this.drag;
    if (!d || d.pointer !== ev.pointerId) return;
    if (!d.ghost) {
      if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
      const g = document.createElement('div');
      g.className = 'bag-item bag-ghost';
      g.innerHTML = `<img alt="" src="${iconUrl(d.id)}"><span class="tag"></span>`;
      this.host.appendChild(g);
      d.ghost = g;
      d.el.classList.add('lifted');
      this.label.classList.add('hidden');
    }
    d.ghost.style.left = `${ev.clientX - d.ox}px`;
    d.ghost.style.top = `${ev.clientY - d.oy}px`;
    // Tell the player what letting go here will do.
    const where = this.targetAt(ev.clientX, ev.clientY);
    const aim = where === 'view' ? this.aimAt(d.id, ev.clientX, ev.clientY) : null;
    const toHand = this.toHand(d.id, ev.clientX, ev.clientY);
    const tag = where === 'view' && aim ? (aim.power < DROP_BELOW ? 'set down' : aim.power > 0.7 ? 'hurl' : 'throw') : where === 'bag' ? '' : where === 'doll' ? (toHand ? 'hold' : 'wear') : '✕';
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
    const where = this.targetAt(ev.clientX, ev.clientY);
    if (where === 'bag') {
      const r = this.area.getBoundingClientRect();
      const s = { x: clamp01((ev.clientX - d.ox - r.left) / (AREA_W - ICON)), y: clamp01((ev.clientY - d.oy - r.top) / (AREA_H - ICON)) };
      this.spots.set(d.id, s);
      this.placeIcon(d.el, s);
      // The last thing you touched sits on top.
      this.area.appendChild(d.el);
      this.save();
    } else if (where === 'doll') {
      if (this.toHand(d.id, ev.clientX, ev.clientY)) this.cb.wear(d.id, HAND_SLOT);
      else this.cb.wear(d.id);
    } else if (where === 'view') {
      const aim = this.aimAt(d.id, ev.clientX, ev.clientY);
      const icon = this.icons.get(d.id);
      if (aim && icon && icon.shown > 0) {
        this.cb.throwItem(aim);
        this.pending.set(d.id, { target: icon.shown - 1, until: performance.now() + 1500 });
      }
    }
    this.cancelDrag();
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.el.classList.remove('lifted');
    if (d.el.hasPointerCapture(d.pointer)) d.el.releasePointerCapture(d.pointer);
    this.drag = null;
  }

  /** The item you last clicked, while the bag is open and its label shows (for the quick keys). */
  picked(): ItemId | null {
    return this.open && this.labelled !== '' && !this.label.classList.contains('hidden') ? this.labelled : null;
  }

  /** One click names the item; a second quick click uses it. */
  private click(id: ItemId): void {
    const now = performance.now();
    if (this.lastClick.id === id && now - this.lastClick.at < 380) {
      this.lastClick = { id: '', at: 0 };
      this.cb.use(id);
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
    this.area.appendChild(this.label);
    this.labelUntil = now + 4000;
  }

  /** Is this screen point inside the bag, over the open world, or over some other window? */
  /** Dropped on the paperdoll here, does it go into the hands? (Anything not armour does, and anything dropped on the hands.) */
  private toHand(id: ItemId, x: number, y: number): boolean {
    return !itemDef(CONTENT, id)?.armour || this.dollSlotAt(x, y) === HAND_SLOT;
  }

  private targetAt(x: number, y: number): 'bag' | 'doll' | 'view' | 'none' {
    const r = this.area.getBoundingClientRect();
    if (this.open && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return 'bag';
    if (this.dollAt(x, y)) return 'doll';
    const hit = document.elementFromPoint(x, y);
    if (hit instanceof Element && hit.closest('.panel, .spellbar')) return 'none';
    const canvas = document.getElementById('screen');
    const c = canvas?.getBoundingClientRect();
    if (!c || x < c.left || x > c.right || y < c.top || y > c.bottom) return 'none';
    return 'view';
  }

  /**
   * The throw toward a point on the view: the direction is the line from your eye through that
   * point, and its height on the screen sets how hard.
   */
  private aimAt(item: ItemId, x: number, y: number): ThrowAim | null {
    const p = this.proj;
    const canvas = document.getElementById('screen');
    const c = canvas?.getBoundingClientRect();
    if (!p || !c || c.width <= 0 || c.height <= 0) return null;
    const sx = ((x - c.left) / c.width) * p.W;
    const sy = ((y - c.top) / c.height) * p.H;
    return {
      item,
      yaw: p.cam.yaw + Math.atan2(sx - p.W / 2, p.F),
      lift: Math.atan2(p.HOR - sy, p.F),
      power: clamp01(1 - sy / p.H),
    };
  }

  /**
   * With the bag open the mouse is free, so things lying in the world can be pulled straight into
   * it: press on a loose item in the view, drag it over the bag and let go. The sim decides whether
   * you can actually reach it (distance and walls); this only finds what is under the cursor.
   */
  private listenToView(): void {
    window.addEventListener('pointerdown', (ev) => {
      if ((!this.open && !this.dollOpen()) || ev.button !== 0 || this.drag || this.worldDrag) return;
      if (this.targetAt(ev.clientX, ev.clientY) !== 'view') return;
      const hit = this.worldItemAt(ev.clientX, ev.clientY);
      if (!hit) return;
      ev.preventDefault();
      this.worldDrag = { entity: hit.entity, item: hit.item, pointer: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ghost: null };
    });
    window.addEventListener('pointermove', (ev) => {
      const d = this.worldDrag;
      if (!d) {
        if ((this.open || this.dollOpen()) && !this.drag) this.hover(ev.clientX, ev.clientY);
        return;
      }
      if (d.pointer !== ev.pointerId) return;
      if (!d.ghost) {
        if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 4) return;
        const g = document.createElement('div');
        g.className = 'bag-item bag-ghost';
        g.style.setProperty('--icon', `${ICON}px`);
        g.innerHTML = `<img alt="" src="${iconUrl(d.item)}"><span class="tag"></span>`;
        this.host.appendChild(g);
        d.ghost = g;
      }
      d.ghost.style.left = `${ev.clientX - ICON / 2}px`;
      d.ghost.style.top = `${ev.clientY - ICON / 2}px`;
      const reach = this.inReach(d.entity);
      const over = this.targetAt(ev.clientX, ev.clientY);
      const tag = reach === null ? '✕' : !reach ? 'too far' : over === 'bag' ? 'into the bag' : over === 'doll' ? (itemDef(CONTENT, d.item)?.armour ? 'wear it' : '✕') : '';
      const t = d.ghost.querySelector<HTMLElement>('.tag');
      if (t && t.textContent !== tag) t.textContent = tag;
    });
    const end = (ev: PointerEvent): void => {
      const d = this.worldDrag;
      if (!d || d.pointer !== ev.pointerId) return;
      if (d.ghost && this.targetAt(ev.clientX, ev.clientY) === 'doll' && this.inReach(d.entity) && itemDef(CONTENT, d.item)?.armour) {
        this.cb.wearFrom(d.entity);
      } else if (d.ghost && this.targetAt(ev.clientX, ev.clientY) === 'bag' && this.inReach(d.entity)) {
        // It lands in the bag where you let go of it.
        const r = this.area.getBoundingClientRect();
        const s = { x: clamp01((ev.clientX - ICON / 2 - r.left) / (AREA_W - ICON)), y: clamp01((ev.clientY - ICON / 2 - r.top) / (AREA_H - ICON)) };
        this.spots.set(d.item, s);
        const icon = this.icons.get(d.item);
        if (icon) {
          this.placeIcon(icon.el, s);
          this.area.appendChild(icon.el);
        }
        this.save();
        this.cb.pickUp(d.entity);
      }
      this.cancelWorldDrag();
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', () => this.cancelWorldDrag());
  }

  private cancelWorldDrag(): void {
    this.worldDrag?.ghost?.remove();
    this.worldDrag = null;
  }

  /** A grab cursor over loose items you could pull into the bag. */
  private hover(x: number, y: number): void {
    const canvas = document.getElementById('screen');
    if (!canvas) return;
    const over = this.targetAt(x, y) === 'view' && this.worldItemAt(x, y) !== null;
    const want = over ? 'grab' : '';
    if (canvas.style.cursor !== want) canvas.style.cursor = want;
  }

  /** Is that loose item close enough to reach? null when it is gone. */
  private inReach(entity: number): boolean | null {
    const it = this.state?.entities.get(entity);
    const me = this.me;
    if (!it?.item || it.dead || !me) return null;
    const d = Math.hypot(it.pos.x - me.pos.x, it.pos.y - me.pos.y, it.z - (me.z + 1));
    return d <= CONTENT.rules.pickReach;
  }

  /** The nearest loose item whose picture is under this screen point, as last drawn. */
  private worldItemAt(x: number, y: number): { entity: number; item: ItemId } | null {
    const p = this.proj;
    const st = this.state;
    const canvas = document.getElementById('screen');
    const c = canvas?.getBoundingClientRect();
    if (!p || !st || !c || c.width <= 0 || c.height <= 0) return null;
    const px = ((x - c.left) / c.width) * p.W;
    const py = ((y - c.top) / c.height) * p.H;
    let best: { entity: number; item: ItemId } | null = null;
    let bestDepth = Infinity;
    for (const e of st.entities.values()) {
      if (!e.item || e.dead || e.heldBy !== null) continue;
      if (!toScreen(p, e.pos.x, e.pos.y, e.z, this.hit) || this.hit.depth > 40 || this.hit.depth >= bestDepth) continue;
      const size = (itemWorldSize(itemDef(CONTENT, e.item.id)) * p.F) / this.hit.depth;
      const half = size / 2 + PICK_PAD;
      if (px < this.hit.sx - half || px > this.hit.sx + half || py < this.hit.sy - size - PICK_PAD || py > this.hit.sy + PICK_PAD) continue;
      best = { entity: e.id, item: e.item.id };
      bestDepth = this.hit.depth;
    }
    return best;
  }

  /** Drag the bag by its title bar, like any window. */
  private makeMovable(handle: HTMLElement): void {
    let grab: { id: number; ox: number; oy: number } | null = null;
    handle.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || (ev.target instanceof Element && ev.target.closest('button'))) return;
      const r = this.el.getBoundingClientRect();
      grab = { id: ev.pointerId, ox: ev.clientX - r.left, oy: ev.clientY - r.top };
      handle.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    handle.addEventListener('pointermove', (ev) => {
      if (!grab || grab.id !== ev.pointerId) return;
      this.win = { x: ev.clientX - grab.ox, y: ev.clientY - grab.oy };
      this.placeWindow();
    });
    const end = (ev: PointerEvent): void => {
      if (!grab || grab.id !== ev.pointerId) return;
      grab = null;
      this.save();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => this.placeWindow());
  }

  private placeWindow(): void {
    if (!this.win) return;
    const w = this.el.offsetWidth || AREA_W + 32;
    const h = this.el.offsetHeight || AREA_H + 120;
    const x = Math.max(0, Math.min(window.innerWidth - w, this.win.x));
    const y = Math.max(0, Math.min(window.innerHeight - h, this.win.y));
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.el.style.right = 'auto';
  }

  private save(): void {
    const spots: Record<string, [number, number]> = {};
    for (const [id, s] of this.spots) spots[id] = [Math.round(s.x * 1000) / 1000, Math.round(s.y * 1000) / 1000];
    try {
      localStorage.setItem(STORE, JSON.stringify({ spots, win: this.win ? [Math.round(this.win.x), Math.round(this.win.y)] : null }));
    } catch {
      /* storage may be blocked: the layout just won't be remembered */
    }
  }
}
