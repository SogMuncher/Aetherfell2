import type { InputSnapshot } from '../types';


/** More waiting inputs than this and the oldest are folded together. */
export const MAX_WAITING_INPUTS = 3;
/** A friend who has fallen this far behind (about two seconds) loses the oldest inputs. */
export const MAX_QUEUED_INPUTS = 40;

/** Two inputs can become one when they do not both press the same kind of thing (two potions stay two). */
export function canFold(a: InputSnapshot, b: InputSnapshot): boolean {
  const both = (x: unknown, y: unknown): boolean => x !== null && x !== false && y !== null && y !== false;
  return !(
    both(a.jump, b.jump) || both(a.interact, b.interact) || both(a.grab, b.grab) || both(a.cast, b.cast) ||
    both(a.prepare, b.prepare) || both(a.useItem, b.useItem) || both(a.dropItem, b.dropItem) ||
    both(a.throwItem, b.throwItem) || both(a.throwHeld, b.throwHeld) || both(a.pickUp, b.pickUp) || both(a.wear, b.wear) || both(a.choice, b.choice)
  );
}

/** Last tick's input with every one-off press taken out: held keys and look direction carry on. */
export function holdInput(i: InputSnapshot): InputSnapshot {
  return { ...i, jump: false, interact: false, grab: false, cast: false, prepare: null, useItem: null, dropItem: null, throwItem: null, throwHeld: false, pickUp: null, wear: null, choice: null };
}

export function hasPress(i: InputSnapshot): boolean {
  return i.jump || i.interact || i.grab || i.cast || i.prepare !== null || i.useItem !== null || i.dropItem !== null || i.throwItem !== null || i.throwHeld || i.pickUp !== null || i.wear !== null || i.choice !== null;
}

/** Two inputs as one: the later one's held keys and look, and every press from either. */
export function foldInputs(a: InputSnapshot, b: InputSnapshot): InputSnapshot {
  return {
    ...b,
    jump: a.jump || b.jump,
    interact: a.interact || b.interact,
    grab: a.grab || b.grab,
    cast: a.cast || b.cast,
    prepare: b.prepare ?? a.prepare,
    useItem: b.useItem ?? a.useItem,
    dropItem: b.dropItem ?? a.dropItem,
    throwItem: b.throwItem ?? a.throwItem,
    throwHeld: a.throwHeld || b.throwHeld,
    pickUp: b.pickUp ?? a.pickUp,
    wear: b.wear ?? a.wear,
    choice: b.choice ?? a.choice,
  };
}
