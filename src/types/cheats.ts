/**
 * Debug cheats: shapes only. The list of cheats is data (src/content/cheats.ts), the menu builds
 * itself from that list, and a cheat reaches the world only as a `cheat` Command, which the host's
 * sim applies (sim/cheats). Guests ask the host; the host decides.
 */
import type { HandlingTune } from './defs/handling';

/** Ongoing cheats a traveller can have switched on. Optional so old saves load unchanged. */
export interface PlayerCheats {
  /** Takes no harm at all. */
  god?: boolean;
  /** No gravity: look where you want to go, Space rises, Shift goes faster. */
  fly?: boolean;
  /** Aether and stamina never run out. */
  endless?: boolean;
}
export type CheatFlag = keyof PlayerCheats;

/** What the menu needs the player to choose before a cheat can run. */
export type CheatArg =
  | { kind: 'none' }
  | { kind: 'item'; count: number }
  | { kind: 'rune' }
  /** Any thing that has a brain (animals, monsters, villagers). */
  | { kind: 'creature' }
  /** A building recipe (content/structures.ts). */
  | { kind: 'structure' }
  /** A place the world already knows about (state.locations). */
  | { kind: 'place' }
  | { kind: 'number'; min: number; max: number; step: number; value: number; unit: string }
  | { kind: 'choice'; options: readonly { value: string; label: string }[] };

/** The general things a cheat can do. New cheats combine these; new verbs go in sim/cheats. */
export type CheatAction =
  | { type: 'toggle'; flag: CheatFlag }
  | { type: 'restore' }
  | { type: 'giveItem' }
  | { type: 'learnRune' }
  | { type: 'learnAllRunes' }
  | { type: 'teleportPlace' }
  /** Jump this many metres ahead along your view (the number argument). */
  | { type: 'teleportAhead' }
  /** Hour of the day (the number argument, 0..24). */
  | { type: 'setTime' }
  /** Weather by name: clear / rain / storm (the choice argument). */
  | { type: 'setWeather' }
  | { type: 'spawn'; distance: number }
  /** Builds the chosen building this far ahead, its door facing you. */
  | { type: 'build'; distance: number }
  /** Removes every creature with a brain within the radius (never players or villagers). */
  | { type: 'banish'; radius: number }
  | { type: 'revealPlaces' }
  /** Takes the whole party to the chosen realm (the choice argument), landing at the spot beneath/above where you stand. */
  | { type: 'travelRealm' }
  | { type: 'addSkill'; levels: number }
  /** Sets one handling number of the item in your hand to the number argument (content/handling.ts tuneHeld). */
  | { type: 'tuneHeld'; tune: HandlingTune };

export interface CheatDef {
  id: string;
  name: string;
  /** One plain sentence shown under the name. */
  help: string;
  /** Sub-heading in the menu. */
  group: string;
  arg: CheatArg;
  action: CheatAction;
}

/** The value picked for a cheat's argument (item/rune/thing/place id, a number, or a choice). */
export type CheatValue = string | number | null;
