import type { DressDef } from '../art';
import type { FactionId, ItemId, SiteId, ThingId } from './ids';
import type { ItemStack } from '../items';


/**
 * A job someone can be asked to do for a village, as data. Kinds:
 * - cull: kill `count` of a creature (`target`);
 * - fetch: bring `count` of an item (`item`), handed over when you report back;
 * - explore: find a place of a kind (`site`) nobody in the party had found when you took the job;
 *   `what` names it in the journal ("the standing stones").
 */
export type QuestTemplate = QuestWords &
  (
    | { kind: 'cull'; target: ThingId; count: number }
    | { kind: 'fetch'; item: ItemId; count: number }
    | { kind: 'explore'; site: SiteId; what: string }
  );

export interface QuestWords {
  reward: number;
  /** {place} = the village name. */
  title: string;
  /** Dialogue option that asks about it. */
  offer: string;
  /** What the giver says when you take it on: {count}, {reward}, {plural} (creatures or item), {what} (explore). */
  ask: string;
  /** Dialogue option to hand it in. */
  turnIn: string;
  thanks: string;
}

/** What a villager trades. Each part is optional; the first that applies is used. */
export interface TradeDef {
  /** Dialogue option label. */
  label: string;
  /** Mends a worn weapon for a price. */
  mend?: { price: number; done: string; broke: string };
  /** Sells the first item in their stock you can afford, at its value. */
  sellStock?: { empty: string; broke: string };
  /** Buys these off you at their value, then sells you one of `sells` at its value. */
  barter?: { buys: ItemId[]; sells: ItemId; sold: string; bought: string; broke: string };
}

export interface RoleDef {
  /** Added to the greeting. */
  greeting: string;
  /** What they keep on the rack. */
  stock: ItemStack[];
  quest?: QuestTemplate;
  trade?: TradeDef;
  /** What people in this job wear (colours and features from their look). */
  dress?: DressDef;
  /** Where they spend each part of the day (missing parts follow `rules.routine`). */
  routine?: Routine;
  /** What they say when asked about themselves. */
  about?: string;
}

/** The four parts of the day (content/day.ts tells which it is). */
export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';

/**
 * Where someone spends each part of the day, and where they shelter when it rains by day. Each is a
 * list of place words; one is picked per person per day. A word is 'home', 'square' (the open
 * middle of the place), 'edge' (out past the houses: fields, pastures) or a building recipe id
 * ('tavern', 'smithy'...). A word the place has no spot for is skipped.
 */
export type Routine = Partial<Record<DayPart | 'rain', readonly string[]>>;

/** The words of conversation: topic labels and answer templates (content/talk.ts). */
export interface TalkDef {
  /** Labels of the topics and menus. */
  ask: { where: string; places: string; people: string; about: string; self: string; rumour: string; back: string; farewell: string };
  /** Said when a menu of topics opens. */
  prompt: string;
  /** Where a place is: {what} {dir} {dist}. */
  place: readonly string[];
  /** Where a person is now: {name} {role} {at} {dir} {dist}. */
  person: readonly string[];
  /** Asked about themselves without an `about` line: {role}. */
  self: string;
  /** Asked where they themselves are. */
  me: string;
  /** How far, by the metres they are under (the last entry covers anything further). */
  dist: readonly [number, string][];
  /** Where someone is, by place word ('building' fills {what} with a building's name). */
  at: { home: string; square: string; edge: string; building: string };
  /** Below this feeling for the party, people will not give directions. */
  refuseBelow: number;
  refuse: readonly string[];
}

export interface FactionDef {
  name: string;
  /** Members hurt each other with blows and spells (default no: wild animals do not mind). */
  friendlyFire?: boolean;
  /** Starting feeling towards other factions, -1..1 (missing = 0). */
  feels: Record<FactionId, number>;
}
