import type { Content, Entity, Rng, SpawnInit, ThingId } from '../types';
import { addItem } from '../types';
import { itemDef, rollLoot, rollOutfit, thingDef } from '../content';

/** Builds an entity from its definition. Only instance data lives on the entity. */
export function makeEntity(content: Content, id: number, def: ThingId, x: number, y: number, init: SpawnInit = {}): Entity {
  const d = thingDef(content, def);
  const hp = d.health?.hp ?? 1;
  const base: Entity = {
    id,
    def,
    pos: { x, y },
    prev: { x, y },
    vel: { x: 0, y: 0 },
    z: 0,
    prevZ: 0,
    vz: 0,
    angle: 0,
    hp,
    maxHp: hp,
    faction: d.faction ?? content.rules.factions.default,
    status: {},
    invuln: 0,
    dead: false,
    heldBy: null,
    thrownBy: null,
    age: 0,
    cooldown: 0,
  };
  if (d.actor) {
    base.actor = { weapon: null, inventory: [], swing: null, guard: null, guardSince: 0, lastAttacker: null, onGround: true, wantSwing: null, wantGuard: false };
    // Casters start with their aether full.
    if (d.actor.caster) base.actor.mana = d.actor.caster.mana;
  }
  if (d.brain) base.ai = { mode: 'wander', target: null, goal: null, think: 0, home: { x, y } };
  if (d.container) base.container = { opened: false, locked: !!d.container.lock };
  if (d.station) base.control = { v: 0, by: null };
  if (d.store) base.stored = [];
  return { ...base, ...init, id, def, pos: { x, y }, prev: { x, y } };
}

/**
 * Whatever a newly made body comes with: worn and held gear from its outfit (unless it was handed
 * its own) and a bag filled from its `carries` loot table.
 */
export function dress(content: Content, e: Entity, rng: Rng): void {
  const d = content.things[e.def];
  if (d?.outfit && !e.worn && !e.actor?.weapon) {
    const got = rollOutfit(content.gear, rng, d.outfit, d.wears ?? []);
    if (got.worn) e.worn = got.worn;
    if (got.held && e.actor) e.actor.weapon = got.held;
  }
  if (d?.carries && e.actor && e.actor.inventory.length === 0) for (const s of rollLoot(content, d.carries, rng)) addItem(e.actor.inventory, s.id, s.count);
}

/** A new traveller's kit from content.rules.start: the bag, what is in the hands and what is worn. */
export function startKit(content: Content, e: Entity): void {
  const st = content.rules.start;
  if (e.actor) {
    e.actor.inventory = st.inventory.map((s) => ({ ...s }));
    if (st.wield) e.actor.weapon = st.wield;
  }
  for (const id of st.worn) {
    const region = itemDef(content, id)?.armour?.region;
    if (region) (e.worn ??= {})[region] = id;
  }
}
