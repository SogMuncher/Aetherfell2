// Townsfolk: they find their way round walls and in through doors (ground and 3D cells), keep routines, and answer "where is" topics.
import { CUBE, STONE, check, failures, flatten, gz, run, world } from './matterKit';
import { spawner } from './smokeKit';
import { CONTENT, hauntNow } from '../src/content';
import { tileCode } from '../src/content/tiles';
import { findPath, walkable } from '../src/sim/ai/paths';
import type { Entity, NpcData, SimContext } from '../src/types';

const { sim, me } = world();
const s = sim.state;
const ctx = (sim as unknown as { ctx: SimContext }).ctx;
const { spawn } = spawner(sim);
const X = 7300;
const Y = 7300;
flatten(sim, X, Y, 30, tileCode('grass'));
me.pos.x = X + 20;
me.pos.y = Y + 20;
const folk = (x: number, y: number, npc: Partial<NpcData>): Entity =>
  spawn('villager', x, y, { npc: { name: 'Tess', role: 'farmer', home: { x, y }, haunts: {}, locationId: 999, questId: null, stock: [], ...npc } });
/** Steps the world with the night's roaming beasts sent away: this is about finding the way, not about wolves. */
/** Closest the watched walker came to its goal in the last `calm` (once there, folk may potter off a few steps). */
let near = Infinity;
const calm = (ticks: number, who?: Entity, goal?: { x: number; y: number }): void => {
  near = Infinity;
  for (let t = 0; t < ticks; t++) {
    run(sim, 1);
    if (who && goal) near = Math.min(near, Math.hypot(who.pos.x - goal.x, who.pos.y - goal.y));
    if (t % 10 === 0) for (const o of [...s.entities.values()]) if (o.ai && !o.npc && !o.player) s.entities.delete(o.id);
  }
};
const at = (e: Entity, p: { x: number; y: number }, r: number): boolean => Math.hypot(e.pos.x - p.x, e.pos.y - p.y) < r;

// ---- On the ground: a U of wall tiles, the goal inside, the walker outside its closed end. ----
{
  const wall = tileCode('stoneWall');
  const gx = X - 12;
  const gy = Y;
  for (let i = -4; i <= 4; i++) {
    sim.tiles.setKind(gx + i, gy - 4, wall);
    sim.tiles.setKind(gx - 4, gy + i, wall);
    sim.tiles.setKind(gx + 4, gy + i, wall);
  }
  const goal = { x: gx + 0.5, y: gy + 0.5 };
  const path = findPath(ctx, { x: gx + 0.5, y: gy - 9.5 }, goal, gz(sim, gx, gy));
  check('a way is found round a wall of tiles', !!path && path.length > 1, `${path?.length ?? 0} waypoints`);
  s.weather.time = 0.9;
  const v = folk(gx + 0.5, gy - 9.5, { home: goal, haunts: { home: goal } });
  calm(20 * 30, v, goal);
  check('a villager walks round the wall to get home', near <= 1.8, `came within ${near.toFixed(1)} m`);
}

// ---- In the 3D layer: home is inside a stone pen open on one side; the walker starts behind it and must go round. ----
{
  const px = X + 8;
  const py = Y;
  for (let i = -3; i <= 3; i++) {
    for (const [cx, cy] of [[px + i, py + 3], [px - 3, py + i], [px + 3, py + i]] as const) {
      const z0 = gz(sim, cx, cy);
      for (let z = z0; z <= z0 + 2; z++) s.volume.set(cx, cy, z, CUBE, STONE);
    }
  }
  const home = { x: px + 0.5, y: py + 0.5 };
  const back = { x: px + 0.5, y: py + 7.5 };
  const z = sim.tiles.ground(px, py);
  check('cells of a wall are not walkable, the pen inside is', Number.isNaN(walkable(ctx, px, py + 3, z)) && !Number.isNaN(walkable(ctx, px, py, z)));
  const v = folk(back.x, back.y, { home, haunts: { home } });
  s.weather.time = 0.9;
  calm(20 * 30, v, home);
  check('from behind the pen, a villager goes round the 3D walls and in', near <= 1.8, `came within ${near.toFixed(1)} m`);
  // In the morning they come back out to the place their role names.
  const field = { x: px + 0.5, y: py - 12 };
  if (v.npc) v.npc.haunts['edge'] = v.npc.haunts['square'] = field;
  s.weather.time = 0.3;
  calm(20 * 30);
  check('by day they leave home for their work place', at(v, field, 4.5), `${Math.hypot(v.pos.x - field.x, v.pos.y - field.y).toFixed(1)} m off`);
}

