import type { BodyRegionId, DamageKind, Entity, ItemId } from '../../types';
import { DAMAGE_KINDS } from '../../types';
import { CONTENT, gearCondition, gearEffect, itemDef, skillXp, stackWeight, thingDef, weaponStats, wornWeight } from '../../content';
import { describe, iconUrl } from './bagParts';

export interface PaperdollCallbacks {
  /** Take what is worn on this part of the body off (it goes into the bag). */
  remove(region: BodyRegionId): void;
}

/** The figure is painted at this many pixels and shown 2× as big. */
const FIG_W = 76;
const FIG_H = 112;
const SHOW = 2;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

function css(c: number, k = 1): string {
  const ch = (shift: number): number => Math.max(0, Math.min(255, Math.round(((c >> shift) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const SKIN = 0xd2a078;
const UNDER = 0x5a4e40;

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
      <div class="hint">Double-click armour in the bag, or drag it here from the bag or from the ground, to wear it · double-click a worn piece, or drag it off, to take it off</div>`;
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
    this.fig.style.width = `${FIG_W * SHOW}px`;
    this.fig.style.height = `${FIG_H * SHOW}px`;
    this.el.querySelector('button[data-close]')?.addEventListener('click', () => this.toggle(false));
    // One slot over every box of every body part the content names.
    for (const [region, def] of Object.entries(CONTENT.gear.regions)) {
      for (const b of def.at) {
        const el = document.createElement('div');
        el.className = 'doll-slot';
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
    const worn = e.worn ?? {};
    this.lastWorn = worn;
    const wornKey = Object.entries(worn).map(([r, id]) => `${r}=${id}`).join(',');
    if (wornKey !== this.figKey) {
      this.figKey = wornKey;
      this.paintFigure(worn);
      for (const s of this.slots) {
        const id = worn[s.region];
        s.el.classList.toggle('full', !!id);
        if (id) {
          s.img.src = iconUrl(id);
          s.el.title = itemDef(CONTENT, id)?.name ?? s.region;
        } else {
          s.img.style.display = 'none';
          s.el.title = CONTENT.gear.regions[s.region]?.name ?? s.region;
        }
      }
    }
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
      a?.weapon ?? '', a?.wear ?? 0, p.stats.might, p.stats.grace, p.stats.will,
    ].join('|');
    if (key === this.key) return;
    this.key = key;
    this.side.innerHTML = this.stats(e);
  }

  /** The figure: skin and plain cloth, with every worn piece painted over its part in its own colour. */
  private paintFigure(worn: Readonly<Record<BodyRegionId, ItemId>>): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, FIG_W, FIG_H);
    // Bare parts first, then the garments over them.
    const draw = (region: BodyRegionId, dressed: boolean): void => {
      const def = CONTENT.gear.regions[region];
      if (!def) return;
      const id = worn[region];
      const item = id ? itemDef(CONTENT, id) : undefined;
      if (dressed && !item) return;
      const hard = (item?.look?.plate ?? 0) > 0.5;
      const base = item ? item.tint : region === 'head' || region === 'arms' || region === 'legs' ? SKIN : UNDER;
      for (const b of def.at) {
        const x = Math.round(b.x * FIG_W);
        const y = Math.round(b.y * FIG_H);
        const w = Math.round(b.w * FIG_W);
        const h = Math.round(b.h * FIG_H);
        const round = region === 'head';
        for (let j = 0; j < h; j++) {
          for (let i = 0; i < w; i++) {
            const nx = (i + 0.5) / w - 0.5;
            const ny = (j + 0.5) / h - 0.5;
            if (round && nx * nx * 4 + ny * ny * 4 > 1) continue;
            // Light from the top left; plate gets a bright rim and bands, cloth a seam.
            let k = 0.85 - nx * 0.45 - ny * 0.25;
            if (item && hard) {
              if (i === 0 || j === 0) k += 0.25;
              if (j % 5 === 4) k -= 0.2;
            } else if (item && Math.abs(nx) < 0.04) k -= 0.15;
            g.fillStyle = css(base, k);
            g.fillRect(x + i, y + j, 1, 1);
          }
        }
      }
    };
    for (const r of Object.keys(CONTENT.gear.regions)) draw(r, false);
    for (const r of Object.keys(CONTENT.gear.regions)) draw(r, true);
  }

  private stats(e: Entity): string {
    const p = e.player;
    if (!p) return '';
    const def = thingDef(CONTENT, e.def);
    const worn = e.worn ?? {};
    const bar = (cls: string, v: number, max: number, label: string): string => `<div class="doll-bar ${cls}"><i style="width:${Math.max(0, Math.min(100, (100 * v) / Math.max(1, max)))}%"></i><span>${label} ${Math.ceil(v)} / ${Math.round(max)}</span></div>`;
    // Protection: what each body part turns off a blow, and the kinds of harm that worn pieces change.
    const base = def.health?.armor ?? 0;
    const parts: string[] = [];
    const harm: Partial<Record<DamageKind, number>> = {};
    for (const [region, rd] of Object.entries(CONTENT.gear.regions)) {
      if (!def.wears?.includes(region)) continue;
      const id = worn[region];
      const a = id ? itemDef(CONTENT, id)?.armour : undefined;
      const val = base + (a ? a.armor * gearEffect(CONTENT.gear, a) : 0);
      const item = id ? itemDef(CONTENT, id) : undefined;
      parts.push(`<div class="${a ? '' : 'dim'}">${esc(rd.name)} <b>${val.toFixed(1)}</b> ${item && a ? `· ${esc(item.name)} <small class="dim">(${gearCondition(a)})</small>` : '· nothing worn'}</div>`);
      if (a) for (const k of DAMAGE_KINDS) if (a.resist[k] !== undefined) harm[k] = (harm[k] ?? 1) * (a.resist[k] ?? 1);
    }
    const kinds = Object.entries(harm).filter(([, v]) => Math.abs((v ?? 1) - 1) > 0.01).map(([k, v]) => `${k} ${(v ?? 1) < 1 ? '−' : '+'}${Math.round(Math.abs(1 - (v ?? 1)) * 100)}%`);
    const wpn = e.actor ? weaponStats(CONTENT, def, e.actor.weapon) : null;
    const hand = wpn ? `${esc(wpn.name)} · ${wpn.damage} ${wpn.kind}${e.actor?.weapon ? ` · edge ${e.actor.wear}/${wpn.durability}` : ''}` : 'bare hands';
    const skills = Object.entries(p.skills)
      .map(([k, s]) => `<div class="doll-skill"><span>${esc(k)} ${s.level}</span><i><b style="width:${Math.min(100, (100 * s.xp) / skillXp(s.level))}%"></b></i></div>`)
      .join('');
    const afflictions = Object.entries(e.status)
      .filter(([, t]) => t > 0)
      .map(([id, t]) => `<span class="doll-status">${esc(CONTENT.statuses[id]?.name ?? id)} <small>${Math.ceil(t / 20)}s</small></span>`)
      .join('');
    const load = stackWeight(p.inventory) + wornWeight(CONTENT, e.worn);
    const limit = 30 + p.stats.might * 4;
    return `<div class="doll-name">${esc(p.name)}</div>
      ${bar('hp', e.hp, e.maxHp, 'Health')}${bar('st', p.stamina, p.maxStamina, 'Stamina')}${bar('mp', p.mana, p.maxMana, 'Aether')}
      <h3>Protection</h3><div class="doll-parts">${parts.join('')}</div>
      ${kinds.length ? `<div class="dim">Harm taken: ${esc(kinds.join(', '))}</div>` : ''}
      <h3>Stats</h3><div>Might ${p.stats.might} · Grace ${p.stats.grace} · Will ${p.stats.will}</div>
      <div class="dim">${esc(hand)}</div>
      <div class="${load > limit ? 'heavy' : 'dim'}">Load ${load.toFixed(1)} / ${limit} kg</div>
      <h3>Skills</h3>${skills}
      <h3>Afflictions</h3><div>${afflictions || '<span class="dim">none</span>'}</div>`;
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
    this.note.innerHTML = def ? `<b>${esc(def.name)}</b> — ${describe(def).map(esc).join(' ')}` : esc(`${CONTENT.gear.regions[region]?.name ?? region}: nothing worn.`);
    this.noteUntil = now + 6000;
  }
}
