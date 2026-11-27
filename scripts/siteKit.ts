// Shared helpers for the settlement and city checks: a calm world, stepping, finding a site of a kind, walking into it.
import { Simulation, createState } from '../src/sim';
import { siteInRegion } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';
import type { Entity, InputSnapshot } from '../src/types';
import { emptyInput } from '../src/types';

declare const process: { env: Record<string, string | undefined> };
let failed = 0;
/** How many checks have failed so far. */
export function failures(): number {
  return failed;
}
export function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
export const DEBUG = process.env['DEBUG'] === '1';

export function world(seed = 4242): { sim: Simulation; me: Entity } {
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
export function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    sim.step();
  }
}
export function find(sim: Simulation, kind: string, from = 0): SiteLayout | null {
  let best: SiteLayout | null = null;
  let bd = Infinity;
  for (let ry = -14; ry <= 14; ry++) {
    for (let rx = -14; rx <= 14; rx++) {
      const s = siteInRegion(sim.state.seed, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
      if (s?.kind !== kind) continue;
      const d = Math.hypot(s.cx, s.cy);
      if (d >= from && d < bd) {
        best = s;
        bd = d;
      }
    }
  }
  return best;
}
export function visit(sim: Simulation, me: Entity, s: SiteLayout): void {
  // Move in stages so the world around is made and the place registers.
  me.pos.x = s.cx + 0.5;
  me.pos.y = s.cy - 60;
  me.vel.x = me.vel.y = 0;
  run(sim, 3);
  me.pos.x = s.cx + 0.5;
  me.pos.y = s.cy + 0.5;
  me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y) + 6;
  run(sim, 1);
}
