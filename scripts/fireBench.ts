// Fire benchmark: a big dry-brush field is lit; reports burning cells, burn-out and tick time over time.
import { Simulation, createState } from '../src/sim';
declare const process: { argv: string[] };
import { Tile } from '../src/types';

const sim = new Simulation(createState(99));
const st = sim.state;
for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) sim.tiles.setKind(5000 + x, 5000 + y, (x + y) % 5 === 0 ? Tile.Grass : Tile.Brush);
st.weather.wind = { x: 3, y: 0 }; st.weather.windTarget = { x: 3, y: 0 };
st.weather.rain = 0; st.weather.rainTarget = 0; st.weather.wetness = 0; st.weather.nextShift = 999999;
st.queues.effects.push({ target: { kind: 'tile', x: 5002, y: 5060 }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
const lit = new Map<string, number>(); let rebur = 0, dur = 0, durN = 0; const since = new Map<string, number>();
let ev1 = 0, evPeak = 0; let burnt = 0, ms = 0, peak = 0, last = 0;
const secs = Number(process.argv[2] ?? 300);
for (let t = 1; t <= 20 * secs; t++) {
  const a = performance.now();
  for (const e of sim.step()) {
    if (e.type === 'ignited' || e.type === 'doused') ev1++;
    if (e.type === 'ignited') { const k = `${e.x},${e.y}`; if (lit.has(k)) rebur++; lit.set(k, 1); since.set(k, t); }
    if (e.type === 'burntOut') { burnt++; const k = `${e.x},${e.y}`; const a = since.get(k); if (a !== undefined) { dur += (t - a) / 20; durN++; } }
  }
  ms += performance.now() - a;
  peak = Math.max(peak, st.burning.size);
  if (st.burning.size > 0) last = t / 20;
  if (t % 20 === 0) { evPeak = Math.max(evPeak, ev1); ev1 = 0; }
  if (t % (20 * 30) === 0) console.log(`t=${t / 20}s burning=${st.burning.size} burntOut=${burnt} avgTickMs=${(ms / t).toFixed(2)}`);
}
console.log(`cells lit ${lit.size}, re-ignitions ${rebur}, avg burn time per cell ${(dur / Math.max(1, durN)).toFixed(1)}s`);
console.log(`peak fire sound events/s ${evPeak} (old: one 4-node output each; now at most 5 voices/s, 40 outputs, 96 voices)`);
console.log(`peak burning ${peak}, last fire seen at ${last}s`);
