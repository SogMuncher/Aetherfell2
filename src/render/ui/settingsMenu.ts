import type { CheatDef, CheatValue, Entity, NetRole, SimState } from '../../types';
import { CONTENT, tunedValue } from '../../content';
import { CHEATS } from '../../content/cheats';
import { SETTINGS, SETTING_GROUPS } from '../../settings';
import type { SettingDef, SettingGroup, SettingsStore } from '../../settings';

/** What the menu can ask for. Cheats go out as requests; the host's sim decides what happens. */
export interface SettingsMenuCallbacks {
  cheat(id: string, value: CheatValue): void;
}

type Tab = SettingGroup | 'Debug cheats';

const CSS = `
#ui .settings { left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(620px, calc(100vw - 32px)); max-height: calc(100vh - 64px); overflow: auto; box-sizing: border-box; z-index: 20; }
#ui.prestart > .settings:not(.hidden) { display: block !important; }
#ui .settings .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px; border-bottom: 1px solid var(--edge); padding-bottom: 8px; }
#ui .settings .tabs button.on { background: var(--brass); color: var(--ink); }
#ui .settings .tabs button.cheat { border-color: var(--danger); }
#ui .settings .opt { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(140px, 1.3fr); gap: 2px 12px; align-items: center; padding: 6px 0; border-bottom: 1px solid #ffffff10; }
#ui .settings .opt .help { grid-column: 1 / -1; font-size: 11px; color: var(--dim); }
#ui .settings .opt .ctl { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
#ui .settings .opt .val { min-width: 54px; text-align: right; color: var(--gold); }
#ui .settings input[type=range] { flex: 1; accent-color: var(--brass); min-width: 0; }
#ui .settings input[type=checkbox] { width: 18px; height: 18px; accent-color: var(--brass); }
#ui .settings .ctl button { white-space: nowrap; }
#ui .settings select { min-width: 0; font: inherit; background: var(--ink); color: var(--text); border: 1px solid var(--brass); padding: 2px 4px; max-width: 100%; }
#ui .settings h3 { margin: 12px 0 2px; font-size: 12px; color: var(--brass); text-transform: uppercase; letter-spacing: .08em; }
#ui .settings .note { margin: 4px 0 8px; padding: 6px 8px; background: var(--ink); border: 1px solid var(--edge); font-size: 12px; }
#ui .settings .note.warn { border-color: var(--danger); }
#ui .settings button.go.on { background: var(--go); color: var(--ink); }
#ui .settings .foot { display: flex; justify-content: space-between; margin-top: 10px; }
`;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/**
 * The settings menu, built from the settings list (src/settings) and the cheat list
 * (content/cheats.ts): one row per entry, so new settings and cheats show up by themselves.
 * Settings change locally and are remembered; cheats are only ever requests (callbacks.cheat).
 */
export class SettingsMenu {
  readonly el: HTMLElement;
  open = false;
  private tab: Tab = 'Sound';
  private cheatKey = '';
  /** Last argument picked per cheat, so the menu remembers between openings. */
  private picks = new Map<string, CheatValue>();

