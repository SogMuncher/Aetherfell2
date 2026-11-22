import type { ArmourStats } from '../gear';
import type { HeldLightDef, WeaponStats } from './things';
import type { Effect } from '../effects';
import type { ItemId, MaterialId, RuneId } from './ids';


export type ItemCategory = 'currency' | 'potion' | 'throwable' | 'food' | 'weapon' | 'armour' | 'material' | 'key' | 'tool' | 'rune';

/**
 * Which shared base shape an item picture is built from (render/entities/itemArt.ts paints them):
 * 'vessel' (bottles, vials, jugs, pots: see ItemLook.body), 'blade', 'axe', 'hammer', 'club',
 * 'spear', 'coin', 'key', 'loaf', 'haunch', 'pelt', 'shard', 'stone', 'bundle', 'lump'.
 * A plain string like SpriteId: an unknown form is painted as a lump.
 */
export type ItemForm = string;

/** Body of a vessel: 'round' flask, 'tall' bottle, thin 'vial', clay 'jug' or 'pot'. */
export type VesselBody = 'round' | 'tall' | 'vial' | 'jug' | 'pot';

/**
 * How an item looks. Every field is optional: whatever is left out is worked out from the rest of
 * the definition (a weapon's look comes from its stats, a potion is a flask of its tint, and so
 * on), so most items need no look at all.
 */
export interface ItemLook {
  form?: ItemForm;
  /** For vessels. */
  body?: VesselBody;
  /** Colour of what is inside a vessel (default: the item tint). */
  fill?: number;
  /** 0..1 how full a vessel is (default 0.75). */
  level?: number;
  /** Colour of the thing itself: glass, clay, metal, wood, hide (default depends on the form). */
  shell?: number;
  /** Colour of glowing marks: a rune cut, a pommel gem, a shimmer in the liquid. */
  glow?: number;
  /** Bubbles or motes floating in a liquid. */
  sparkle?: boolean;
  /** 0.6..1.4 how big it is in its picture and in the world (default 1). */
  size?: number;
  /** For armour: 0 (cloth) .. 1 (plates). */
  plate?: number;
  /**
   * Picture pieces painted in order, later over earlier (render/entities/itemParts.ts): gear puts
   * itself together this way ('haft', 'axeBit'…). Left out, the item is the one piece `form`.
   */
  parts?: readonly string[];
}

/** What happens where an item breaks (a flask shatters and splashes, a torch scatters fire). */
export interface BreakDef {
  /** A burst of effects around the spot (missing = nothing happens there). */
  radius?: number;
  effects?: Effect[];
  /** What is left lying there (missing = nothing). */
  into?: ItemId;
}

export interface ItemDef {
  name: string;
  category: ItemCategory;
  weight: number;
  value: number;
  /** Main colour for the procedural item picture. */
  tint: number;
  /** Optional hints for the procedural picture; see ItemLook. */
  look?: ItemLook;
  /** Drinking or eating it applies these to you. */
  use?: Effect[];
  /** Made to be thrown: using it throws it at this speed (it still has to break to burst). */
  thrown?: { speed: number };
  /**
   * Blows (or hard landings) it takes before it breaks. Every item has some: left out, the
   * category's number in `rules.items.durability` is used. A resolved item always has it.
   */
  durability?: number;
  /** Blows left, for one worn item (set when an id carries `@wear`, see content/itemDefs.ts). */
  wear?: number;
  /** What it is made of: how it sounds when struck or broken (missing: `rules.items.material` by category). */
  material?: MaterialId;
  /** What it does when it breaks (in the hands, or flying into something). */
  onBreak?: BreakDef;
  /** How it fights when swung. Left out, any item is swung as it is (`rules.items.improvised`). */
  weapon?: WeaponStats;
  /** Lights the way while it is wielded (a torch): the same light as anything else that glows, carried with you. */
  light?: HeldLightDef;
  /** Wearing it protects a part of the body (put on by double-clicking it, or dragging it onto the paperdoll). */
  armour?: ArmourStats;
  /** Holding jump in the air opens it as a glider. */
  glide?: { sink: number; speed: number };
  /** Carrying it teaches you this rune (the stone is used up the first time). */
  teaches?: RuneId;
}
