import type { DamageKind } from '../effects';
import type { FactionId, ItemId, RuneId, StatusId, ThingId } from './ids';
import type { ItemStack } from '../items';
import type { SkillId } from '../entities';
import type { SwingDir } from '../input';


/** How a body reacts to heat, water and cold: which status it gets and for how long. */
export interface ReactionDef {
  status: StatusId;
  /** Ticks per 1.0 of effect amount. */
  ticks: number;
  /** Chance = amount × material flammability, lasting the material's burn time. */
  byFlammability?: boolean;
  /** Lasts `factor` times longer while the body already has this status (wet things freeze stiff). */
  longerWhile?: { status: StatusId; factor: number };
  /** A body that already has `while` is turned to `status` for `ticks` as well (wet things freeze solid; dry ones are only chilled). */
  freezes?: { while: StatusId; status: StatusId; ticks: number };
}

/** What one way of swinging does (rules.combat.swings). Lengths are in sim ticks (20 per second). */
export interface SwingDef {
  /** Ticks from a tap to the blow landing (time already spent holding the button counts). */
  windup: number;
  /** Ticks after the blow before the next action. */
  recover: number;
  /** Half-width of the sweep, radians. */
  arc: number;
  /** Multiplies the weapon's reach and damage. */
  reach: number;
  damage: number;
  /** Stamina the swing itself costs (charging costs more, see `charge`). */
  stamina: number;
  /** Most bodies it can catch at once. */
  targets: number;
  /**
   * Where it throws what it hits, as multiples of the weapon's push: `along` is straight away from
   * you, `side` along the sweep (a left sweep throws foes to your left; thrusts and chops have none),
   * `lift` up in the air.
   */
  knock: { along: number; side: number; lift: number };
  /** Extra ticks of hitstun on top of the usual. */
  stun: number;
  /** 0..1: share of armour a blow ignores. */
  pierce: number;
  /** Multiplies the damage dealt to walls, doors and other things that can be broken. */
  breaking: number;
  /** When the weapon cannot swing this way, the first of these it can. */
  else: SwingDir[];
  /** Words for the controls help. */
  help: string;
}

