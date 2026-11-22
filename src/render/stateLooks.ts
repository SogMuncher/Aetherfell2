/**
 * The looks of matter states (content/matterStates.ts) flattened for drawing: one slot per state in SHOWN_STATES order.
 * The GPU shaders get these as uniform arrays; the far-land painter (terrainLod) uses `tintFar` for its average colours.
 * Nothing here knows any state by name.
 */
import { SHOWN_STATES, type ShownState } from '../types';
import { MATTER_STATES } from '../content/matterStates';
import { SURFACES } from '../content/surfaces';

export const STATE_COUNT = SHOWN_STATES.length;
/** RGBA texels needed per spot to hold every state (four states per texel). */
export const STATE_LAYERS = Math.ceil(STATE_COUNT / 4);

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Per state: shade rgb, cover rgb + amount, cover surface (index into STATE_SURFACES, -1 = flat colour), glint share + amount, glow rgb, rain. */
export const LOOKS = {
  shade: new Float32Array(STATE_COUNT * 3),
  cover: new Float32Array(STATE_COUNT * 4),
  surface: new Int32Array(STATE_COUNT),
  glint: new Float32Array(STATE_COUNT * 2),
  glow: new Float32Array(STATE_COUNT * 3),
  rain: new Float32Array(STATE_COUNT),
};
/** Surfaces the states cover things with, in the order the GPU surface atlas holds them after the tiles' own. */
export const STATE_SURFACES: string[] = [];

SHOWN_STATES.forEach((id: ShownState, i) => {
  const d = MATTER_STATES[id];
  const sh = d.shade ?? [1, 1, 1];
  LOOKS.shade.set(sh, i * 3);
  LOOKS.surface[i] = -1;
  if (d.cover) {
    let rgb: [number, number, number];
    if ('surface' in d.cover) {
      const s = SURFACES[d.cover.surface];
      rgb = s ? [s.base[0] / 255, s.base[1] / 255, s.base[2] / 255] : [1, 1, 1];
      let at = STATE_SURFACES.indexOf(d.cover.surface);
      if (at < 0) at = STATE_SURFACES.push(d.cover.surface) - 1;
      LOOKS.surface[i] = at;
    } else rgb = hex(d.cover.colour);
    LOOKS.cover.set([...rgb, d.cover.amount], i * 4);
  }
  if (d.glint) LOOKS.glint.set([d.glint.share, d.glint.amount], i * 2);
  if (d.glow) LOOKS.glow.set(d.glow, i * 3);
  LOOKS.rain[i] = d.rain ?? 0;
});

/** Tints an average far colour (0..255, in place) by the states' strengths `w` (0..1 each, SHOWN_STATES order). Says whether any state showed. */
export function tintFar(rgb: [number, number, number], w: ArrayLike<number>): boolean {
  let any = false;
  for (let i = 0; i < STATE_COUNT; i++) {
    const s = w[i] ?? 0;
    if (s <= 0) continue;
    any = true;
    const a = (LOOKS.cover[i * 4 + 3] ?? 0) * s;
    for (let c = 0; c < 3; c++) {
      let v = rgb[c] ?? 0;
      v *= 1 + ((LOOKS.shade[i * 3 + c] ?? 1) - 1) * s;
      if (a > 0) v += ((LOOKS.cover[i * 4 + c] ?? 0) * 255 - v) * a;
      rgb[c] = v;
    }
  }
  return any;
}
