import type { BodyRegionId, OutfitEntry } from '../gear';
import type { BrainId, FactionId, ItemId, LootId, MaterialId, RealmId, SiteId, SpriteId, ThingId } from './ids';
import type { Color } from '../math';
import type { DamageKind, Effect } from '../effects';
import type { SwingDir } from '../input';
import type { AirDef } from '../sky';
import type { HandlingDef } from './handling';
import type { CraftDef, StationDef } from '../craft';


/** Which family of sounds a material makes underfoot and when struck. */
export type SoundClass = 'soft' | 'wood' | 'stone' | 'metal' | 'flesh' | 'water' | 'glass' | 'snow' | 'ice' | 'sand';

export interface MaterialDef {
  name: string;
  /** 0..1 chance that heat sets a body of this material alight. */
  flammability: number;
  /** How long a body of this burns once lit (ticks). */
  burnTicks: number;
  /** Damage multipliers by kind; missing kinds are ×1. */
  resist: Partial<Record<DamageKind, number>>;
  sound: SoundClass;
  /** Floats on water instead of sinking. */
  floats: boolean;
  /**
   * 0 (soft) .. 1 (hard as stone and iron): how much striking it hurts a weapon, how hard it rings
   * and kicks back, and whether sparks fly.
   */
  hardness: number;
  /** What flies off when it is struck: a kind of mote the renderer knows, its colour (0xRRGGBB), how many and how big. */
  debris?: { kind: 'dust' | 'leaf' | 'frost' | 'water'; colour: number; amount: number; size: number };
}

export interface LightDef {
  r: number;
  g: number;
  b: number;
  radius: number;
  flicker: number;
  /** false = a glow with no fire (a lantern behind glass, an aether tank): no flame motes on top. */
  flame?: boolean;
  /** Height of the light above the thing's base (default 1 m), so a lamp lights from its flame, not from above it. */
  at?: number;
}

/** Light given off by something carried in the hand. `flame` = real fire (it throws flame motes and can be told apart from a glow). */
export interface HeldLightDef extends LightDef {
  flame: boolean;
}

export interface WeaponStats {
  name: string;
  damage: number;
  kind: DamageKind;
  /** Metres. */
  reach: number;
  /** Swing time multiplier — heavy weapons are slow. */
  speed: number;
  /** Knockback multiplier. */
  push: number;
  /** Tint for the first-person view model. */
  tint: Color;
  /** Extra effects on whatever it hits, scaled with the blow (a venomous bite, a freezing blade). */
  effects?: Effect[];
  /** The swings a creature wielding it may choose (default: just a thrust). Players choose with the mouse. */
  swings?: SwingDir[];
  /** 0..1: how often a creature winds a blow up for a heavy one before swinging (a brute with a hammer telegraphs). */
  charge?: number;
  /** How it handles, where it differs from what its damage kind and weight give (content/handling.ts). */
  handling?: HandlingDef;
}

/** A burst of effects around a point. */
export interface Burst {
  radius: number;
  effects: Effect[];
}

/**
 * A realm is a space with its own ground, its own light and its own sky (or none). Every system works
 * the same in every realm — fire, rain, blows, creatures, light, saving — because a realm is only the
 * set of tiles, cells, things and places that are loaded right now. Travelling swaps one set for another.
 */
export interface RealmDef {
  name: string;
  /** Open sky overhead: sun, moon, stars, clouds and rain reach the ground. False = rock overhead (nothing falls, nothing is lit but by fire). */
  sky: boolean;
  /** How its ground is made (code in sim/world): 'surface' = the land grown from the seed; 'lattice' = halls and corridors laid on a grid under the land. */
  ground: 'surface' | 'lattice';
  /** Height of its floor (metres), for realms with a flat floor. */
  floor: number;
  /** Underground look: how much light there is without lamps (0..1), the colour of the dark, and how far you see through it (metres). */
  ambient: number;
  fog: readonly [number, number, number];
  fogDist: number;
  /** Motes floating in the air here (dust in the halls); used when the realm has no sky biome of its own. */
  air?: AirDef;
  /** What lies in the halls of a lattice realm: for each hall, each entry is placed with this chance (at its middle, in a corner, or along a wall). */
  scatter?: { thing: ThingId; chance: number; at: 'middle' | 'corner' | 'wall'; under?: SiteId[] }[];
  /** A lamp every traveller carries here, so the dark can be explored (colour, reach in metres, flicker). */
  glow?: { r: number; g: number; b: number; radius: number; flicker: number };
  /**
   * How a lattice realm reads the land above (sim/world/underSpot.ts). `tile`: the unbreakable rock of the roof, `shell` cells thick. Clear heights over
   * corridors and halls. Under ways: an artery the way's half-width plus `widen`, its height by the way's rank (1 trail…3 highroad).
   * Under rivers and lakes: water `sink` m below the floor and up to `depth` deep, an open shore `bank` m wide, clear `height`
   * over the shore and `rise` m more per metre out over the water, up to `max`.
   */
  lattice?: {
    tile: string;
    shell: number;
    corridor: number;
    hall: number;
    way: { widen: number; height: readonly number[] };
    water: { bank: number; height: number; rise: number; max: number; sink: number; depth: number };
  };
  /** The land's places that have a cavern beneath them are places here too, named by this pattern (`{name}` = the place above). */
  places?: { name: string };
  /** Where a travelling party appears when it comes here (relative to the way in), and which thing is placed there so it can go back. */
  arrival?: { thing: ThingId };
  /** Where a party wipe in this realm sends the survivors. */
  wipe?: RealmId;
  /** How close the whole party must be to a way in to take it (metres). */
  gather: number;
  /** Music mood while here. */
  mood?: Readonly<Record<string, number>>;
}

