import type { ItemId, RuneId } from './defs';
import type { WearRequest } from './gear';

/**
 * Letting go of an item from the bag over the view: where the cursor was decides the throw.
 * `yaw` is the absolute direction through that point, `lift` the angle above (+) or below (-) the
 * horizon through it, and `power` how high up the screen it was (0 bottom = a gentle drop, 1 top = a
 * full-strength throw).
 */
export interface ThrowAim {
  item: ItemId;
  yaw: number;
  lift: number;
  power: number;
}

/**
 * The four ways to swing. Sweeps (left, right) are wide and throw foes sideways, a thrust reaches
 * far and drives straight in, an overhead chop is slow and heavy and smashes things down. What
 * each one does is data: content/rules.ts, `combat.swings`.
 */
export type SwingDir = 'left' | 'right' | 'thrust' | 'overhead';

export const SWING_DIRS: readonly SwingDir[] = ['left', 'right', 'thrust', 'overhead'];

/** Everything one player asked for during one sim tick. Small and serialisable — sent over the network as-is. */
export interface InputSnapshot {
  seq: number;
  /** -1..1 */
  forward: number;
  /** -1..1, positive = right */
  strafe: number;
  /** Absolute view yaw in radians (mouse look is applied immediately on the client). */
  yaw: number;
  /** View pitch, -1..1 (purely for aiming throws and spells). */
  pitch: number;
  sprint: boolean;
  /** Pressed this tick (edge). */
  jump: boolean;
  /** Held down — keeps a glider open. */
  jumpHeld: boolean;
  /** Attack button held: press to start winding up, keep holding to charge, let go to swing. */
  attack: boolean;
  /** Direction hint taken from recent mouse motion (read when the swing is let go). */
  swingDir: SwingDir;
  /** Block button held. */
  block: boolean;
  /** Edge-triggered actions (true for exactly one snapshot). */
  interact: boolean;
  grab: boolean;
  cast: boolean;
  /** Runes picked in the runebook to prepare as the new spell this tick ([] clears it). */
  prepare: RuneId[] | null;
  useItem: ItemId | null;
  dropItem: ItemId | null;
  /** An item dragged out of the bag and let go over the view (thrown or dropped there). */
  throwItem: ThrowAim | null;
  /** A loose item (entity id) dragged from the view into the open bag: pick it up if within reach. */
  pickUp: number | null;
  /** Putting armour on or taking it off (the paperdoll and the bag). */
  wear: WearRequest | null;
  /** Picking a dialogue option (index) while talking. */
  choice: number | null;
}

export function emptyInput(seq = 0, yaw = 0): InputSnapshot {
  return {
    seq,
    forward: 0,
    strafe: 0,
    yaw,
    pitch: 0,
    sprint: false,
    jump: false,
    jumpHeld: false,
    attack: false,
    swingDir: 'right',
    block: false,
    interact: false,
    grab: false,
    cast: false,
    prepare: null,
    useItem: null,
    dropItem: null,
    throwItem: null,
    pickUp: null,
    wear: null,
    choice: null,
  };
}
