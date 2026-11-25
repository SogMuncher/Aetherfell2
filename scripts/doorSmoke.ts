// DOORS: one rule for a door tile on the ground and a door leaf in a wall of the 3D layer: open, shut, burn, freeze, break
import { check, failures, flatten, gz, run, world } from './matterKit';
import { CONTENT } from '../src/content';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import { buildStructure } from '../src/sim/structures';
import { makeRng } from '../src/sim/simState';
import type { Effect, Rng } from '../src/types';

const rngOf = (seed: number): Rng => makeRng({ rng: seed });

const { sim, me } = world();
const s = sim.state;
const X = 6300;
const Y = 6300;
flatten(sim, X, Y, 16, tileCode('flagstone'));
const hit = (target: { kind: 'cell'; x: number; y: number; z: number } | { kind: 'tile'; x: number; y: number }, effects: Effect[], ticks = 2): void => {
  s.queues.effects.push({ target, effects, source: null, from: null });
  run(sim, ticks);
};
const face = (x: number, y: number, z: number, yaw: number): void => {
  me.pos.x = x;
  me.pos.y = y;
  me.z = z;
  me.vel.x = me.vel.y = 0;
  run(sim, 6, () => ({ yaw }));
  run(sim, 2, (i) => (i === 0 ? { interact: true, yaw } : { yaw }));
};

// A cottage's front door: a leaf two cells high, shut when built.
const def = CONTENT.structures['cottage'];
if (!def) throw new Error('no cottage');
const r = buildStructure(def, s.volume, { x: X, y: Y, rot: 0, ground: (x, y) => sim.tiles.ground(x, y) }, rngOf(3));
const dx = r.door.outX;
const dy = r.door.outY + 1;
const dz = r.floor;
const SHUT = shapeId('panelMid');
const OPEN = shapeId('doorOpen');
const leaf = (): number[] => [dz, dz + 1].map((z) => s.volume.shapeAt(dx, dy, z) & 63);
check('a built house has a shut door, two cells high, made of door', leaf().every((v) => v === SHUT) && s.volume.matAt(dx, dy, dz) === tileCode('door'), leaf().join(','));
face(dx + 0.5, dy - 0.5, dz, Math.PI / 2);
check('using it swings the whole leaf open', leaf().every((v) => v === OPEN), leaf().join(','));
check('an open door lets you through', !s.volume.solidBetween(dx + 0.6, dy + 0.5, dz + 0.1, dz + 1.9));
face(dx + 0.5, dy - 0.5, dz, Math.PI / 2);
check('and using it again shuts it', leaf().every((v) => v === SHUT) && s.volume.solidBetween(dx + 0.5, dy + 0.5, dz + 0.1, dz + 1.9));
hit({ kind: 'cell', x: dx, y: dy, z: dz }, [{ type: 'soak', amount: 200 }, { type: 'chill', amount: 400 }], 4);
check('a door freezes like any wall', s.volume.cellGet('frost', dx, dy, dz) > 0);
hit({ kind: 'cell', x: dx, y: dy, z: dz + 1 }, [{ type: 'damage', amount: 400, kind: 'blunt' }]);
check('battering the door breaks the whole leaf', leaf().every((v) => v === 0), leaf().join(','));

// A second cottage, to set its door alight.
const r2 = buildStructure(def, s.volume, { x: X + 10, y: Y, rot: 0, ground: (x, y) => sim.tiles.ground(x, y) }, rngOf(3));
const fx = r2.door.outX;
const fy = r2.door.outY + 1;
hit({ kind: 'cell', x: fx, y: fy, z: r2.floor }, [{ type: 'heat', amount: 1 }]);
check('a wooden door catches fire', s.volume.cellGet('fire', fx, fy, r2.floor) > 0);

// The same rule on the ground: a door tile.
const tx = X - 8;
const ty = Y - 8;
sim.tiles.setKind(tx, ty, tileCode('door'));
const tz = gz(sim, tx, ty);
check('a door tile starts shut', sim.tiles.door(tx, ty) < 128);
face(tx + 0.5, ty - 0.7, tz, Math.PI / 2);
check('using a door tile opens it', sim.tiles.door(tx, ty) > 128);
hit({ kind: 'tile', x: tx, y: ty }, [{ type: 'damage', amount: 400, kind: 'blunt' }]);
check('battering a door tile breaks it', sim.tiles.kind(tx, ty) !== tileCode('door'));

console.log(failures() === 0 ? 'door checks passed' : `${failures()} door checks FAILED`);
if (failures() > 0) throw new Error('door checks failed');
