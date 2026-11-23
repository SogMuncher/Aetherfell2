// Headless checks for the settings list and the debug cheats (which travel as sim commands).
// Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, tunedValue } from '../src/content';
import { CHEATS } from '../src/content/cheats';
import { SETTINGS, SettingsStore } from '../src/settings';
import type { CheatValue, Entity, InputSnapshot } from '../src/types';
import { bagOf, emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(777));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  return { sim, me };
}
function run(sim: Simulation, ticks: number, input?: Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ?? {}) } });
    sim.step();
  }
}
function cheat(sim: Simulation, id: string, value: CheatValue = null, who = 'local'): void {
  sim.enqueue({ type: 'cheat', playerId: who, cheat: id, value });
}

// Settings: every entry is well-formed and the store survives bad input (no storage in Node).
{
  const ids = new Set(SETTINGS.map((s) => s.id));
  check('settings have unique ids', ids.size === SETTINGS.length);
  check('every setting default fits its own range', SETTINGS.every((s) => (s.kind === 'slider' ? s.value >= s.min && s.value <= s.max : s.kind === 'choice' ? s.options.some((o) => o.value === s.value) : true)));
  const store = new SettingsStore();
  store.set('masterVolume', 250);
  check('sliders are kept in range', store.num('masterVolume') === 100);
  store.set('resolution', 'enormous');
  check('unknown choices are refused', store.str('resolution') === '200');
  store.set('invertMouse', true);
  store.reset('Controls');
  check('reset puts a group back', store.bool('invertMouse') === false && store.num('masterVolume') === 100);
}

// Cheats: every entry is well-formed.
{
  const ids = new Set(CHEATS.map((c) => c.id));
  check('cheats have unique ids', ids.size === CHEATS.length);
}

// God mode: no harm gets through; switching it off lets harm through again.
{
  const { sim, me } = world();
  cheat(sim, 'god');
  run(sim, 1);
  const hp = me.hp;
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'damage', amount: 40, kind: 'cut' }, { type: 'damage', amount: 40, kind: 'fire' }], source: null, from: null });
  run(sim, 2);
  check('god mode takes no harm', me.hp === hp && me.player?.cheats?.god === true, `hp ${hp} -> ${me.hp}`);
  cheat(sim, 'god');
  run(sim, 1);
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'damage', amount: 10, kind: 'cut' }], source: null, from: null });
  run(sim, 2);
  check('god mode switches off', me.hp < hp);
}

// Fly: rises with Space, hovers without falling, lands softly.
{
  const { sim, me } = world();
  cheat(sim, 'fly');
  run(sim, 1);
  const z0 = me.z;
  run(sim, 30, { jumpHeld: true });
  const up = me.z;
  run(sim, 20);
  check('fly: Space rises', up > z0 + 5, `${z0.toFixed(1)} -> ${up.toFixed(1)}`);
  check('fly: hovers when idle', Math.abs(me.z - up) < 1.5, `${up.toFixed(1)} -> ${me.z.toFixed(1)}`);
  const hp = me.hp;
  run(sim, 60, { forward: 1, pitch: -1 });
  check('fly: diving down does not hurt', me.hp === hp && me.z < up);
  cheat(sim, 'fly');
  run(sim, 40);
  check('fly off: gravity returns', Math.abs(me.z - sim.tiles.ground(me.pos.x, me.pos.y)) < 1.2);
}

