// Headless checks: creatures are found wearing and holding real gear (their outfit), fight with what they hold
// by the player's rules (stats, wear) on the ground and on a 3D floor, and drop it. Prints PASS/FAIL per check.
import { CONTENT, itemDef, itemWeapon, thingDef, weaponStats } from '../src/content';
import type { Entity } from '../src/types';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { shapeByte } from '../src/types';
import { check, failures, hit, spawner, world } from './smokeKit';

// Creatures wear armour through the same rule, and may drop it.
{
  const { sim, me } = world();
  let dressed = 0;
  let total = 0;
  let sample: Entity | null = null;
  for (let i = 0; i < 40; i++) {
    const r = spawner(sim).spawn('raider', me.pos.x + 20 + i, me.pos.y + 20, { z: me.z, prevZ: me.z });
    total++;
    if (r.worn && Object.keys(r.worn).length) {
      dressed++;
      sample = sample ?? r;
    }
  }
  check('raiders are found in armour', dressed > total * 0.6, `${dressed}/${total}`);
  check('what they wear is real armour on the right parts', !!sample && Object.entries(sample.worn ?? {}).every(([region, id]) => itemDef(CONTENT, id)?.armour?.region === region));
  const wolf = spawner(sim).spawn('wolf', me.pos.x + 30, me.pos.y, { z: me.z, prevZ: me.z });
  check('animals wear nothing', !wolf.worn);
  const villager = spawner(sim).spawn('villager', me.pos.x + 31, me.pos.y, { z: me.z, prevZ: me.z });
  void villager;
  // Armoured raider takes less than a bare one from the same blow, on average.
  const bareRaiders: Entity[] = [];
  const armouredRaiders: Entity[] = [];
  for (let i = 0; i < 30; i++) {
    const a = spawner(sim).spawn('raider', me.pos.x + 60, me.pos.y + i * 2, { z: me.z, prevZ: me.z, worn: {} });
    const b = spawner(sim).spawn('raider', me.pos.x + 70, me.pos.y + i * 2, { z: me.z, prevZ: me.z, worn: { head: 'gear:helm:steel:common', torso: 'gear:cuirass:steel:common', arms: 'gear:bracers:steel:common', legs: 'gear:greaves:steel:common' } });
    bareRaiders.push(a);
    armouredRaiders.push(b);
    hit(sim, a, 16);
    hit(sim, b, 16);
  }
  sim.step();
  const sum = (l: Entity[]): number => l.reduce((n, r) => n + (r.maxHp - r.hp), 0);
  check('armour protects creatures by the same rule', sum(armouredRaiders) < sum(bareRaiders) * 0.8, `${sum(bareRaiders)} bare vs ${sum(armouredRaiders)} armoured`);
  // A dead raider drops some of what it wore.
  let drops = 0;
  for (let i = 0; i < 20; i++) {
    const r = spawner(sim).spawn('raider', me.pos.x + 90, me.pos.y + i * 2, { z: me.z, prevZ: me.z, worn: { torso: 'gear:cuirass:iron:common' } });
    r.hp = 1;
    hit(sim, r, 50);
  }
  sim.step();
  for (const e of sim.state.entities.values()) if (e.item?.id === 'gear:cuirass:iron:common') drops++;
  check('what a fallen creature wore can be found on it', drops > 3 && drops < 20, `${drops}/20`);
}

// People hold real weapons from the gear table, rolled by the same outfit rule as their armour.
{
  const { sim, me } = world();
  const raiders = Array.from({ length: 40 }, (_, i) => spawner(sim).spawn('raider', me.pos.x + 20 + i, me.pos.y - 20, { z: me.z, prevZ: me.z }));
  const held = raiders.map((r) => r.actor?.weapon ?? null);
  check('raiders are found holding real weapons', held.every((id) => !!id && !!itemWeapon(CONTENT, id)), held.join(','));
  check('most raiders carry an axe, the rest something else', held.filter((id) => id?.startsWith('gear:axe')).length > 15 && held.some((id) => !id?.startsWith('gear:axe')));
  const hexer = spawner(sim).spawn('hexer', me.pos.x + 25, me.pos.y - 25, { z: me.z, prevZ: me.z });
  check('hexers carry a wooden staff', !!hexer.actor?.weapon?.startsWith('gear:staff:oak'), hexer.actor?.weapon ?? 'none');
  const r = raiders[0] as Entity;
  check('a creature swings what it holds by the item\'s own numbers', weaponStats(CONTENT, thingDef(CONTENT, r.def), r.actor?.weapon ?? null) === itemWeapon(CONTENT, r.actor?.weapon ?? ''));
  if (r.actor) r.actor.weapon = null;
  check('empty-handed, people punch like the traveller', weaponStats(CONTENT, thingDef(CONTENT, r.def), null)?.name === 'Fists');
}

// A raider's held weapon wears as it lands blows, by the same rule as the traveller's, on the ground and on a 3D floor.
for (const raised of [false, true]) {
  const { sim, me } = world();
  const z0 = Math.floor(me.z) + 2;
  if (raised) {
    for (let j = -14; j <= 14; j++) for (let i = -14; i <= 14; i++) sim.state.volume.set(Math.floor(me.pos.x) + i, Math.floor(me.pos.y) + j, z0, shapeByte(shapeId('cube'), 0), tileCode('stoneWall'));
    me.z = me.prevZ = z0 + 1;
  }
  const r = spawner(sim).spawn('raider', me.pos.x + 1.2, me.pos.y, { z: me.z, prevZ: me.z, worn: {} });
  if (r.actor) r.actor.weapon = 'gear:sword:iron:common';
  for (let i = 0; i < 300 && me.hp > 0; i++) {
    sim.step();
    me.hp = Math.max(me.hp, 30);
  }
  const w = r.actor?.weapon ?? '';
  check(`a raider's sword wears with its blows${raised ? ' on a 3D floor' : ''}`, (!raised || (me.z > z0 && r.z > z0)) && w.startsWith('gear:sword:iron:common@'), `${w} z ${me.z.toFixed(1)}`);
}

// A fallen raider may drop what it held.
{
  const { sim, me } = world();
  for (let i = 0; i < 20; i++) {
    const r = spawner(sim).spawn('raider', me.pos.x + 30, me.pos.y + i * 2, { z: me.z, prevZ: me.z, worn: {} });
    if (r.actor) r.actor.weapon = 'gear:spear:bronze:common';
    r.hp = 1;
    hit(sim, r, 50);
  }
  sim.step();
  let drops = 0;
  for (const e of sim.state.entities.values()) if (e.item?.id === 'gear:spear:bronze:common') drops++;
  check('what a fallen creature held can be found on it', drops > 3 && drops < 20, `${drops}/20`);
}

if (failures()) throw new Error(`${failures()} outfit check(s) failed`);
console.log('all outfit checks passed');
