import type { ShownState, StateLookDef } from '../types';

/**
 * How the states of stuff look on top of it (soot, wet, oil, frost, fire). The stuff itself never changes: a frozen
 * roof is still a thatch roof with frost blended over it, and when the frost thaws it looks exactly as before. The
 * renderer reads this table and blends each state by how strong it is on that ground tile or 3D cell (0..255).
 * A new look for a state is a change here; the order of blending is SHOWN_STATES in types/matter.ts.
 */
export const MATTER_STATES: Readonly<Record<ShownState, StateLookDef>> = {
  // Scorch marks left by fire on whatever did not burn away.
  soot: { shade: [0.3, 0.3, 0.3] },
  // Puddles, splashes and rain: darker and a touch cooler.
  wet: { shade: [0.72, 0.72, 0.75], rain: 1 },
  // Lamp oil: a brown film with a sheen.
  oil: { cover: { amount: 0.6, colour: '#43321e' }, glint: { share: 0.1, amount: 0.24 } },
  // The wetness in it, frozen: rime over the stuff, glittering, and slick underfoot.
  frost: { cover: { amount: 0.8, surface: 'frost' }, glint: { share: 0.04, amount: 0.3 }, slide: 0.3 },
  // Flames make what burns glow.
  fire: { glow: [1.4, 0.6, 0.15], smoke: 0.7, light: { r: 1.1, g: 0.55, b: 0.18, radius: 5, flicker: 0.4 } },
};
