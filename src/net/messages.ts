/**
 * Checking and shaping co-op messages. Kept apart from the PeerJS connection so it can be tested
 * without a browser (scripts/coopSmoke.ts). Everything that comes from another computer is
 * `unknown` until it has been checked here.
 */
import type { CheatValue, Entity, EntitySnapshot, GuestMessage, HostMessage, InputSnapshot, SharedLog, SimState, ThrowAim, WearRequest } from '../types';

export function isGuestMessage(v: unknown): v is GuestMessage {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as { t?: unknown }).t;
  if (t === 'hello') return typeof (v as { name?: unknown }).name === 'string' && (v as { name: string }).name.length <= 64;
  if (t === 'ping') return true;
  if (t === 'input') {
    const i = (v as { input?: unknown }).input;
    return typeof i === 'object' && i !== null && !Array.isArray(i);
  }
  if (t === 'cheat') {
    const c = v as { cheat?: unknown; value?: unknown };
    return typeof c.cheat === 'string' && c.cheat.length <= 32 && cleanCheatValue(c.value) !== undefined;
  }
  return false;
}

export function isHostMessage(v: unknown): v is HostMessage {
  if (typeof v !== 'object' || v === null) return false;
  const t = (v as { t?: unknown }).t;
  if (t === 'shared') {
    const log = (v as { log?: unknown }).log;
    return typeof log === 'object' && log !== null && Array.isArray((log as { journal?: unknown }).journal) && typeof (log as { journalFrom?: unknown }).journalFrom === 'number';
  }
  return t === 'welcome' || t === 'snap' || t === 'events';
}

