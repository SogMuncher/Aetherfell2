// Shared helpers for the headless smoke checks: seeded rng, flat arena, a joined traveller, PASS/FAIL counting
import { Simulation, createState } from '../src/sim';
import type { Entity, InputSnapshot, Rng } from '../src/types';
import { Tile, emptyInput } from '../src/types';
/** A small seeded random source for the checks (the sim has its own). */
export function makeRng(seed: number): Rng {
  let s = seed | 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + (b - a) * next(), int: (n) => Math.floor(next() * n), chance: (p) => next() < p, pick: (a) => a[Math.floor(next() * a.length)] as never };
}

export function spawner(sim: Simulation): { spawn: (t: string, x: number, y: number, i?: object) => Entity } {
  return (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
}
/** Flat, clear ground to stand on, with the traveller placed at its middle. */
export function arena(sim: Simulation, me: Entity, x = 18000, y = 18000, r = 40): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, Tile.Flagstone as 0);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < r + 20) sim.state.entities.delete(e.id);
  me.pos.x = me.prev.x = x + 0.5;
  me.pos.y = me.prev.y = y + 0.5;
  me.z = me.prevZ = sim.tiles.ground(x, y);
  me.vel.x = me.vel.y = me.vz = 0;
}

let failed = 0;
/** How many checks have failed so far. */
export function failures(): number {
  return failed;
}
export function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

export function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  arena(sim, me);
  return { sim, me };
}
let seq = 0;
/** The next input number, for stepping a sim by hand. */
export function nextSeq(): number {
  return ++seq;
}
export function run(sim: Simulation, ticks: number, input?: Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(nextSeq(), 0), ...(input ?? {}) } });
    sim.step();
  }
}
export function hit(sim: Simulation, target: Entity, amount: number, kind: 'cut' | 'blunt' | 'fire' | 'cold' = 'cut', swing: 'left' | 'right' | 'thrust' | 'overhead' | null = null): void {
  sim.state.queues.effects.push({ target: { kind: 'entity', id: target.id }, effects: [{ type: 'damage', amount, kind }], source: null, from: null, swing });
}
