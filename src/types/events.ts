import type { TileCellData } from './tiles';
import type { SkillId } from './entities';
import type { ItemId, RuneId, SpellId, ThingId } from './defs';
import type { SwingDir } from './input';
import type { DamageKind } from './effects';
import type { VolumeBrickData } from './volume';

/** Things that happened during a tick. Audio, render effects, UI and the network react to these. */
export type SimEvent =
  | { type: 'tileChanged'; x: number; y: number; cell: TileCellData }
  /** A 16 m block of the 3D layer changed (built, broken, burnt); carries the whole block. */
  | { type: 'volumeChanged'; brick: VolumeBrickData }
  /** The party went to another realm: everything in view is a different place now (friends are sent the new world). */
  | { type: 'realmChanged'; realm: string; x: number; y: number }
  | { type: 'ignited'; x: number; y: number; z?: number }
  | { type: 'burntOut'; x: number; y: number; z?: number }
  | { type: 'doused'; x: number; y: number; z?: number }
  | { type: 'swing'; entity: number; dir: SwingDir; x: number; y: number; /** 0..1 how wound up it was. */ power: number }
  /** Winding a blow up: `start` when the button goes down, `full` when it can be wound no further. */
  | { type: 'charge'; entity: number; stage: 'start' | 'full'; x: number; y: number }
  | { type: 'hit'; target: number; source: number; damage: number; blocked: boolean; parried: boolean; x: number; y: number; z: number; dir?: SwingDir; power?: number; /** Ticks of hitstop. */ hold?: number; killed?: boolean }
  /** A weapon struck a wall, door, tree or stone. */
  | { type: 'strike'; x: number; y: number; z: number; tile: number; material: string; weapon: DamageKind; power: number; recoil: boolean }
  | { type: 'tileBroken'; x: number; y: number; tile: number; z?: number }
  | { type: 'death'; entity: number; def: ThingId; x: number; y: number }
  | { type: 'spellCast'; entity: number; spell: SpellId; x: number; y: number }
  | { type: 'spellBurst'; spell: SpellId; x: number; y: number; z: number }
  | { type: 'fizzle'; entity: number }
  | { type: 'spellPrepared'; entity: number; spell: SpellId }
  | { type: 'runeLearned'; player: number; rune: RuneId }
  | { type: 'doorToggled'; x: number; y: number; open: boolean }
  | { type: 'doorJammed'; x: number; y: number }
  | { type: 'thrown'; entity: number; x: number; y: number }
  | { type: 'impact'; entity: number; x: number; y: number; strength: number }
  | { type: 'propBroken'; def: ThingId; x: number; y: number }
  | { type: 'pickup'; player: number; item: ItemId; count: number }
  | { type: 'footstep'; entity: number; x: number; y: number; surface: string }
  | { type: 'jump'; entity: number }
  | { type: 'land'; entity: number; speed: number }
  | { type: 'splash'; x: number; y: number; size: number }
  | { type: 'say'; speaker: number; text: string }
  | { type: 'growl'; entity: number; x: number; y: number }
  | { type: 'discovered'; locationId: number; name: string; x: number; y: number }
  | { type: 'journal'; text: string }
  | { type: 'containerOpened'; entity: number; x: number; y: number }
  | { type: 'weatherShift'; rain: number; wind: number }
  | { type: 'thunder'; x: number; y: number }
  | { type: 'skillUp'; player: number; skill: SkillId; level: number }
  | { type: 'notice'; player: number; text: string }
  | { type: 'playerJoined'; playerId: string; name: string }
  | { type: 'playerLeft'; playerId: string }
  | { type: 'trapSprung'; entity: number; x: number; y: number }
  | { type: 'froze'; x: number; y: number; z?: number }
  | { type: 'thawed'; x: number; y: number; z?: number }
  | { type: 'shatter'; entity: number; x: number; y: number }
  /** An item broke (in the hands or flying into something). */
  | { type: 'itemBroke'; item: ItemId; x: number; y: number; z: number }
  | { type: 'glide'; entity: number; open: boolean }
  | { type: 'locked'; entity: number; x: number; y: number }
  | { type: 'unlocked'; entity: number; x: number; y: number }
  | { type: 'equip'; entity: number; item: ItemId | null }
  /** Armour put on (`item`), taken off (`item` null) or broken (`broke`) on one part of the body. */
  | { type: 'armour'; entity: number; region: string; item: ItemId | null; broke?: boolean }
  | { type: 'statusOn'; entity: number; status: string };
