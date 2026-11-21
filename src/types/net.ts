import type { InputSnapshot } from './input';
import type { SimEvent } from './events';
import type { Entity } from './entities';
import type { JournalEntry, Location, Quest, WeatherState } from './world';
import type { FactionId } from './defs';
import type { CheatValue } from './cheats';

/** Guest → host */
export type GuestMessage =
  /** `id` is the friend's own lasting id (kept in their browser), so their character waits for them between sessions. */
  | { t: 'hello'; name: string; id?: string }
  | { t: 'input'; input: InputSnapshot }
  /** "Still here": sent on a timer, so a friend whose game is in the background is not let go. */
  | { t: 'ping' }
  /** Asking the host to run a debug cheat; the host decides whether friends may. */
  | { t: 'cheat'; cheat: string; value: CheatValue };

/** Compact per-entity snapshot streamed host → guests. Entities are sent whole for now (lean first). */
export interface EntitySnapshot {
  tick: number;
  entities: Entity[];
  weather: WeatherState;
  players: Record<string, number>;
}

/**
 * The party's shared record, sent to friends whenever part of it changes: new journal lines (from
 * `journalFrom` on), quests, known places and how factions feel. Missing parts did not change.
 */
export interface SharedLog {
  journalFrom: number;
  journal: JournalEntry[];
  quests?: Quest[];
  nextQuestId?: number;
  locations?: Location[];
  factions?: Record<FactionId, Record<FactionId, number>>;
}

/** Host → guest */
export type HostMessage =
  | { t: 'welcome'; playerId: string; save: Uint8Array }
  | { t: 'shared'; log: SharedLog }
  | { t: 'snap'; snap: EntitySnapshot }
  | { t: 'events'; events: SimEvent[] };

export type NetRole = 'solo' | 'host' | 'guest';

export interface NetStatus {
  role: NetRole;
  code: string | null;
  peers: number;
  message: string;
}
