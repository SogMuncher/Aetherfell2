// Checks: creatures see in 3D (height and line of sight), one "is it dark here" check, and what bodies stand in (ground and cells)
import { Simulation, createState } from '../src/sim';
import { CONTENT, isCreature, isDark, thingDef } from '../src/content';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { sense } from '../src/sim/ai/behaviours';
import type { Creature, Entity, SimContext } from '../src/types';
import { GROUND_Z, Tile, shapeByte } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const CUBE = shapeByte(shapeId('cube'), 0);
const STONE = tileCode('stoneWall');
const WOOD = tileCode('woodFloor');

function world(): { sim: Simulation; ctx: SimContext; me: Entity } {
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  const w = sim.state.weather;
  w.rain = w.rainTarget = w.wetness = 0;
  w.nextShift = 1e9;
  const ctx = (sim as unknown as { ctx: SimContext }).ctx;
  return { sim, ctx, me };
}
const X = 18000;
const Y = 18000;
function flat(sim: Simulation): number {
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) sim.tiles.setKind(X + i, Y + j, Tile.Flagstone as 0);
  for (const e of [...sim.state.entities.values()]) if (!e.player) sim.state.entities.delete(e.id);
  return sim.tiles.ground(X, Y);
}
function place(e: Entity, x: number, y: number, z: number): void {
  e.pos.x = e.prev.x = x;
  e.pos.y = e.prev.y = y;
  e.z = e.prevZ = z;
}

// ---- Sight: line of sight on the ground and through cells, height counts ----------------------
{
  const { sim, ctx, me } = world();
  const g = flat(sim);
  place(me, X + 5.5, Y + 0.5, sim.tiles.ground(X + 5.5, Y + 0.5));
  const wolf = ctx.spawn('wolf', X + 0.5, Y + 0.5);
  wolf.z = wolf.prevZ = sim.tiles.ground(X + 0.5, Y + 0.5);
  if (!isCreature(wolf)) throw new Error('wolf is no creature');
  const brain = CONTENT.brains[thingDef(CONTENT, wolf.def).brain ?? ''];
  if (!brain) throw new Error('wolf has no brain');
  sim.step();
  place(me, X + 5.5, Y + 0.5, sim.tiles.ground(X + 5.5, Y + 0.5));
  wolf.z = wolf.prevZ = sim.tiles.ground(X + 0.5, Y + 0.5);
  const sees = (): boolean => sense(ctx, wolf as Creature, brain, false).seen.some((s) => s.e === me);
  check('a wolf sees a traveller in the open', sees());
  for (let j = -2; j <= 2; j++) sim.tiles.setKind(X + 3, Y + j, STONE);
  check('a ground wall between them hides the traveller', !sees());
  for (let j = -2; j <= 2; j++) sim.tiles.setKind(X + 3, Y + j, Tile.Flagstone as 0);
  check('remove it and the wolf sees again', sees());
  const gz = Math.floor(sim.tiles.ground(X + 3.5, Y + 0.5)) - 1;
  for (let j = -2; j <= 2; j++) for (let k = 0; k < 4; k++) sim.state.volume.set(X + 3, Y + j, gz + k, CUBE, STONE);
  check('a wall of 3D cells between them hides the traveller', !sees());
  wolf.actor.lastAttacker = me.id;
  check('but whoever just hurt it is noticed anyway', sees());
  wolf.actor.lastAttacker = null;
  for (let j = -2; j <= 2; j++) for (let k = 0; k < 4; k++) sim.state.volume.set(X + 3, Y + j, gz + k, 0, 0);
  place(me, X + 0.5, Y + 0.5, g + 30);
  const s = sense(ctx, wolf as Creature, brain, false).seen.find((o) => o.e === me);
  check('height counts: someone high straight above is far, not beside it', !s || s.d > 25, `d ${s?.d.toFixed(1)}`);
}

// ---- Dark: one check, underworld always dark ---------------------------------------------------
{
  check('the surface is light at noon', !isDark(CONTENT, 'surface', 0.5));
  check('the surface is dark at midnight', isDark(CONTENT, 'surface', 0));
  check('the underworld is dark even at noon', isDark(CONTENT, 'underworld', 0.5));
}

// ---- Standing in: the same rules for a ground tile and a cell underfoot -------------------------
function standIn(cell: boolean, field: 'fire' | 'wet', status: string): boolean {
  const { sim, ctx, me } = world();
  const gz = Math.floor(flat(sim)) + 3;
  if (cell) {
    sim.state.volume.set(X, Y, gz, CUBE, WOOD);
    place(me, X + 0.5, Y + 0.5, gz + 1);
  } else {
    sim.tiles.setKind(X, Y, tileCode('grass'));
    place(me, X + 0.5, Y + 0.5, sim.tiles.ground(X + 0.5, Y + 0.5));
  }
  for (let i = 0; i < 40; i++) {
    ctx.matter.set(field, X, Y, cell ? gz : GROUND_Z, 255);
    if (cell) place(me, X + 0.5, Y + 0.5, gz + 1);
    sim.step();
    if ((me.status[status] ?? 0) > 0) return true;
  }
  return false;
}
check('standing on burning ground sets you alight', standIn(false, 'fire', 'burning'));
check('standing on a burning floor cell sets you alight', standIn(true, 'fire', 'burning'));
check('standing in a puddle on the ground soaks you', standIn(false, 'wet', 'wet'));
check('standing on a soaked floor cell soaks you', standIn(true, 'wet', 'wet'));

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
if (failed > 0) throw new Error('senseSmoke failed');
