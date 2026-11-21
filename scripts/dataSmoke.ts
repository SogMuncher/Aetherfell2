// Data-friendliness checks: one day clock, tile numbers from the ledger, effects and
// HUD colours as data, land that changes over time, sites rolling on their own, quest kinds, quick keys.
import { Simulation, createState } from '../src/sim';
import { CONTENT, dayPart, isNight, nightFalls, validateContent } from '../src/content';
import { assignTileCodes, tileCode, tilesMissingFromLedger } from '../src/content/tiles';
import { TILE_LEDGER } from '../src/content/tileCodes';
import { kindFor } from '../src/sim/world/sites';
import { hudVariables } from '../src/render/ui/style';
import { QuickSlots } from '../src/input/quickSlots';
import type { Entity, SiteDef } from '../src/types';
import { Tile, emptyInput } from '../src/types';

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
  sim.state.weather.rain = 0;
  sim.state.weather.rainTarget = 0;
  sim.state.weather.wetness = 0;
  sim.state.weather.nextShift = 1e9;
  return { sim, me };
}
function run(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i, 0) });
    sim.step();
  }
}

const problems = validateContent(CONTENT);
check('content  validates', problems.length === 0, problems.join('; '));

// One day clock.
{
  const d = CONTENT.rules.day;
  check('midnight and late evening are night, noon is not', isNight(d, 0.05) && isNight(d, 0.9) && !isNight(d, 0.5));
  check('the day has a morning, afternoon and evening', dayPart(d, 0.3) === 'morning' && dayPart(d, 0.55) === 'afternoon' && dayPart(d, 0.75) === 'evening' && dayPart(d, 0.1) === 'night');
  check('nightfall is noticed once', nightFalls(d, d.nightFrom - 0.001, d.nightFrom + 0.001) && !nightFalls(d, d.nightFrom + 0.001, d.nightFrom + 0.002));
}

// Tile numbers.
{
  check('ledger tiles keep their numbers', TILE_LEDGER.every((id, code) => !(id in CONTENT.tileIds) || CONTENT.tileIds[id] === code));
  check('the old tile names still match', tileCode('peat') === Tile.Peat && tileCode('grass') === Tile.Grass && tileCode('stoneSill') === 42);
  const codes = assignTileCodes(['grass', 'newMoss', 'peat', 'newSlime'], ['grass', 'retired', 'peat']);
  check('a new tile gets the next free number, retired numbers stay unused', codes.grass === 0 && codes.peat === 2 && codes.newMoss === 3 && codes.newSlime === 4 && !('retired' in codes), JSON.stringify(codes));
  check('every tile is in the ledger', tilesMissingFromLedger().length === 0, tilesMissingFromLedger().join(', '));
}

// Effects and HUD colours as data.
{
  check('effect bursts are data', Object.keys(CONTENT.effects).length >= 15 && !!CONTENT.effects.parry && !!CONTENT.effects.tileFlame);
  const css = hudVariables(CONTENT.hud);
  check('HUD colours become CSS variables', css.includes('--hp-top: #e0574a') && css.includes('--gold:'));
}

// Land that changes over time.
{
  const { sim, me } = world();
  const x = Math.floor(me.pos.x) + 4;
  const y = Math.floor(me.pos.y);
  sim.tiles.setKind(x, y, tileCode('ash'));
  sim.tiles.setKind(x + 1, y, tileCode('ash'));
  sim.tiles.setFire(x + 1, y, 120);
  sim.tiles.setFuel(x + 1, y, 255);
  check('ash is told when it will grow over', sim.state.later.has(((x + 1048576) * 2097152) + (y + 1048576)));
  for (const k of sim.state.later.keys()) sim.state.later.set(k, sim.state.tick + 1);
  run(sim, 40);
  check('after its time, ash greens over', sim.tiles.kind(x, y) === tileCode('grass'), sim.tiles.info(x, y).name);
  check('but not while it still burns', sim.tiles.kind(x + 1, y) === tileCode('ash') || sim.tiles.fire(x + 1, y) > 0, sim.tiles.info(x + 1, y).name);
  sim.tiles.setFire(x + 2, y, 0);
  sim.tiles.setKind(x + 2, y, tileCode('burntTree'));
  for (const k of sim.state.later.keys()) sim.state.later.set(k, sim.state.tick + 1);
  run(sim, 40);
  check('a charred trunk falls to ash, which will green over in turn', sim.tiles.kind(x + 2, y) === tileCode('ash') && [...sim.state.later.values()].some((t) => t > sim.state.tick));
}

