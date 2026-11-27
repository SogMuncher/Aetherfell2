// Headless checks: creatures carry a bag (players' own kind), spill all of it when they die, and their brains
// grab loose items and throw them with the player's pick-up and throw, on the ground and on a 3D floor.
import { CONTENT, thingDef } from '../src/content';
import type { BrainDef, Entity } from '../src/types';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { shapeByte } from '../src/types';
import { check, failures, hit, spawner, world } from './smokeKit';

const brain = (id: string): BrainDef => {
  const b = CONTENT.brains[thingDef(CONTENT, id).brain ?? ''];
  if (!b) throw new Error(`no brain for ${id}`);
  return b;
};
const looseItems = (all: Iterable<Entity>, id: string): Entity[] => [...all].filter((e) => !e.dead && e.item?.id === id);

// Creatures are found carrying things in a bag, filled from their `carries` table.
{
  const { sim, me } = world();
  let filled = 0;
  for (let i = 0; i < 20; i++) if ((spawner(sim).spawn('raider', me.pos.x + 20 + i, me.pos.y + 20, { z: me.z, prevZ: me.z }).actor?.inventory.length ?? 0) > 0) filled++;
  check('raiders are found with things in their bag', filled > 12, `${filled}/20`);
  check('the traveller keeps the start kit in the same kind of bag', JSON.stringify(me.actor?.inventory) === JSON.stringify(CONTENT.rules.start.inventory));
}

for (const raised of [false, true]) {
  const where = raised ? ' on a 3D floor' : '';
  const { sim, me } = world();
  const z0 = Math.floor(me.z) + 2;
  if (raised) {
    for (let j = -16; j <= 16; j++) for (let i = -16; i <= 16; i++) sim.state.volume.set(Math.floor(me.pos.x) + i, Math.floor(me.pos.y) + j, z0, shapeByte(shapeId('cube'), 0), tileCode('stoneWall'));
    me.z = me.prevZ = z0 + 1;
  }
  const at = { z: me.z, prevZ: me.z };

  // Death: the whole bag spills out, every time.
  const dead = spawner(sim).spawn('raider', me.pos.x + 10, me.pos.y + 10, { ...at, worn: {} });
  if (dead.actor) dead.actor.inventory = [{ id: 'bread', count: 3 }, { id: 'antidote', count: 1 }];
  dead.hp = 1;
  hit(sim, dead, 50);
  sim.step();
  const bread = looseItems(sim.state.entities.values(), 'bread').reduce((n, e) => n + (e.item?.count ?? 0), 0);
  check(`a fallen creature always drops its whole bag${where}`, bread === 3 && looseItems(sim.state.entities.values(), 'antidote').length === 1, `bread ${bread}`);

  // Grab: a raider with nothing to fight walks to a loose item and puts it in its bag.
  const g = spawner(sim).spawn('raider', me.pos.x - 8, me.pos.y + 8, { ...at, worn: {}, faction: me.faction });
  if (g.actor) g.actor.inventory = [];
  spawner(sim).spawn('looseItem', g.pos.x + 3, g.pos.y, { ...at, item: { id: 'firePot', count: 1 } });
  for (let i = 0; i < 160 && !g.actor?.inventory.length; i++) sim.step();
  check(`a creature's brain grabs a loose item into its bag${where}`, !!g.actor?.inventory.some((s) => s.id === 'firePot') && (!raised || g.z > z0), `bag ${JSON.stringify(g.actor?.inventory)} z ${g.z.toFixed(1)}`);

  // Throw: a raider with a fire pot in its bag throws it at the traveller from a distance.
  const t = spawner(sim).spawn('raider', me.pos.x + 7, me.pos.y, { ...at, worn: {} });
  if (t.actor) t.actor.inventory = [{ id: 'firePot', count: 1 }];
  let thrown = false;
  for (let i = 0; i < 200 && !thrown; i++) {
    // Held at throwing range, so a brain that chose to close in first gets more chances (the throw is a dice roll).
    t.pos.x = t.prev.x = me.pos.x + 7;
    t.pos.y = t.prev.y = me.pos.y;
    sim.step();
    me.hp = Math.max(me.hp, 50);
    thrown = !t.actor?.inventory.length;
  }
  check(`a creature's brain throws from its bag at an enemy${where}`, thrown, JSON.stringify(t.actor?.inventory));
}

check('grab and throw are brain behaviours any creature can list', brain('raider').behaviours.some((b) => b.do === 'grab') && brain('raider').behaviours.some((b) => b.do === 'throw'));

if (failures()) throw new Error(`${failures()} hands check(s) failed`);
console.log('all hands checks passed');
