// Shared helpers for the matter checks: a calm world, flat ground, stepping, PASS/FAIL counting, common cells
import { Simulation, createState } from '../src/sim';
import { shapeId } from '../src/content/shapes';
import { tileCode } from '../src/content/tiles';
import type { Entity, InputSnapshot, SimEvent } from '../src/types';
import { emptyInput, shapeByte } from '../src/types';

let failed = 0;
/** How many checks have failed so far. */
export function failures(): number {
  return failed;
}
export function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
export const CUBE = shapeByte(shapeId('cube'), 0);
export const WOOD = tileCode('woodWall');
export const STONE = tileCode('stoneWall');
export const THATCH = tileCode('thatch');

export function world(seed = 4242): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(seed));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  const w = sim.state.weather;
  w.rain = w.rainTarget = w.wetness = 0;
  w.wind = { x: 0, y: 0 };
  w.windTarget = { x: 0, y: 0 };
  w.nextShift = 1e9;
  return { sim, me };
}
export function flatten(sim: Simulation, x: number, y: number, r: number, kind: number): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, kind);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < 60) sim.state.entities.delete(e.id);
  // Fires far from every player sleep, so keep the tester near the scene.
  for (const e of sim.state.entities.values()) if (e.player && Math.hypot(e.pos.x - x, e.pos.y - y) > 60) { e.pos.x = x + 30; e.pos.y = y + 30; }
}
export function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    for (const e of sim.step()) seen.push(e);
  }
  return seen;
}
export const gz = (sim: Simulation, x: number, y: number): number => Math.floor(sim.tiles.ground(x + 0.5, y + 0.5));
export const types = (ev: SimEvent[]): string[] => ev.map((e) => e.type);

