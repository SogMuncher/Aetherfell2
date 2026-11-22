import type { Content, Entity, SpawnInit, ThingId } from '../types';
import { thingDef } from '../content';

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
    base.actor = { weapon: null, swing: null, guard: null, guardSince: 0, lastAttacker: null, onGround: true, wantSwing: null, wantGuard: false };
    // Casters start with their aether full.
    if (d.actor.caster) base.actor.mana = d.actor.caster.mana;
  }
  if (d.brain) base.ai = { mode: 'wander', target: null, goal: null, think: 0, home: { x, y } };
  if (d.container) base.container = { opened: false, locked: !!d.container.lock };
  return { ...base, ...init, id, def, pos: { x, y }, prev: { x, y } };
}
