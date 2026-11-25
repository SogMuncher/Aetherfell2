// FINE CELLS: a 3D cell split into 2 x 2 x 2 half-metre cells; the shape palette, splitting, standing, saving, fire on ground and cell
import { CUBE, STONE, THATCH, WOOD, check, failures, flatten, world } from './matterKit';
import { tileCode } from '../src/content/tiles';
import { SHAPES, SHAPE_FINE, SHAPE_LEDGER, SHAPE_SAMPLES, SHAPE_TOP, shapeId, splitShape } from '../src/content/shapes';
import { VolumeStore } from '../src/sim/world/volume';
import { shapeByte } from '../src/types';

// The palette: every shape is something solid, and the shapes that are open below are open below.
const empty = SHAPE_LEDGER.filter((id) => id !== 'fine' && ![...Array(SHAPE_SAMPLES * SHAPE_SAMPLES).keys()].some((s) => !Number.isNaN(SHAPE_TOP[shapeId(id) * SHAPE_SAMPLES * SHAPE_SAMPLES + s] ?? Number.NaN)));
check(`all ${SHAPE_LEDGER.length - 1} shapes have something to stand on`, empty.length === 0 && Object.keys(SHAPES).length === SHAPE_LEDGER.length, empty.join(', '));

// A whole ramp split into halves: a small ramp at the foot, a block behind it, a small ramp on top of that.
const ramp = shapeByte(shapeId('ramp'), 0);
const halves = splitShape(ramp);
check('a ramp splits into small ramps and a block', halves[0] === ramp && halves[1] === CUBE && halves[4] === 0 && halves[5] === ramp && halves[2] === ramp && halves[7] === ramp, [...halves].join(','));

const v = new VolumeStore();
v.set(10, 10, 10, CUBE, WOOD);
v.setFine(21, 21, 21, 0, 0);
check('taking one half-metre out of a block splits it', (v.shapeAt(10, 10, 10) & 63) === SHAPE_FINE && v.matAt(10, 10, 10) === WOOD && v.fineAt(20, 20, 20) === CUBE);
check('you stand half a metre lower where the half is gone', Math.abs(v.floorBelow(10.75, 10.75, 12) - 10.5) < 1e-6 && Math.abs(v.floorBelow(10.25, 10.25, 12) - 11) < 1e-6, `${v.floorBelow(10.75, 10.75, 12)} / ${v.floorBelow(10.25, 10.25, 12)}`);
v.set(12, 10, 10, CUBE, WOOD);
v.setFine(24, 20, 20, 0, 0);
check('and you bump your head on the underside of a half above', Math.abs(v.ceilingAbove(12.25, 10.25, 10) - 10.5) < 1e-6 && v.solidBetween(12.25, 10.25, 10.6, 10.9) && !v.solidBetween(12.25, 10.25, 10.1, 10.4));
v.set(12, 10, 10, 0, 0);
const copy = new VolumeStore();
for (const b of v.allBricks()) copy.importBrick(b);
check('fine cells are saved and sent with their brick', copy.fineAt(21, 21, 21) === 0 && copy.fineAt(21, 21, 20) === CUBE && Math.abs(copy.floorBelow(10.75, 10.75, 12) - 10.5) < 1e-6);
v.set(10, 10, 10, shapeByte(SHAPE_FINE, 0), STONE);
check('a split cell turned to other stuff (burnt, frozen) turns all its halves', v.fineMatAt(20, 20, 20) === STONE && v.fineMatAt(21, 20, 20) === STONE);
v.setFine(21, 21, 21, CUBE, STONE);
check('eight blocks of one stuff join back into a whole block', v.shapeAt(10, 10, 10) === CUBE && v.fineAt(20, 20, 20) === 0);
v.setFine(20, 20, 20, 0, 0);
v.set(10, 10, 10, 0, 0);
check('clearing a split cell clears its halves', v.shapeAt(10, 10, 10) === 0 && v.fineAt(21, 21, 21) === 0 && v.floorBelow(10.5, 10.5, 12) === -Infinity);

// Fire: the ground under a split timber cell sets it alight; the cell keeps one fire for all its halves, like a tile.
const { sim, me } = world();
const s = sim.state;
const gx = 6200;
const gy = 6200;
flatten(sim, gx, gy, 10, tileCode('flagstone'));
void me;
const gz = Math.floor(sim.tiles.ground(gx + 0.5, gy + 0.5));
s.volume.set(gx, gy, gz, CUBE, THATCH);
s.volume.setFine(gx * 2 + 1, gy * 2 + 1, gz * 2 + 1, 0, 0);
// Spread is chancy, so a whole strip of dry brush burns beside it: the check is about the split cell catching.
for (let y = -1; y <= 1; y++) {
  for (const x of [gx - 1, gx + 1]) {
    sim.tiles.setKind(x, gy + y, tileCode('brush'));
    s.queues.effects.push({ target: { kind: 'tile', x, y: gy + y }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  }
}
for (let i = 0; i < 1200 && s.volume.cellGet('fire', gx, gy, gz) === 0; i++) sim.step();
check('burning ground next door sets a split thatch cell alight', s.volume.cellGet('fire', gx, gy, gz) > 0 && (s.volume.shapeAt(gx, gy, gz) & 63) === SHAPE_FINE);
const cell = { kind: 'cell' as const, x: gx, y: gy, z: gz + 2 };
s.volume.set(gx, gy, gz + 2, CUBE, WOOD);
s.volume.setFine(gx * 2, gy * 2, (gz + 2) * 2, 0, 0);
s.queues.effects.push({ target: cell, effects: [{ type: 'soak', amount: 200 }, { type: 'chill', amount: 400 }], source: null, from: null });
for (let i = 0; i < 4; i++) sim.step();
check('and a split cell freezes like any other', s.volume.cellGet('frost', gx, gy, gz + 2) > 0);

console.log(failures() === 0 ? 'fine cell checks passed' : `${failures()} fine cell checks FAILED`);
if (failures() > 0) throw new Error('fine cell checks failed');
