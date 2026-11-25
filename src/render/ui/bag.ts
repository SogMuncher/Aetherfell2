import { DROP_BELOW, ICON, PICK_PAD, STORE, type Spot, type WorldDrag, clamp01, esc, iconUrl, readStore } from './bagParts';
import { BagArea, type DropTarget } from './bagArea';
import { makeMovable } from './movable';
import { CONTENT, itemDef, stackWeight, thingDef, weaponStats, wornWeight } from '../../content';
import type { Entity, ItemId, SimState, ThrowAim } from '../../types';
import { bagOf, HAND_SLOT } from '../../types';
import { type Projection, toScreen } from '../raycaster/camera';
import { itemWorldSize } from '../entities/itemArt';


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
  readonly area: BagArea;
  private readonly foot: HTMLElement;
  private readonly spots: Map<ItemId, Spot>;
  private win: Spot | null;
  private proj: Projection | null = null;
  private worldDrag: WorldDrag | null = null;
  private state: SimState | null = null;
  private me: Entity | null = null;
  private readonly hit = { sx: 0, sy: 0, depth: 0 };
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
    this.el.innerHTML = `<div class="bag-title"><h2>Bag</h2><button data-close title="Close (I)">×</button></div><div class="bag-foot"></div>
      <div class="hint">Click: identify · double-click: use · drag onto the world: throw (higher up = further, bottom = set down) · drag things lying nearby into the bag to pick them up</div>`;
    host.appendChild(this.el);
    const foot = this.el.querySelector<HTMLElement>('.bag-foot');
    const title = this.el.querySelector<HTMLElement>('.bag-title');
    if (!foot || !title) throw new Error('bag markup');
    this.foot = foot;
    this.area = new BagArea(host, this.el, this.spots, { use: (id) => this.cb.use(id), moved: () => this.save() });
    this.el.insertBefore(this.area.el, foot);
    this.area.targets.push(this.dollTarget(), this.viewTarget());
    this.el.style.setProperty('--icon', `${ICON}px`);
    this.el.querySelector('button[data-close]')?.addEventListener('click', () => this.toggle(false));
    makeMovable(this.el, title, this.win, (w) => {
      this.win = w;
      this.save();
    });
    this.listenToView();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.el.classList.toggle('hidden', !this.open);
    if (!this.open) {
      this.area.cancel();
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
    this.area.sync(bagOf(e));
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

  /** The item you last clicked, while the bag is open and its label shows (for the quick keys). */
  picked(): ItemId | null {
    return this.open ? this.area.picked() : null;
  }

  /** Let go over the paperdoll: armour onto the body, anything onto the hands. */
  private dollTarget(): DropTarget {
    return {
      tag: (id, x, y) => (this.dollAt(x, y) ? (this.toHand(id, x, y) ? 'hold' : 'wear') : null),
      drop: (id, x, y) => this.cb.wear(id, this.toHand(id, x, y) ? HAND_SLOT : undefined),
    };
  }

  /** Let go over the open world: throw toward that point (higher up harder, near the bottom just set down). */
  private viewTarget(): DropTarget {
    return {
      tag: (id, x, y) => {
        if (this.targetAt(x, y) !== 'view') return null;
        const aim = this.aimAt(id, x, y);
        return aim ? (aim.power < DROP_BELOW ? 'set down' : aim.power > 0.7 ? 'hurl' : 'throw') : null;
      },
      drop: (id, x, y) => {
        const aim = this.aimAt(id, x, y);
        if (!aim) return;
        this.cb.throwItem(aim);
        this.area.sent(id);
      },
    };
  }

  /** Is this screen point inside the bag, over the open world, or over some other window? */
  /** Dropped on the paperdoll here, does it go into the hands? (Anything not armour does, and anything dropped on the hands.) */
  private toHand(id: ItemId, x: number, y: number): boolean {
    return !itemDef(CONTENT, id)?.armour || this.dollSlotAt(x, y) === HAND_SLOT;
  }

  private targetAt(x: number, y: number): 'bag' | 'doll' | 'view' | 'none' {
    if (this.open && this.area.contains(x, y)) return 'bag';
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
      if ((!this.open && !this.dollOpen()) || ev.button !== 0 || this.area.dragging || this.worldDrag) return;
      if (this.targetAt(ev.clientX, ev.clientY) !== 'view') return;
      const hit = this.worldItemAt(ev.clientX, ev.clientY);
      if (!hit) return;
      ev.preventDefault();
      this.worldDrag = { entity: hit.entity, item: hit.item, pointer: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ghost: null };
    });
    window.addEventListener('pointermove', (ev) => {
      const d = this.worldDrag;
      if (!d) {
        if ((this.open || this.dollOpen()) && !this.area.dragging) this.hover(ev.clientX, ev.clientY);
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
        this.area.landAt(d.item, ev.clientX, ev.clientY);
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
