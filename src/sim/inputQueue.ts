// Each player's waiting inputs: taken in from two network roads, played one per tick, never repeated or lost.
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

/**
 * Inputs waiting to be played, per player, oldest first. A friend's inputs arrive over the network
 * in bursts and gaps; each tick plays exactly one, so a press is never repeated or lost.
 */
export class InputQueues {
  private queues = new Map<string, InputSnapshot[]>();
  /** Input numbers already taken in, per player (recent ones only). */
  private seen = new Map<string, Set<number>>();
  /** Ticks in a row a player was kept walking with no input from them (see `play`). */
  private gaps = new Map<string, number>();
  /** The newest input that really came from each player (played or not): its held keys are the freshest we know. */
  private latest = new Map<string, InputSnapshot>();

  /** How many inputs from this player wait to be played. */
  waiting(playerId: string): number {
    return this.queues.get(playerId)?.length ?? 0;
  }

  forget(playerId: string): void {
    this.queues.delete(playerId);
    this.seen.delete(playerId);
    this.gaps.delete(playerId);
    this.latest.delete(playerId);
  }

  clear(): void {
    this.queues.clear();
    this.seen.clear();
    this.gaps.clear();
    this.latest.clear();
  }

  /** Takes in one input; `current` is the one the player is playing now. */
  add(playerId: string, input: InputSnapshot, current: InputSnapshot): void {
    const queue = this.queues.get(playerId) ?? [];
    this.queues.set(playerId, queue);
    const seq = input.seq;
    if (seq <= 0) {
      queue.push(input);
      return;
    }
    // Inputs come by two roads (a fast one that may lose or reorder them, and a sure one for
    // presses), so the same one can arrive twice or late. Each is played once, in order.
    const seen = this.seen.get(playerId) ?? new Set<number>();
    this.seen.set(playerId, seen);
    if (seen.has(seq)) return;
    seen.add(seq);
    if (seq > (this.latest.get(playerId)?.seq ?? 0)) this.latest.set(playerId, input);
    if (seen.size > 256) for (const s of seen) if (s < seq - 200) seen.delete(s);
    if (seq <= current.seq) {
      // Too late to be played in its place: its movement is old news, but a press still counts.
      if (hasPress(input)) queue.unshift({ ...foldInputs(input, holdInput(queue[0] ?? current)), seq: current.seq });
      return;
    }
    let at = queue.length;
    while (at > 0 && (queue[at - 1]?.seq ?? 0) > seq) at--;
    queue.splice(at, 0, input);
  }

  /**
   * The input a player plays this tick. With nothing new, they keep walking and looking the way they
   * were but nothing is pressed again. That held step stands in for the input that is late (it is
   * numbered as that one, so when it arrives only its presses still count): the host then moves a
   * friend exactly one step per input, as the friend foresaw, instead of an extra step now and a
   * lost one later. Only for a few ticks: after that the numbering goes back to the last real input, so a
   * friend who went quiet is not run ahead and their next inputs all play. If inputs pile
   * up (the friend's clock runs a little fast), the oldest are folded together so they catch up.
   */
  play(playerId: string, current: InputSnapshot): InputSnapshot {
    const queue = this.queues.get(playerId);
    if (queue && queue.length > MAX_QUEUED_INPUTS) {
      // Far behind: old movement goes, but nothing they pressed is lost.
      const dropped = queue.splice(0, queue.length - MAX_QUEUED_INPUTS);
      queue.unshift(...dropped.filter(hasPress));
    }
    let next = queue?.shift();
    while (queue && next && queue.length > MAX_WAITING_INPUTS) {
      const after = queue[0];
      if (!after || !canFold(next, after)) break;
      queue.shift();
      next = foldInputs(next, after);
    }
    if (next) {
      this.gaps.set(playerId, 0);
      return next;
    }
    const gap = (this.gaps.get(playerId) ?? 0) + 1;
    this.gaps.set(playerId, gap);
    const real = this.latest.get(playerId);
    if (current.seq <= 0 || !real) return holdInput(current);
    const held = holdInput(real.seq >= current.seq ? real : current);
    return { ...held, seq: gap <= MAX_WAITING_INPUTS ? Math.max(current.seq, real.seq) + 1 : real.seq };
  }
}
