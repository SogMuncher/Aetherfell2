// How a weapon handles: per-angle timing, damage, knockback and stamina, charging, impact and throwing (all multipliers).
import type { DamageKind } from '../effects';
import type { SwingDir } from '../input';

/** One way of swinging with one weapon, as multipliers on the swing's row in rules.combat.swings. */
export interface SwingFeel {
  /** Wind-up time (a tap's lead-in and the time to a full charge). Bigger = slower. */
  windup: number;
  /** Swing time: from letting go to the blow landing, and the recovery after. Bigger = slower. */
  swing: number;
  /** Damage, at most 1: an angle the weapon is not made for hits weaker, never stronger. */
  damage: number;
  /** Knockback. */
  knock: number;
  /** Stamina the swing costs. */
  stamina: number;
  /** This angle hits with another part of the weapon (the back of an axe is blunt). */
  kind?: DamageKind;
}

/**
 * Everything about how a weapon handles, fully worked out (content/handling.ts). One flat shape so
 * any of it can be tuned or patched on the spot: per angle, then for the weapon as a whole.
 */
export interface Handling {
  angles: Record<SwingDir, SwingFeel>;
  /** Time to wind up to a full charge. Bigger = slower. */
  charge: number;
  /** Damage of a fully charged blow (1 = no gain). */
  chargeDamage: number;
  /** Stamina for every swing and for holding a charge. */
  stamina: number;
  /** How long a hit freezes both bodies, and how long the one hit flinches. Heavy and blunt = more. */
  hitstop: number;
  hitstun: number;
  /** Damage when thrown. */
  thrown: number;
}

/** What data writes: only what differs from what the weapon's kind and weight already give. */
export interface HandlingDef {
  angles?: Partial<Record<SwingDir, Partial<SwingFeel>>>;
  charge?: number;
  chargeDamage?: number;
  stamina?: number;
  hitstop?: number;
  hitstun?: number;
  thrown?: number;
}
