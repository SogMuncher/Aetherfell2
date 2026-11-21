/**
 * A guest's view of the host's world. Other things are shown as the host last described them,
 * eased between updates. Our own traveller is foreseen: each input moves us at once with the host's
 * own rules (Simulation.predict), and each host update is taken as the truth of a few inputs ago,
 * with the inputs it has not seen yet played again on top. Kept free of the browser so the
 * co-op checks can run it (scripts/coopSmoke.ts).
 */
import type { EntitySnapshot, InputSnapshot, SimState } from '../types';

/** What the guest view needs from the replica simulation. */
export interface Replica {
  state: SimState;
  predict(playerId: string, input: InputSnapshot): void;
}

/** Inputs kept for replaying at most (three seconds). */
const KEEP = 60;
/** A difference smaller than this is eased away; bigger ones (a respawn, a big shove) are taken at once. */
const EASE_WITHIN = 2.5;
/** How much of the difference is kept after each update (the rest is corrected). */
const EASE_KEEP = 0.6;

export class GuestView {
  /** Our inputs the host has not answered yet, oldest first. */
  unanswered: InputSnapshot[] = [];

  reset(): void {
    this.unanswered = [];
  }

  /** One of our ticks: move ourselves now and remember the input until the host answers it. */
  tick(sim: Replica, playerId: string, input: InputSnapshot): void {
    if (sim.state.players[playerId] === undefined) return;
    sim.predict(playerId, input);
    this.unanswered.push(input);
    if (this.unanswered.length > KEEP) this.unanswered.shift();
  }

  /** A host update. Returns false when it was older than what we have (the fast road may reorder). */
  adopt(sim: Replica, playerId: string, snap: EntitySnapshot): boolean {
    if (snap.tick <= sim.state.tick) return false;
    const old = sim.state.entities;
    const myId = snap.players[playerId];
    const mine = myId !== undefined ? old.get(myId) : undefined;
    const shown = mine ? { x: mine.pos.x, y: mine.pos.y, z: mine.z, prev: { ...mine.prev }, prevZ: mine.prevZ } : null;
    const next = new Map<number, (typeof snap.entities)[number]>();
    for (const e of snap.entities) {
      const before = old.get(e.id);
      e.prev = before ? { x: before.pos.x, y: before.pos.y } : { x: e.pos.x, y: e.pos.y };
      e.prevZ = before ? before.z : e.z;
      next.set(e.id, e);
    }
    sim.state.entities = next;
    sim.state.weather = snap.weather;
    sim.state.players = snap.players;
    sim.state.tick = snap.tick;

    const me = myId !== undefined ? next.get(myId) : undefined;
    if (!me?.player) return true;
    const answered = me.player.input.seq;
    this.unanswered = this.unanswered.filter((s) => s.seq > answered);
    for (const s of this.unanswered) sim.predict(playerId, s);
    if (!shown) return true;
    const ex = shown.x - me.pos.x;
    const ey = shown.y - me.pos.y;
    const ez = shown.z - me.z;
    if (Math.hypot(ex, ey) < EASE_WITHIN && Math.abs(ez) < 2) {
      me.pos.x += ex * EASE_KEEP;
      me.pos.y += ey * EASE_KEEP;
      me.z += ez * EASE_KEEP;
      me.prev = shown.prev;
      me.prevZ = shown.prevZ;
    }
    return true;
  }
}
