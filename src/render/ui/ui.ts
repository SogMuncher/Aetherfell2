import type { BodyRegionId, CheatValue, Entity, ItemId, ItemStack, NetStatus, ThrowAim, RuneId, SimEvent, SimState, WorldSampler, BiomeId } from '../../types';
import { CONTENT, MAX_SPELL_RUNES, itemDef, isNight, composeSpell, describeSpell, rainAt, spellFor, spellKey, thingDef } from '../../content';
import type { Projection } from '../raycaster/camera';
import { toScreen } from '../raycaster/camera';
import { UI_CSS, hudVariables } from './style';
import { BagWindow } from './bag';
import { PaperdollWindow } from './paperdoll';
import { SettingsMenu } from './settingsMenu';
import type { SettingsStore } from '../../settings';

export type MenuAction = 'solo' | 'host' | 'join' | 'continue';

export interface UiCallbacks {
  use(id: ItemId): void;
  drop(id: ItemId): void;
  /** The bag: an item let go over the view, to be thrown toward that point. */
  throwItem(aim: ThrowAim): void;
  /** The bag: a loose item in the view was dragged into it (entity id). */
  pickUp(entity: number): void;
  /** The paperdoll: put this piece of armour from the bag on (or, with a slot of the hands, hold anything). */
  wear(id: ItemId, slot?: string): void;
  /** The paperdoll: put on a piece of armour lying in the view (entity id). */
  wearFrom(entity: number): void;
  /** The paperdoll: take what is worn on this part of the body off. */
  remove(region: BodyRegionId): void;
  choose(i: number): void;
  /** Runebook: make these runes the prepared spell. */
  prepare(runes: readonly RuneId[]): void;
  menu(action: MenuAction, name: string, code: string): void;
  /** Settings menu, Debug cheats: ask for a cheat (the host's sim decides). */
  cheat(id: string, value: CheatValue): void;
}

export interface UiFrame {
  state: SimState;
  local: Entity | null;
  net: NetStatus;
  proj: Projection | null;
  /** Quick-use keys 1..4: item id, '@throwable' or ''. */
  quick: readonly string[];
  fps: number;
  debug: string;
}

