import type { GearRoll } from '../gear';
import type { ItemId, RealmId, RuneId, ThingId } from './ids';
import type { TileKind } from '../tiles';


/**
 * One reusable behaviour from the shared library in sim/ai/behaviours.ts, with its own settings.
 * Every creature (animal, monster or villager) is just a brain listing which of these it has.
 * A new creature mixes existing behaviours; only a genuinely new kind of behaviour needs code.
 */
export type BehaviourDef =
  /** Runs about blindly while a status with `panic` is on it (burning). */
  | { do: 'panic' }
  /** Runs away from fire it can see. `chance` 0..1 is how strongly fire scares it. */
  | { do: 'fleeFire'; chance: number; distance: number }
  /** Runs from enemies once its health drops below `below` (a fraction of full health). */
  | { do: 'retreat'; below: number; distance: number }
  /**
   * Keeps its distance from anything that looks dangerous (players and creatures that hunt) whose
   * side it does not trust. `within` is a fraction of its senses. With `untilProvoked` it stops
   * running once something attacks it (and its other behaviours take over, e.g. `defend`).
   */
  | { do: 'avoid'; within: number; distance: number; trust: number; untilProvoked?: boolean }
  /** Chases and attacks the nearest enemy (see BrainDef.hate), or whoever hurt it. `growl` is a chance per bite to snarl. */
  | { do: 'hunt'; growl: number }
  /**
   * Casts spells at enemies it can see. Each entry is a spell written as a rune list (the same
   * runes and rules as the runebook, content/spellcraft.ts), the distance band it likes to cast
   * from and how readily. `keep` is the distance it backs off to when an enemy gets closer;
   * `telegraph` the ticks of gathering magic before the spell is let go (a chance to dodge or close in);
   * `cooldown` the ticks between casts. Needs the thing to have `actor.caster`.
   */
  | { do: 'cast'; spells: { runes: RuneId[]; range: [number, number]; chance: number }[]; keep: number; telegraph: number; cooldown: [number, number] }
  /**
   * Goes with the nearest traveller of its own side (someone who joined the party): fights what threatens the party
   * within `guard` metres of them, keeps within `near`, and hurries once more than `far` behind.
   */
  | { do: 'follow'; near: number; far: number; guard: number }
  /** Fights back against whoever hurt it, if they are still close. */
  | { do: 'defend' }
  /** Keeps a daily routine: work place by day, home by night, pottering about at work. Needs a home and work place. */
  | { do: 'routine'; potter: number; chance: number }
  /** Stops to graze now and then, for a while. */
  | { do: 'graze'; chance: number; ticks: [number, number] }
  /** Sits still in its patch and only now and then shuffles a little way. */
  | { do: 'lurk'; roam: number; chance: number }
  /** Strolls around its home. */
  | { do: 'wander'; roam: number; chance: number }
  /**
   * Walks over to loose items it can see within `within` metres and puts them in its bag, the same
   * pick-up a player makes, until it carries `keep` things. With `throwables` it only wants things
   * made to be thrown. `chance` is how readily it goes for one when it stops to think.
   */
  | { do: 'grab'; within: number; keep: number; chance: number; throwables?: boolean }
  /**
   * Throws something from its bag at an enemy it can see `range` metres away, the same throw a
   * player makes: things made to be thrown first, and with `anything` whatever else it carries.
   * `chance` is how readily it throws when it stops to think.
   */
  | { do: 'throw'; range: [number, number]; chance: number; anything?: boolean };

/** Every behaviour name in the library. */
export type BehaviourKind = BehaviourDef['do'];

/**
 * A creature's mind as data: how far it notices things, and the behaviours it has, in order of
 * importance. Every few moments it goes down the list and does the first one that applies.
 */
export interface BrainDef {
  /** Metres it notices things. */
  sense: number;
  /** Sense multiplier at night. */
  nightSense: number;
  /** Its side's feeling (-1..1) towards another side below which that side counts as an enemy. */
  hate: number;
  behaviours: BehaviourDef[];
}

export interface LootEntry {
  /** What drops: this item, or (with `gear`) a piece of armour made at random. */
  item: ItemId;
  gear?: GearRoll;
  min: number;
  max: number;
  /** 0..1 chance this entry drops at all. */
  chance: number;
}

export interface LootDef {
  entries: LootEntry[];
}

export interface HabitatDef {
  /** Which realm it lives in (default: the surface). */
  realm?: RealmId;
  thing: ThingId;
  tiles: TileKind[];
  /** How many hang around a traveller by day and night. */
  day: number;
  night: number;
  /** Group size range, by day and by night. */
  group: [number, number];
  nightGroup: [number, number];
}

/** Where a population entry is placed in a site. */
export type Placement =
  | { at: 'centre'; offset?: [number, number] }
  | { at: 'ring'; min: number; max: number }
  /** Inside each house (villages). `every` picks every n-th house starting at `first`. */
  | { at: 'house'; every: number; first: number; corner: 'near' | 'far' };

export interface PopulationEntry {
  thing: ThingId;
  count: number;
  chance: number;
  place: Placement;
  /** For loose items: which item lies there. */
  item?: { id: ItemId; count: number };
}
