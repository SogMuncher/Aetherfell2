import type { BurstDef } from '../types';

/**
 * Bursts of motes for things that happen in the world (not spells: those have their own look in
 * content/spellcraft.ts). Colours are 0xRRGGBB; `colourTo` makes each mote a random mix between
 * the two. Counts and speeds are the base: harder blows scale them up in the drawing code.
 * Continuous ones (fire, torches, rain) are read every frame.
 */
export const EFFECTS: Record<string, BurstDef> = {
  // Blows
  parry: { kind: 'spark', count: 14, speed: 5, colour: 0xffe68c, glow: true, life: 0.35, size: 0.06 },
  block: { kind: 'spark', count: 7, speed: 3, colour: 0xffc878, glow: true, life: 0.3, size: 0.06 },
  blood: { kind: 'blood', count: 8, speed: 2.5, colour: 0x961414, life: 0.6, size: 0.08 },
  hitDust: { kind: 'dust', count: 8, speed: 2, colour: 0x967850, life: 0.6, size: 0.1 },
  strikeSpark: { kind: 'spark', count: 8, speed: 3.5, colour: 0xffdc8c, glow: true, life: 0.35, size: 0.05 },
  strikeDust: { kind: 'dust', count: 5, speed: 2, colour: 0x96948c, life: 0.5, size: 0.07 },
  recoil: { kind: 'spark', count: 6, speed: 4.5, colour: 0xfff5c8, glow: true, life: 0.25, size: 0.05 },
  chargeGleam: { kind: 'spark', count: 5, speed: 1.2, colour: 0xfff0be, glow: true, life: 0.3, size: 0.04 },
  // Things breaking and falling
  rubbleDust: { kind: 'dust', count: 10, speed: 1.5, colour: 0x968c7d, life: 1.6, size: 0.18 },
  propBroken: { kind: 'dust', count: 20, speed: 3, colour: 0x825c38, life: 0.9, size: 0.12 },
  impact: { kind: 'dust', count: 4, speed: 2, colour: 0x8c785a, life: 0.6, size: 0.1 },
  death: { kind: 'dust', count: 16, speed: 2, colour: 0x786450, life: 1, size: 0.12 },
  splash: { kind: 'water', count: 10, speed: 3, colour: 0xaac8f0, life: 0.7, size: 0.1 },
  // Fire, frost and water on tiles
  ignite: { kind: 'flame', count: 4, speed: 1.5, colour: 0xffa03c, glow: true, life: 0.5, size: 0.2 },
  douse: { kind: 'smoke', count: 6, speed: 0.8, colour: 0xc8c8c8, life: 2, size: 0.4 },
  frostCreep: { kind: 'frost', count: 4, speed: 1.5, colour: 0xd2f0ff, glow: true, life: 0.8, size: 0.08 },
  trapFire: { kind: 'flame', count: 70, speed: 5, colour: 0xff7828, colourTo: 0xffc828, glow: true, life: 0.7, size: 0.3 },
  // Continuous: one mote each time
  tileFlame: { kind: 'flame', count: 1, speed: 0, colour: 0xff7828, colourTo: 0xffd228, glow: true, life: 0.7, size: 0.18 },
  tileSmoke: { kind: 'smoke', count: 1, speed: 0, colour: 0x464240, life: 4, size: 0.5 },
  propWake: { kind: 'magic', count: 1, speed: 0, colour: 0x5fdccd, colourTo: 0xd2fff6, glow: true, life: 3.5, size: 0.4 },
  glideTrail: { kind: 'magic', count: 1, speed: 0, colour: 0x3cf0ff, colourTo: 0xc8ffff, glow: true, life: 1.6, size: 0.24 },
  torchFlame: { kind: 'flame', count: 1, speed: 0, colour: 0xff9632, colourTo: 0xffdc32, glow: true, life: 0.35, size: 0.14 },
  burningBody: { kind: 'flame', count: 1, speed: 0, colour: 0xff8c28, glow: true, life: 0.5, size: 0.22 },
  chilledBody: { kind: 'frost', count: 1, speed: 0, colour: 0xd2f0ff, glow: true, life: 0.6, size: 0.06 },
  ember: { kind: 'spark', count: 1, speed: 0, colour: 0xffbe5a, glow: true, life: 0.15, size: 0.07 },
  rainSplash: { kind: 'water', count: 1, speed: 0, colour: 0xbed2f0, life: 0.18, size: 0.05 },
};
