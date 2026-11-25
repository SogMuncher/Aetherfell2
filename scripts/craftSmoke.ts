// CRAFTS: the airship is cells of the 3D layer flown as one frame: decks hold you up and carry you, stations, fuel, wind, thin air, plank, hold, horn
import { check, failures, world } from './matterKit';
import { aboard } from '../src/sim/craft/craftMotion';
import { CONTENT, thingDef } from '../src/content';
import type { Entity, InputSnapshot, SimEvent } from '../src/types';
import { countItem, emptyInput } from '../src/types';

const { sim, me } = world();
let seq = 0;
/** Steps with inputs numbered on from the last (the host drops inputs older than one it has seen). */
function run(_: unknown, ticks: number, input?: (i: number) => Partial<InputSnapshot>): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(++seq, 0), ...(input ? input(i) : {}) } });
    seen.push(...sim.step());
  }
  return seen;
}
const s = sim.state;
const bag = (): { id: string; count: number }[] => me.actor?.inventory ?? [];
check('a sky horn is in the starting bag', countItem(bag(), 'skyHorn') === 1);
run(sim, 1, () => ({ useItem: 'skyHorn' }));
const ship = [...s.entities.values()].find((e) => e.craft);
check('blowing the horn calls (makes) an airship heading for you', !!ship?.craft?.goal);
if (!ship?.craft) throw new Error('no ship');
const cd = thingDef(CONTENT, ship.def).craft;
if (!cd) throw new Error('no craft def');
const fit = (thing: string): Entity => {
  const f = [...s.entities.values()].find((e) => e.def === thing && e.ride?.craft === ship.id);
  if (!f) throw new Error(`no ${thing}`);
  return f;
};
const wheel = fit('shipWheel');
const tank = fit('fuelTank');
const throttle = fit('throttleLever');
check('its stations, hold and plank are fitted aboard', !!fit('altitudeLever') && !!fit('shipHold') && !!fit('launchPlank'));

// Park it over the tester, high up, fuelled, with nothing set.
const park = (z: number): void => {
  if (!ship.craft) return;
  ship.craft.goal = null;
  ship.pos.x = me.pos.x;
  ship.pos.y = me.pos.y;
  ship.z = z;
  ship.angle = 0;
  ship.craft.vel = { x: 0, y: 0 };
  ship.craft.vz = 0;
  for (const e of s.entities.values()) if (e.ride?.craft === ship.id && e.control && e !== tank) e.control.v = 0;
  if (tank.control) tank.control.v = 600;
  run(sim, 1);
};
const ground = sim.tiles.ground(me.pos.x, me.pos.y);
park(ground + 40);
const stand = (lx: number, ly: number, dz: number): void => {
  const at = aboard(ship, cd, lx, ly);
  me.pos.x = at.x;
  me.pos.y = at.y;
  me.z = ship.z + dz + 0.05;
  me.vz = 0;
  me.vel = { x: 0, y: 0 };
  // Falls between the checks may have knocked the tester down.
  if (me.player) me.player.downed = 0;
  me.hp = me.maxHp;
};
stand(8, 6, 4);
run(sim, 20);
check('the main deck holds you up in the air', Math.abs(me.z - (ship.z + 4)) < 0.1, `${(me.z - ship.z).toFixed(2)} m above the keel`);
const vol = s.volume;
const lowStep = aboard(ship, cd, 3.25, 0.5);
const highStep = aboard(ship, cd, 8.25, 3);
check('stairs rise the right way (boarding stair, stern stair)', Math.abs(vol.floorOn(ship.id, lowStep.x, lowStep.y, ship.z + 3) - ship.z - 0.5) < 0.01 && Math.abs(vol.floorOn(ship.id, highStep.x, highStep.y, ship.z + 7) - ship.z - 5) < 0.01, `${(vol.floorOn(ship.id, lowStep.x, lowStep.y, ship.z + 3) - ship.z).toFixed(2)} / ${(vol.floorOn(ship.id, highStep.x, highStep.y, ship.z + 7) - ship.z).toFixed(2)}`);

