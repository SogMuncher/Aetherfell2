/** Musical styles: types and helpers in styleTypes.ts, the entries in stylesDay/Places/Danger.ts.
 * Adding a mood = adding one entry to one of those tables. The conductor blends by itself. */
import type { StyleDef } from './styleTypes';
import { STYLES_DANGER } from './stylesDanger';
import { STYLES_DAY } from './stylesDay';
import { STYLES_PLACES } from './stylesPlaces';

export { METERS } from './styleTypes';
export type { Meter, MeterId, LayerRole, LayerDef, StyleDef } from './styleTypes';

const STYLE_TABLE = { ...STYLES_DAY, ...STYLES_PLACES, ...STYLES_DANGER };

export type StyleId = keyof typeof STYLE_TABLE;

export const STYLES: Readonly<Record<StyleId, StyleDef>> = STYLE_TABLE;

export const STYLE_IDS = Object.keys(STYLES) as StyleId[];