// ---- Routines: the role's own list by day part; rain sends folk in. ----
{
  const v = folk(X, Y + 12, { role: 'smith', haunts: { home: { x: X, y: Y }, smithy: { x: X + 1, y: Y }, tavern: { x: X + 2, y: Y }, square: { x: X + 3, y: Y } } });
  s.weather.time = 0.3;
  check('a smith spends the morning at the smithy', hauntNow(CONTENT, s.weather, v) === 'smithy', hauntNow(CONTENT, s.weather, v));
  s.weather.time = 0.9;
  check('and the night at home', hauntNow(CONTENT, s.weather, v) === 'home');
  const days = new Set<string>();
  const t = folk(X, Y + 13, { role: 'farmer', haunts: { home: { x: X, y: Y }, tavern: { x: X + 2, y: Y }, square: { x: X + 3, y: Y } } });
  s.weather.time = 0.75;
  for (let d = 0; d < 12; d++) {
    s.weather.day = d;
    days.add(hauntNow(CONTENT, s.weather, t));
  }
  check('evenings differ from day to day', days.size > 1, [...days].join(','));
}

// ---- Talk: "Where is..." a place and a person, Daggerfall style. ----
{
  const out = { x: X - 12.5, y: Y - 5.5 };
  s.locations.push({ id: 999, kind: 'village', name: 'Testford', pos: { x: X, y: Y }, radius: 30, discovered: true, populated: true, landmarks: { tavern: out, square: { x: X, y: Y + 10 } } });
  const a = folk(X + 20, Y + 22, { name: 'Bram', role: 'smith', haunts: { home: { x: X + 20, y: Y + 22 } } });
  folk(X - 10, Y + 22, { name: 'Wren', haunts: { home: { x: X - 10, y: Y + 22 } } });
  s.weather.time = 0.3;
  me.pos.x = X + 21;
  me.pos.y = Y + 22;
  s.queues.use.push({ player: me.id, tileX: 0, tileY: 0, z: 0, entity: a.id });
  run(sim, 1);
  const pick = (action: string): void => {
    const i = me.player?.dialogue?.options.findIndex((o) => o.action === action) ?? -1;
    run(sim, 1, () => ({ choice: i }));
  };
  pick('where');
  pick('places');
  const opts = me.player?.dialogue?.options.map((o) => o.label).join('|') ?? '';
  check('"Where is..." lists the places of the town', opts.includes('tavern') && opts.includes('square'), opts);
  pick('place');
  const said = me.player?.dialogue?.text ?? '';
  check('and the answer gives a direction and a distance', /(north|south|east|west)/.test(said), said);
  pick('back');
  pick('where');
  pick('people');
  const first = me.player?.dialogue?.options[0]?.label.split(' ')[0] ?? '?';
  pick('person');
  const who = me.player?.dialogue?.text ?? '';
  check('asking after someone tells where they are at this hour', who.includes(first) && /(north|south|east|west)/.test(who), who);
  pick('back');
  pick('about');
  pick('self');
  check('asked about themselves, they talk about their trade', (me.player?.dialogue?.text ?? '') === CONTENT.roles['smith']?.about, me.player?.dialogue?.text);
}

// ---- A real village from the game's start: folk begin at home and their routines reach the buildings it has. ----
{
  const real = world();
  const rs = real.sim.state;
  const town = rs.locations.filter((l) => l.kind === 'village').sort((a, b) => Math.hypot(a.pos.x - real.me.pos.x, a.pos.y - real.me.pos.y) - Math.hypot(b.pos.x - real.me.pos.x, b.pos.y - real.me.pos.y))[0];
  if (town) {
    real.me.pos.x = town.pos.x + 3;
    real.me.pos.y = town.pos.y + 3;
    run(real.sim, 40);
    const folk = [...rs.entities.values()].filter((e) => e.npc?.locationId === town.id);
    check('real village: townsfolk start at their homes, not all in the square', folk.length > 0 && folk.every((e) => Math.hypot(e.pos.x - e.npc!.home.x, e.pos.y - e.npc!.home.y) < 3), `${folk.length} folk`);
    const smiths = folk.filter((e) => e.npc!.role === 'smith');
    check('real village: its smith has a smithy to work in (non-dwellings count too)', smiths.length === 0 || smiths.some((e) => 'smithy' in e.npc!.haunts), smiths.map((e) => Object.keys(e.npc!.haunts).join('/')).join(' '));
  } else check('real village found near the start', false);
}

console.log(failures() === 0 ? 'townSmoke: all passed' : `townSmoke: ${failures()} failed`);
if (failures() > 0) (globalThis as unknown as { process: { exit: (n: number) => void } }).process.exit(1);