  constructor(
    host: HTMLElement,
    private readonly store: SettingsStore,
    private readonly cb: SettingsMenuCallbacks,
  ) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.className = 'panel settings hidden';
    host.appendChild(this.el);
    // A reset or a change made elsewhere (F3) shows up in the open menu.
    this.store.onChange(() => {
      if (this.open && this.tab !== 'Debug cheats') this.syncValues();
    });
  }

  toggle(open = !this.open): void {
    this.open = open;
    this.el.classList.toggle('hidden', !open);
    this.cheatKey = '';
    if (open) this.build(null, 'solo', false);
  }

  /** Called every frame while the game runs: keeps the cheat rows in step with the world. */
  update(state: SimState | null, me: Entity | null, role: NetRole, running: boolean): void {
    if (!this.open || this.tab !== 'Debug cheats') return;
    const c = me?.player?.cheats;
    const key = `${running}|${role}|${me?.id ?? -1}|${c?.god}|${c?.fly}|${c?.endless}|${state?.locations.length ?? 0}|${me?.player?.runes.length ?? 0}|${this.store.bool('allowGuestCheats')}`;
    if (key === this.cheatKey) return;
    this.cheatKey = key;
    this.build(state, role, running, me);
  }

  private build(state: SimState | null, role: NetRole, running: boolean, me: Entity | null = null): void {
    const tabs: Tab[] = [...SETTING_GROUPS, 'Debug cheats'];
    const tabRow = tabs.map((t) => `<button data-tab="${esc(t)}" class="${t === this.tab ? 'on' : ''}${t === 'Debug cheats' ? ' cheat' : ''}">${esc(t)}</button>`).join('');
    const body = this.tab === 'Debug cheats' ? this.cheatsHtml(state, role, running, me) : this.settingsHtml(this.tab);
    this.el.innerHTML = `<h2>Settings</h2><div class="tabs">${tabRow}</div><div class="body">${body}</div>
      <div class="foot">${this.tab === 'Debug cheats' ? '<span></span>' : `<button data-reset>Reset ${esc(this.tab.toLowerCase())}</button>`}<button data-settings-close>Close <kbd>Esc</kbd></button></div>`;
    this.el.querySelectorAll<HTMLButtonElement>('button[data-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = (b.dataset.tab as Tab | undefined) ?? 'Sound';
        this.cheatKey = '';
        this.build(state, role, running, me);
      }),
    );
    this.el.querySelector('button[data-settings-close]')?.addEventListener('click', () => this.toggle(false));
    this.el.querySelector('button[data-reset]')?.addEventListener('click', () => {
      if (this.tab !== 'Debug cheats') this.store.reset(this.tab);
    });
    if (this.tab === 'Debug cheats') this.wireCheats();
    else this.wireSettings();
  }

  // Settings ----------------------------------------------------------------------------------

  private settingsHtml(group: SettingGroup): string {
    return SETTINGS.filter((d) => d.group === group)
      .map((d) => `<div class="opt" data-id="${esc(d.id)}"><label for="set-${esc(d.id)}">${esc(d.label)}</label><div class="ctl">${this.control(d)}</div>${d.help ? `<div class="help">${esc(d.help)}</div>` : ''}</div>`)
      .join('');
  }

  private control(d: SettingDef): string {
    const id = `set-${esc(d.id)}`;
    if (d.kind === 'slider') return `<input id="${id}" type="range" min="${d.min}" max="${d.max}" step="${d.step}"><span class="val"></span>`;
    if (d.kind === 'toggle') return `<input id="${id}" type="checkbox">`;
    return `<select id="${id}">${d.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
  }

  private wireSettings(): void {
    for (const d of SETTINGS) {
      const input = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`#set-${d.id}`);
      if (!input) continue;
      const send = (): void => {
        if (d.kind === 'slider') this.store.set(d.id, Number(input.value));
        else if (d.kind === 'toggle' && input instanceof HTMLInputElement) this.store.set(d.id, input.checked);
        else this.store.set(d.id, input.value);
      };
      input.addEventListener(d.kind === 'slider' ? 'input' : 'change', send);
    }
    this.syncValues();
  }

  /** Shows the stored values in the controls (after opening, a reset, or a change elsewhere). */
  private syncValues(): void {
    for (const d of SETTINGS) {
      const input = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`#set-${d.id}`);
      if (!input) continue;
      if (d.kind === 'slider') {
        const v = this.store.num(d.id);
        input.value = String(v);
        const out = input.parentElement?.querySelector('.val');
        if (out) out.textContent = d.format ? d.format(v) : String(v);
      } else if (d.kind === 'toggle' && input instanceof HTMLInputElement) input.checked = this.store.bool(d.id);
      else input.value = this.store.str(d.id);
    }
  }

  // Cheats ------------------------------------------------------------------------------------

  private cheatsHtml(state: SimState | null, role: NetRole, running: boolean, me: Entity | null): string {
    if (!running || !state || !me?.player) return '<div class="note">Cheats work once you are out in the world. Start or join a journey first.</div>';
    const note =
      role === 'guest'
        ? '<div class="note warn">You are a guest. Your friend who hosts decides: cheats only work if they switch on <b>Let friends use cheats</b> (Settings, Co-op).</div>'
        : role === 'host'
          ? `<div class="note">You are hosting. Friends ${this.store.bool('allowGuestCheats') ? '<b>can</b>' : 'cannot'} use cheats (Co-op tab).</div>`
          : '<div class="note">For testing and fooling around. Cheats change your saved world like anything else you do.</div>';
    const flags = me.player.cheats ?? {};
    let html = note;
    let group = '';
    for (const c of CHEATS) {
      if (c.group !== group) {
        group = c.group;
        html += `<h3>${esc(group)}</h3>`;
      }
      const on = c.action.type === 'toggle' ? !!flags[c.action.flag] : false;
      const btn = c.action.type === 'toggle' ? `<button class="go${on ? ' on' : ''}" data-cheat="${esc(c.id)}">${on ? 'On' : 'Off'}</button>` : `<button class="go" data-cheat="${esc(c.id)}">Do it</button>`;
      html += `<div class="opt"><label>${esc(c.name)}</label><div class="ctl">${this.cheatArg(c, state, me)}${btn}</div><div class="help">${esc(c.help)}</div></div>`;
    }
    return html;
  }

  /** The picker a cheat needs, from its argument kind. */
  private cheatArg(c: CheatDef, state: SimState, me: Entity): string {
    const a = c.arg;
    const pick = this.picks.get(c.id);
    const select = (opts: { value: string; label: string }[]): string => {
      if (!opts.length) return '<span class="dim">none yet</span>';
      const chosen = typeof pick === 'string' || typeof pick === 'number' ? String(pick) : '';
      return `<select data-arg="${esc(c.id)}">${opts.map((o) => `<option value="${esc(o.value)}"${o.value === chosen ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    };
    const byName = (x: { label: string }, y: { label: string }): number => x.label.localeCompare(y.label);
    switch (a.kind) {
      case 'none':
        return '';
      case 'item':
        return `${select(Object.entries(CONTENT.items).map(([id, d]) => ({ value: id, label: d.name })).sort(byName))}<span class="dim">×${a.count}</span>`;
      case 'rune': {
        const known = me.player?.runes ?? [];
        return select(CONTENT.runeOrder.map((id) => ({ value: id, label: `${CONTENT.runes[id]?.glyph ?? ''} ${CONTENT.runes[id]?.name ?? id}${known.includes(id) ? ' (known)' : ''}` })));
      }
      case 'creature':
        return select(Object.entries(CONTENT.things).filter(([, d]) => !!d.brain).map(([id, d]) => ({ value: id, label: d.name })).sort(byName));
      case 'structure':
        return select(Object.entries(CONTENT.structures).map(([id, d]) => ({ value: id, label: d.name })).sort(byName));
      case 'place': {
        const near = (l: { pos: { x: number; y: number } }): number => Math.hypot(l.pos.x - me.pos.x, l.pos.y - me.pos.y);
        return select(
          [...state.locations]
            .sort((x, y) => near(x) - near(y))
            .map((l) => ({ value: String(l.id), label: `${l.name}${l.discovered ? '' : ' (undiscovered)'} · ${near(l) > 1000 ? `${(near(l) / 1000).toFixed(1)} km` : `${Math.round(near(l))} m`}` })),
        );
      }
      case 'number': {
        const now = c.action.type === 'tuneHeld' ? tunedValue(CONTENT, me, c.action.tune) : undefined;
        const v = typeof pick === 'number' ? pick : now !== undefined ? Math.round(now * 100) / 100 : a.value;
        return `<input type="range" data-arg="${esc(c.id)}" min="${a.min}" max="${a.max}" step="${a.step}" value="${v}"><span class="val" data-val="${esc(c.id)}">${esc(numberLabel(v, a.unit))}</span>`;
      }
      case 'choice':
        return select(a.options.map((o) => ({ ...o })));
    }
  }

  private wireCheats(): void {
    this.el.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-arg]').forEach((input) => {
      const id = input.dataset.arg ?? '';
      const def = CHEATS.find((c) => c.id === id);
      const read = (): void => {
        this.picks.set(id, argValue(def, input.value));
        if (def?.arg.kind === 'number') {
          const out = this.el.querySelector(`[data-val="${id}"]`);
          if (out) out.textContent = numberLabel(Number(input.value), def.arg.unit);
        }
      };
      input.addEventListener('input', read);
      input.addEventListener('change', read);
    });
    this.el.querySelectorAll<HTMLButtonElement>('button[data-cheat]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = b.dataset.cheat ?? '';
        const def = CHEATS.find((c) => c.id === id);
        if (!def) return;
        const input = this.el.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-arg="${id}"]`);
        const value = input ? argValue(def, input.value) : null;
        if (def.arg.kind !== 'none' && value === null) return;
        this.cb.cheat(id, value);
      }),
    );
  }
}

/** The menu's text for a picked value, turned into what the cheat expects (numbers stay numbers). */
function argValue(def: CheatDef | undefined, raw: string): CheatValue {
  if (!def || raw === '') return null;
  if (def.arg.kind === 'number' || def.arg.kind === 'place') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return raw;
}

function numberLabel(v: number, unit: string): string {
  if (unit === ':00') return `${String(Math.floor(v)).padStart(2, '0')}:${v % 1 >= 0.5 ? '30' : '00'}`;
  return `${v} ${unit}`;
}