// Things, travel and world.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  const item = Object.keys(CONTENT.items)[0] ?? '';
  const before = bagOf(me).find((s) => s.id === item)?.count ?? 0;
  cheat(sim, 'giveItem', item);
  cheat(sim, 'giveItem', 'notARealItem');
  run(sim, 1);
  check('give item adds to the bag', (bagOf(me).find((s) => s.id === item)?.count ?? 0) === before + 5);
  check('unknown items are refused', !bagOf(me).some((s) => s.id === 'notARealItem'));

  cheat(sim, 'allRunes');
  run(sim, 1);
  check('learn every rune', CONTENT.runeOrder.every((r) => p.runes.includes(r)));

  p.mana = 0;
  cheat(sim, 'endless');
  run(sim, 2);
  check('endless aether refills', p.mana === p.maxMana);

  me.hp = 5;
  cheat(sim, 'restore');
  run(sim, 1);
  check('heal fully', me.hp === me.maxHp);

  const x0 = me.pos.x;
  const y0 = me.pos.y;
  cheat(sim, 'ahead', 500);
  run(sim, 1, { yaw: 0 });
  check('teleport ahead', Math.hypot(me.pos.x - x0, me.pos.y - y0) > 450, `${Math.hypot(me.pos.x - x0, me.pos.y - y0).toFixed(0)} m`);
  cheat(sim, 'ahead', 1e9);
  const x1 = me.pos.x;
  run(sim, 1, { yaw: 0 });
  check('teleport distance is capped', me.pos.x - x1 <= 3001);

  run(sim, 40);
  const loc = sim.state.locations[0];
  if (loc) {
    cheat(sim, 'toPlace', loc.id);
    run(sim, 1);
    check('teleport to a place', Math.hypot(me.pos.x - loc.pos.x, me.pos.y - loc.pos.y) < loc.radius + 14, loc.name);
  } else check('teleport to a place', false, 'no places known');

  cheat(sim, 'time', 21);
  run(sim, 1);
  check('set time of day', Math.abs(sim.state.weather.time * 24 - 21) < 0.05);
  cheat(sim, 'weather', 'storm');
  run(sim, 1);
  check('set weather', sim.state.weather.rain > 0.9);

  const creature = Object.entries(CONTENT.things).find(([, d]) => !!d.brain)?.[0] ?? '';
  const count = (): number => [...sim.state.entities.values()].filter((e) => e.def === creature && Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) < 10).length;
  const had = count();
  cheat(sim, 'spawn', creature);
  run(sim, 1);
  check('spawn creature', count() === had + 1, creature);
  cheat(sim, 'spawn', 'barrel');
  cheat(sim, 'banish');
  run(sim, 2);
  check('banish nearby creatures', [...sim.state.entities.values()].every((e) => !e.ai || !!e.npc || Math.hypot(e.pos.x - me.pos.x, e.pos.y - me.pos.y) > 40));

  // Saves keep cheat switches (plain data) and load again.
  const loaded = Simulation.fromSave(sim.save());
  const again = loaded ? loaded.state.entities.get(loaded.state.players['local'] ?? -1) : undefined;
  check('cheat switches survive a save', again?.player?.cheats?.endless === true);

  // A cheat from someone who is not in the world does nothing.
  me.hp = 5;
  cheat(sim, 'restore', null, 'stranger');
  run(sim, 1);
  check('cheats from someone not in the world do nothing', me.hp === 5);
}

// Held-item cheats: set one number of the weapon in hand, and the sim's handling reads it at once.
{
  const { sim, me } = world();
  const a = me.actor;
  if (a) a.weapon = 'gear:sword:iron:common';
  cheat(sim, 'held.left.knock', 3.5);
  cheat(sim, 'held.hitstop', 2);
  cheat(sim, 'held.overhead.damage', 9);
  sim.step();
  const knock = tunedValue(CONTENT, me, { angle: 'left', key: 'knock' });
  check('held-item cheat sets one angle', knock === 3.5 && tunedValue(CONTENT, me, { angle: 'right', key: 'knock' }) !== 3.5, `${knock}`);
  check('held-item cheat sets the whole weapon', tunedValue(CONTENT, me, { key: 'hitstop' }) === 2);
  check('held-item cheat keeps damage within its slider', tunedValue(CONTENT, me, { angle: 'overhead', key: 'damage' }) === 1);
}

if (failed) throw new Error(`${failed} cheat check(s) failed`);
console.log('all settings and cheat checks passed');