/** A cheat's argument from a peer: a short id, a finite number, or nothing (undefined = refused). */
export function cleanCheatValue(v: unknown): CheatValue | undefined {
  if (v === null) return null;
  if (typeof v === 'string' && v.length <= 64) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

/** Copies an input with only the fields we expect, so a peer can't smuggle extra state in or crash the host. */
export function cleanInput(raw: unknown): InputSnapshot {
  const i: Record<string, unknown> = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const n = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const b = (v: unknown): boolean => v === true;
  const clamp = (v: number): number => Math.max(-1, Math.min(1, v));
  const id = (v: unknown): string | null => (typeof v === 'string' && v.length <= 64 ? v : null);
  return {
    seq: Math.max(0, Math.floor(n(i.seq))),
    forward: clamp(n(i.forward)),
    strafe: clamp(n(i.strafe)),
    yaw: n(i.yaw),
    pitch: clamp(n(i.pitch)),
    sprint: b(i.sprint),
    jump: b(i.jump),
    jumpHeld: b(i.jumpHeld),
    attack: b(i.attack),
    swingDir: i.swingDir === 'left' || i.swingDir === 'right' || i.swingDir === 'overhead' ? i.swingDir : 'thrust',
    block: b(i.block),
    interact: b(i.interact),
    grab: b(i.grab),
    cast: b(i.cast),
    prepare: Array.isArray(i.prepare) && i.prepare.length <= 3 && i.prepare.every((r) => typeof r === 'string' && r.length <= 32) ? [...(i.prepare as string[])] : null,
    useItem: id(i.useItem),
    dropItem: id(i.dropItem),
    throwItem: cleanThrow(i.throwItem),
    throwHeld: b(i.throwHeld),
    pickUp: typeof i.pickUp === 'number' && Number.isInteger(i.pickUp) ? i.pickUp : null,
    wear: cleanWear(i.wear),
    choice: typeof i.choice === 'number' && Number.isInteger(i.choice) ? i.choice : null,
  };
}

function cleanWear(v: unknown): WearRequest | null {
  if (typeof v !== 'object' || v === null) return null;
  const w = v as Record<string, unknown>;
  const short = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;
  if (w.do === 'wear' && short(w.item)) return short(w.slot) ? { do: 'wear', item: w.item, slot: w.slot } : { do: 'wear', item: w.item };
  if (w.do === 'wearFrom' && typeof w.entity === 'number' && Number.isInteger(w.entity)) return { do: 'wearFrom', entity: w.entity };
  if (w.do === 'remove' && short(w.region)) return { do: 'remove', region: w.region };
  return null;
}

function cleanThrow(v: unknown): ThrowAim | null {
  if (typeof v !== 'object' || v === null) return null;
  const t = v as Record<string, unknown>;
  const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const yaw = num(t.yaw);
  const lift = num(t.lift);
  const power = num(t.power);
  if (typeof t.item !== 'string' || t.item.length > 64 || yaw === null || lift === null || power === null) return null;
  return { item: t.item, yaw, lift: Math.max(-1.2, Math.min(1.2, lift)), power: Math.max(0, Math.min(1, power)) };
}

/**
 * Host side: notices when the party's shared record (journal, quests, places, factions) changed
 * since the last call and returns just the changed parts, or null when nothing did.
 */
export class SharedLogTracker {
  private journalLen = -1;
  private quests = '';
  private places = '';
  private factions = '';

  next(state: SimState): SharedLog | null {
    const quests = JSON.stringify(state.quests);
    let found = 0;
    for (const l of state.locations) if (l.discovered) found++;
    const places = `${state.locations.length}|${found}`;
    const factions = JSON.stringify(state.factions);
    const len = state.journal.length;
    if (len === this.journalLen && quests === this.quests && places === this.places && factions === this.factions) return null;
    const from = this.journalLen < 0 || this.journalLen > len ? 0 : this.journalLen;
    const log: SharedLog = { journalFrom: from, journal: state.journal.slice(from) };
    if (quests !== this.quests) {
      log.quests = state.quests;
      log.nextQuestId = state.nextQuestId;
    }
    if (places !== this.places) log.locations = state.locations;
    if (factions !== this.factions) log.factions = state.factions;
    this.journalLen = len;
    this.quests = quests;
    this.places = places;
    this.factions = factions;
    return log;
  }
}

/** Guest side: lays the host's shared record over our copy of the world. */
export function applySharedLog(state: SimState, log: SharedLog): void {
  const from = Math.max(0, Math.min(state.journal.length, Math.floor(log.journalFrom)));
  state.journal.length = from;
  for (const j of log.journal) state.journal.push(j);
  if (log.quests) state.quests = log.quests;
  if (typeof log.nextQuestId === 'number') state.nextQuestId = log.nextQuestId;
  if (log.locations) state.locations = log.locations;
  if (log.factions) state.factions = log.factions;
}

/** A friend's lasting id as they sent it: short letters and digits only, or null (then their connection id is used). */
export function cleanFriendId(v: unknown): string | null {
  return typeof v === 'string' && /^[a-z0-9]{8,32}$/.test(v) ? `f-${v}` : null;
}

/** True when an input presses something (these go by the sure road; plain movement goes by the fast one). */
export function inputHasPress(i: InputSnapshot): boolean {
  return i.jump || i.interact || i.grab || i.cast || i.prepare !== null || i.useItem !== null || i.dropItem !== null || i.throwItem !== null || i.throwHeld || i.pickUp !== null || i.wear !== null || i.choice !== null;
}

/**
 * What one friend is sent each update: everything within `radius` metres of their traveller, every
 * traveller, and whatever a traveller carries. Far things are left out (they are not drawn anyway),
 * which keeps updates small however big the world gets.
 */
export function snapshotFor(state: SimState, playerId: string, radius: number): EntitySnapshot {
  const id = state.players[playerId];
  const me = id !== undefined ? state.entities.get(id) : undefined;
  const r2 = radius * radius;
  const entities: Entity[] = [];
  for (const e of state.entities.values()) {
    if (e.dead) continue;
    if (!me || e.player || (e.heldBy !== null && state.entities.get(e.heldBy)?.player)) {
      entities.push(e);
      continue;
    }
    const dx = e.pos.x - me.pos.x;
    const dy = e.pos.y - me.pos.y;
    if (dx * dx + dy * dy <= r2) entities.push(e);
  }
  return { tick: state.tick, entities, weather: state.weather, players: state.players };
}