/** World-wide rules and tuning that are not tied to one definition. */
export interface RulesDef {
  /** The item used as money. */
  currency: ItemId;
  reactions: { heat: ReactionDef; soak: ReactionDef; chill: ReactionDef };
  /**
   * Cold freezes the wetness in ground and cells into frost (an overlay: the stuff stays what it is). Only spots at least
   * `wetNeeded` wet (0..255, rain on open ground counts) freeze; dry ones are just cold. Frost holds `lasts` ticks per unit of
   * chill, then gives back `fade` of its ice as wet every 10 ticks until it is gone. Heat thaws it at once.
   */
  frost: { wetNeeded: number; lasts: number; fade: number };
  combat: {
    /** Guarding just before a blow lands staggers the attacker and shoves them back. */
    parry: { status: StatusId; ticks: number; shove: number };
    /** A blocked blow does `damage` of itself, staggers briefly and costs stamina. */
    block: { status: StatusId; ticks: number; damage: number; stamina: number };
    /** A hit at least this strong staggers an actor. */
    heavyHit: { damage: number; status: StatusId; ticks: number };
    /** What each way of swinging does. */
    swings: Record<SwingDir, SwingDef>;
    /** Holding the button winds a blow up: more stamina, more damage and knockback. Lengths in ticks. */
    charge: {
      /** Held for less than this and it is a quick swing. */
      tap: number;
      /** Held this long and the blow is at full strength. */
      full: number;
      /** Stamina drained every tick while winding up past `tap`. */
      stamina: number;
      /** Stamina needed to begin. */
      begin: number;
      /** Multipliers at full strength. */
      damage: number;
      push: number;
      reach: number;
      /** Stamina regrowth while winding up (fraction of normal) and walking speed (fraction). */
      regen: number;
      slow: number;
      /** Ticks from letting go to the blow landing when wound up. */
      snap: number;
      /** Extra ticks a fully charged blow keeps a guard staggered. */
      guardBreak: number;
    };
    /** Hitstun: a landed blow makes the one hit flinch. Ticks of `status`. */
    hitstun: { status: StatusId; base: number; perDamage: number; charged: number; max: number };
    /** Hitstop: a solid blow freezes both bodies for a moment (ticks). */
    hitstop: { base: number; perDamage: number; charged: number; max: number; blocked: number; parried: number; kill: number };
    /** Striking walls, doors, trees and stone. */
    surface: {
      /** Hits of wear on a weapon per unit of hardness, by damage kind (missing = 1). */
      wear: Partial<Record<DamageKind, number>>;
      /** Material hardness at which blows kick back, how long the one swinging flinches and gets thrown back, and the freeze. */
      recoil: { hardness: number; stun: number; push: number; hold: number };
      /** Hardness from which cutting and piercing weapons throw sparks. */
      spark: number;
      /** Wear on breakable things (doors, fences) mends this much per second. */
      mend: number;
    };
  };
  /** Fire: what it throws on the wind, how fast it spreads, how many may burn, and how it looks and sounds. */
  fire: {
    mote: ThingId;
    /** Chance scale for a flame to catch a neighbour per spread beat (times flammability, wind, heat). */
    spread: number;
    /** Ticks between spread beats. */
    beat: number;
    /** The weakest a dying fire spreads, as a share of full (a fire with little fuel left barely spreads). */
    dying: number;
    /** At most this many spots burn at once; further fires do not catch. */
    max: number;
    /** Fires farther than this (m) from every player burn out but no longer spread (they sleep). */
    sleep: number;
    /** Sparks on the wind: chance per burning spot per tick (+ per m/s of wind), and how many may fly at once. */
    spark: { chance: number; wind: number; max: number };
    /** Drawing: palette from hot to cool, flames per second for the whole view, per-fire rates, reach (m). */
    vfx: { palette: number[]; smoke: number[]; budget: number; flame: number; smokeRate: number; ember: number; range: number; pixel: number };
    /** Sound: fire voices (rate-limited one-shots per second), crackle level cap. */
    audio: { oneShots: number; crackle: number };
  };
  /** A fresh traveller. `prepared` runes are kept only if known. */
  start: { inventory: ItemStack[]; wield: ItemId | null; /** Worn from the start. */ worn: ItemId[]; prepared: RuneId[] };
  /**
   * The quick-use keys 1..4 on a new computer: an item id, '@throwable' (whatever flask you carry)
   * or '' for empty. Players change them in the bag (click an item, press the number).
   */
  quickUse: readonly string[];
  /** What each skill level-up adds. */
  skills: Record<SkillId, { maxHp?: number; maxMana?: number; maxStamina?: number }>;
  /** How far away (metres) you can reach a loose item to pull it into your open bag with the mouse. */
  pickReach: number;
  /**
   * Places and the party. A place is filled with its people and creatures when someone comes within
   * `fill` metres. What lives there belongs to the place and stays until everyone is `keep` metres
   * away (it must be more than `fill`, or the place empties before you arrive).
   */
  sites: { fill: number; keep: number };
  /** Metres from every player beyond which bodies sleep (no physics, so far chunks are not dragged back in). */
  awake: number;
  /** Co-op. A friend whose game sends nothing for `timeout` seconds is let go. */
  coop: { timeout: number };
  /** The day and its hours (content/day.ts asks these). */
  day: DayRules;
  /**
   * Who is who. `player`: the travellers' own faction. `folk`: the people of the villages, whose
   * opinion of the party colours greetings and trade. `default`: anything that names none.
   */
  factions: { player: FactionId; folk: FactionId; default: FactionId };
}

/** Colours of the screen furniture (content/hud.ts), as CSS colours. */
export type HudTheme = Readonly<Record<
  | 'text' | 'textSoft' | 'dim' | 'bright' | 'gold' | 'brass' | 'brassFaint' | 'brassGlow' | 'brassLit'
  | 'ink' | 'inkGlass' | 'inkSoft' | 'inkKbd' | 'inkDeep' | 'panel' | 'button' | 'buttonOn' | 'edge' | 'leather'
  | 'rune' | 'aether' | 'warn' | 'warnEdge' | 'danger' | 'go' | 'place' | 'friend'
  | 'hpTop' | 'hpBottom' | 'stTop' | 'stBottom' | 'mpTop' | 'mpBottom'
  | 'mapFound' | 'mapUnknown' | 'mapFoe' | 'mapFriend', string>>;

/** Hours as a share of the day (0 midnight, 0.25 six o'clock, 0.5 noon). */
export interface DayRules {
  /** Real minutes one whole day lasts. */
  minutes: number;
  /** When the sun crosses the horizon in the morning (it sets the same distance after noon). */
  sunrise: number;
  /** Night (creatures of the dark wake, others sleep, auroras may show) runs nightFrom..nightUntil. */
  nightFrom: number;
  nightUntil: number;
  /** After night comes morning until morningUntil, then afternoon until afternoonUntil, then evening. */
  morningUntil: number;
  afternoonUntil: number;
}
