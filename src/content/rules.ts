import type { RulesDef } from '../types';

/**
 * World-wide rules that are not one definition: how bodies react to heat, water and cold, how
 * guards and heavy blows stagger, what a fire throws on the wind, and what a new traveller carries.
 * Systems read these instead of naming statuses or items in code.
 */
export const RULES: RulesDef = {
  currency: 'coin',
  reactions: {
    heat: { status: 'burning', ticks: 60, byFlammability: true },
    soak: { status: 'wet', ticks: 300 },
    chill: { status: 'chilled', ticks: 100, longerWhile: { status: 'wet', factor: 2 }, freezes: { while: 'wet', status: 'frozen', ticks: 60 } },
  },
  temperature: { perHeat: 150, perChill: 60, jitter: 15, meltPerDegree: 4, dryPerDegree: 1.5, burns: 80, freezes: -30, thaws: -5, relax: 1, every: 15, limit: 400 },
  frost: { wetNeeded: 60, fade: 12 },
  combat: {
    parry: { status: 'staggered', ticks: 26, shove: 4 },
    block: { status: 'staggered', ticks: 3, damage: 0.25, stamina: 10 },
    heavyHit: { damage: 8, status: 'staggered', ticks: 6 },
    // Four ways to swing (all lengths in 20 Hz ticks). The mouse picks one as you let go: sweep it
    // left or right, pull it down for a chop, or hold it still for a thrust.
    swings: {
      left: {
        windup: 7, recover: 12, arc: 1.25, reach: 1, damage: 0.9, stamina: 11, targets: 4,
        knock: { along: 0.35, side: 1.0, lift: 0 }, stun: 0, pierce: 0, breaking: 0.9,
        else: ['right', 'overhead', 'thrust'],
        help: 'sweep left: wide, hits several foes and throws them to the left',
      },
      right: {
        windup: 7, recover: 12, arc: 1.25, reach: 1, damage: 0.9, stamina: 11, targets: 4,
        knock: { along: 0.35, side: 1.0, lift: 0 }, stun: 0, pierce: 0, breaking: 0.9,
        else: ['left', 'overhead', 'thrust'],
        help: 'sweep right: wide, hits several foes and throws them to the right',
      },
      thrust: {
        windup: 5, recover: 11, arc: 0.4, reach: 1.2, damage: 1.2, stamina: 9, targets: 1,
        knock: { along: 1.3, side: 0, lift: 0 }, stun: 1, pierce: 0.5, breaking: 0.6,
        else: ['overhead', 'left', 'right'],
        help: 'thrust (hold the mouse still): long reach, slips past armour, drives foes straight back',
      },
      overhead: {
        windup: 10, recover: 15, arc: 0.55, reach: 0.95, damage: 1.45, stamina: 15, targets: 2,
        knock: { along: 0.25, side: 0, lift: 0 }, stun: 4, pierce: 0.15, breaking: 1.6,
        else: ['thrust', 'left', 'right'],
        help: 'chop (pull the mouse down): slow and heavy, staggers foes and smashes doors',
      },
    },
    // Hold the button to wind up: it costs stamina every moment, hits harder and shoves further.
    charge: { tap: 4, full: 18, stamina: 1.5, begin: 8, damage: 2.1, push: 2.6, reach: 1.1, regen: 0, slow: 0.55, snap: 2, guardBreak: 14 },
    hitstun: { status: 'staggered', base: 2, perDamage: 0.12, charged: 6, max: 14 },
    hitstop: { base: 1, perDamage: 0.07, charged: 2, max: 4, blocked: 1, parried: 3, kill: 1 },
    surface: {
      // Hits of wear on the weapon per striking of something of full hardness (stone is about .85).
      wear: { cut: 3, pierce: 2.5, blunt: 1.2 },
      recoil: { hardness: 0.7, stun: 5, push: 2.4, hold: 2 },
      spark: 0.7,
      mend: 1.5,
    },
  },
  fire: {
    mote: 'spark',
    spread: 0.08,
    beat: 6,
    dying: 0.35,
    max: 700,
    sleep: 110,
    spark: { chance: 0.0006, wind: 0.0008, max: 10 },
    vfx: { palette: [0xfff4b0, 0xffd23c, 0xff8a28, 0xd2441c, 0x74261a], smoke: [0x56504c, 0x3c3836, 0x2a2826], budget: 220, flame: 5, smokeRate: 0.7, ember: 0.6, range: 70, pixel: 3 },
    audio: { oneShots: 5, crackle: 0.5 },
  },
  start: {
    inventory: [
      { id: 'healingDraught', count: 2 },
      { id: 'oilFlask', count: 2 },
      { id: 'bread', count: 2 },
      { id: 'torch', count: 2 },
      { id: 'glider', count: 1 },
      { id: 'coin', count: 12 },
    ],
    wield: 'gear:sword:iron:common',
    // Plain clothes to begin with; anything better is found, bought or taken.
    worn: ['gear:tunic:wool:common', 'gear:leggings:wool:common'],
    prepared: ['ember'],
  },
  quickUse: ['healingDraught', '@throwable', 'torch', 'gear:sword:iron:common'],
  // Every item can be held, swung, thrown and broken. Flasks and pots break at the first blow.
  items: {
    durability: { currency: 400, potion: 1, throwable: 1, food: 3, weapon: 100, armour: 60, material: 8, key: 60, tool: 30, rune: 200 },
    material: { currency: 'metal', potion: 'glass', throwable: 'clay', food: 'flesh', weapon: 'metal', armour: 'cloth', material: 'fur', key: 'metal', tool: 'wood', rune: 'stone' },
    improvised: { damage: 2, perKg: 2.2, kind: 'blunt', reach: 1.6, speed: 0.85, slowPerKg: 0.08, push: 0.6, pushPerKg: 0.25 },
    dropPitch: -0.55,
    impactSpeed: 4,
  },
  skills: {
    blade: { maxHp: 4 },
    evocation: { maxMana: 6 },
    athletics: { maxStamina: 6 },
    speech: {},
  },
  pickReach: 4.5,
  sites: { fill: 180, keep: 280 },
  awake: 200,
  coop: { timeout: 20 },
  day: { minutes: 16, sunrise: 0.25, nightFrom: 0.8, nightUntil: 0.23, morningUntil: 0.45, afternoonUntil: 0.7 },
  factions: { player: 'party', folk: 'village', default: 'wild' },
};
