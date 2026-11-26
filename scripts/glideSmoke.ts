// GLIDERS: each cloth flies its own way (data): burlap only slows your fall, wyvern hide soars, dives and climbs; off ground and off a 3D cell
import type { Entity } from '../src/types';
import { bagOf, shapeByte } from '../src/types';
import { SHAPE_CUBE } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import type { Simulation } from '../src/sim';
import { check, failures, run, world } from './smokeKit';

const TIERS = ['burlapGlider', 'glider', 'silkGlider', 'wyvernGlider'];

function carry(me: Entity, id: string): void {
  const bag = bagOf(me);
  bag.length = 0;
  bag.push({ id, count: 1 });
}

/** Fly a glider high over open ground: level, then a dive, then a pull-up. */
function flight(id: string): { sink: number; dive: number; climb: number } {
  const { sim, me } = world();
  carry(me, id);
  me.angle = 0;
  me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y) + 400;
  me.vz = -1;
  run(sim, 60, { jumpHeld: true, forward: 1 });
  const z0 = me.z;
  run(sim, 20, { jumpHeld: true, forward: 1 });
  const sink = (z0 - me.z) / 1;
  run(sim, 80, { jumpHeld: true, forward: 1, pitch: -1 });
  const dive = Math.hypot(me.vel.x, me.vel.y, me.vz);
  const z1 = me.z;
  run(sim, 30, { jumpHeld: true, forward: 1, pitch: 1 });
  return { sink, dive, climb: me.z - z1 };
}

const f = TIERS.map(flight);
for (let i = 0; i < TIERS.length; i++) console.log(`  ${TIERS[i]}: sinks ${f[i].sink.toFixed(1)} m/s, dives to ${f[i].dive.toFixed(1)} m/s, pull-up ${f[i].climb.toFixed(1)} m`);
check('every glider opens and slows the fall', f.every((x) => x.sink > 0 && x.sink < 3.5));
check('burlap only drifts: a dive gains little and pulling up never climbs', f[0].dive < 12 && f[0].climb < 0);
check('wyvern hide soars: a dive builds real speed and pulling up turns it into height', f[3].dive > 25 && f[3].climb > 3);
check('each better cloth dives faster', f.every((x, i) => i === 0 || x.dive > f[i - 1].dive));

// Off a 3D cell: step off a high stone ledge with jump held and the glider carries you out.
{
  const { sim, me } = world();
  carry(me, 'glider');
  ledgeGlide(sim, me);
}
if (failures()) throw new Error(`${failures()} glide check(s) failed`);

function ledgeGlide(sim: Simulation, me: Entity): void {
  const x = Math.floor(me.pos.x);
  const y = Math.floor(me.pos.y);
  const top = Math.floor(sim.tiles.ground(x, y)) + 30;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) sim.state.volume.set(x + i, y + j, top - 1, shapeByte(SHAPE_CUBE, 0), tileCode('flagstone'));
  me.z = me.prevZ = top;
  me.angle = 0;
  run(sim, 10);
  const stood = Math.abs(me.z - top) < 0.3;
  run(sim, 40, { jumpHeld: true, forward: 1 });
  const out = me.pos.x - x;
  check('stepping off a 3D ledge, the glider opens and carries you out', stood && !!me.player?.gliding && out > 8 && me.z > top - 12, `stood ${stood}, ${out.toFixed(1)} m out, ${(top - me.z).toFixed(1)} m down`);
}
