/**
 * How a creature looks, as data. Every creature (people included) is a small set of solid parts
 * (balls, boxes and cones) placed in metres around its feet. The renderer builds its sprites from
 * these parts, from 8 directions, and animates them by swinging limbs about their joints, so a new
 * creature is a new entry in content/looks.ts, never new drawing code.
 *
 * Coordinates are the creature's own: [forward, up, side] in metres, from the point on the ground
 * between its feet. Side is positive on its left.
 */
export type LookId = string;

export type Vec3 = readonly [number, number, number];

/** 'drum' is an upright cylinder (a barrel, a post, a torch shaft), centred like a ball or box. */
export type PartShape = 'ball' | 'box' | 'cone' | 'drum';

/**
 * Surface texture and shine. 'glow' ignores shading (eyes, embers). 'leaves' has ragged, see-through
 * edges (foliage, needles, reeds); 'bark' runs in streaks along the piece; 'stone' is mottled;
 * 'thatch' runs in bands; 'wood' shows rings and grain.
 */
export type Surface = 'smooth' | 'skin' | 'fur' | 'cloth' | 'scales' | 'shell' | 'metal' | 'glow' | 'leaves' | 'bark' | 'stone' | 'thatch' | 'wood';

export interface PartDef {
  /** Name so other parts can hang from it. */
  id?: string;
  /** Moves with this part (eyes and ears with the head, a hand with the arm). */
  parent?: string;
  shape: PartShape;
  /** Centre of a ball or box; centre of the base of a cone. */
  at: Vec3;
  /** Radii along forward, up, side. For a cone: base radius forward, length, base radius side. */
  size: Vec3;
  /** Degrees about the side axis; positive tips the top of the part forward. */
  tilt?: number;
  /** Degrees about the up axis; positive turns the front of the part to the creature's left. */
  yaw?: number;
  /** Degrees about the forward axis; positive leans the top of the part to the creature's left. */
  roll?: number;
  /** The joint it swings about (hip, shoulder, neck). Defaults to `at`. */
  pivot?: Vec3;
  /**
   * The colour region it belongs to ('coat', 'eye'), filled from the look's `colors` when drawn,
   * or a fixed '#rrggbb'.
   */
  color: string;
  surface?: Surface;
  /** Drawn only when the individual has this feature ('beard'); '!hat' = only when it lacks it. */
  feature?: string;
  /** Also add a copy on the other side (side, yaw and roll mirrored; half a stride out of step). */
  mirror?: boolean;
  /** Swings while walking: degrees each way, and where in the stride (0..1) it is furthest forward. */
  stride?: { swing: number; phase: number };
  /** Extra swing (degrees) at the moment of an attack: a lunging head, a raised arm. */
  strike?: number;
  /** Swing (degrees) while resting: a wagging tail, a breathing chest. */
  idle?: number;
}

export interface GaitDef {
  /** Metres covered by one full stride (both legs). Longer strides animate slower at the same speed. */
  stride: number;
  /** How far the body rises during a stride (metres). */
  bounce: number;
  /** Bounds along in one arc per stride (toads, rabbits) instead of a rise per footfall. */
  hop?: boolean;
}

export interface LookDef {
  /** Pixels per metre. Higher is finer. */
  ppm?: number;
  parts: readonly PartDef[];
  /**
   * Colour regions and the colours each may take: '#rrggbb' or '@palette' (content/palettes.ts).
   * Each individual gets its own pick, laid over the shared picture when it is drawn, so a pack of
   * wolves is not all alike.
   */
  colors: Readonly<Record<string, readonly string[]>>;
  /** Optional features and the chance (0..1) an individual has one. */
  features?: Readonly<Record<string, number>>;
  gait: GaitDef;
  /** The whole body leans forward (degrees) and lunges (metres) as it strikes. */
  attack?: { lean: number; lunge: number };
  /** Individuals are this much bigger or smaller at most (0.1 = ±10%). */
  vary?: number;
}

/** Clothing and features a role or faction puts on an individual (a smith's apron, an elder's beard). */
export interface DressDef {
  /** Replaces the look's choices for these colour slots. */
  colors?: Readonly<Record<string, readonly string[]>>;
  /** Always has these features. */
  features?: readonly string[];
  /** Never has these features. */
  without?: readonly string[];
}
