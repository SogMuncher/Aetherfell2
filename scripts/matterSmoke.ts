// MATTER: ground tiles and cells of the 3D layer obey the same rules. A timber wall burns like brush,
// thatch catches from burning grass, rain wets what it reaches and a roof keeps it off, blows break
// walls, a bolt does not fly through a house, and what happened to a wall is saved and sent to friends.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { VolumeStore } from '../src/sim/world/volume';
import type { Entity, InputSnapshot, SimEvent } from '../src/types';
import { GROUND_Z, Tile, emptyInput, shapeByte, spotKey, unpackSpot } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const CUBE = shapeByte(shapeId('cube'), 0);
const WOOD = tileCode('woodWall');
const STONE = tileCode('stoneWall');
const THATCH = tileCode('thatch');

function world(seed = 4242): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(seed));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  const w = sim.state.weather;
  w.rain = w.rainTarget = w.wetness = 0;
  w.wind = { x: 0, y: 0 };
  w.windTarget = { x: 0, y: 0 };
  w.nextShift = 1e9;
  return { sim, me };
}
function flatten(sim: Simulation, x: number, y: number, r: number, kind: number): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, kind);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < 60) sim.state.entities.delete(e.id);
  // Fires far from every player sleep, so keep the tester near the scene.
  for (const e of sim.state.entities.values()) if (e.player && Math.hypot(e.pos.x - x, e.pos.y - y) > 60) { e.pos.x = x + 30; e.pos.y = y + 30; }
}
function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    for (const e of sim.step()) seen.push(e);
  }
  return seen;
}
const gz = (sim: Simulation, x: number, y: number): number => Math.floor(sim.tiles.ground(x + 0.5, y + 0.5));
const types = (ev: SimEvent[]): string[] => ev.map((e) => e.type);

