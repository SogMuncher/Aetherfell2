// THE AIRSHIP'S BUILD: a tight hull and envelope, stations on both decks, a hold among crates, lanterns, windsock, a call ignores the wind, the anchor and its climbable chain
import { check, failures, world } from './matterKit';
import { leaks } from './hullTight';
import { aboard } from '../src/sim/craft/craftMotion';
import { AIRSHIP, ENVELOPE_SWEEP, HULL_SWEEP } from '../src/content/crafts';
import { CONTENT, thingDef } from '../src/content';
import type { Entity, InputSnapshot } from '../src/types';
import { emptyInput } from '../src/types';

const hull = leaks(HULL_SWEEP);
const env = leaks(ENVELOPE_SWEEP);
check('the hull has no gaps between its curved planks (outside air never reaches the hold)', hull.count === 0, hull.at);
check('nor does the envelope', env.count === 0, env.at);
const fit = (thing: string): number[] => AIRSHIP.fittings.filter((f) => f.thing === thing).map((f) => f.at[2]);
check('stations stand on both decks: the helm up on the stern deck, the altitude lever and the aether tank on the main deck', fit('shipWheel')[0] === 7 && fit('altitudeLever')[0] === 4.5 && fit('fuelTank')[0] === 4.5);
const hold = AIRSHIP.fittings.find((f) => f.thing === 'shipHold');
const goods = AIRSHIP.fittings.filter((f) => (f.thing === 'crate' || f.thing === 'barrel') && hold && Math.hypot(f.at[0] - hold.at[0], f.at[1] - hold.at[1]) < 5 && f.at[2] >= 1.5 && f.at[2] < 4.5);
check('the hold is below deck among crates and barrels', !!hold && hold.at[2] === 1.5 && goods.length >= 5, `${goods.length} goods`);
check('lanterns light the decks, the hold and the cabin', fit('shipLamp').length >= 6 && !!thingDef(CONTENT, 'shipLamp').light);

const { sim, me } = world();
const s = sim.state;
let seq = 0;
const run = (ticks: number, input?: (i: number) => Partial<InputSnapshot>): void => {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(++seq, 0), ...(input ? input(i) : {}) } });
    sim.step();
  }
};
run(1, () => ({ useItem: 'skyHorn' }));
const ship = [...s.entities.values()].find((e) => e.craft);
if (!ship?.craft) throw new Error('no ship');
const cd = thingDef(CONTENT, ship.def).craft;
if (!cd) throw new Error('no craft def');
const of = (thing: string): Entity => {
  const f = [...s.entities.values()].find((e) => e.def === thing && (e.ride?.craft === ship.id || e.tether?.craft === ship.id));
  if (!f) throw new Error(`no ${thing}`);
  return f;
};
const tank = of('fuelTank');
const throttle = of('throttleLever');
const anchor = of('shipAnchor');
if (tank.control) tank.control.v = 1500;

// Called from afar with a strong side wind, it flies straight at the caller.
s.weather.wind = { x: 0, y: 9 };
s.weather.windTarget = { x: 0, y: 9 };
run(100);
const toCaller = Math.atan2(me.pos.y - ship.pos.y, me.pos.x - ship.pos.x);
const side = -ship.craft.vel.x * Math.sin(toCaller) + ship.craft.vel.y * Math.cos(toCaller);
check('answering a call it ignores the wind until it touches down', !!ship.craft.goal && Math.abs(side) < 0.6, `${side.toFixed(2)} m/s sideways in a 9 m/s wind`);
run(20);
const sock = of('windsock');
check('the windsock points downwind', Math.abs(Math.atan2(Math.sin(sock.angle - Math.PI / 2), Math.cos(sock.angle - Math.PI / 2))) < 0.05, `${sock.angle.toFixed(2)}`);
s.weather.wind = { x: 0, y: 0 };
s.weather.windTarget = { x: 0, y: 0 };

