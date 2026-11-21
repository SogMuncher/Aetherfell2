// Headless smoke test: run the sim for a while and report what happened.
import { Simulation, createState } from '../src/sim';
import { emptyInput } from '../src/types';

const sim = new Simulation(createState(1234));
sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
const counts: Record<string, number> = {};
const t0 = performance.now();
for (let i = 0; i < 2400; i++) {
  const inp = emptyInput(i, 0.3);
  inp.forward = 1;
  inp.cast = i % 60 === 0;
  inp.attack = i % 30 < 2;
  sim.enqueue({ type: 'input', playerId: 'local', input: inp });
  for (const e of sim.step()) counts[e.type] = (counts[e.type] ?? 0) + 1;
}
const ms = performance.now() - t0;
const pid = sim.state.players['local'];
const p = pid !== undefined ? sim.state.entities.get(pid) : undefined;
console.log('ticks', sim.state.tick, 'ms/tick', (ms / 2400).toFixed(3));
console.log('player', p?.pos, 'z', p?.z.toFixed(2), 'hp', p?.hp);
console.log('entities', sim.state.entities.size, 'chunks', sim.state.chunks.size, 'burning', sim.state.burning.size, 'locations', sim.state.locations.map((l) => `${l.kind}:${l.name}`).join(', '));
console.log('events', counts);
const bytes = sim.save();
const back = Simulation.fromSave(bytes);
console.log('save bytes', bytes.length, 'reload ok', !!back, back?.state.entities.size);