export interface ThingDef {
  name: string;
  /** Plural for quests and journal lines ("wolves"); defaults to name + 's'. */
  plural?: string;
  body: {
    radius: number;
    height: number;
    mass: number;
    /** Pushes other solid bodies apart. */
    solid: boolean;
    /** Ignores gravity and ground (sparks, magic bolts). */
    ghost?: boolean;
    /** Never moves on its own unless something shoves it (torches, plates). */
    anchored?: boolean;
  };
  /**
   * Hangs on a wall instead of standing on the floor (a wall torch, a sconce). Placed against a wall
   * (a building's inner wall, a hall's edge) it hangs `height` metres above the floor, with its middle
   * `flush` metres from the wall face (0 = touching it), so it shows on the wall and not in the room.
   */
  mount?: { height: number; flush: number };
  material: MaterialId;
  health?: { hp: number; armor: number };
  faction?: FactionId;
  /** Walks and fights. The weapon is its natural one (fangs, fists) when nothing is wielded. */
  actor?: {
    speed: number;
    weapon: WeaponStats;
    /** Can cast spells (see the `cast` behaviour): an aether pool that refills over time, and how strong its magic is. */
    caster?: { mana: number; regen: number; power: number };
  };
  brain?: BrainId;
  /** Can be grabbed and thrown. */
  carry?: boolean;
  /** Holds loot. With a lock, the key item is needed (or brute force). */
  container?: { loot: LootId; lock?: ItemId };
  /** Flies: its cells are built into the 3D layer and carried as one moving frame. */
  craft?: CraftDef;
  /** Worked by a player standing at it (a wheel, a lever, a fuel tank). */
  station?: StationDef;
  /** Keeps items put into it (E opens it beside the bag). */
  store?: { slots: number };
  /** Its chain's greatest length when fitted with a `tie` (an anchor): a chain you can climb. */
  chain?: number;
  /** Fitted aboard, it turns to point downwind (a windsock). */
  vane?: boolean;
  /** Effects on whoever jumps while standing on it (a launching plank), pushed away from it. */
  onJump?: Effect[];
  light?: LightDef;
  /** A fire that smokes: grey puffs rise from `rise` metres above it (a hearth's smoke leaves by the chimney, above the roof), about `rate` a second, only seen when near. `fx` = another burst (content/effects.ts); `pace` = only at full rate once the craft it is fitted to flies this fast (m/s; a propeller's trail); `spread` = from anywhere this many metres around its middle (default 0.15). */
  smoke?: { rise: number; rate: number; fx?: string; pace?: number; spread?: number };
  /** Pictures `<sprite>0..frames-1` turned through in order as the craft it is fitted to flies, `turn` frames a metre (a propeller). */
  spin?: { frames: number; turn: number };
  /** What its chain is drawn with: a picture every `every` metres (default chain links; a rope ladder's rungs). */
  links?: { art: string; every: number };
  /** Can be used when you press interact in front of it (a bed to rest on): the effects land on the user, then it rests for `cooldown` ticks. */
  use?: { effects: Effect[]; text: string; cooldown: number };
  /** Effects when it hits something hard; shattering destroys it. */
  onImpact?: Burst & { minSpeed: number; shatter: boolean };
  /** Effects and loot when it breaks or dies. */
  onDestroy?: Partial<Burst> & { loot?: LootId };
  /** Effects on whatever steps on it (traps). Fires a burst around itself, then rests. */
  contact?: Burst & { minMass: number; cooldown: number; reach: number };
  /** Drifts on the wind and does something where it lands (sparks, embers). */
  mote?: { wind: number; life: number; onLand: Effect[] };
  /** A way into another realm (a stair down, a hole in the floor): using it takes the whole party if all are near. The same place in the other realm. */
  portal?: { to: RealmId; text: string };
  /** Can hold a conversation. */
  talk?: boolean;
  /** Parts of the body that can wear armour (the same rules for people, travellers and anything else with arms and legs). */
  wears?: BodyRegionId[];
  /** Armour it is found wearing: each entry is tried on its own when it first appears. */
  outfit?: OutfitEntry[];
  /** What it carries in its bag (a loot table rolled when it first appears). The whole bag drops when it dies. */
  carries?: LootId;
  /** Wanders off the map when no player is within this distance. */
  despawn?: number;
  /** Procedural sprite; null = drawn only by particles (bolts, sparks). */
  sprite: SpriteId | null;
  /** Creature voice for growls and death cries. */
  voice?: 'howl' | 'bleat' | 'grunt';
  /** Bleeds when hit (blood particles). */
  bleeds?: boolean;
}