// Hang it still 16 m over the tester.
const lift = 16;
const moveShip = (x: number, y: number, z: number): void => {
  if (!ship.craft) return;
  for (const o of s.entities.values()) {
    if (o.aboard !== ship.id) continue;
    o.pos.x += x - ship.pos.x;
    o.pos.y += y - ship.pos.y;
    o.z += z - ship.z;
  }
  ship.craft.goal = null;
  ship.craft.vel = { x: 0, y: 0 };
  ship.craft.vz = 0;
  ship.pos.x = x;
  ship.pos.y = y;
  ship.z = z;
  ship.angle = 0;
};
moveShip(me.pos.x, me.pos.y, sim.tiles.ground(me.pos.x, me.pos.y) + lift);
run(10);
check('the anchor lies loose on the foredeck, riding along', anchor.aboard === ship.id && Math.abs(anchor.z - ship.z - 4.5) < 0.1 && !anchor.ride, `${(anchor.z - ship.z).toFixed(2)} m above the keel`);
const stand = (lx: number, ly: number, dz: number): void => {
  const at = aboard(ship, cd, lx, ly);
  me.pos.x = at.x;
  me.pos.y = at.y;
  me.z = ship.z + dz + 0.05;
  me.vz = 0;
  me.vel = { x: 0, y: 0 };
  if (me.player) me.player.downed = 0;
  me.hp = me.maxHp;
};
const al = (o: Entity): { x: number; y: number } => ({ x: o.pos.x - ship.pos.x + cd.pivot[0], y: o.pos.y - ship.pos.y + cd.pivot[1] });

// Pick it up like anything you can carry, and throw it over the side through the gap in the rail.
const a0 = al(anchor);
stand(a0.x - 1, a0.y, 4.5);
run(5);
run(1, () => ({ grab: true, yaw: 0 }));
check('G picks the anchor up', anchor.heldBy === me.id);
stand(19.25, 7.2, 4.5);
run(6, () => ({ yaw: Math.PI / 2 }));
run(1, () => ({ grab: true, yaw: Math.PI / 2 }));
run(120);
const ground = sim.tiles.ground(anchor.pos.x, anchor.pos.y);
check('thrown off the side it falls to the ground on its chain', anchor.heldBy === null && Math.abs(anchor.z - ground) < 0.2 && !anchor.aboard, `${(anchor.z - ground).toFixed(2)} m above the ground`);

// Lying there it holds the ship: full throttle and it cannot get further than the chain.
const chain = (): number => {
  const t = anchor.tether?.top;
  return t ? Math.hypot(anchor.pos.x - t.x, anchor.pos.y - t.y, anchor.z - t.z) : -1;
};
const len = anchor.tether?.len ?? 0;
if (throttle.control) throttle.control.v = 1;
let most = 0;
for (let i = 0; i < 400; i++) {
  run(1);
  most = Math.max(most, chain());
}
check('lying on the ground the anchor holds the ship: full throttle and it never gets further than its chain', most > len - 3 && most < len + 0.5, `at most ${most.toFixed(1)} of ${len} m`);
if (throttle.control) throttle.control.v = 0;
// A wind across the chain: the ship drifts until it is taut, then swings its bow round to the anchor.
const across = Math.atan2(ship.pos.y - anchor.pos.y, ship.pos.x - anchor.pos.x) + Math.PI / 2;
s.weather.wind = { x: Math.cos(across) * 6, y: Math.sin(across) * 6 };
s.weather.windTarget = { ...s.weather.wind };
run(800);
const off = Math.atan2(anchor.pos.y - ship.pos.y, anchor.pos.x - ship.pos.x) - ship.angle;
const faced = Math.abs(Math.atan2(Math.sin(off), Math.cos(off)));
check('riding to its anchor in the wind, it swings its bow round toward it', faced < 0.35 && chain() < len + 0.5, `${faced.toFixed(2)} rad off, chain ${chain().toFixed(1)} m`);
s.weather.wind = { x: 0, y: 0 };
s.weather.windTarget = { x: 0, y: 0 };
// Hang it beside the anchor, the chain leading out from the cathead and down.
const ag = sim.tiles.ground(anchor.pos.x, anchor.pos.y);
moveShip(anchor.pos.x - 8.25, anchor.pos.y - 7 - 3.7, ag + lift);
run(20);

