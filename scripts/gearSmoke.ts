// Headless checks for armour: generated pieces, the paperdoll requests, protection and wear,
// creatures wearing and dropping armour. Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, gearItem, itemDef, parseGear, rollGear, validateContent } from '../src/content';
import type { Entity, InputSnapshot, Rng } from '../src/types';
import { Tile, addItem, countItem, emptyInput } from '../src/types';

/** A small seeded random source for the checks (the sim has its own). */
function makeRng(seed: number): Rng {
  let s = seed | 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + (b - a) * next(), int: (n) => Math.floor(next() * n), chance: (p) => next() < p, pick: (a) => a[Math.floor(next() * a.length)] as never };
}

function spawner(sim: Simulation): { spawn: (t: string, x: number, y: number, i?: object) => Entity } {
  return (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
}
/** Flat, clear ground to stand on, with the traveller placed at its middle. */
function arena(sim: Simulation, me: Entity, x = 18000, y = 18000, r = 40): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, Tile.Flagstone as 0);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < r + 20) sim.state.entities.delete(e.id);
  me.pos.x = me.prev.x = x + 0.5;
  me.pos.y = me.prev.y = y + 0.5;
  me.z = me.prevZ = sim.tiles.ground(x, y);
  me.vel.x = me.vel.y = me.vz = 0;
}

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  arena(sim, me);
  return { sim, me };
}
let seq = 0;
function run(sim: Simulation, ticks: number, input?: Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(++seq, 0), ...(input ?? {}) } });
    sim.step();
  }
}
function hit(sim: Simulation, target: Entity, amount: number, kind: 'cut' | 'blunt' | 'fire' | 'cold' = 'cut', swing: 'left' | 'right' | 'thrust' | 'overhead' | null = null): void {
  sim.state.queues.effects.push({ target: { kind: 'entity', id: target.id }, effects: [{ type: 'damage', amount, kind }], source: null, from: null, swing });
}

// The tables are sound and every id means what it says.
{
  check('content is valid with the armour tables', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));
  const helm = gearItem(CONTENT.gear, 'gear:helm:iron:fine');
  check('an id becomes a named item', helm?.name === 'Fine iron helm' && helm.armour?.region === 'head' && helm.category === 'armour', helm?.name);
  const plain = gearItem(CONTENT.gear, 'gear:cap:linen:common');
  check('ordinary work has no grade in its name', plain?.name === 'Linen cap', plain?.name);
  const crude = gearItem(CONTENT.gear, 'gear:helm:iron:crude');
  const master = gearItem(CONTENT.gear, 'gear:helm:iron:masterwork');
  check('quality changes protection, durability and value', !!crude?.armour && !!master?.armour && master.armour.armor > (helm?.armour?.armor ?? 0) && (helm?.armour?.armor ?? 0) > crude.armour.armor && master.armour.durability > crude.armour.durability && master.value > crude.value);
  const steel = gearItem(CONTENT.gear, 'gear:cuirass:steel:common');
  const linen = gearItem(CONTENT.gear, 'gear:tunic:linen:common');
  check('material changes protection and weight', !!steel?.armour && !!linen?.armour && steel.armour.armor > linen.armour.armor * 3 && steel.weight > linen.weight * 3);
  check('wear travels in the id', gearItem(CONTENT.gear, 'gear:helm:iron:fine:7')?.armour?.wear === 7 && parseGear(CONTENT.gear, 'gear:helm:iron:fine:7')?.wear === 7);
  check('nonsense ids are refused', gearItem(CONTENT.gear, 'gear:helm:mithril:fine') === null && gearItem(CONTENT.gear, 'gear:spoon:iron:fine') === null && itemDef(CONTENT, 'gear:') === undefined);
  const rng = makeRng(99);
  const rolled = Array.from({ length: 60 }, () => rollGear(CONTENT.gear, rng, {}));
  check('random armour always names real things', rolled.every((id) => id !== null && gearItem(CONTENT.gear, id) !== null));
  const kinds = new Set(rolled.map((id) => (id ? gearItem(CONTENT.gear, id)?.armour?.region : '')));
  check('random armour covers every body part', kinds.size === Object.keys(CONTENT.gear.regions).length, [...kinds].join(','));
  const onlyLeather = Array.from({ length: 20 }, () => rollGear(CONTENT.gear, rng, { region: 'torso', materials: ['leather'], qualities: ['fine'] }));
  check('a roll can be steered', onlyLeather.every((id) => id !== null && gearItem(CONTENT.gear, id)?.name.startsWith('Fine leather')));
}

