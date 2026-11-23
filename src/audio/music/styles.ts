/** Musical styles: types and helpers in styleTypes.ts, the entries in stylesDay/Places/Danger.ts.
 * Adding a mood = adding one entry to one of those tables. The conductor blends by itself. */
import type { MeterId, StyleDef } from './styleTypes';
import type { MoodSignals } from './signals';
import { STYLES_DANGER } from './stylesDanger';
import { STYLES_DAY } from './stylesDay';
import { STYLES_PLACES } from './stylesPlaces';

export { METERS } from './styleTypes';
export type { Meter, MeterId, LayerRole, LayerDef, StyleDef } from './styleTypes';

const STYLE_TABLE = { ...STYLES_DAY, ...STYLES_PLACES, ...STYLES_DANGER };

export type StyleId = keyof typeof STYLE_TABLE;

export const STYLES: Readonly<Record<StyleId, StyleDef>> = STYLE_TABLE;

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];

/** How well a style fits the mood right now (a broken affinity counts as 0). */
export function styleScore(id: StyleId, s: MoodSignals, extra: ReadonlyMap<string, number>): number {
  try {
    const v = STYLES[id].affinity(s, extra);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** The best-fitting style; the current one gets a small bonus so the music doesn't flicker. */
export function bestStyle(s: MoodSignals, extra: ReadonlyMap<string, number>, current: StyleId): StyleId {
  let best: StyleId = 'wander';
  let bestV = -Infinity;
  for (const id of STYLE_IDS) {
    const v = styleScore(id, s, extra) + (id === current ? 0.08 : 0);
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/** What the conductor is doing right now (console status). */
export interface MusicStatus {
  style: StyleId;
  styleName: string;
  section: string;
  key: string;
  mode: string;
  tempo: number;
  meter: MeterId;
  energy: number;
  voices: number;
  lastCue: string;
}