// Climb the chain from the ground up onto the cathead.
const t0 = anchor.tether?.top;
if (!t0) throw new Error('no chain');
const up = Math.atan2(t0.y - anchor.pos.y, t0.x - anchor.pos.x);
me.pos.x = anchor.pos.x + Math.cos(up) * 0.3;
me.pos.y = anchor.pos.y + Math.sin(up) * 0.3;
me.z = sim.tiles.ground(me.pos.x, me.pos.y);
me.vz = 0;
me.vel = { x: 0, y: 0 };
run(5, () => ({ yaw: up }));
const z0 = me.z;
run(40, () => ({ forward: 1, yaw: up, pitch: 0.3 }));
check('pushing forward at the chain you climb it', !!me.player?.climbing && me.z - z0 > 2.5, `${(me.z - z0).toFixed(1)} m up`);
run(40, () => ({ yaw: up }));
const hang = me.z;
check('let go of the keys and you hang there', !!me.player?.climbing && Math.abs(me.z - hang) < 0.05);
for (let i = 0; i < 600 && !(me.actor?.onGround && me.aboard === ship.id); i++) run(1, () => ({ forward: 1, yaw: up, pitch: 0.3 }));
run(10);
check('at the top you step off onto the ship', me.aboard === ship.id && !me.player?.climbing && Math.abs(me.z - ship.z - 4.5) < 0.1, `${(me.z - ship.z).toFixed(2)} m above the keel`);

// And back down: walk off the end of the cathead, catch the chain, climb down looking down.
stand(19.25, 9.25, 4.5);
run(5, () => ({ yaw: Math.PI / 2 }));
run(12, () => ({ forward: 1, yaw: Math.PI / 2 }));
run(20, () => ({ yaw: Math.PI / 2 }));
check('stepping off the cathead you catch the chain', !!me.player?.climbing && me.z > ship.z + 3, `${(me.z - ship.z).toFixed(2)} m above the keel`);
const hp = me.hp;
for (let i = 0; i < 600 && me.player?.climbing; i++) run(1, () => ({ forward: 1, yaw: up + Math.PI, pitch: -0.7 }));
const g2 = sim.tiles.ground(me.pos.x, me.pos.y);
check('and climb down it to the ground unhurt', !me.player?.climbing && Math.abs(me.z - g2) < 0.2 && me.hp === hp, `${(me.z - g2).toFixed(2)} m above the ground, hp ${hp} -> ${me.hp}`);

// The chain has a length: carry the anchor off and you are held back at its end.
me.pos.x = anchor.pos.x - Math.cos(up) * 1;
me.pos.y = anchor.pos.y - Math.sin(up) * 1;
me.z = sim.tiles.ground(me.pos.x, me.pos.y);
run(3, () => ({ yaw: up }));
run(1, () => ({ grab: true, yaw: up }));
check('on the ground you can pick the anchor up again', anchor.heldBy === me.id);
const tt = anchor.tether?.top ?? { x: 0, y: 0 };
const far = Math.atan2(me.pos.y - tt.y, me.pos.x - tt.x);
me.pos.x = tt.x + Math.cos(far) * (len + 8);
me.pos.y = tt.y + Math.sin(far) * (len + 8);
me.z = sim.tiles.ground(me.pos.x, me.pos.y);
run(3, () => ({ forward: 1, yaw: far }));
check('carrying it off you are held at the end of the chain', anchor.heldBy === me.id && chain() < len + 0.6 && chain() > len - 2, `chain ${chain().toFixed(1)} of ${len} m`);

console.log(failures() === 0 ? 'ship checks passed' : `${failures()} ship checks FAILED`);
if (failures() > 0) throw new Error('ship checks failed');
