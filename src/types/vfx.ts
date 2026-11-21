/** World motes that are not spells: fire, smoke, sparks, splashes, blood, dust, frost glitter. */
export type ParticleKind = 'flame' | 'smoke' | 'spark' | 'water' | 'magic' | 'blood' | 'dust' | 'leaf' | 'frost';

export const PARTICLE_KINDS: readonly ParticleKind[] = ['flame', 'smoke', 'spark', 'water', 'magic', 'blood', 'dust', 'leaf', 'frost'];

/** A burst of motes (content/effects.ts). */
export interface BurstDef {
  kind: ParticleKind;
  /** Motes in one burst (continuous effects make one at a time). */
  count: number;
  /** How fast they fly out, m/s. */
  speed: number;
  /** 0xRRGGBB. */
  colour: number;
  /** Each mote is a random mix between colour and this. */
  colourTo?: number;
  /** Shines in the dark. */
  glow?: boolean;
  /** Seconds. */
  life: number;
  /** Metres. */
  size: number;
}

/**
 * Where the hand is and how the held item points, in metres in front of the eye (x right, y up, z forward).
 * `lean` tips it sideways (+ = to the right), `pitch` turns its tip away from you (0 = straight up,
 * 1.57 = straight ahead, 3.14 = straight down), `roll` twists its flat, `reach` scales it. The item's flat
 * picture is warped to match (render/entities/spriteWarp.ts).
 */
export interface HandPose {
  x: number;
  y: number;
  z: number;
  lean: number;
  pitch: number;
  roll: number;
  reach: number;
}

/** The first-person held item (content/viewmodel.ts): poses for every swing, and how it moves and reacts. */
export interface ViewmodelDef {
  /** Focal length in screen heights (smaller = the item looks farther off and flatter). */
  focal: number;
  /** How the flat picture is warped: its width in metres, the narrowest its flat gets when twisted edge-on, how much a twist slants it, and how much its far end shrinks. */
  warp: { side: number; flat: number; shear: number; taper: number };
  rest: HandPose;
  guard: HandPose;
  /** Drawn back, ready to strike, and where the blow ends, for each way of swinging. */
  wind: Readonly<Record<string, HandPose>>;
  end: Readonly<Record<string, HandPose>>;
  /** The hand dips when carrying something in the other. */
  carry: { y: number };
  /** Walking, breathing and turning move the weapon: metres of travel, and how fast it catches up with the view. */
  sway: { walk: number; breath: number; turn: number; follow: number };
  /** Blows ring through the weapon: spring stiffness and damping, how far a blow kicks it back (metres) and twists it (radians). */
  kick: { stiff: number; damp: number; push: number; twist: number };
  /** A fast sweep leaves a ribbon: how many frames it remembers, the tip speed (screen heights per second) it begins at, and its strength. */
  trail: { frames: number; from: number; strength: number };
  /** The flash, sparks and shock that mark a blow: how long they last (s), how many sparks per unit of power, how far they fly (screen heights). */
  impact: { flash: number; sparks: number; fly: number; gravity: number };
}
