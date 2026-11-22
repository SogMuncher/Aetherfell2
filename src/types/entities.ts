import type { Vec2 } from './math';
import type { ItemStack } from './items';
import type { InputSnapshot, SwingDir } from './input';
import type { BehaviourKind, FactionId, ItemId, RoleId, RuneId, SpellId, StatusId, ThingId } from './defs';
import type { PlayerCheats } from './cheats';
import type { BodyRegionId } from './gear';

export type SkillId = 'blade' | 'evocation' | 'athletics' | 'speech';

export interface Skill {
  level: number;
  xp: number;
}

export interface Stats {
  might: number;
  grace: number;
  will: number;
}

export interface SwingState {
  dir: SwingDir;
  /** Ticks since the swing started. */
  t: number;
  /** Tick on which the blow lands. */
  strikeAt: number;
  /** Total ticks until another action is possible. */
  recover: number;
  struck: boolean;
  /** How wound-up it was when let go, 0 (a tap) .. 1 (fully charged). */
  power: number;
}

/** A blow being wound up: the button is held (or the creature is gathering itself) before the swing is let go. */
export interface ChargeState {
  /** Direction the swing will take (follows the mouse until it is let go). */
  dir: SwingDir;
  /** Ticks held so far. */
  t: number;
  /** Creatures let go by themselves after this many ticks (players: 0, they let go with the button). */
  hold: number;
  /** Reached full strength (the cue has been given). */
  full: boolean;
}

export interface ActorData {
  /**
   * What is in the hands (the paperdoll's hand slot): any item, or null for the natural weapon from
   * the definition. Whatever it is gets swung; how worn it is rides in its id (`id@wear`).
   */
  weapon: ItemId | null;
  swing: SwingState | null;
  /** Direction currently guarded, or null if not blocking. */
  guard: SwingDir | null;
  /** Tick the guard went up — guarding just before a hit is a parry. */
  guardSince: number;
  /** Things that want this actor dead stay mad for a while. */
  lastAttacker: number | null;
  onGround: boolean;
  /** Set by a controller (AI) to ask for a swing; melee consumes it. */
  wantSwing: SwingDir | null;
  /** Set by a controller to raise or lower a guard. */
  wantGuard: boolean;
  /** Set by a controller together with `wantSwing`: ticks to wind the blow up before letting it go (0 = a quick one). */
  wantCharge?: number;
  /** A blow being wound up. */
  charge?: ChargeState | null;
  /** Aether a creature has to cast with (its definition's `caster`); players use their own pool. */
  mana?: number;
  /** Ticks until a creature may cast again. */
  castCooldown?: number;
  /** Set by a controller (AI) to cast this spell (a rune list key, see spellKey); the magic system consumes it. */
  wantCast?: SpellId | null;
}

export interface DialogueOption {
  label: string;
  /** What the option does — resolved by the social system. */
  action: 'rumour' | 'quest' | 'trade' | 'farewell' | 'turnIn';
}

export interface DialogueView {
  speaker: number;
  speakerName: string;
  text: string;
  options: DialogueOption[];
}

export interface PlayerData {
  peerId: string;
  name: string;
  input: InputSnapshot;
  /** Previous attack button state — used to detect presses. */
  prevAttack: boolean;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  /** Runes this traveller has learned. */
  runes: RuneId[];
  /** The runes of the spell readied for casting (empty = none). */
  prepared: RuneId[];
  /** Entity being carried, if any. */
  holding: number | null;
  stats: Stats;
  skills: Record<SkillId, Skill>;
  inventory: ItemStack[];
  dialogue: DialogueView | null;
  /** Ticks until the next interact is allowed. */
  cooldown: number;
  respawn: Vec2;
  /** Distance walked — drives footsteps and athletics. */
  stride: number;
  /** >0 while knocked down: ticks until waking at the respawn point. A friend can revive sooner. */
  downed: number;
  /** Glider open. */
  gliding: boolean;
  /** Debug cheats switched on (see content/cheats.ts). Absent = none. */
  cheats?: PlayerCheats;
}

