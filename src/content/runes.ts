import type { RuneDef, RuneId } from '../types';

/**
 * Runes, the syllables of magic. Up to three make a spell in the runebook:
 * - an ESSENCE says what the spell is made of (fire, water, wind…). At least one.
 * - a SHAPE says how it travels (wave, ward, nova…). At most one; without it the first essence
 *   takes its natural shape.
 * - a POWER bends the rest (stronger, faster, wider).
 * A new rune is just a new entry here; content/spellcraft.ts combines them.
 */
export const RUNES: Record<RuneId, RuneDef> = {
  // ── Essences ────────────────────────────────────────────────────────────
  ember: {
    name: 'Ember',
    word: 'Ign',
    glyph: 'ᚲ',
    cost: 12,
    text: 'Fire. Burns what it touches and sets dry ground alight.',
    essence: {
      delivery: { type: 'bolt', speed: 17, gravity: 0, life: 60 },
      hit: [{ type: 'damage', amount: 10, kind: 'fire' }, { type: 'heat', amount: 1 }],
      burst: { radius: 1, effects: [{ type: 'heat', amount: 1 }] },
      // Warms you through: drives off the chill and dries you out.
      ward: [{ type: 'cure', tag: 'cold' }, { type: 'cure', tag: 'water' }],
      friendly: true,
      light: { r: 1, g: 0.5, b: 0.15, radius: 6, flicker: 0.3 },
      color: { r: 255, g: 150, b: 50 },
      sound: 'fire',
      // Licking flames that rise and shrink, crackle a little, and leave grey smoke behind.
      look: {
        motes: { core: { r: 255, g: 220, b: 120 }, edge: { r: 230, g: 70, b: 20 }, glow: 1, soft: 0.3, size: 0.24, grow: -1.1, life: 0.6, lift: 3, drag: 1.2, swirl: 0, jitter: 0.8, density: 28, spread: 4, upward: 0.45 },
        wake: { core: { r: 90, g: 84, b: 80 }, edge: { r: 60, g: 58, b: 58 }, glow: 0, soft: 1, size: 0.35, grow: 0.5, life: 2.2, lift: 0.9, drag: 1.5, swirl: 0, jitter: 0.1, density: 8, spread: 1, upward: 0.8 },
        strands: 0,
      },
    },
  },
  gust: {
    name: 'Gust',
    word: 'Vael',
    glyph: 'ᚹ',
    cost: 9,
    text: 'Wind. Shoves and staggers, and fans flames downwind. As a ward it lifts you into the air.',
    essence: {
      delivery: { type: 'cone', range: 8, width: 0.75 },
      hit: [{ type: 'push', force: 11, lift: 3 }, { type: 'status', id: 'staggered', ticks: 8 }],
      // Pushing on burning ground makes the flames leap downwind.
      burst: { radius: 0, effects: [{ type: 'push', force: 1 }] },
      ward: [{ type: 'push', force: 0, lift: 11 }],
      friendly: false,
      light: { r: 0.7, g: 0.9, b: 1, radius: 3, flicker: 0 },
      color: { r: 210, g: 230, b: 255 },
      sound: 'wind',
      // Pale streaks curling in eddies, barely there, gone in a breath.
      look: {
        motes: { core: { r: 235, g: 245, b: 255 }, edge: { r: 170, g: 200, b: 230 }, glow: 0.35, soft: 0.6, size: 0.08, grow: 0.2, life: 0.5, lift: 0.4, drag: 0.6, swirl: 1.4, jitter: 0.3, density: 34, spread: 6, upward: -0.4 },
        wake: { core: { r: 190, g: 175, b: 150 }, edge: { r: 150, g: 140, b: 120 }, glow: 0, soft: 1, size: 0.18, grow: 0.8, life: 0.9, lift: 0.2, drag: 2, swirl: 0.8, jitter: 0.2, density: 6, spread: 2, upward: -0.6 },
        strands: 2,
      },
    },
  },
  tide: {
    name: 'Tide',
    word: 'Mar',
    glyph: 'ᛚ',
    cost: 10,
    text: 'Water. Soaks bodies and ground and puts fires out.',
    essence: {
      delivery: { type: 'bolt', speed: 13, gravity: 9, life: 60 },
      hit: [{ type: 'damage', amount: 3, kind: 'blunt' }, { type: 'soak', amount: 1 }, { type: 'push', force: 2 }],
      burst: { radius: 2.6, effects: [{ type: 'soak', amount: 1 }] },
      ward: [{ type: 'soak', amount: 1 }],
      friendly: false,
      light: { r: 0.3, g: 0.6, b: 1, radius: 4, flicker: 0.1 },
      color: { r: 120, g: 170, b: 255 },
      sound: 'water',
      // Heavy droplets that splash out in a crown and fall, with a fine spray.
      look: {
        motes: { core: { r: 170, g: 210, b: 255 }, edge: { r: 70, g: 120, b: 220 }, glow: 0.15, soft: 0, size: 0.12, grow: 0, life: 0.8, lift: -9, drag: 0.2, swirl: 0, jitter: 0, density: 30, spread: 4.5, upward: 0.5 },
        wake: { core: { r: 220, g: 235, b: 255 }, edge: { r: 180, g: 200, b: 230 }, glow: 0, soft: 1, size: 0.2, grow: 0.6, life: 0.8, lift: 0.3, drag: 2.5, swirl: 0, jitter: 0.1, density: 8, spread: 1.5, upward: 0.3 },
        strands: 1,
      },
    },
  },
  frost: {
    name: 'Frost',
    word: 'Hrim',
    glyph: 'ᛁ',
    cost: 14,
    text: 'Cold. Chills and slows, and freezes water into ice you can walk on.',
    essence: {
      delivery: { type: 'bolt', speed: 15, gravity: 2, life: 50 },
      hit: [{ type: 'damage', amount: 8, kind: 'cold' }, { type: 'chill', amount: 1 }],
      // Freezes water into walkable ice for a while.
      burst: { radius: 2.8, effects: [{ type: 'chill', amount: 1 }] },
      // Smothers flames on you.
      ward: [{ type: 'cure', tag: 'fire' }],
      friendly: true,
      light: { r: 0.6, g: 0.85, b: 1, radius: 5, flicker: 0.05 },
      color: { r: 190, g: 235, b: 255 },
      sound: 'ice',
      // Glittering shards in every direction that drift down slowly, and a cold mist.
      look: {
        motes: { core: { r: 240, g: 252, b: 255 }, edge: { r: 140, g: 200, b: 255 }, glow: 0.8, soft: 0, size: 0.09, grow: -0.3, life: 0.9, lift: -2, drag: 1.4, swirl: 0.2, jitter: 0.05, density: 40, spread: 5, upward: 0 },
        wake: { core: { r: 210, g: 235, b: 250 }, edge: { r: 180, g: 210, b: 235 }, glow: 0, soft: 1, size: 0.3, grow: 0.4, life: 1.6, lift: -0.3, drag: 2.5, swirl: 0, jitter: 0, density: 6, spread: 1, upward: -0.5 },
        strands: 2,
      },
    },
  },
  mend: {
    name: 'Mend',
    word: 'Sel',
    glyph: 'ᛒ',
    cost: 14,
    text: 'Life. Closes wounds on you, or on whoever it strikes, friend or foe.',
    essence: {
      delivery: { type: 'self' },
      hit: [{ type: 'heal', amount: 14 }],
      burst: { radius: 0, effects: [] },
      ward: [{ type: 'heal', amount: 18 }, { type: 'cure', tag: 'poison' }],
      friendly: false,
      light: { r: 0.6, g: 1, b: 0.6, radius: 4, flicker: 0.1 },
      color: { r: 150, g: 255, b: 160 },
      sound: 'life',
      // Soft green-gold motes spiralling gently upwards.
      look: {
        motes: { core: { r: 230, g: 255, b: 200 }, edge: { r: 90, g: 220, b: 120 }, glow: 0.9, soft: 0.4, size: 0.08, grow: -0.2, life: 1.1, lift: 1.4, drag: 1.6, swirl: 0.9, jitter: 0, density: 26, spread: 2.5, upward: 0.7 },
        strands: 3,
      },
    },
  },
  venom: {
    name: 'Venom',
    word: 'Thur',
    glyph: 'ᚦ',
    cost: 11,
    text: 'Poison. Sickens what it touches and leaves a lingering cloud.',
    essence: {
      delivery: { type: 'bolt', speed: 14, gravity: 4, life: 55 },
      hit: [{ type: 'damage', amount: 3, kind: 'poison' }, { type: 'status', id: 'poisoned', ticks: 160 }],
      burst: { radius: 1.6, effects: [{ type: 'status', id: 'poisoned', ticks: 100 }] },
      // Like cures like.
      ward: [{ type: 'cure', tag: 'poison' }],
      friendly: true,
      light: { r: 0.6, g: 0.3, b: 0.8, radius: 3, flicker: 0.2 },
      color: { r: 160, g: 90, b: 200 },
      sound: 'venom',
      // A slow, swelling sickly cloud that hangs where it lands, with buzzing specks in it.
      look: {
        motes: { core: { r: 190, g: 120, b: 220 }, edge: { r: 90, g: 120, b: 50 }, glow: 0, soft: 1, size: 0.22, grow: 0.7, life: 1.6, lift: 0.15, drag: 3, swirl: 0.15, jitter: 0.2, density: 26, spread: 2.4, upward: 0.1 },
        wake: { core: { r: 200, g: 240, b: 120 }, edge: { r: 120, g: 160, b: 60 }, glow: 0.6, soft: 0, size: 0.05, grow: 0, life: 1, lift: 0, drag: 2, swirl: 0.6, jitter: 1.5, density: 10, spread: 1.5, upward: 0 },
        strands: 1,
      },
    },
  },

  quake: {
    name: 'Quake',
    word: 'Grud',
    glyph: 'ᚷ',
    cost: 11,
    text: 'Earth. A shock through the ground that knocks things off their feet. As a ward it steadies you.',
    essence: {
      delivery: { type: 'cone', range: 6, width: 0.9 },
      hit: [{ type: 'damage', amount: 7, kind: 'blunt' }, { type: 'push', force: 5, lift: 5 }, { type: 'status', id: 'staggered', ticks: 14 }],
      burst: { radius: 0, effects: [] },
      ward: [{ type: 'cure', tag: 'stun' }],
      friendly: true,
      light: { r: 0.8, g: 0.6, b: 0.35, radius: 2, flicker: 0 },
      color: { r: 170, g: 130, b: 80 },
      // No earthy sound exists yet, so it borrows the wind's. Its look is its own (below).
      sound: 'wind',
      // Chunks of earth thrown up and falling hard, and dust rolling low along the ground.
      look: {
        motes: { core: { r: 150, g: 115, b: 75 }, edge: { r: 95, g: 75, b: 55 }, glow: 0, soft: 0, size: 0.16, grow: 0, life: 0.9, lift: -12, drag: 0.1, swirl: 0, jitter: 0, density: 30, spread: 5, upward: 0.6 },
        wake: { core: { r: 175, g: 150, b: 115 }, edge: { r: 140, g: 125, b: 100 }, glow: 0, soft: 1, size: 0.4, grow: 0.9, life: 1.4, lift: 0.1, drag: 2.2, swirl: 0, jitter: 0, density: 12, spread: 2.5, upward: -0.8 },
        strands: 0,
      },
    },
  },

  // ── Shapes ─────────────────────────────────────────────────────────────
  lance: {
    name: 'Lance',
    word: 'Kel',
    glyph: 'ᛏ',
    cost: 2,
    text: 'Shape: a fast, straight bolt.',
    shape: { delivery: { type: 'bolt', speed: 22, gravity: 0, life: 50 }, power: 1, cost: 1, radius: 0.8, noun: 'Lance', look: { size: 0.85, spread: 0.8, strands: -1 } },
  },
  arc: {
    name: 'Arc',
    word: 'Orn',
    glyph: 'ᚢ',
    cost: 3,
    text: 'Shape: a heavy orb lobbed in an arc that bursts wide where it lands.',
    shape: { delivery: { type: 'bolt', speed: 12, gravity: 8, life: 80 }, power: 1, cost: 1.15, radius: 1.8, noun: 'Orb', look: { size: 1.3, density: 1.3, spread: 1.2 } },
  },
  wave: {
    name: 'Wave',
    word: 'Ys',
    glyph: 'ᛉ',
    cost: 2,
    text: 'Shape: a sweeping cone in front of you.',
    shape: { delivery: { type: 'cone', range: 7, width: 0.7 }, power: 0.9, cost: 1.1, radius: 1, noun: 'Wave', look: { density: 1.2 } },
  },
  ward: {
    name: 'Ward',
    word: 'Ae',
    glyph: 'ᛟ',
    cost: 0,
    text: 'Shape: the spell turns inward and works on you.',
    shape: { delivery: { type: 'self' }, power: 1, cost: 0.8, radius: 1, noun: 'Ward', look: { swirl: 1.6, spread: 0.6, strands: 1 } },
  },
  nova: {
    name: 'Nova',
    word: 'Rath',
    glyph: 'ᛝ',
    cost: 4,
    text: 'Shape: a ring bursting out around you. Spares you, not always your friends.',
    shape: { delivery: { type: 'nova', radius: 4.5 }, power: 0.8, cost: 1.5, radius: 1, noun: 'Nova', look: { density: 1.5, spread: 1.2 } },
  },

  // ── Powers ─────────────────────────────────────────────────────────────
  grand: {
    name: 'Grand',
    word: 'Mag',
    glyph: 'ᛞ',
    cost: 0,
    text: 'Power: much stronger and a little wider, but costly.',
    power: { power: 1.6, cost: 1.7, radius: 1.2, speed: 1, adjective: 'Grand', look: { size: 1.35, density: 1.6, spread: 1.15, life: 1.15, strands: 1 } },
  },
  swift: {
    name: 'Swift',
    word: 'Ka',
    glyph: 'ᚱ',
    cost: 0,
    text: 'Power: flies much faster and costs less, but hits softer.',
    power: { power: 0.85, cost: 0.8, radius: 1, speed: 1.6, adjective: 'Swift', look: { size: 0.8, life: 0.7, spread: 1.3, jitter: 0.6 } },
  },
  wide: {
    name: 'Wide',
    word: 'Lo',
    glyph: 'ᛜ',
    cost: 0,
    text: 'Power: bursts, waves and novas reach much further.',
    power: { power: 0.9, cost: 1.35, radius: 1.8, speed: 1, adjective: 'Wide', look: { density: 1.4, spread: 1.6, life: 1.2 } },
  },
};

/** The four runes every traveller already knows, plus the ward to turn them on yourself. */
export const STARTING_RUNES: readonly RuneId[] = ['ember', 'gust', 'tide', 'frost', 'ward'];

/** Runebook order. */
export const RUNE_ORDER: readonly RuneId[] = Object.keys(RUNES);
