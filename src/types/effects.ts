import type { Vec2 } from './math';
import type { SwingDir } from './input';
import type { FactionId, StatusId, ThingId } from './defs';

/** Kinds of harm. Materials scale each one (stone shrugs off cuts, wood hates fire). */
export type DamageKind = 'cut' | 'blunt' | 'pierce' | 'fire' | 'cold' | 'poison' | 'fall' | 'magic';
export const DAMAGE_KINDS: readonly DamageKind[] = ['cut', 'blunt', 'pierce', 'fire', 'cold', 'poison', 'fall', 'magic'];

/**
 * The one shared vocabulary for everything that happens. Spells, items, traps, statuses, hits and
 * breaking props all speak it, and the effects system applies it in one place.
 */
export type Effect =
  /** `pierce` (0..1) is the share of the target's armour the blow ignores (a thrust finds the gaps). */
  | { type: 'damage'; amount: number; kind: DamageKind; pierce?: number }
  | { type: 'heal'; amount: number }
  | { type: 'restore'; stat: 'mana' | 'stamina'; amount: number }
  | { type: 'status'; id: StatusId; ticks: number }
  /** Removes every status carrying this tag. */
  | { type: 'cure'; tag: string }
  /** Shoves bodies away from where the request came from; fans burning tiles the same way. */
  /** `angle` (radians) throws along that direction instead of straight away from the source (a sweep throws sideways). */
  | { type: 'push'; force: number; lift?: number; angle?: number }
  /** Ignites flammable dry tiles and bodies, melts ice. */
  | { type: 'heat'; amount: number }
  /** Wets tiles and bodies and puts fire out. */
  | { type: 'soak'; amount: number }
  /** Freezes water, chills bodies, snuffs flames. */
  | { type: 'chill'; amount: number }
  /** Spills a liquid on the ground. */
  | { type: 'coat'; liquid: 'oil'; amount: number }
  | { type: 'spawn'; thing: ThingId; count: number };

export type EffectTarget =
  | { kind: 'entity'; id: number }
  | { kind: 'tile'; x: number; y: number }
  /** One cell of the 3D layer (a wall, a roof tile…): treated by the very same rules as a ground tile. */
  | { kind: 'cell'; x: number; y: number; z: number }
  /** Every tile, cell of the 3D layer and body within the radius. */
  | { kind: 'area'; x: number; y: number; z: number; radius: number };

/** One request on the effect queue. Producers push, the effects system applies all of them each tick. */
export interface EffectRequest {
  target: EffectTarget;
  effects: readonly Effect[];
  /** Entity credited for kills and stagger on parry (null for the world itself). */
  source: number | null;
  /** Where the force came from — pushes go away from here. */
  from: Vec2 | null;
  /** Melee swing direction, so guards and parries can match it. */
  swing?: SwingDir | null;
  /** How wound-up a melee blow was, 0 (a tap) .. 1 (fully charged): more hitstop, hitstun and guard-breaking. */
  charge?: number;
  /** Multiplies the hitstop and hitstun a melee blow causes (the weapon's heft). Default 1. */
  hitstop?: number;
  hitstun?: number;
  /** Multiplies every amount (spell power, swing strength). Default 1. */
  scale?: number;
  /** Bodies of this faction are spared (friendly spells). */
  spare?: FactionId;
  /** Never affects this entity (the caster of an area). */
  exclude?: number;
}
