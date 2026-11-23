import type { DamageKind, Effect } from './effects';
import type { HandlingDef } from './defs/handling';
import type { MaterialId } from './defs';
import type { ItemId } from './defs';
import type { Surface, Vec3 } from './art';

/** A part of a body that armour can cover (content/gear.ts: head, torso, arms, legs). */
export type BodyRegionId = string;

/** The slot for what is held in the hands. Gear made for it is swung; anything else put there is swung as it is. */
export const HAND_SLOT = 'hand';

/** Where a piece of gear goes: a part of the body, or the hands. */
export type GearSlot = BodyRegionId;

/** A box on the paperdoll figure, as shares of its width and height. */
export interface DollBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What a body part looks like on the paperdoll and how often blows land on it. */
export interface BodyRegionDef {
  name: string;
  /** How much of the fighting lands here (relative weights). */
  cover: number;
  /** Swing directions that favour it, as multipliers on `cover` (missing = ×1). Keys are swing directions. */
  aim?: Readonly<Record<string, number>>;
  /** Boxes on the paperdoll figure. Arms and legs have two. */
  at: readonly DollBox[];
  /**
   * How armour sits on a creature: a shell over each body part marked with this region (ArtPart.wear),
   * its size times `grow` and moved by `shift` (shares of the part's size), [forward, up, side].
   * `hides` are the features it covers up (a helm hides a hat).
   */
  fit: { grow: Vec3; shift: Vec3; hides?: readonly string[] };
}

/**
 * What a worn piece does. The numbers are worked out from its form, material, quality and
 * enchantment (content/gear.ts) or written straight into a hand-made item. How worn it is lives on
 * the item (every item has durability), not here.
 */
export interface ArmourStats {
  region: BodyRegionId;
  /** Flat harm taken off every physical blow that lands on its part of the body. */
  armor: number;
  /** Multipliers on harm by kind (heat through cloth, cold through steel…); missing = ×1. */
  resist: Partial<Record<DamageKind, number>>;
}

/** The fighting numbers of a held gear form, before material and quality. */
export interface GearWeaponBase {
  damage: number;
  kind: DamageKind;
  reach: number;
  speed?: number;
  push?: number;
  swings?: readonly ('left' | 'right' | 'thrust' | 'overhead')[];
  charge?: number;
  /** How it handles where that differs from its kind and weight (types/defs/handling.ts). */
  handling?: HandlingDef;
}

/**
 * A kind of gear: a garment for one part of the body, or something made to be held and swung
 * (content/gear.ts, `forms`). Its picture is put together from `parts` (art pieces 'item.<name>', content/itemGearArt.ts).
 */
export interface GearFormDef {
  name: string;
  /** Where it goes: a body part, or HAND_SLOT for weapons. */
  slot: GearSlot;
  /** Which material families it can be made of. */
  families: readonly string[];
  /** Worn: flat protection before material and quality. */
  armor?: number;
  /** Held: fighting numbers before material and quality. */
  weapon?: GearWeaponBase;
  weight: number;
  value: number;
  durability: number;
  /** Picture pieces, painted in order (later ones over earlier ones). */
  parts: readonly string[];
  /** 0 (cloth) .. 1 (plates): how much of the picture is hard plate. Materials add to it. */
  plate: number;
}

/** What gear can be made of. */
export interface GearMaterialDef {
  /** Word in the name ("iron helm"). */
  name: string;
  family: string;
  /** The physical material (fire, rot…) the piece is made of. */
  material: MaterialId;
  tint: number;
  /** Multiplier on protection when worn and on harm when swung. */
  power: number;
  weight: number;
  durability: number;
  value: number;
  resist: Partial<Record<DamageKind, number>>;
  /** How common it is to find (relative weight). */
  rarity: number;
  /** 0..1 plates in the picture. */
  plate: number;
  /** Its texture, in the item picture and worn on a body: 'cloth', 'skin' (leather), 'metal'. */
  surface: Surface;
}

/** How well a piece was made. */
export interface GearQualityDef {
  /** Word in the name; empty for ordinary work. */
  name: string;
  power: number;
  durability: number;
  value: number;
  /** 0..1 shine in the picture. */
  sheen: number;
  /** How common it is to find (relative weight). */
  rarity: number;
}

/**
 * A magic laid into a piece. A new enchantment is one entry: what it adds to every blow struck
 * with it, what it turns aside when worn, and the words and glow it gives.
 */
export interface EnchantDef {
  /** Words after the name ("Iron sword of embers"). */
  name: string;
  /** Which slots it can be laid into (missing = any). */
  slots?: readonly GearSlot[];
  /** Held: extra effects on whatever it hits, scaled with the blow. */
  hit?: Effect[];
  /** Worn: extra multipliers on harm by kind. */
  resist?: Partial<Record<DamageKind, number>>;
  /** Multipliers on power and durability (missing = ×1). */
  power?: number;
  durability?: number;
  value: number;
  /** Colour of the glow in its picture. */
  glow: number;
  rarity: number;
}

export interface GearTables {
  regions: Readonly<Record<BodyRegionId, BodyRegionDef>>;
  /**
   * The hands on the paperdoll, and how a creature holds an item at its 'hand' part: `tilt` degrees
   * forward, `length` metres per metre the item is long in the world, gripped `grip` of the way up.
   */
  hand: { name: string; at: readonly DollBox[]; hold: { tilt: number; length: number; grip: number } };
  forms: Readonly<Record<string, GearFormDef>>;
  materials: Readonly<Record<string, GearMaterialDef>>;
  qualities: Readonly<Record<string, GearQualityDef>>;
  enchants: Readonly<Record<string, EnchantDef>>;
  /** Tuning shared by every system that touches gear. */
  rules: {
    /** Armour that is worn down to nothing still gives this share of its protection (the rest depends on wear left). */
    worn: number;
    /** A blow of this much harm wears a piece by one more hit. */
    heavyBlow: number;
    /** Chance a piece worn by a creature is dropped when it dies. */
    dropChance: number;
    /** Wear a dropped piece has left, as a share of its durability. */
    droppedWear: readonly [number, number];
    /** Chance a rolled piece carries an enchantment. */
    enchantChance: number;
  };
}

/** Asks for a piece of gear to be made at random: anything left out is picked by rarity. */
export interface GearRoll {
  /** A body part, or HAND_SLOT for something to swing. */
  region?: GearSlot;
  form?: string;
  /** Material families or material ids to choose from. */
  materials?: readonly string[];
  /** Quality ids to choose from. */
  qualities?: readonly string[];
  /** Chance of an enchantment (default: rules.enchantChance). */
  enchant?: number;
}

/** Garments a creature puts on when it first appears: each entry is tried on its own. */
export interface OutfitEntry {
  chance: number;
  roll: GearRoll;
}

/** A request to change what a traveller wears or holds (an input, like using an item). */
export type WearRequest =
  /** Put a piece from the bag on (or, with `slot` HAND_SLOT, take anything from the bag into the hands). */
  | { do: 'wear'; item: ItemId; slot?: GearSlot }
  /** Put on a piece lying in the world (it is picked up first, if within reach). */
  | { do: 'wearFrom'; entity: number }
  /** Take what is on this part of the body (or in the hands) into the bag. */
  | { do: 'remove'; region: GearSlot };
