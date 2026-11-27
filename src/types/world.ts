import type { Vec2 } from './math';

import type { SiteId } from './defs';

export type LocationKind = SiteId;

/** A named place in the world. Registered by the world system as players come near. */
export interface Location {
  id: number;
  kind: LocationKind;
  name: string;
  pos: Vec2;
  radius: number;
  discovered: boolean;
  /** Entities for this place have been spawned. */
  populated: boolean;
  /** How many of the place's planned buildings have been raised so far (they go up a few at a time). */
  built?: number;
  /** Tick it was found (for "find a place" quests). */
  discoveredAt?: number;
  /** Where its buildings stand, by recipe id (plus 'square'): the spot outside a door. Townsfolk give directions to these. */
  landmarks?: Record<string, Vec2>;
}

export interface JournalEntry {
  tick: number;
  day: number;
  text: string;
}

export type QuestState = 'offered' | 'active' | 'done';

export interface Quest {
  id: number;
  title: string;
  giver: number;
  giverName: string;
  kind: 'cull' | 'fetch' | 'explore';
  /** Creature to cull, item to fetch, or kind of place to find. */
  targetKind: string;
  /** Explore: how the journal names the place. */
  what?: string;
  /** Tick it was taken on. */
  since?: number;
  targetLocation: number | null;
  needed: number;
  progress: number;
  state: QuestState;
  reward: number;
}

export interface WeatherState {
  /** 0..1 through the day; 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  time: number;
  day: number;
  /** Wind direction (unit-ish) times strength in m/s. */
  wind: Vec2;
  windTarget: Vec2;
  /** 0..1 */
  rain: number;
  rainTarget: number;
  /** 0..1 cloud cover. */
  cloud: number;
  /** 0..1 how soaked the open ground is. */
  wetness: number;
  /** 0..1 strength of tonight's aurora. */
  aurora: number;
  /** Ticks until the weather changes its mind. */
  nextShift: number;
  /** How far the wind has carried the clouds so far (metres): everyone sees the same sky. */
  drift?: Vec2;
}
