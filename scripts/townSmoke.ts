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
const calm = (ticks: number): void => {
  for (let t = 0; t < ticks; t++) {
    run(sim, 1);
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
  calm(20 * 30);
  check('a villager walks round the wall to get home', at(v, goal, 1.8), `${Math.hypot(v.pos.x - goal.x, v.pos.y - goal.y).toFixed(1)} m off`);
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
  calm(20 * 30);
  check('from behind the pen, a villager goes round the 3D walls and in', at(v, home, 1.8), `${Math.hypot(v.pos.x - home.x, v.pos.y - home.y).toFixed(1)} m off`);
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

console.log(failures() === 0 ? 'townSmoke: all passed' : `townSmoke: ${failures()} failed`);
if (failures() > 0) (globalThis as unknown as { process: { exit: (n: number) => void } }).process.exit(1);
