import type { DamageKind } from './effects';
import type { MaterialId } from './defs';
import type { ItemId } from './defs';

/** A part of a body that armour can cover (content/gear.ts: head, torso, arms, legs). */
export type BodyRegionId = string;

/** What a body part looks like on the paperdoll and how often blows land on it. */
export interface BodyRegionDef {
  name: string;
  /** How much of the fighting lands here (relative weights). */
  cover: number;
  /** Swing directions that favour it, as multipliers on `cover` (missing = ×1). Keys are swing directions. */
  aim?: Readonly<Record<string, number>>;
  /** Boxes on the paperdoll figure, as shares of its width and height. Arms and legs have two. */
  at: readonly { x: number; y: number; w: number; h: number }[];
}

/**
 * What a worn piece does. The numbers are worked out from its form, material and quality
 * (content/gear.ts) or written straight into a hand-made item.
 */
export interface ArmourStats {
  region: BodyRegionId;
  /** Flat harm taken off every physical blow that lands on its part of the body. */
  armor: number;
  /** Multipliers on harm by kind (heat through cloth, cold through steel…); missing = ×1. */
  resist: Partial<Record<DamageKind, number>>;
  /** Blows it can take before it breaks. */
  durability: number;
  /** Blows left. */
  wear: number;
}

/** A kind of garment: the shape of armour for one body part (content/gear.ts, `forms`). */
export interface GearFormDef {
  name: string;
  region: BodyRegionId;
  /** Which material families it can be made of. */
  families: readonly string[];
  /** Base numbers before material and quality. */
  armor: number;
  weight: number;
  value: number;
  durability: number;
  /** Which picture shape draws it (render/entities/itemArt.ts). */
  shape: string;
  /** 0 (cloth) .. 1 (plates): how much of the picture is hard plate. Materials add to it. */
  plate: number;
}

/** What armour can be made of. */
export interface GearMaterialDef {
  /** Word in the name ("iron helm"). */
  name: string;
  family: string;
  /** The physical material (fire, rot…) the piece is made of. */
  material: MaterialId;
  tint: number;
  /** Multipliers on the form's numbers. */
  armor: number;
  weight: number;
  durability: number;
  value: number;
  resist: Partial<Record<DamageKind, number>>;
  /** How common it is to find (relative weight). */
  rarity: number;
  /** 0..1 plates in the picture. */
  plate: number;
}

/** How well a piece was made. */
export interface GearQualityDef {
  /** Word in the name; empty for ordinary work. */
  name: string;
  armor: number;
  durability: number;
  value: number;
  /** 0..1 shine in the picture. */
  sheen: number;
  /** How common it is to find (relative weight). */
  rarity: number;
}

export interface GearTables {
  regions: Readonly<Record<BodyRegionId, BodyRegionDef>>;
  forms: Readonly<Record<string, GearFormDef>>;
  materials: Readonly<Record<string, GearMaterialDef>>;
  qualities: Readonly<Record<string, GearQualityDef>>;
  /** Tuning shared by every system that touches armour. */
  rules: {
    /** Armour that is worn down to nothing still gives this share of its protection (the rest depends on wear left). */
    worn: number;
    /** A blow of this much harm wears a piece by one more hit. */
    heavyBlow: number;
    /** Chance a piece worn by a creature is dropped when it dies. */
    dropChance: number;
    /** Wear a dropped piece has left, as a share of its durability. */
    droppedWear: readonly [number, number];
  };
}

/** Asks for a piece of armour to be made at random: anything left out is picked by rarity. */
export interface GearRoll {
  region?: BodyRegionId;
  form?: string;
  /** Material families or material ids to choose from. */
  materials?: readonly string[];
  /** Quality ids to choose from. */
  qualities?: readonly string[];
}

/** Garments a creature puts on when it first appears: each entry is tried on its own. */
export interface OutfitEntry {
  chance: number;
  roll: GearRoll;
}

/** A request to change what a traveller wears (an input, like using an item). */
export type WearRequest =
  /** Put on a piece from the bag. */
  | { do: 'wear'; item: ItemId }
  /** Put on a piece lying in the world (it is picked up first, if within reach). */
  | { do: 'wearFrom'; entity: number }
  /** Take the piece off this part of the body and into the bag. */
  | { do: 'remove'; region: BodyRegionId };