// A traveller begins in plain clothes, and putting armour on and off goes through the one rule.
{
  const { sim, me } = world();
  check('travellers begin dressed', !!me.worn?.torso && !!me.worn?.legs && !me.worn?.head);
  const inv = me.player?.inventory ?? [];
  addItem(inv, 'gear:helm:steel:common', 1);
  addItem(inv, 'gear:helm:iron:fine', 1);
  run(sim, 2, { wear: { do: 'wear', item: 'gear:helm:steel:common' } });
  check('wearing from the bag moves the piece onto the body', me.worn?.head === 'gear:helm:steel:common' && countItem(inv, 'gear:helm:steel:common') === 0);
  run(sim, 2, { useItem: 'gear:helm:iron:fine' });
  check('double-clicking (using) armour wears it and the old piece goes back in the bag', me.worn?.head === 'gear:helm:iron:fine' && countItem(inv, 'gear:helm:steel:common') === 1);
  run(sim, 2, { wear: { do: 'remove', region: 'head' } });
  check('taking off returns it to the bag', !me.worn?.head && countItem(inv, 'gear:helm:iron:fine') === 1);
  // Armour lying in the world can be put on straight from the ground.
  const item = sim.state.nextEntityId;
  spawner(sim).spawn('looseItem', me.pos.x + 1, me.pos.y, { z: me.z + 0.2, prevZ: me.z + 0.2, item: { id: 'gear:cuirass:iron:common', count: 1 } });
  run(sim, 2, { wear: { do: 'wearFrom', entity: item } });
  check('armour on the ground can be put on', me.worn?.torso === 'gear:cuirass:iron:common' && countItem(inv, 'gear:tunic:wool:common') === 1, JSON.stringify(me.worn));
  const far = sim.state.nextEntityId;
  spawner(sim).spawn('looseItem', me.pos.x + 30, me.pos.y, { z: me.z, prevZ: me.z, item: { id: 'gear:cap:linen:common', count: 1 } });
  run(sim, 2, { wear: { do: 'wearFrom', entity: far } });
  check('armour out of reach is not put on', !me.worn?.head);
  addItem(inv, 'bread', 1);
  const loaves = countItem(inv, 'bread');
  run(sim, 2, { wear: { do: 'wear', item: 'bread' } });
  check('only armour can be worn', countItem(inv, 'bread') === loaves && !Object.values(me.worn ?? {}).includes('bread'));
}

// Protection: armour turns blows, wears with each one and breaks at last; fire goes through cloth.
{
  const { sim, me } = world();
  me.worn = { torso: 'gear:cuirass:steel:common' };
  me.invuln = 0;
  const base = CONTENT.things['player']?.health?.armor ?? 0;
  const armor = gearItem(CONTENT.gear, 'gear:cuirass:steel:common')?.armour?.armor ?? 0;
  // Only the torso is covered, so test with a fixed region by clearing the others: every blow that lands on the torso is turned.
  const naked = world();
  naked.me.worn = {};
  let hurtBare = 0;
  let hurtArmoured = 0;
  const rng = makeRng(5);
  for (let i = 0; i < 40; i++) {
    naked.me.hp = naked.me.maxHp;
    me.hp = me.maxHp;
    naked.me.invuln = 0;
    me.invuln = 0;
    me.worn = { head: 'gear:helm:steel:common', torso: 'gear:cuirass:steel:common', arms: 'gear:bracers:steel:common', legs: 'gear:greaves:steel:common' };
    hit(naked.sim, naked.me, 14);
    hit(sim, me, 14);
    run(naked.sim, 1);
    run(sim, 1);
    hurtBare += naked.me.maxHp - naked.me.hp;
    hurtArmoured += me.maxHp - me.hp;
    rng.next();
  }
  check('armour reduces the harm taken', hurtArmoured < hurtBare * 0.8, `${hurtBare} bare vs ${hurtArmoured} armoured (base ${base}, cuirass ${armor})`);

  // Wear and breaking.
  const w = world();
  w.me.worn = { torso: 'gear:tunic:linen:crude:3' };
  w.me.hp = w.me.maxHp;
  const events: string[] = [];
  for (let i = 0; i < 12 && w.me.worn?.torso; i++) {
    w.me.invuln = 0;
    hit(w.sim, w.me, 5);
    run(w.sim, 1);
    const left = w.me.worn?.torso;
    if (left) events.push(left);
  }
  // Each blow lands on a random part of the body, so the first one may miss the tunic; it wears within a few.
  check('blows wear the piece', events.some((e) => e === 'gear:tunic:linen:crude:2' || e === 'gear:tunic:linen:crude:1'), events.join(' '));
  check('a worn-out piece breaks and falls away', !w.me.worn?.torso);

  // Heat comes through cloth faster than through iron.
  const f = world();
  f.me.worn = { head: 'gear:cap:linen:common', torso: 'gear:tunic:linen:common', arms: 'gear:wraps:linen:common', legs: 'gear:leggings:linen:common' };
  const g = world();
  g.me.worn = { head: 'gear:helm:iron:common', torso: 'gear:cuirass:iron:common', arms: 'gear:bracers:iron:common', legs: 'gear:greaves:iron:common' };
  f.me.invuln = g.me.invuln = 0;
  f.me.hp = g.me.hp = f.me.maxHp;
  hit(f.sim, f.me, 20, 'fire');
  hit(g.sim, g.me, 20, 'fire');
  run(f.sim, 1);
  run(g.sim, 1);
  check('material changes how fire is taken', f.me.maxHp - f.me.hp > g.me.maxHp - g.me.hp, `${f.me.maxHp - f.me.hp} in linen vs ${g.me.maxHp - g.me.hp} in iron`);
}

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

if (failed) throw new Error(`${failed} gear check(s) failed`);
console.log('all armour checks passed');
