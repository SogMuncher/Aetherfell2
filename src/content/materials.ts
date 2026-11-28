import type { MaterialDef, MaterialId } from '../types';

export function mat(p: Partial<MaterialDef> & { name: string; sound: MaterialDef['sound'] }): MaterialDef {
  return { flammability: 0, burnTicks: 0, resist: {}, floats: false, hardness: 0.2, ...p };
}

/** How stuff reacts physically. Every tile and thing made of a material behaves the same way. */
export const MATERIALS: Record<MaterialId, MaterialDef> = {
  flesh: mat({ name: 'flesh', sound: 'flesh', hardness: 0.1, flammability: 0.9, burnTicks: 90, resist: { cold: 1.2 } }),
  fur: mat({ name: 'fur', sound: 'flesh', hardness: 0.1, flammability: 1, burnTicks: 110, resist: { cold: 0.6 } }),
  wood: mat({ name: 'wood', sound: 'wood', hardness: 0.4, debris: { kind: 'dust', colour: 0x9a7048, amount: 7, size: 0.07 }, flammability: 1, burnTicks: 160, resist: { cut: 0.8, pierce: 0.5, blunt: 1.3, fire: 1.5, poison: 0, cold: 0.3 }, floats: true }),
  ironWood: mat({ name: 'iron-bound wood', sound: 'metal', hardness: 0.65, debris: { kind: 'dust', colour: 0x6a5a48, amount: 5, size: 0.06 }, flammability: 0.3, burnTicks: 120, resist: { cut: 0.3, pierce: 0.2, blunt: 1.2, fire: 0.8, poison: 0, cold: 0.2 } }),
  stone: mat({ name: 'stone', sound: 'stone', hardness: 0.85, debris: { kind: 'dust', colour: 0x8c8a84, amount: 9, size: 0.06 }, resist: { cut: 0.15, pierce: 0.1, blunt: 0.8, fire: 0, poison: 0, cold: 0 } }),
  metal: mat({ name: 'metal', sound: 'metal', hardness: 0.95, resist: { cut: 0.2, pierce: 0.2, fire: 0.1, poison: 0, cold: 0.1 } }),
  bone: mat({ name: 'bone', sound: 'wood', hardness: 0.5, debris: { kind: 'dust', colour: 0xd8d0bc, amount: 6, size: 0.05 }, resist: { blunt: 1.6, fire: 0.3, poison: 0, cold: 0 } }),
  clay: mat({ name: 'fired clay', sound: 'glass', hardness: 0.45, debris: { kind: 'dust', colour: 0xa05c38, amount: 8, size: 0.06 }, resist: { cut: 0.6, blunt: 2, fire: 0, poison: 0 } }),
  glass: mat({ name: 'glass', sound: 'glass', hardness: 0.6, resist: { blunt: 2, fire: 0, poison: 0 } }),
  cloth: mat({ name: 'cloth', sound: 'soft', hardness: 0.05, flammability: 1, burnTicks: 60, floats: true }),
  aether: mat({ name: 'aether', sound: 'glass', hardness: 0, resist: { cut: 0, blunt: 0, pierce: 0, fire: 0, cold: 0, poison: 0 } }),
  // Ground materials (tiles).
  grass: mat({ name: 'grass', sound: 'soft', hardness: 0.05, debris: { kind: 'leaf', colour: 0x4a7a38, amount: 6, size: 0.07 } }),
  earth: mat({ name: 'earth', sound: 'soft', hardness: 0.25, debris: { kind: 'dust', colour: 0x7a6248, amount: 6, size: 0.08 } }),
  sand: mat({ name: 'sand', sound: 'sand', hardness: 0.1, debris: { kind: 'dust', colour: 0xc8b078, amount: 6, size: 0.06 } }),
  snow: mat({ name: 'snow', sound: 'snow', hardness: 0.05, debris: { kind: 'frost', colour: 0xe8f0f8, amount: 7, size: 0.07 } }),
  water: mat({ name: 'water', sound: 'water', hardness: 0, debris: { kind: 'water', colour: 0xaac8f0, amount: 8, size: 0.09 } }),
  ice: mat({ name: 'ice', sound: 'ice', hardness: 0.5, debris: { kind: 'frost', colour: 0xd0eaff, amount: 8, size: 0.07 } }),
  ash: mat({ name: 'ash', sound: 'soft', hardness: 0.02, debris: { kind: 'dust', colour: 0x5a5654, amount: 6, size: 0.08 } }),
  /** Fen ground: slow to catch, but once alight it smoulders for a very long time. */
  peat: mat({ name: 'peat', sound: 'soft', hardness: 0.1, debris: { kind: 'dust', colour: 0x40301e, amount: 6, size: 0.08 }, flammability: 0.4, burnTicks: 400 }),
};
