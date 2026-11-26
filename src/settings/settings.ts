/**
 * Player settings: what each one is (data), and a small store that remembers the choices on this
 * computer between sessions (localStorage). Settings never touch the simulation; main.ts reads
 * them and hands them to audio, render and input. The settings menu (render/ui/settingsMenu.ts)
 * builds itself from SETTINGS, so adding a setting is one entry here plus wherever it is used.
 */
import { STYLES, STYLE_IDS } from '../audio/music';
import { VIDEO_SETTINGS } from './videoSettings';

export type SettingGroup = 'Sound' | 'Video' | 'Controls' | 'Game' | 'Co-op';
export const SETTING_GROUPS: readonly SettingGroup[] = ['Sound', 'Video', 'Controls', 'Game', 'Co-op'];

interface SettingBase {
  id: string;
  group: SettingGroup;
  label: string;
  /** One plain sentence shown under the label. */
  help?: string;
}
export interface SliderSetting extends SettingBase {
  kind: 'slider';
  min: number;
  max: number;
  step: number;
  value: number;
  /** How the number reads in the menu. */
  format?: (v: number) => string;
}
export interface ToggleSetting extends SettingBase {
  kind: 'toggle';
  value: boolean;
}
export interface ChoiceSetting extends SettingBase {
  kind: 'choice';
  value: string;
  options: readonly { value: string; label: string }[];
  /** A preset: choosing an option sets these other settings too; changing one of them by hand picks 'custom'. */
  sets?: Readonly<Record<string, Readonly<Record<string, SettingValue>>>>;
}
export type SettingDef = SliderSetting | ToggleSetting | ChoiceSetting;
export type SettingValue = number | boolean | string;

const pct = (v: number): string => `${Math.round(v)}%`;

export const SETTINGS: readonly SettingDef[] = [
  // Sound
  { id: 'masterVolume', group: 'Sound', label: 'Overall volume', kind: 'slider', min: 0, max: 100, step: 1, value: 70, format: pct },
  { id: 'musicVolume', group: 'Sound', label: 'Music', help: 'The score that composes itself as you play.', kind: 'slider', min: 0, max: 100, step: 1, value: 80, format: pct },
  { id: 'effectsVolume', group: 'Sound', label: 'Sound effects', help: 'Steps, swings, spells, creatures, doors.', kind: 'slider', min: 0, max: 100, step: 1, value: 100, format: pct },
  { id: 'ambienceVolume', group: 'Sound', label: 'Surroundings', help: 'Wind, rain, fire, water, leaves, birds and crickets.', kind: 'slider', min: 0, max: 100, step: 1, value: 100, format: pct },
  {
    id: 'musicMood',
    group: 'Sound',
    label: 'Music mood',
    help: 'Normally the music follows what is happening. Pick a mood to hear only that one.',
    kind: 'choice',
    value: 'follow',
    options: [{ value: 'follow', label: 'Follow the adventure' }, ...STYLE_IDS.map((id) => ({ value: id, label: STYLES[id].name }))],
  },
  { id: 'muteInBackground', group: 'Sound', label: 'Quiet when in the background', help: 'Fades the sound out while you are in another window or tab.', kind: 'toggle', value: true },

  ...VIDEO_SETTINGS,
  // Controls
  { id: 'mouseSensitivity', group: 'Controls', label: 'Mouse sensitivity', kind: 'slider', min: 10, max: 300, step: 5, value: 100, format: pct },
  { id: 'invertMouse', group: 'Controls', label: 'Invert mouse up/down', kind: 'toggle', value: false },
  { id: 'turnSpeed', group: 'Controls', label: 'Arrow-key turning speed', kind: 'slider', min: 25, max: 300, step: 5, value: 100, format: pct },

  // Game
  {
    id: 'autosave',
    group: 'Game',
    label: 'Save by itself',
    help: 'When you play alone or host, the world is saved this often, and when you close the game.',
    kind: 'choice',
    value: '5',
    options: [
      { value: '0', label: 'Never (F5 only)' },
      { value: '2', label: 'Every 2 minutes' },
      { value: '5', label: 'Every 5 minutes' },
      { value: '10', label: 'Every 10 minutes' },
    ],
  },

  // Co-op
  { id: 'allowGuestCheats', group: 'Co-op', label: 'Let friends use cheats', help: 'When you host, friends can use the Debug cheats menu too. You always can.', kind: 'toggle', value: false },
];

const KEY = 'aetherfell2.settings';

function settingDef(id: string): SettingDef | undefined {
  return SETTINGS.find((s) => s.id === id);
}

/** Makes any stored or typed-in value fit its setting (wrong type or unknown option → default). */
function fit(def: SettingDef, v: unknown): SettingValue {
  if (def.kind === 'slider') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return def.value;
    const stepped = def.min + Math.round((v - def.min) / def.step) * def.step;
    return Math.max(def.min, Math.min(def.max, Number(stepped.toFixed(4))));
  }
  if (def.kind === 'toggle') return typeof v === 'boolean' ? v : def.value;
  return typeof v === 'string' && def.options.some((o) => o.value === v) ? v : def.value;
}

/** The current choices. Reads once from storage, writes on every change, tells listeners. */
export class SettingsStore {
  private values = new Map<string, SettingValue>();
  private listeners: ((id: string) => void)[] = [];

  constructor() {
    let saved: Record<string, unknown> = {};
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      if (typeof parsed === 'object' && parsed !== null) saved = parsed as Record<string, unknown>;
    } catch {
      /* storage blocked or damaged: use defaults */
    }
    for (const d of SETTINGS) this.values.set(d.id, d.id in saved ? fit(d, saved[d.id]) : d.value);
  }

  get(id: string): SettingValue | undefined {
    return this.values.get(id);
  }
  num(id: string): number {
    const v = this.values.get(id);
    return typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : 0;
  }
  bool(id: string): boolean {
    return this.values.get(id) === true;
  }
  str(id: string): string {
    const v = this.values.get(id);
    return v === undefined ? '' : String(v);
  }

  set(id: string, v: SettingValue): void {
    const def = settingDef(id);
    if (!def) return;
    const next = fit(def, v);
    if (this.values.get(id) === next) return;
    this.values.set(id, next);
    const changed = [id];
    const preset = def.kind === 'choice' ? def.sets?.[String(next)] : undefined;
    if (preset) {
      for (const [k, pv] of Object.entries(preset)) {
        const d = settingDef(k);
        if (d) this.values.set(k, fit(d, pv));
        changed.push(k);
      }
    } else {
      // A setting a preset owns, changed by hand: that preset no longer holds.
      for (const p of SETTINGS) {
        if (p.kind !== 'choice' || !p.sets || p.id === id) continue;
        const chosen = p.sets[this.str(p.id)];
        if (chosen && id in chosen && chosen[id] !== next) {
          this.values.set(p.id, 'custom');
          changed.push(p.id);
        }
      }
    }
    this.save();
    for (const c of changed) for (const l of this.listeners) l(c);
  }

  /** Puts one group (or everything) back to how it started. */
  reset(group?: SettingGroup): void {
    for (const d of SETTINGS) if (!group || d.group === group) this.values.set(d.id, d.value);
    this.save();
    for (const d of SETTINGS) if (!group || d.group === group) for (const l of this.listeners) l(d.id);
  }

  onChange(l: (id: string) => void): void {
    this.listeners.push(l);
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(this.values)));
    } catch {
      /* storage may be blocked */
    }
  }
}