/**
 * How a creature is moving right now. Behaviours (sim/ai/behaviours.ts) choose one; the steering
 * in sim/ai carries it out. Audio and music read it to tell when something is chasing you.
 */
export type AiMode = 'idle' | 'wander' | 'graze' | 'chase' | 'flee' | 'goto' | 'attack' | 'cast';

export interface AiData {
  mode: AiMode;
  /** The behaviour from the creature's brain that chose the current mode (handy for debugging). */
  doing?: BehaviourKind;
  target: number | null;
  goal: Vec2 | null;
  /** Ticks until the next decision. */
  think: number;
  home: Vec2;
  /** A spell being gathered (mode 'cast'): when `t` reaches the telegraph time it is let go. */
  cast?: { spell: SpellId; t: number };
}

/**
 * Anything that walks, fights and thinks for itself. Wolves, deer, toads and villagers are all
 * creatures: there are no separate enemy, animal or villager types, only different brains, sides
 * (factions) and optional extras such as `npc` for someone you can talk to.
 */
export type Creature = Entity & { actor: ActorData; ai: AiData };

/** A role id from content/roles.ts. */
export type NpcRole = RoleId;

/** Extras for a creature you can talk to and that keeps a home and work place (villagers today). */
export interface NpcData {
  name: string;
  role: NpcRole;
  home: Vec2;
  work: Vec2;
  /** Their house's door, if home is indoors: the spot outside it, the spot just inside, and the room's cells. Used to walk in and out. */
  door?: { out: Vec2; in: Vec2; room: { x0: number; y0: number; x1: number; y1: number } };
  locationId: number;
  /** Quest this NPC hands out, if any. */
  questId: number | null;
  stock: ItemStack[];
}

export interface ProjectileData {
  owner: number;
  spell: SpellId;
  life: number;
  /** Strength it was cast with (spell power × the caster's skill). */
  power?: number;
}

export interface ContainerData {
  opened: boolean;
  /** Still locked (only for containers whose definition has a lock). */
  locked: boolean;
}

/**
 * Everything in the world that is not a tile. Fixed facts (size, material, sprite, behaviour) come
 * from the definition `def`; the entity only keeps what changes.
 */
export interface Entity {
  id: number;
  def: ThingId;
  pos: Vec2;
  /** Position at the start of the tick — render interpolates from here. */
  prev: Vec2;
  vel: Vec2;
  /** Height of the feet above sea level. */
  z: number;
  prevZ: number;
  vz: number;
  angle: number;
  hp: number;
  maxHp: number;
  faction: FactionId;
  /** Active statuses: id → ticks left. */
  status: Record<StatusId, number>;
  /** Ticks of invulnerability after a hit. */
  invuln: number;
  dead: boolean;
  /** Who is carrying this entity. */
  heldBy: number | null;
  /** Who last threw it (credited for what it breaks). */
  thrownBy: number | null;
  /** Ticks this entity has existed. */
  age: number;
  /** The place (location id) this belongs to: it stays while anyone is near (content rules.sites.keep). */
  site?: number;
  /** General countdown for things that rest between actions (traps). */
  cooldown: number;
  /** Ticks left of hitstop: a solid blow freezes both bodies for a moment. */
  freeze?: number;
  /** Knockback in flight (m/s): added to the body's own velocity and fading fast, so a shove is felt even by someone steering. */
  kb?: Vec2;
  /** Armour on each part of the body (region → item id; wear left is part of the id). Anything whose definition `wears` regions can have it. */
  worn?: Record<BodyRegionId, ItemId>;
  actor?: ActorData;
  player?: PlayerData;
  ai?: AiData;
  npc?: NpcData;
  item?: ItemStack;
  container?: ContainerData;
  projectile?: ProjectileData;
}
