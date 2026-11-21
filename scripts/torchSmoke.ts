// Headless checks for torches: the wall-mounted kind in buildings and halls, and the one you hold
// (it lights the way and sets things alight). Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, heldLight, thingDef, validateContent, weaponStats } from '../src/content';
import { siteInRegion } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';
import type { Entity, InputSnapshot } from '../src/types';
import { Tile, emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function world(seed = 4242): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(seed));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  sim.state.weather.rain = 0;
  sim.state.weather.rainTarget = 0;
  sim.state.weather.nextShift = 1e9;
  return { sim, me };
}
let seq = 0;
function run(sim: Simulation, ticks: number, input?: Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(++seq, 0), ...(input ?? {}) } });
    sim.step();
  }
}

check('content validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

// ---- The torch in your hand ----------------------------------------------------------------
{
  const { sim, me } = world();
  const a = me.actor;
  check('a traveller has a weapon slot', !!a);
  if (a) {
    a.weapon = 'travellerSword';
    check('a sword gives no light', !heldLight(CONTENT, me));
    a.weapon = 'torch';
    const l = heldLight(CONTENT, me);
    check('a held torch gives a flame light', !!l && l.flame && l.radius > 4, `radius ${l?.radius}`);
    const w = weaponStats(CONTENT, thingDef(CONTENT, me.def), 'torch');
    check('the torch is a weapon that burns', !!w && (w.effects ?? []).some((x) => x.type === 'heat'), `${w?.damage} dmg`);
    // Strike a living target with the torch's own effects: it catches fire.
    const x = 18000;
    const y = 18000;
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) sim.tiles.setKind(x + i, y + j, Tile.Flagstone as 0);
    me.pos.x = me.prev.x = x + 0.5;
    me.pos.y = me.prev.y = y + 0.5;
    me.z = me.prevZ = sim.tiles.ground(x, y);
    const ctx = sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } };
    const wolf = ctx.ctx.spawn('wolf', x + 2.5, y + 0.5);
    sim.state.queues.effects.push({ target: { kind: 'entity', id: wolf.id }, effects: [...(w?.effects ?? [])], source: me.id, from: { x: me.pos.x, y: me.pos.y }, swing: 'right' });
    run(sim, 2);
    check('a torch blow sets a creature alight', (wolf.status.burning ?? 0) > 0, `burning ${wolf.status.burning ?? 0}`);
  }
}

// ---- Torches on walls ---------------------------------------------------------------------
{
  const def = thingDef(CONTENT, 'wallTorch');
  check('the wall torch is a mounted, lit thing', !!def.mount && def.mount.height > 1 && !!def.light);
  const { sim, me } = world();
  let best: SiteLayout | null = null;
  let bd = Infinity;
  for (let ry = -14; ry <= 14; ry++) for (let rx = -14; rx <= 14; rx++) {
    const s = siteInRegion(sim.state.seed, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
    if (s?.kind !== 'village') continue;
    const d = Math.hypot(s.cx, s.cy);
    if (d < bd) { best = s; bd = d; }
  }
  if (best) {
    me.pos.x = best.cx + 0.5; me.pos.y = best.cy - 60; me.vel.x = me.vel.y = 0;
    run(sim, 3);
    me.pos.x = best.cx + 0.5; me.pos.y = best.cy + 0.5;
    me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y) + 6;
    run(sim, 60);
    const torches = [...sim.state.entities.values()].filter((e) => e.def === 'wallTorch');
    const high = torches.filter((e) => e.z - sim.tiles.ground(e.pos.x, e.pos.y) > 1);
    check('buildings hold wall torches up on the wall', torches.length > 0 && high.length > 0, `${torches.length} torches, ${high.length} raised`);
  } else check('a village exists to look at', false);
}

if (failed) {
  console.log(`${failed} FAILED`);
  throw new Error('torchSmoke failed');
}
console.log('torchSmoke: all passed');