// Down the hatch stair into the hold and back up: the deck above leaves head room all the way.
const origin = aboard(ship, cd, 0, 0);
stand(15, 5, 4);
run(sim, 60, () => ({ forward: 1, yaw: Math.PI }));
const downAt = me.pos.x - origin.x;
check('you can walk down the hatch stair into the hold', Math.abs(me.z - ship.z - 1) < 0.1 && downAt < 11, `at x ${downAt.toFixed(1)}, ${(me.z - ship.z).toFixed(2)} m above the keel`);
stand(8, 5, 1);
for (let i = 0; i < 80 && me.pos.x - origin.x < 15; i++) run(sim, 1, () => ({ forward: 1, yaw: 0 }));
const upAt = me.pos.x - origin.x;
check('and back up it onto the deck', Math.abs(me.z - ship.z - 4) < 0.1 && upAt > 14, `at x ${upAt.toFixed(1)}, ${(me.z - ship.z).toFixed(2)} m above the keel`);

// Stations: E takes the wheel, keys move it, it eases back while manned and holds once you leave.
const use = (t: Entity): void => {
  s.queues.use.push({ player: me.id, tileX: 0, tileY: 0, entity: t.id });
};
use(wheel);
run(sim, 1);
check('E at the wheel puts you at it', me.player?.station === wheel.id && Math.hypot(me.pos.x - wheel.pos.x, me.pos.y - wheel.pos.y) < 1.2);
run(sim, 10, () => ({ strafe: 1 }));
const turned = wheel.control?.v ?? 0;
run(sim, 30);
check('the wheel turns while you push and eases back when you let go', turned > 0.4 && Math.abs(wheel.control?.v ?? 1) < 0.05, `${turned.toFixed(2)} then ${(wheel.control?.v ?? 0).toFixed(2)}`);
run(sim, 6, () => ({ strafe: 1 }));
const set = wheel.control?.v ?? 0;
use(wheel);
run(sim, 20);
check('stepping away leaves the wheel where it was set', me.player?.station == null && Math.abs((wheel.control?.v ?? 0) - set) < 1e-6 && set > 0.2);
check('a wheel left over turns the ship', Math.abs(ship.craft.spin) > 0.05);
if (wheel.control) wheel.control.v = 0;

// Flight carries whoever stands on deck; fuel burns only under power.
stand(8, 6, 4);
run(sim, 4);
const fuel0 = tank.control?.v ?? 0;
if (throttle.control) throttle.control.v = 1;
const x0 = ship.pos.x;
run(sim, 60);
const flew = ship.pos.x - x0;
const deck = vol.floorOn(ship.id, me.pos.x, me.pos.y, me.z + 0.3);
check('the throttle drives it forward and you ride along on deck', flew > 5 && Math.abs(deck - me.z) < 0.1 && Math.abs(me.z - ship.z - 4) < 0.15, `${flew.toFixed(1)} m`);
const burnt = fuel0 - (tank.control?.v ?? 0);
check('fuel burns while flying (one second a second)', Math.abs(burnt - 3) < 0.2, `${burnt.toFixed(2)} s`);
if (throttle.control) throttle.control.v = 0;
run(sim, 80);
const fuel1 = tank.control?.v ?? 0;
run(sim, 40);
check('no fuel is used while it hangs still', fuel1 === tank.control?.v);

// Guest foresight: a friend's own copy carries them along too.
if (throttle.control) throttle.control.v = 1;
run(sim, 20);
const before = { x: me.pos.x, sx: ship.pos.x };
sim.predict('local', emptyInput(999, 0));
check("a guest's foresight moves deck and rider together", Math.abs(me.pos.x - before.x - (ship.pos.x - before.sx)) < 0.05 && ship.pos.x > before.sx);
if (throttle.control) throttle.control.v = 0;