// Each kind of place rolls on its own: a new kind with a lower priority moves nothing.
{
  const before: (string | null)[] = [];
  for (let ry = -20; ry < 20; ry++) for (let rx = -20; rx < 20; rx++) before.push(kindFor(77, rx, ry, 20));
  const sites = CONTENT.sites as Record<string, SiteDef>;
  const village = sites.village;
  if (village) sites.testNewPlace = { ...village, chance: 0.5, priority: -1 };
  const after: (string | null)[] = [];
  for (let ry = -20; ry < 20; ry++) for (let rx = -20; rx < 20; rx++) after.push(kindFor(77, rx, ry, 20));
  delete sites.testNewPlace;
  const moved = before.filter((k, i) => k !== null && after[i] !== k).length;
  const filled = after.filter((k, i) => before[i] === null && k === 'testNewPlace').length;
  check('adding a new kind of place leaves the old places where they were', moved === 0, `${moved} moved`);
  check('the new kind fills empty regions', filled > 50, `${filled} regions`);
}

// Quest kinds.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  sim.state.quests.push({ id: 900, title: 'Pelts', giver: 0, giverName: 'Smith', kind: 'fetch', targetKind: 'wolfPelt', targetLocation: null, needed: 2, progress: 0, state: 'active', reward: 5, since: sim.state.tick });
  sim.state.quests.push({ id: 901, title: 'Stones', giver: 0, giverName: 'Trader', kind: 'explore', targetKind: 'stones', what: 'the stones', targetLocation: null, needed: 1, progress: 0, state: 'active', reward: 5, since: sim.state.tick });
  p.inventory.push({ id: 'wolfPelt', count: 2 });
  sim.state.locations.push({ id: 950, kind: 'stones', name: 'Old Ring', pos: { x: 1e6, y: 1e6 }, radius: 10, discovered: true, populated: true, discoveredAt: sim.state.tick - 100 });
  run(sim, 25);
  const fetch = sim.state.quests.find((q) => q.id === 900);
  const explore = sim.state.quests.find((q) => q.id === 901);
  check('a fetch job counts what you carry', fetch?.progress === 2, `${fetch?.progress}/2`);
  check('an explore job ignores places found before it was taken', explore?.progress === 0);
  const loc = sim.state.locations.find((l) => l.id === 950);
  if (loc) loc.discoveredAt = sim.state.tick;
  run(sim, 25);
  check('and is done once such a place is found', explore?.progress === 1 && sim.state.journal.some((j) => j.text.includes('you found the stones')));
  check('new quest kinds are offered by villagers', CONTENT.roles.smith?.quest?.kind === 'fetch' && CONTENT.roles.trader?.quest?.kind === 'explore');
}

// Factions from the rules.
{
  const { sim, me } = world();
  const ctx = (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number) => Entity } }).ctx;
  const e = ctx.spawn('urn', me.pos.x + 3, me.pos.y);
  check('things without a faction join the default one', e.faction === CONTENT.rules.factions.default, e.faction);
}

// Quick-use keys.
{
  const q = new QuickSlots(['healingDraught', '@throwable', 'bread']);
  check('quick keys start from the rules', q.get(0) === 'healingDraught' && q.get(1) === '@throwable' && q.get(3) === '');
  q.set(3, 'healingDraught');
  check('putting an item on a key takes it off the old one', q.get(3) === 'healingDraught' && q.get(0) === '');
}

if (failed) throw new Error(`${failed} data check(s) failed`);
console.log('all data checks passed');
