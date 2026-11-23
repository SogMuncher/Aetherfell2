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

/** One moment of a swing: where the hand is (m from the eye, x right, y up, z forward), where the blade points (need not be unit length), and the twist of its flat. */
export interface ArcKey {
  at: readonly [number, number, number];
  d: readonly [number, number, number];
  roll: number;
}

/**
 * A swing as a path: the hand curves about `pivot` (m from the eye) while the blade turns from `from`
 * (drawn back) through `hit` (the moment it lands) to `to` (end of the follow-through), always the short way round.
 */
export interface SwingArcDef {
  pivot: readonly [number, number, number];
  from: ArcKey;
  hit: ArcKey;
  to: ArcKey;
}

/** The first-person held item (content/viewmodel.ts): poses for every swing, and how it moves and reacts. */
export interface ViewmodelDef {
  /** Focal length in screen heights (smaller = the item looks farther off and flatter). */
  focal: number;
  /** How the flat picture is warped: its width in metres, the narrowest its flat gets when twisted edge-on, how much a twist slants it, and how much its far end shrinks. */
  warp: { side: number; flat: number; shear: number; taper: number };
  rest: HandPose;
  guard: HandPose;
  /** The path of each way of swinging (render/entities/viewPose.ts). */
  arcs: Readonly<Record<string, SwingArcDef>>;
  /**
   * How it moves between poses: `aim` and `home` are how fast (1/s) it settles on the wound-up pose while you
   * turn the mouse, and back to rest after a blow; `draw` = how much further back (share of the arc) a full
   * charge draws it; `lag` = how far the tip trails the hand into the blow and whips past it after;
   * `through` = share of the recovery spent following through; `tapWind` = share of a quick tap spent drawing back.
   */
  motion: { aim: number; home: number; draw: number; lag: number; through: number; tapWind: number };
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