// Thin air: faster high up; wind drifts it aloft but not moored on the ground.
const speedAt = (z: number): number => {
  park(z);
  if (throttle.control) throttle.control.v = 1;
  run(sim, 200);
  if (throttle.control) throttle.control.v = 0;
  return Math.hypot(ship.craft?.vel.x ?? 0, ship.craft?.vel.y ?? 0);
};
const low = speedAt(ground + 10);
const high = speedAt(cd.air.base + cd.air.span);
check('it flies faster in the thin air up high', high > low * 1.3, `${low.toFixed(1)} vs ${high.toFixed(1)} m/s`);
s.weather.wind = { x: 6, y: 0 };
s.weather.windTarget = { x: 6, y: 0 };
park(ground + 30);
run(sim, 100);
const drift = ship.craft.vel.x;
park(cd.air.base + cd.air.span);
run(sim, 100);
const driftHigh = ship.craft.vel.x;
check('the wind carries it, less in the thin air', drift > 2 && driftHigh < drift * 0.5, `${drift.toFixed(1)} vs ${driftHigh.toFixed(1)} m/s`);
park(sim.tiles.ground(me.pos.x, me.pos.y) + 1);
if (tank.control) tank.control.v = 0;
run(sim, 120);
const mx = ship.pos.x;
run(sim, 40);
check('without fuel it sinks to the ground and rests there, moored against the wind', Math.abs(ship.pos.x - mx) < 0.05 && ship.craft.vz > -0.01);
s.weather.wind = { x: 0, y: 0 };
s.weather.windTarget = { x: 0, y: 0 };

// The fuel tank drinks a rune shard from the bag.
park(ground + 40);
if (tank.control) tank.control.v = 0;
use(tank);
run(sim, 1);
check('with no shard the tank stays empty', (tank.control?.v ?? 1) === 0);
bag().push({ id: 'runeShard', count: 2 });
use(tank);
run(sim, 1);
check('E at the tank feeds it one shard: five minutes of flight', (tank.control?.v ?? 0) === 300 && countItem(bag(), 'runeShard') === 1);

// The plank flings a jumper out and up.
stand(11, 13, 4);
run(sim, 3);
run(sim, 1, () => ({ jump: true }));
run(sim, 1);
const out = aboard(ship, cd, 11, 30);
const away = (me.kb?.x ?? 0) * (out.x - me.pos.x) + (me.kb?.y ?? 0) * (out.y - me.pos.y);
check('jumping from the plank launches you out and up', me.vz > 7.5 && away > 0, `vz ${me.vz.toFixed(1)}`);

// The hold keeps what you put in it.
stand(14.5, 5, 1);
run(sim, 20);
const hold = fit('shipHold');
use(hold);
const opened = run(sim, 1).some((e) => e.type === 'storeOpened');
const bread = countItem(bag(), 'bread');
run(sim, 1, () => ({ stow: { entity: hold.id, item: 'bread', put: true } }));
check('E opens the hold below deck and it keeps what you put in', opened && countItem(hold.stored ?? [], 'bread') === bread && countItem(bag(), 'bread') === 0 && bread > 0);
run(sim, 1, () => ({ stow: { entity: hold.id, item: 'bread', put: false } }));
check('and gives it back', countItem(bag(), 'bread') === bread);

// Every cell burns and freezes on its own: fire on one hull cell, frost on another.
const deckCell = aboard(ship, cd, 15.5, 4.5);
const cell = s.volume.cellOf(deckCell.x, deckCell.y, ship.z + 3.5);
const a = ship.craft.anchor;
check('a point on deck is a cell of the ship', cell.x - a.x === 15 && cell.y - a.y === 4 && cell.z - a.z === 3, JSON.stringify({ x: cell.x - a.x, y: cell.y - a.y, z: cell.z - a.z }));
const place = s.volume.placeOf(cell.x, cell.y, cell.z);
check('and its fire would show where the ship is', Math.hypot(place.x - deckCell.x, place.y - deckCell.y) < 0.8);
s.queues.effects.push({ target: { kind: 'cell', ...cell }, effects: [{ type: 'heat', amount: 400 }], source: null, from: null });
run(sim, 10);
check('a hull cell (split into fine deck planks) catches fire by itself', s.volume.cellGet('fire', cell.x, cell.y, cell.z) > 0 && s.volume.cellGet('fire', cell.x, cell.y - 3, cell.z) === 0);
const wet = { x: cell.x, y: cell.y - 3, z: cell.z };
s.queues.effects.push({ target: { kind: 'cell', ...wet }, effects: [{ type: 'soak', amount: 200 }, { type: 'chill', amount: 400 }], source: null, from: null });
run(sim, 4);
check('another cell freezes', s.volume.cellGet('frost', wet.x, wet.y, wet.z) > 0, `frost ${s.volume.cellGet('frost', wet.x, wet.y, wet.z)}`);


console.log(failures() === 0 ? 'craft checks passed' : `${failures()} craft checks FAILED`);
if (failures() > 0) throw new Error('craft checks failed');