/** Map colour of a biome, from its definition (map colour, else its far colour). */
function biomeMapColour(id: BiomeId): readonly [number, number, number] {
  const b = CONTENT.biomes[id];
  return b?.map ?? b?.far ?? [92, 132, 62];
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** All the 2D interface, as plain DOM over the canvas. Reads state; talks back only through callbacks. */
export class GameUI {
  private root: HTMLElement;
  private hp: HTMLElement;
  private st: HTMLElement;
  private mp: HTMLElement;
  private spellbar: HTMLElement;
  private spellbarKey = '';
  private quickbar: HTMLElement;
  private quickKey = '';
  private book: HTMLElement;
  private bookOpen = false;
  private bookKey = '';
  /** Runes laid into the book's slots but not prepared yet (local to this screen). */
  private draft: RuneId[] = [];
  private compass: HTMLElement;
  private info: HTMLElement;
  private netEl: HTMLElement;
  private prompt: HTMLElement;
  private toastEl: HTMLElement;
  private log: HTMLElement;
  private dialogue: HTMLElement;
  private side: HTMLElement;
  private mapPanel: HTMLElement;
  private mapCanvas: HTMLCanvasElement;
  private menuEl: HTMLElement;
  private debugEl: HTMLElement;
  private downedEl: HTMLElement;
  private sayLayer: HTMLElement;
  private sideMode: 'journal' | null = null;
  private bag: BagWindow;
  private doll: PaperdollWindow;
  /** Settings and the Debug cheats sub-menu (settingsMenu.ts). */
  readonly settings: SettingsMenu;
  private mapOpen = false;
  private debugOn = false;
  private toastTimer = 0;
  private dialogueKey = '';
  private sideKey = '';
  private says: { speaker: number; text: string; until: number; el: HTMLElement }[] = [];
  private mapJob: { cx: number; cy: number; row: number; img: ImageData } | null = null;
  menuOpen = true;

  constructor(
    host: HTMLElement,
    private readonly cb: UiCallbacks,
    private readonly sampler: () => WorldSampler | null,
    hasSave: boolean,
    store: SettingsStore,
  ) {
    const style = document.createElement('style');
    style.textContent = hudVariables(CONTENT.hud) + UI_CSS;
    document.head.appendChild(style);
    this.root = host;
    host.classList.add('prestart');
    const bars = el('div', 'hud-bars', host);
    this.quickbar = el('div', 'quickbar', bars);
    this.hp = el('div', '', el('div', 'bar hp', bars));
    this.st = el('div', '', el('div', 'bar st', bars));
    this.mp = el('div', '', el('div', 'bar mp', bars));
    this.spellbar = el('div', 'spellbar', host);
    this.compass = el('div', 'compass', host);
    this.info = el('div', 'info', host);
    this.netEl = el('div', 'net', host);
    this.prompt = el('div', 'prompt', host);
    el('div', 'cross', host);
    this.toastEl = el('div', 'toast', host);
    this.log = el('div', 'log', host);
    this.sayLayer = el('div', '', host);
    this.dialogue = el('div', 'panel dialogue hidden', host);
    this.side = el('div', 'panel side hidden', host);
    this.book = el('div', 'panel book hidden', host);
    this.bag = new BagWindow(host, {
      use: (id) => this.cb.use(id),
      throwItem: (aim) => this.cb.throwItem(aim),
      pickUp: (id) => this.cb.pickUp(id),
      wear: (id, slot) => this.cb.wear(id, slot),
      wearFrom: (id) => this.cb.wearFrom(id),
    });
    this.doll = new PaperdollWindow(host, { remove: (r) => this.cb.remove(r) });
    this.bag.dollAt = (x, y) => this.doll.contains(x, y);
    this.bag.dollSlotAt = (x, y) => this.doll.slotAt(x, y);
    this.bag.dollOpen = () => this.doll.open;
    this.mapPanel = el('div', 'panel map hidden', host, '<h2>Map</h2>');
    this.mapCanvas = el('canvas', '', this.mapPanel);
    this.mapCanvas.width = 220;
    this.mapCanvas.height = 220;
    this.debugEl = el('div', 'debug hidden', host);
    this.downedEl = el('div', 'downed hidden', host, 'You are down…');
    this.menuEl = el('div', 'panel menu', host);
    this.settings = new SettingsMenu(host, store, { cheat: (id, v) => this.cb.cheat(id, v) });
    this.buildMenu(hasSave);
  }

  private buildMenu(hasSave: boolean): void {
    const params = new URLSearchParams(location.search);
    const code = params.get('join') ?? '';
    this.menuEl.innerHTML = `
      <h1>Aetherfell</h1><div class="sub">— the second journey —</div>
      <div class="row">Name <input id="af-name" maxlength="16" value="${esc(localStorage.getItem('aetherfell2.name') ?? 'Wanderer')}"></div>
      <div class="row"><button data-a="solo">New journey</button>${hasSave ? '<button data-a="continue">Continue</button>' : ''}<button data-a="host">Host co-op</button><button data-settings>Settings</button></div>
      <div class="row">Friend's code <input id="af-code" maxlength="8" value="${esc(code)}" placeholder="ABCD12"> <button data-a="join">Join</button></div>
      <div class="keys">
        <div><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint</div>
        <div><kbd>Space</kbd> jump · hold in the air to glide</div>
        <div><kbd>LMB</kbd> swing · <b>hold</b> to wind up a heavy blow (costs stamina)</div>
        <div>mouse sideways = sweep that way · still = thrust · pull down = chop. Walls, doors and trees can be struck too</div>
        <div><kbd>RMB</kbd> guard (tap just before a hit to parry)</div>
        <div><kbd>Q</kbd>/<kbd>MMB</kbd> cast · <kbd>B</kbd> runebook</div>
        <div><kbd>E</kbd> use / talk / open / revive</div>
        <div><kbd>F</kbd> grab, then throw · <kbd>G</kbd> throw what is in your hands (look down to set it at your feet)</div>
        <div><kbd>1</kbd>–<kbd>4</kbd> quick use (draught, flask, bread…) · in the bag, click an item then a number to change a key</div>
        <div><kbd>I</kbd> bag (drag items onto the world to throw, or things lying nearby into the bag)</div>
        <div><kbd>C</kbd> you: armour on a paperdoll, stats, skills, afflictions (double-click armour in the bag to wear it, drag anything onto the hands to hold it)</div>
        <div><kbd>J</kbd> journal · <kbd>M</kbd> map</div>
        <div><kbd>F5</kbd> save · <kbd>F9</kbd> load · <kbd>F3</kbd> debug</div>
        <div><kbd>Esc</kbd>/<kbd>O</kbd> settings and debug cheats</div>
      </div>`;
    this.menuEl.querySelector('button[data-settings]')?.addEventListener('click', () => this.settings.toggle());
    this.menuEl.querySelectorAll<HTMLButtonElement>('button[data-a]').forEach((b) => {
      b.addEventListener('click', () => {
        const a = b.dataset.a as MenuAction | undefined;
        if (!a) return;
        const name = (this.menuEl.querySelector('#af-name') as HTMLInputElement | null)?.value.trim() || 'Wanderer';
        const c = (this.menuEl.querySelector('#af-code') as HTMLInputElement | null)?.value.trim().toUpperCase() ?? '';
        try {
          localStorage.setItem('aetherfell2.name', name);
        } catch {
          /* storage may be blocked */
        }
        this.cb.menu(a, name, c);
      });
    });
  }

  closeMenu(): void {
    this.menuOpen = false;
    this.menuEl.classList.add('hidden');
    this.root.classList.remove('prestart');
    this.settings.toggle(false);
  }

  /** True while a panel that needs the mouse is open. */
  get blocking(): boolean {
    return this.menuOpen || this.settings.open || this.sideMode !== null || this.mapOpen || this.bookOpen || this.bag.open || this.doll.open || !this.dialogue.classList.contains('hidden');
  }

  /** The frame-rate and details corner (F3, or the Video setting). */
  setDebug(on: boolean): void {
    this.debugOn = on;
    this.debugEl.classList.toggle('hidden', !on);
  }

  toggle(what: 'inventory' | 'paperdoll' | 'journal' | 'map' | 'runebook' | 'debug' | 'escape' | 'settings'): void {
    if (what === 'debug') {
      this.setDebug(!this.debugOn);
      return;
    }
    if (what === 'settings') {
      this.settings.toggle();
      return;
    }
    if (what === 'escape') {
      // Escape closes whatever is open; with nothing open it opens the settings.
      const anyOpen = this.settings.open || this.sideMode !== null || this.bag.open || this.doll.open || this.mapOpen || this.bookOpen;
      if (!anyOpen) {
        this.settings.toggle(true);
        return;
      }
      this.settings.toggle(false);
      this.sideMode = null;
      this.bag.toggle(false);
      this.doll.toggle(false);
      this.mapOpen = false;
      this.bookOpen = false;
    } else if (what === 'runebook') {
      this.bookOpen = !this.bookOpen;
      this.draft = [];
      this.bookKey = '';
      if (this.bookOpen) {
        this.sideMode = null;
        this.mapOpen = false;
      }
    } else if (what === 'map') {
      this.mapOpen = !this.mapOpen;
      this.mapJob = null;
    } else if (what === 'paperdoll') {
      this.doll.toggle();
    } else if (what === 'inventory') {
      // The bag and the journal share the right side of the screen.
      this.bag.toggle();
      if (this.bag.open) this.sideMode = null;
    } else {
      this.sideMode = this.sideMode === what ? null : what;
      if (this.sideMode) this.bag.toggle(false);
    }
    this.side.classList.toggle('hidden', this.sideMode === null);
    this.mapPanel.classList.toggle('hidden', !this.mapOpen);
    this.book.classList.toggle('hidden', !this.bookOpen);
    this.sideKey = '';
  }

  toast(title: string, sub = ''): void {
    this.toastEl.innerHTML = `${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    this.toastEl.style.opacity = '1';
    this.toastTimer = performance.now() + 3500;
  }

  line(text: string): void {
    const d = el('div', '', this.log, esc(text));
    setTimeout(() => (d.style.opacity = '0'), 6000);
    setTimeout(() => d.remove(), 7000);
    while (this.log.children.length > 6) this.log.firstElementChild?.remove();
  }

  onEvent(e: SimEvent, localId: number | null, state: SimState): void {
    switch (e.type) {
      case 'discovered':
        this.toast(e.name, 'discovered');
        break;
      case 'journal':
        this.line(e.text);
        break;
      case 'notice':
        if (e.player === localId) this.line(e.text);
        break;
      case 'pickup':
        if (e.player === localId) this.line(`+${e.count} ${itemDef(CONTENT, e.item)?.name ?? e.item}`);
        break;
      case 'skillUp':
        if (e.player === localId) this.toast(`${e.skill[0]?.toUpperCase() ?? ''}${e.skill.slice(1)} ${e.level}`, 'skill improved');
        break;
      case 'doorJammed':
        this.line('Something heavy is blocking the door.');
        break;
      case 'fizzle':
        if (e.entity === localId) this.line('Not enough aether.');
        break;
      case 'runeLearned':
        if (e.player === localId) this.toast(`${CONTENT.runes[e.rune]?.glyph ?? ''} ${CONTENT.runes[e.rune]?.name ?? e.rune}`, 'rune learned · open your runebook (B)');
        break;
      case 'spellPrepared':
        if (e.entity === localId) {
          const sp = spellFor(CONTENT, e.spell);
          this.line(sp ? `Prepared ${sp.name} — "${sp.words}"` : 'Your hands are empty of magic.');
        }
        break;
      case 'playerJoined':
        this.line(`${e.name} joined.`);
        break;
      case 'say': {
        const s = state.entities.get(e.speaker);
        if (!s) break;
        const bubble = el('div', 'say', this.sayLayer, esc(e.text.length > 64 ? `${e.text.slice(0, 61)}…` : e.text));
        this.says.push({ speaker: e.speaker, text: e.text, until: performance.now() + 4000, el: bubble });
        break;
      }
      default:
        break;
    }
  }

  update(f: UiFrame): void {
    const now = performance.now();
    if (this.toastTimer && now > this.toastTimer) {
      this.toastEl.style.opacity = '0';
      this.toastTimer = 0;
    }
    const e = f.local;
    const p = e?.player;
    if (e && p) {
      this.hp.style.width = `${(100 * Math.max(0, e.hp)) / e.maxHp}%`;
      this.st.style.width = `${(100 * p.stamina) / p.maxStamina}%`;
      this.mp.style.width = `${(100 * p.mana) / p.maxMana}%`;
      this.updateSpellbar(e);
      this.updateQuickbar(p.inventory, f.quick);
      if (this.bookOpen) this.updateBook(e);
      this.downedEl.classList.toggle('hidden', p.downed <= 0);
      if (p.downed > 0) this.downedEl.textContent = `You are down — a friend can revive you (E). Waking in ${Math.ceil(p.downed / 20)}s`;
      this.updateCompass(f.state, e);
      this.updatePrompt(f.state, e);
      this.updateDialogue(e);
      this.updateSide(f.state, e);
      this.bag.update(e, f.proj, f.state);
      this.doll.update(e);
      if (this.mapOpen) this.updateMap(f.state, e);
    }
    const w = f.state.weather;
    const hours = Math.floor(w.time * 24);
    const mins = Math.floor((w.time * 24 - hours) * 60);
    const here = f.local ? rainAt(CONTENT.sky, w, f.local.pos.x, f.local.pos.y) : w.rain;
    const sky = here > 0.6 ? 'storm' : here > 0.15 ? 'rain' : w.rain > 0.3 ? 'showers about' : w.cloud > 0.5 ? 'overcast' : 'clear';
    const wind = Math.hypot(w.wind.x, w.wind.y);
    this.info.textContent = `Day ${w.day}  ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}  ${sky}, wind ${wind.toFixed(0)} m/s${w.aurora > 0 && isNight(CONTENT.rules.day, w.time) ? '  ✦ aurora' : ''}`;
    const n = f.net;
    this.netEl.textContent = n.role === 'solo' ? 'solo' : `${n.role}${n.code ? `  code ${n.code}` : ''}  ·  ${n.peers + 1} in party${n.message ? `\n${n.message}` : ''}`;
    if (this.debugOn) this.debugEl.textContent = `${f.fps.toFixed(0)} fps\n${f.debug}`;
    this.settings.update(f.state, f.local, f.net.role, !this.menuOpen);
    // Speech bubbles follow their speaker.
    this.says = this.says.filter((s) => {
      const sp = f.state.entities.get(s.speaker);
      const pos = { sx: 0, sy: 0, depth: 0 };
      if (now > s.until || !sp || !f.proj || !toScreen(f.proj, sp.pos.x, sp.pos.y, sp.z + thingDef(CONTENT, sp.def).body.height + 0.3, pos) || pos.depth > 30) {
        if (now > s.until || !sp) {
          s.el.remove();
          return false;
        }
        s.el.style.display = 'none';
        return true;
      }
      const canvas = document.getElementById('screen');
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return true;
      s.el.style.display = '';
      s.el.style.left = `${rect.left + (pos.sx / f.proj.W) * rect.width}px`;
      s.el.style.top = `${rect.top + (pos.sy / f.proj.H) * rect.height}px`;
      return true;
    });
  }

  /** Bottom-right: the prepared spell, its cost, and the runebook button. */
  /** The item picked in the open bag, for the quick keys. */
  pickedItem(): ItemId | null {
    return this.bag.picked();
  }

  /** Quick-use keys and how many of each you carry. */
  private updateQuickbar(inv: readonly ItemStack[], quick: readonly string[]): void {
    const have = (id: string): number =>
      id === '@throwable' ? inv.filter((s) => itemDef(CONTENT, s.id)?.thrown).reduce((n, s) => n + s.count, 0) : inv.filter((s) => s.id === id).reduce((n, s) => n + s.count, 0);
    const name = (id: string): string => (id === '@throwable' ? 'flask' : (itemDef(CONTENT, id)?.name ?? id));
    const parts = quick.map((id, i) => (id ? { i, id, n: have(id) } : null)).filter((x): x is { i: number; id: string; n: number } => !!x);
    const key = parts.map((p) => `${p.i}${p.id}${p.n}`).join('|');
    if (key === this.quickKey) return;
    this.quickKey = key;
    this.quickbar.innerHTML = parts.map((p) => `<span class="${p.n > 0 ? '' : 'dim'}"><kbd>${p.i + 1}</kbd> ${esc(name(p.id))}${p.n > 1 ? ` ×${p.n}` : ''}</span>`).join(' ');
  }

  private updateSpellbar(e: Entity): void {
    const p = e.player;
    if (!p) return;
    const sp = spellFor(CONTENT, spellKey(p.prepared));
    const low = sp ? p.mana < sp.cost : false;
    const key = `${spellKey(p.prepared)}|${low}`;
    if (key === this.spellbarKey) return;
    this.spellbarKey = key;
    const glyphs = p.prepared.map((r) => `<span class="glyph">${esc(CONTENT.runes[r]?.glyph ?? '?')}</span>`).join('');
    this.spellbar.classList.toggle('low', low);
    this.spellbar.innerHTML = sp
      ? `<div class="glyphs">${glyphs}</div><div class="name">${esc(sp.name)}</div><div class="cost">${sp.cost} aether</div><button data-book>Runebook <kbd>B</kbd></button><button data-bag>Bag <kbd>I</kbd></button>`
      : `<div class="name dim">No spell prepared</div><button data-book>Runebook <kbd>B</kbd></button><button data-bag>Bag <kbd>I</kbd></button>`;
    this.spellbar.querySelector('button[data-book]')?.addEventListener('click', () => this.toggle('runebook'));
    this.spellbar.querySelector('button[data-bag]')?.addEventListener('click', () => this.toggle('inventory'));
  }

  /** The runebook: lay up to three known runes into the slots, see what they make, prepare it. */
  private updateBook(e: Entity): void {
    const p = e.player;
    if (!p) return;
    const key = `${this.draft.join('+')}|${p.runes.join(',')}|${spellKey(p.prepared)}|${p.maxMana}`;
    if (key === this.bookKey) return;
    this.bookKey = key;
    const draft = this.draft;
    const slots = Array.from({ length: MAX_SPELL_RUNES }, (_, i) => {
      const r = draft[i];
      const d = r ? CONTENT.runes[r] : undefined;
      return d ? `<button class="slot full" data-slot="${i}" title="Remove">${esc(d.glyph)}<small>${esc(d.name)}</small></button>` : `<div class="slot"><small>empty</small></div>`;
    }).join('');
    let preview = '<div class="dim">Pick runes below. A spell needs an essence; add a shape to change how it travels and a power to bend it.</div>';
    let canPrepare = false;
    if (draft.length) {
      const made = composeSpell(CONTENT, draft);
      if (made.ok) {
        const sp = made.spell;
        canPrepare = true;
        const casts = Math.floor(p.maxMana / sp.cost);
        preview = `<div class="spellname">${esc(sp.name)}</div><div class="words">“${esc(sp.words)}”</div>
          <div>${sp.cost} aether a cast · about ${casts} cast${casts === 1 ? '' : 's'} from full</div>
          ${describeSpell(CONTENT, sp).map((l) => `<div>· ${esc(l)}</div>`).join('')}`;
      } else preview = `<div class="problem">${esc(made.problem)}</div>`;
    }
    const current = spellFor(CONTENT, spellKey(p.prepared));
    const group = (title: string, pick: (id: RuneId) => boolean): string => {
      const btns = CONTENT.runeOrder
        .filter(pick)
        .map((id) => {
          const d = CONTENT.runes[id];
          if (!d) return '';
          if (!p.runes.includes(id)) return `<div class="rune unknown" title="Not found yet. Search ruins and standing stones."><b>?</b><small>unknown</small></div>`;
          const on = draft.includes(id) ? ' on' : '';
          return `<button class="rune${on}" data-rune="${esc(id)}" title="${esc(d.text)}"><b>${esc(d.glyph)}</b><small>${esc(d.name)}</small></button>`;
        })
        .join('');
      return `<h3>${title}</h3><div class="grid">${btns}</div>`;
    };
    const known = p.runes.length;
    const total = CONTENT.runeOrder.length;
    this.book.innerHTML = `<h2>Runebook</h2>
      <div class="dim">Prepared: ${current ? esc(current.name) : 'nothing'} · ${known} of ${total} runes found</div>
      <div class="slots">${slots}</div>
      <div class="preview">${preview}</div>
      <div class="row"><button data-act="prepare"${canPrepare ? '' : ' disabled'}>Prepare spell</button><button data-act="clear">Clear</button><button data-act="close">Close <kbd>B</kbd></button></div>
      ${group('Essences — what it is made of', (id) => !!CONTENT.runes[id]?.essence)}
      ${group('Shapes — how it travels', (id) => !!CONTENT.runes[id]?.shape)}
      ${group('Powers — how it bends', (id) => !!CONTENT.runes[id]?.power)}
      <div class="hint">Hover a rune to read it. Hidden runes wait in ruins and at standing stones.</div>`;
    this.book.querySelectorAll<HTMLElement>('button[data-rune]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.rune;
        if (!id) return;
        if (this.draft.includes(id)) this.draft = this.draft.filter((x) => x !== id);
        else if (this.draft.length < MAX_SPELL_RUNES) this.draft = [...this.draft, id];
        this.updateBook(e);
      }),
    );
    this.book.querySelectorAll<HTMLElement>('button[data-slot]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.slot);
        this.draft = this.draft.filter((_, j) => j !== i);
        this.updateBook(e);
      }),
    );
    this.book.querySelectorAll<HTMLElement>('button[data-act]').forEach((b) =>
      b.addEventListener('click', () => {
        const act = b.dataset.act;
        if (act === 'prepare' && composeSpell(CONTENT, this.draft).ok) this.cb.prepare(this.draft);
        else if (act === 'clear') {
          this.draft = [];
          this.updateBook(e);
        } else if (act === 'close') this.toggle('runebook');
      }),
    );
  }

  private updateCompass(state: SimState, e: Entity): void {
    const width = this.compass.clientWidth || 400;
    const fov = 2.2;
    const parts: string[] = ['<div class="needle"></div>'];
    const mark = (ang: number, cls: string, text: string): void => {
      let d = ang - e.angle;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      if (Math.abs(d) > fov / 2) return;
      parts.push(`<span class="${cls}" style="left:${(0.5 + d / fov) * width}px">${text}</span>`);
    };
    // World +x is east, +y is south (screen-style).
    mark(0, 'cardinal', 'E');
    mark(Math.PI / 2, 'cardinal', 'S');
    mark(Math.PI, 'cardinal', 'W');
    mark(-Math.PI / 2, 'cardinal', 'N');
    for (const l of state.locations) {
      const d = Math.hypot(l.pos.x - e.pos.x, l.pos.y - e.pos.y);
      if (!l.discovered || d > 2500 || d < 6) continue;
      mark(Math.atan2(l.pos.y - e.pos.y, l.pos.x - e.pos.x), 'loc', `◆${esc(l.name)} ${d > 1000 ? `${(d / 1000).toFixed(1)}km` : `${Math.round(d)}m`}`);
    }
    for (const id of Object.values(state.players)) {
      const o = state.entities.get(id);
      if (!o || o === e || !o.player) continue;
      mark(Math.atan2(o.pos.y - e.pos.y, o.pos.x - e.pos.x), 'friend', `● ${esc(o.player.name)}`);
    }
    this.compass.innerHTML = parts.join('');
  }

  private updatePrompt(state: SimState, e: Entity): void {
    const p = e.player;
    if (!p) return;
    if (p.holding !== null) {
      const h = state.entities.get(p.holding);
      this.prompt.innerHTML = `Carrying ${esc(h ? thingName(h) : 'something')} — <kbd>F</kbd> throw (look up to throw far)`;
      return;
    }
    let best: Entity | null = null;
    let bd = 2.8;
    for (const o of state.entities.values()) {
      if (o === e || o.dead) continue;
      const dx = o.pos.x - e.pos.x;
      const dy = o.pos.y - e.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > bd || Math.abs(o.z - e.z) > 2) continue;
      let da = Math.atan2(dy, dx) - e.angle;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > 0.75 && d > 0.8) continue;
      if (thingDef(CONTENT, o.def).body.ghost) continue;
      best = o;
      bd = d;
    }
    let text = '';
    if (best) {
      const d = thingDef(CONTENT, best.def);
      const name = esc(thingName(best));
      if (d.use) text = best.cooldown > 0 ? `A ${name}` : `<kbd>E</kbd> Use ${name}`;
      else if (d.talk) text = `<kbd>E</kbd> Talk to ${esc(best.npc?.name ?? name)}`;
      else if (d.container) {
        const lock = d.container.lock && best.container?.locked ? ` (locked — needs a ${esc(CONTENT.items[d.container.lock]?.name.toLowerCase() ?? 'key')})` : '';
        text = best.container?.opened ? `Empty ${name}` : `<kbd>E</kbd> Open ${name}${lock}`;
      } else if (best.item) text = `<kbd>E</kbd> Take ${name}${best.item.count > 1 ? ` ×${best.item.count}` : ''}`;
      else if ((best.player?.downed ?? 0) > 0) text = `<kbd>E</kbd> Revive ${esc(best.player?.name ?? '')}`;
      else if (d.carry && d.body.mass <= 60) text = `<kbd>F</kbd> Grab ${name}`;
      else if (d.contact) text = `A ${name}. Something heavy stepping on it would set it off.`;
    }
    this.prompt.innerHTML = text;
  }

  private updateDialogue(e: Entity): void {
    const d = e.player?.dialogue ?? null;
    const key = d ? `${d.speaker}|${d.text}|${d.options.map((o) => o.label).join('|')}` : '';
    if (key === this.dialogueKey) return;
    this.dialogueKey = key;
    this.dialogue.classList.toggle('hidden', !d);
    if (!d) return;
    this.dialogue.innerHTML = `<h2>${esc(d.speakerName)}</h2><div>${esc(d.text)}</div><div class="opts">${d.options.map((o, i) => `<button data-i="${i}">${i + 1}. ${esc(o.label)}</button>`).join('')}</div>`;
    this.dialogue.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.cb.choose(Number(b.dataset.i))));
  }

  private updateSide(state: SimState, e: Entity): void {
    const p = e.player;
    if (!p || !this.sideMode) return;
    {
      const key = `j|${state.journal.length}|${state.quests.map((q) => q.state + q.progress).join(',')}`;
      if (key === this.sideKey) return;
      this.sideKey = key;
      const quests = state.quests.filter((q) => q.state !== 'offered');
      const qh = quests.length
        ? quests.map((q) => `<div>${q.state === 'done' ? '✓' : '•'} ${esc(q.title)} ${q.state === 'active' ? `(${q.progress}/${q.needed}, see ${esc(q.giverName)})` : ''}</div>`).join('')
        : '<div style="color:var(--dim)">No quests yet. Talk to village elders.</div>';
      const places = state.locations.filter((l) => l.discovered).map((l) => esc(l.name)).join(', ') || 'none yet';
      const entries = state.journal.slice(-30).reverse().map((j) => `<div style="margin:4px 0"><span style="color:var(--dim)">Day ${j.day}</span> ${esc(j.text)}</div>`).join('');
      this.side.innerHTML = `<h2>Journal</h2><h3>Quests</h3>${qh}<h3>Places</h3><div>${places}</div><h3>Entries</h3>${entries}`;
    }
  }

  /** Paints the overview map a few rows per frame from the world sampler. */
  private updateMap(state: SimState, e: Entity): void {
    const sampler = this.sampler();
    const ctx = this.mapCanvas.getContext('2d');
    if (!sampler || !ctx) return;
    const N = this.mapCanvas.width;
    const scale = 12;
    if (!this.mapJob || Math.hypot(this.mapJob.cx - e.pos.x, this.mapJob.cy - e.pos.y) > 400) {
      this.mapJob = { cx: Math.round(e.pos.x), cy: Math.round(e.pos.y), row: 0, img: ctx.createImageData(N, N) };
    }
    const job = this.mapJob;
    const end = Math.min(N, job.row + 12);
    for (let y = job.row; y < end; y++) {
      for (let x = 0; x < N; x++) {
        const wx = job.cx + (x - N / 2) * scale;
        const wy = job.cy + (y - N / 2) * scale;
        const s = sampler.sample(wx, wy, 64);
        const c = biomeMapColour(s.biome);
        const shade = s.ground < 0 ? 1 : 0.75 + Math.min(1, s.ground / 200) * 0.45;
        const forest = s.trees > 0.08 ? 0.75 : 1;
        const o = (y * N + x) * 4;
        const rd = s.road > 0.2;
        job.img.data[o] = rd ? 150 : c[0] * shade * forest;
        job.img.data[o + 1] = rd ? 126 : c[1] * shade * forest;
        job.img.data[o + 2] = rd ? 90 : c[2] * shade * forest;
        job.img.data[o + 3] = 255;
      }
    }
    job.row = end;
    ctx.putImageData(job.img, 0, 0);
    const toMap = (x: number, y: number): [number, number] => [N / 2 + (x - job.cx) / scale, N / 2 + (y - job.cy) / scale];
    ctx.font = '8px monospace';
    for (const l of state.locations) {
      const [mx, my] = toMap(l.pos.x, l.pos.y);
      ctx.fillStyle = l.discovered ? CONTENT.hud.mapFound : CONTENT.hud.mapUnknown;
      ctx.fillRect(mx - 2, my - 2, 4, 4);
      if (l.discovered) ctx.fillText(l.name, mx + 4, my + 3);
    }
    for (const id of Object.values(state.players)) {
      const o = state.entities.get(id);
      if (!o) continue;
      const [mx, my] = toMap(o.pos.x, o.pos.y);
      ctx.fillStyle = o === e ? CONTENT.hud.mapFoe : CONTENT.hud.mapFriend;
      ctx.beginPath();
      ctx.arc(mx, my, 3, 0, Math.PI * 2);
      ctx.fill();
      if (o === e) {
        ctx.strokeStyle = CONTENT.hud.mapFoe;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + Math.cos(e.angle) * 9, my + Math.sin(e.angle) * 9);
        ctx.stroke();
      }
    }
  }

  get element(): HTMLElement {
    return this.root;
  }
}

function thingName(e: Entity): string {
  if (e.item) return itemDef(CONTENT, e.item.id)?.name ?? 'item';
  return thingDef(CONTENT, e.def).name;
}
