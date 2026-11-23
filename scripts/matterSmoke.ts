// MATTER: ground tiles and cells of the 3D layer obey the same rules. Rain wets what it reaches and a roof keeps it
// off, frost and oil, blows break walls, a bolt does not fly through a house, saves and sends. (Fire: matterFireSmoke.ts.)
import { Simulation } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { VolumeStore } from '../src/sim/world/volume';
import type { SimEvent } from '../src/types';
import { GROUND_Z, Tile, brickKey, spotKey, unpackSpot } from '../src/types';
import { CUBE, STONE, THATCH, WOOD, check, failures, flatten, gz, run, types, world } from './matterKit';

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

// ---- Cold freezes only what is wet: ground and cells, bodies too -------------------------------
{
  const { sim, me } = world();
  const X = 6100;
  const Y = 6100;
  flatten(sim, X, Y, 6, Tile.Grass);
  const chill = (x: number, y: number, z: number): void => {
    sim.state.queues.effects.push({ target: z === GROUND_Z ? { kind: 'tile', x: x + 0.5, y: y + 0.5 } : { kind: 'cell', x, y, z }, effects: [{ type: 'chill', amount: 1 }], source: null, from: null });
    run(sim, 1);
  };
  sim.state.weather.wetness = 0.0005; // the faint damp left long after rain is not enough to freeze
  chill(X, Y, GROUND_Z);
  check('dry ground is only cold, not frozen', sim.matter.info(X, Y, GROUND_Z)?.id === 'grass' && sim.matter.get('frost', X, Y, GROUND_Z) === 0);
  sim.matter.set('wet', X + 1, Y, GROUND_Z, 255);
  chill(X + 1, Y, GROUND_Z);
  check('wet ground frosts over but stays grass', sim.matter.info(X + 1, Y, GROUND_Z)?.id === 'grass' && sim.matter.get('frost', X + 1, Y, GROUND_Z) > 200);
  sim.state.temp.set(spotKey(X + 1, Y, GROUND_Z), 0); // skip the wait: it is back to its surroundings
  run(sim, 400);
  check('the frost thaws back into wet grass', sim.matter.get('frost', X + 1, Y, GROUND_Z) === 0 && sim.matter.info(X + 1, Y, GROUND_Z)?.id === 'grass' && sim.matter.get('wet', X + 1, Y, GROUND_Z) > 0);
  const z = gz(sim, X, Y) + 1;
  sim.state.volume.set(X + 3, Y, z, CUBE, STONE);
  chill(X + 3, Y, z);
  check('a dry wall is not frozen', sim.matter.info(X + 3, Y, z)?.id === 'stoneWall' && sim.matter.get('frost', X + 3, Y, z) === 0);
  const brick = (): number => sim.state.volume.bricks.get(brickKey((X + 3) >> 4, Y >> 4, z >> 4))?.rev ?? -1;
  const rev0 = brick();
  sim.matter.set('wet', X + 3, Y, z, 255);
  const rev1 = brick();
  chill(X + 3, Y, z);
  check('a wet wall frosts over and stays a stone wall', sim.matter.info(X + 3, Y, z)?.id === 'stoneWall' && sim.matter.get('frost', X + 3, Y, z) > 200);
  check('wetting and frosting a wall tell the renderer to redraw its brick', rev1 > rev0 && brick() > rev1, `${rev0} ${rev1} ${brick()}`);
  // It was chilled twice, so it takes two torches: the first only brings it back up to the cold of the air.
  for (let i = 0; i < 2; i++) {
    sim.state.queues.effects.push({ target: { kind: 'cell', x: X + 3, y: Y, z }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
    run(sim, 1);
  }
  check('and heat thaws it back to what it was', sim.matter.info(X + 3, Y, z)?.id === 'stoneWall' && sim.matter.get('frost', X + 3, Y, z) === 0);
  me.status = {};
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'chill', amount: 1 }], source: null, from: null });
  run(sim, 1);
  check('a dry body is only chilled', (me.status.chilled ?? 0) > 0 && !(me.status.frozen ?? 0));
  me.status = { wet: 100 };
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'chill', amount: 1 }], source: null, from: null });
  run(sim, 1);
  check('a wet body freezes', (me.status.frozen ?? 0) > 0 && !(me.status.wet ?? 0));
}

// ---- Heat is temperature: it dries wet stuff first, then burns it; it settles back by itself ---
{
  const { sim } = world();
  const X = 6300;
  const Y = 6300;
  flatten(sim, X, Y, 6, Tile.Grass);
  sim.state.weather.wetness = 0;
  sim.state.weather.rain = 0;
  const z = gz(sim, X, Y) + 1;
  sim.state.volume.set(X + 3, Y, z, CUBE, WOOD);
  const heat = (x: number, y: number, zz: number): void => {
    sim.state.queues.effects.push({ target: zz === GROUND_Z ? { kind: 'tile', x: x + 0.5, y: y + 0.5 } : { kind: 'cell', x, y, z: zz }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
    run(sim, 1);
  };
  for (const [x, zz, what] of [[X, GROUND_Z, 'wet grass'], [X + 3, z, 'a wet timber wall']] as const) {
    sim.matter.set('wet', x, Y, zz, 255);
    heat(x, Y, zz);
    check(`one torch on ${what} dries it a little but does not light it`, sim.matter.get('fire', x, Y, zz) === 0 && sim.matter.get('wet', x, Y, zz) < 255 && sim.matter.get('wet', x, Y, zz) > 0);
    heat(x, Y, zz);
    heat(x, Y, zz);
    check(`keep the heat on and ${what} dries out and burns`, sim.matter.get('wet', x, Y, zz) === 0 && sim.matter.get('fire', x, Y, zz) > 0);
  }
  sim.matter.set('wet', X + 1, Y + 2, GROUND_Z, 0);
  sim.state.queues.effects.push({ target: { kind: 'tile', x: X + 1.5, y: Y + 2.5 }, effects: [{ type: 'heat', amount: 0.5 }], source: null, from: null });
  run(sim, 1);
  check('a spark warms dry grass without lighting it', sim.matter.get('temp', X + 1, Y + 2, GROUND_Z) > 0 && sim.matter.get('fire', X + 1, Y + 2, GROUND_Z) === 0);
  run(sim, 1500);
  check('and the warmth fades back to the surroundings', sim.matter.get('temp', X + 1, Y + 2, GROUND_Z) === 0 && !sim.state.temp.has(spotKey(X + 1, Y + 2, GROUND_Z)));
}

console.log(failures() === 0 ? 'matter checks passed' : `${failures()} matter checks FAILED`);
if (failures() > 0) throw new Error('matter checks failed');
