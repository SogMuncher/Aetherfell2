/**
 * Player settings: what each one is (data), and a small store that remembers the choices on this
 * computer between sessions (localStorage). Settings never touch the simulation; main.ts reads
 * them and hands them to audio, render and input. The settings menu (render/ui/settingsMenu.ts)
 * builds itself from SETTINGS, so adding a setting is one entry here plus wherever it is used.
 */
import { STYLES, STYLE_IDS } from '../audio/music';

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

  // Video
  {
    id: 'resolution',
    group: 'Video',
    label: 'Pixel size',
    help: 'Bigger pixels look chunkier and run faster.',
    kind: 'choice',
    value: '200',
    options: [
      { value: '150', label: 'Chunky' },
      { value: '200', label: 'Classic' },
      { value: '270', label: 'Fine' },
      { value: '360', label: 'Very fine (slow)' },
    ],
  },
  {
    id: 'adaptive',
    group: 'Video',
    label: 'Keep it smooth',
    help: 'Pixels grow chunkier by themselves when the game runs slower than this, and sharpen again when there is room.',
    kind: 'choice',
    value: '60',
    options: [
      { value: '0', label: 'Off' },
      { value: '30', label: 'Aim for 30 fps' },
      { value: '45', label: 'Aim for 45 fps' },
      { value: '60', label: 'Aim for 60 fps' },
    ],
  },
  { id: 'fieldOfView', group: 'Video', label: 'Field of view', help: 'How wide you see, top to bottom.', kind: 'slider', min: 45, max: 90, step: 1, value: 60, format: (v) => `${Math.round(v)}°` },
  {
    id: 'colours',
    group: 'Video',
    label: 'Colours',
    help: 'Fewer colours give the dithered old-computer look.',
    kind: 'choice',
    value: '24',
    options: [
      { value: '12', label: 'Very retro' },
      { value: '24', label: 'Retro' },
      { value: '48', label: 'Rich' },
      { value: '256', label: 'Smooth' },
    ],
  },
  { id: 'screenShake', group: 'Video', label: 'Screen shake', help: 'The view jolts when you are hit or land hard.', kind: 'toggle', value: true },
  { id: 'headBob', group: 'Video', label: 'Head bob', help: 'The view bobs a little as you walk.', kind: 'toggle', value: true },
  {
    id: 'lightsPerPixel',
    group: 'Video',
    label: 'Lights per pixel',
    help: 'How many nearby lights (torches, fires, spells) light and shadow each pixel. More is richer and slower.',
    kind: 'choice',
    value: '4',
    options: [
      { value: '2', label: '2' },
      { value: '4', label: '4' },
      { value: '8', label: '8' },
    ],
  },
  { id: 'showFps', group: 'Video', label: 'Show frame rate and details', help: 'The same as pressing F3.', kind: 'toggle', value: false },

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
    this.save();
    for (const l of this.listeners) l(id);
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
