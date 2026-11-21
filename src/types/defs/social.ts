import type { DressDef } from '../looks';
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
}

export interface FactionDef {
  name: string;
  /** Members hurt each other with blows and spells (default no: wild animals do not mind). */
  friendlyFire?: boolean;
  /** Starting feeling towards other factions, -1..1 (missing = 0). */
  feels: Record<FactionId, number>;
}
