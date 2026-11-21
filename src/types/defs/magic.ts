import type { Burst, LightDef } from './things';
import type { Color } from '../math';
import type { Effect } from '../effects';
import type { RuneId, SpellId, StatusId } from './ids';


export type Delivery =
  | { type: 'bolt'; speed: number; gravity: number; life: number }
  /** Everything in a cone in front of the caster. */
  | { type: 'cone'; range: number; width: number }
  | { type: 'self' }
  /** A ring bursting outwards from the caster, sparing the caster. */
  | { type: 'nova'; radius: number };

export type SpellSound = 'fire' | 'wind' | 'water' | 'ice' | 'life' | 'venom';

/**
 * A spell ready to cast. Never written by hand: content/spellcraft.ts composes it from up to three
 * runes. Its id is the rune list, so saves, bolts and network messages carry only that string.
 */
export interface SpellDef {
  id: SpellId;
  name: string;
  /** The rune words spoken aloud, e.g. "Ign Vor Mag". */
  words: string;
  runes: readonly RuneId[];
  cost: number;
  /** Multiplies every effect amount (before the caster's own skill). */
  power: number;
  delivery: Delivery;
  /** Applied to the body a bolt strikes (or each body in a cone or nova, or yourself). */
  hit: Effect[];
  /** Applied around the point where a bolt bursts (or to tiles in a cone or nova). */
  burst: Burst;
  /** Spells cast by a party member never hurt the party with these. */
  friendly: boolean;
  light: LightDef;
  /** Average colour of its essences (runebook, item art). The full look is in `look`. */
  color: Color;
  /** Which family of sounds it makes. */
  sound: SpellSound;
  /** How it looks, blended from its runes' looks (content/spellcraft.ts composeLook). */
  look: SpellLook;
}

/**
 * How one layer of a spell's motes looks and moves. Every field is a plain number or colour so
 * looks can be blended: mix Ember and Frost and you get motes halfway between the two, which is
 * how every rune combination gets its own look without anyone drawing it.
 */
export interface MoteLook {
  /** Colour when a mote is born… */
  core: Color;
  /** …and the colour it fades towards. */
  edge: Color;
  /** 0 = solid flecks that cover what is behind (dust, water), 1 = pure light added to the scene (flame, sparkle). */
  glow: number;
  /** 0 = hard-edged flecks, 1 = soft puffs that thin out at the edges (smoke, mist). */
  soft: number;
  /** Size in metres at birth. */
  size: number;
  /** How fast size changes, per second: +0.5 swells like smoke, -1 shrinks like a flame. */
  grow: number;
  /** Seconds a mote lives. */
  life: number;
  /** Up or down pull in m/s²: positive rises like flame, negative falls like water or rubble. */
  lift: number;
  /** How quickly motes lose their speed, per second (0 = keeps flying, 4 = hangs in the air like a cloud). */
  drag: number;
  /** Turns per second motes curl around (wind eddies, motes of life circling). */
  swirl: number;
  /** Random flutter in m/s (crackling fire, buzzing venom). 0 = smooth. */
  jitter: number;
  /** How many motes a typical burst throws. Trails, cones and rings scale from this. */
  density: number;
  /** How fast a burst throws motes outwards, m/s. */
  spread: number;
  /** Where a burst throws them: 1 = a fountain straight up, 0 = a ball in every direction, -1 = a flat ring along the ground. */
  upward: number;
}

/** The whole look of a spell (or of one essence rune before mixing). */
export interface SpellLook {
  /** The main motes: the bolt's body, the burst, the wave. */
  motes: MoteLook;
  /** A quieter second layer left behind: smoke after fire, mist after frost, grit after a quake. */
  wake?: MoteLook;
  /** How many strands a bolt's trail twists into around its path (0 = one straight stream). */
  strands: number;
  /** 0..1, a fixed number from the spell's runes so each combination twists and turns its own way. */
  seed: number;
}

/** An essence rune's own look, before it is mixed into a spell. */
export type EssenceLook = Omit<SpellLook, 'seed'>;

/**
 * How a shape or power rune bends the look of a spell. Sizes, counts and speeds multiply;
 * strands add. All optional.
 */
export interface LookTweak {
  size?: number;
  density?: number;
  spread?: number;
  life?: number;
  swirl?: number;
  jitter?: number;
  strands?: number;
}

/** What an essence rune brings: the substance of the spell. */
export interface EssencePart {
  /** On whatever the spell strikes. */
  hit: Effect[];
  /** Around where it lands (or on tiles a wave or nova sweeps). */
  burst: Burst;
  /** On yourself, when shaped as a ward. */
  ward: Effect[];
  /** The shape it takes when no shape rune is given. */
  delivery: Delivery;
  friendly: boolean;
  light: LightDef;
  color: Color;
  sound: SpellSound;
  /** How its magic looks. Optional: without one, plain glowing motes in `color` are used. */
  look?: EssenceLook;
}

/** What a shape rune brings: how the spell travels. */
export interface ShapePart {
  delivery: Delivery;
  /** Effect strength multiplier. */
  power: number;
  /** Mana cost multiplier. */
  cost: number;
  /** Burst radius multiplier. */
  radius: number;
  /** Word used in the spell's name ("Nova"). */
  noun: string;
  /** How it bends the look (a nova throws more motes, a lance fewer strands…). */
  look?: LookTweak;
}

/** What a power rune brings: tweaks on top of the others. Every field multiplies. */
export interface PowerPart {
  power: number;
  cost: number;
  radius: number;
  speed: number;
  /** Word used in the spell's name ("Grand"). */
  adjective: string;
  /** How it bends the look (Grand: bigger and denser, Swift: thinner and quicker…). */
  look?: LookTweak;
}

/**
 * A rune: one syllable of magic. Exactly one of essence, shape or power is set.
 * Up to three runes make a spell: at least one essence, at most one shape, no repeats.
 */
export interface RuneDef {
  name: string;
  /** Spoken syllable. */
  word: string;
  /** Symbol shown in the runebook. */
  glyph: string;
  /** Base mana cost added to the spell. */
  cost: number;
  /** One line for the runebook. */
  text: string;
  essence?: EssencePart;
  shape?: ShapePart;
  power?: PowerPart;
}

export interface StatusDef {
  name: string;
  tags: string[];
  /** Removes these when applied. */
  cancels: StatusId[];
  /** Refused while any of these are present. */
  blockedBy: StatusId[];
  /** Repeating effects while active. 'ground' applies them to the tile underfoot. */
  every: { ticks: number; effects: Effect[]; at: 'self' | 'ground' }[];
  /** Movement speed multiplier. */
  move: number;
  /** Cannot swing, cast or think. */
  disables: boolean;
  /** Creatures run around in a panic. */
  panic: boolean;
  /** Glows (render draws this as a light). */
  light?: LightDef;
  /** Tints the sprite. */
  tint?: Color;
}