check('content still validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

// ---- One way to ask about matter --------------------------------------------------------------
{
  const { sim } = world();
  const m = sim.matter;
  const X = 6000;
  const Y = 6000;
  flatten(sim, X, Y, 12, Tile.Flagstone);
  const z = gz(sim, X, Y);
  sim.state.volume.set(X + 3, Y, z, CUBE, WOOD);
  check('a cell and a ground tile are asked the same way', m.info(X + 3, Y, z)?.id === 'woodWall' && m.info(X, Y, GROUND_Z)?.id === 'flagstone');
  check('an empty cell is nothing', m.info(X + 5, Y, z) === null && m.kind(X + 5, Y, z) === -1);
  m.set('wet', X + 3, Y, z, 90);
  m.set('wet', X, Y, GROUND_Z, 70);
  check('wetness is stored for both', m.get('wet', X + 3, Y, z) === 90 && m.get('wet', X, Y, GROUND_Z) === 70);
  check('damp spots are counted for both', m.damp().includes(spotKey(X + 3, Y, z)) && m.damp().includes(spotKey(X, Y, GROUND_Z)));
  check('fuel of a fresh cell is its material\'s fuel', m.get('fuel', X + 3, Y, z) === CONTENT.tiles[WOOD]?.fuel);
  const k = unpackSpot(spotKey(-37, 12001, 54));
  check('spot keys round-trip', k.x === -37 && k.y === 12001 && k.z === 54);
  const g = unpackSpot(spotKey(5, -9, GROUND_Z));
  check('ground spots round-trip', g.x === 5 && g.y === -9 && g.z === GROUND_Z);
}

// ---- Fire in a timber wall, and from grass to thatch to wall ------------------------------------
{
  const { sim } = world();
  const X = 6100;
  const Y = 6100;
  flatten(sim, X, Y, 14, Tile.Flagstone);
  const z = gz(sim, X, Y);
  // A little lean-to: timber posts with a thatched roof, next to dry brush.
  for (let y = 0; y < 3; y++) {
    sim.state.volume.set(X + 4, Y + y, z, CUBE, WOOD);
    sim.state.volume.set(X + 4, Y + y, z + 1, CUBE, WOOD);
    sim.state.volume.set(X + 4, Y + y, z + 2, CUBE, THATCH);
    sim.tiles.setKind(X + 3, Y + y, Tile.Brush);
    sim.tiles.setKind(X + 2, Y + y, Tile.Brush);
  }
  // Spread is chancy, so light the whole brush strip: the check is about thatch and timber catching, not about luck.
  for (let y = 0; y < 3; y++) sim.state.queues.effects.push({ target: { kind: 'tile', x: X + 2, y: Y + y }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  let peak = 0;
  let ignited = 0;
  let burntOut = 0;
  for (let t = 0; t < 20 * 60; t++) {
    for (const e of sim.step()) {
      if (e.type === 'ignited' && e.z !== undefined && e.z !== GROUND_Z) ignited++;
      if (e.type === 'burntOut' && e.z !== undefined && e.z !== GROUND_Z) burntOut++;
    }
    peak = Math.max(peak, sim.state.volume.burningCells.size);
  }
  check('burning grass sets the thatch and timber alight', peak > 0 && ignited > 0, `peak ${peak} cells, ${ignited} ignitions`);
  check('and they burn away, leaving ash on the ground', burntOut > 0 && sim.state.volume.shapeAt(X + 4, Y + 1, z + 2) === 0, `${burntOut} cells burnt out`);
  check('the cells that burned are gone from the volume (not left as ghosts)', ![...sim.state.volume.burningCells].some((k) => sim.state.volume.shapeAt(unpackSpot(k).x, unpackSpot(k).y, unpackSpot(k).z) === 0));
  let ash = 0;
  for (let y = 0; y < 3; y++) if (sim.tiles.kind(X + 4, Y + y) === tileCode('ash')) ash++;
  check('a wall that stood on the ground leaves ash where it stood', ash > 0, `${ash} ash tiles`);
}

// ---- Fire climbs: a burning floor lights the wall above, not the other way round as easily ----------
{
  const { sim } = world();
  const X = 6210;
  const Y = 6210;
  flatten(sim, X, Y, 8, Tile.Flagstone);
  const z = gz(sim, X, Y);
  for (let k = 0; k < 4; k++) sim.state.volume.set(X, Y, z + k, CUBE, THATCH);
  sim.state.queues.effects.push({ target: { kind: 'cell', x: X, y: Y, z }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  let topFirst = 0;
  let bottomLast = 0;
  for (let t = 0; t < 20 * 40; t++) {
    sim.step();
    if (!topFirst && sim.matter.get('fire', X, Y, z + 2) > 0) topFirst = t;
    if (!bottomLast && sim.matter.get('fire', X, Y, z + 3) > 0) bottomLast = t;
  }
  check('fire climbs a column of thatch', topFirst > 0 && bottomLast > 0, `reached z+2 at tick ${topFirst}, z+3 at ${bottomLast}`);
}

// ---- Rain, and a roof against it ----------------------------------------------------------------
{
  const { sim } = world();
  const X = 6300;
  const Y = 6300;
  flatten(sim, X, Y, 10, Tile.Flagstone);
  const z = gz(sim, X, Y);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sim.state.volume.set(X + i, Y + j, z + 3, CUBE, THATCH);
  const w = sim.state.weather;
  w.rain = w.rainTarget = 0.9;
  w.wetness = 0.9;
  check('open ground is soaked by the weather', sim.matter.wetness(X + 6, Y, GROUND_Z) > 200);
  check('ground under a roof is not', sim.matter.wetness(X, Y, GROUND_Z) < 30, String(sim.matter.wetness(X, Y, GROUND_Z)));
  check('the roof itself is soaked', sim.matter.wetness(X, Y, z + 3) > 200);
  check('wet thatch will not catch', (() => {
    sim.state.queues.effects.push({ target: { kind: 'cell', x: X, y: Y, z: z + 3 }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
    sim.step();
    return sim.matter.get('fire', X, Y, z + 3) === 0;
  })());
  w.rain = w.rainTarget = 0;
  w.wetness = 0;
  // Soak a burning cell: it goes out and holds the water.
  sim.state.queues.effects.push({ target: { kind: 'cell', x: X, y: Y, z: z + 3 }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  sim.step();
  const lit = sim.matter.get('fire', X, Y, z + 3) > 0;
  sim.state.queues.effects.push({ target: { kind: 'area', x: X + 0.5, y: Y + 0.5, z: z + 3.5, radius: 3 }, effects: [{ type: 'soak', amount: 1 }], source: null, from: null });
  sim.step();
  check('a splash puts out a burning roof and wets it', lit && sim.matter.get('fire', X, Y, z + 3) === 0 && sim.matter.get('wet', X, Y, z + 3) > 200);
  const before = sim.matter.get('wet', X, Y, z + 3);
  run(sim, 20 * 20);
  check('what is wet dries again', sim.matter.get('wet', X, Y, z + 3) < before, `${before} → ${sim.matter.get('wet', X, Y, z + 3)}`);
}

// ---- Frost and oil work on walls too -------------------------------------------------------------
{
  const { sim } = world();
  const X = 6400;
  const Y = 6400;
  flatten(sim, X, Y, 8, Tile.Flagstone);
  const z = gz(sim, X, Y);
  sim.state.volume.set(X, Y, z, CUBE, STONE);
  sim.state.queues.effects.push({ target: { kind: 'area', x: X + 0.5, y: Y + 0.5, z: z + 0.5, radius: 2 }, effects: [{ type: 'coat', liquid: 'oil', amount: 2 }], source: null, from: null });
  sim.step();
  check('oil spilled in a ball coats the wall as it coats the floor', sim.matter.get('oil', X, Y, z) > 0 && sim.matter.get('oil', X + 1, Y, GROUND_Z) > 0);
  sim.state.queues.effects.push({ target: { kind: 'cell', x: X, y: Y, z }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  sim.step();
  check('oiled stone burns (oil burns whatever it is on)', sim.matter.get('fire', X, Y, z) > 0);
  run(sim, 20 * 30);
  check('and the oil burns off, leaving the stone standing and sooty', sim.state.volume.shapeAt(X, Y, z) !== 0 && sim.matter.get('oil', X, Y, z) === 0);
}

// ---- Blows ---------------------------------------------------------------------------------------
{
  const { sim } = world();
  const X = 6500;
  const Y = 6500;
  flatten(sim, X, Y, 10, Tile.Flagstone);
  const z = gz(sim, X, Y);
  sim.state.volume.set(X, Y, z, CUBE, WOOD);
  sim.state.volume.set(X + 2, Y, z, CUBE, STONE);
  const hit = (x: number, dmg: number): SimEvent[] => {
    sim.state.queues.effects.push({ target: { kind: 'cell', x, y: Y, z }, effects: [{ type: 'damage', amount: dmg, kind: 'cut' }], source: null, from: { x: X - 2, y: Y }, swing: 'overhead' });
    return sim.step();
  };
  let n = 0;
  let broke: SimEvent[] = [];
  while (sim.state.volume.shapeAt(X, Y, z) !== 0 && n < 60) {
    broke = hit(X, 40);
    n++;
  }
  check('axe blows break a timber wall', sim.state.volume.shapeAt(X, Y, z) === 0 && n > 2 && n < 30, `${n} blows`);
  check('with a break event at the right height', broke.some((e) => e.type === 'tileBroken' && e.z === z));
  for (let i = 0; i < 10; i++) hit(X + 2, 40);
  check('but a stone wall shrugs off cuts', sim.state.volume.shapeAt(X + 2, Y, z) !== 0 && sim.matter.get('wear', X + 2, Y, z) > 0, `wear ${sim.matter.get('wear', X + 2, Y, z)}`);
  const w0 = sim.matter.get('wear', X + 2, Y, z);
  run(sim, 20 * 60);
  check('wear mends', sim.matter.get('wear', X + 2, Y, z) < w0);
  // A heavy burst (blunt, no swing) batters everything near it.
  sim.state.volume.set(X, Y + 3, z, CUBE, WOOD);
  sim.state.queues.effects.push({ target: { kind: 'area', x: X + 0.5, y: Y + 3.5, z: z + 0.5, radius: 2 }, effects: [{ type: 'damage', amount: 300, kind: 'blunt' }], source: null, from: { x: X + 0.5, y: Y + 3.5 } });
  sim.step();
  check('an explosion of blunt force breaks a wall without a swing', sim.state.volume.shapeAt(X, Y + 3, z) === 0);
}

// ---- A bolt does not fly through a house -----------------------------------------------------------
{
  const { sim, me } = world();
  const X = 6600;
  const Y = 6600;
  flatten(sim, X, Y, 14, Tile.Flagstone);
  const z = gz(sim, X, Y);
  for (let k = 0; k < 3; k++) for (let j = -2; j <= 2; j++) sim.state.volume.set(X + 4, Y + j, z + k, CUBE, WOOD);
  me.pos.x = me.prev.x = X + 0.5;
  me.pos.y = me.prev.y = Y + 0.5;
  me.z = me.prevZ = z;
  me.angle = 0;
  me.vel.x = me.vel.y = me.vz = 0;
  if (me.player) me.player.mana = me.player.maxMana;
  run(sim, 1, () => ({ prepare: ['ember'] }));
  const ev = run(sim, 1, () => ({ cast: true, pitch: 0 }));
  const bursts = run(sim, 30);
  const burstAt = [...ev, ...bursts].find((e) => e.type === 'spellBurst');
  check('an ember bolt bursts on the wall, not behind it', !!burstAt && burstAt.type === 'spellBurst' && burstAt.x < X + 4.2, burstAt && burstAt.type === 'spellBurst' ? `burst at x+${(burstAt.x - X).toFixed(1)}` : 'no burst');
  let lit = false;
  for (let j = -2; j <= 2; j++) for (let k = 0; k < 3; k++) if (sim.matter.get('fire', X + 4, Y + j, z + k) > 0 || sim.matter.get('soot', X + 4, Y + j, z + k) > 0) lit = true;
  check('and sets the timber alight', lit || types([...ev, ...bursts]).includes('burntOut'));
}

// ---- Saved, sent, restored -----------------------------------------------------------------------
{
  const { sim } = world();
  const X = 6700;
  const Y = 6700;
  flatten(sim, X, Y, 8, Tile.Flagstone);
  const z = gz(sim, X, Y);
  sim.state.volume.set(X, Y, z, CUBE, WOOD);
  sim.state.volume.set(X + 1, Y, z, CUBE, WOOD);
  sim.matter.set('wet', X + 1, Y, z, 120);
  sim.matter.set('soot', X + 1, Y, z, 200);
  sim.matter.set('oil', X + 1, Y, z, 60);
  sim.matter.set('fire', X, Y, z, 180);
  check('fire in a cell is tracked', sim.state.volume.burningCells.has(spotKey(X, Y, z)));
  const loaded = Simulation.fromSave(sim.save());
  check('a save keeps what happened to the walls', !!loaded && loaded.matter.get('wet', X + 1, Y, z) === 120 && loaded.matter.get('soot', X + 1, Y, z) === 200 && loaded.matter.get('oil', X + 1, Y, z) === 60 && loaded.matter.get('fire', X, Y, z) === 180);
  check('and the fires, so they burn on', !!loaded && loaded.state.volume.burningCells.has(spotKey(X, Y, z)) && loaded.state.volume.dampCells.has(spotKey(X + 1, Y, z)));
  // A friend receives the brick.
  const friend = new VolumeStore();
  for (const b of sim.state.volume.takeDirty()) friend.importBrick(sim.state.volume.exportBrick(b));
  check('a friend hears of them in the brick that carries the wall', friend.cellGet('soot', X + 1, Y, z) === 200 && friend.burningCells.has(spotKey(X, Y, z)));
  sim.matter.set('fire', X, Y, z, 0);
  for (const b of sim.state.volume.takeDirty()) friend.importBrick(sim.state.volume.exportBrick(b));
  check('and when the fire is out', !friend.burningCells.has(spotKey(X, Y, z)));
}

console.log(failed === 0 ? 'matter checks passed' : `${failed} matter checks FAILED`);
if (failed > 0) throw new Error('matter checks failed');
