// Headless check that a grass/brush fire spreads with wind and stops in rain.
import { Simulation, createState } from '../src/sim';
import { Tile } from '../src/types';

for (const [label, rain] of [['dry', 0], ['grass', 0], ['rain', 0.9]] as const) {
  const sim = new Simulation(createState(99));
  const st = sim.state;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) sim.tiles.setKind(5000 + x, 5000 + y, label === 'grass' ? Tile.Grass : Tile.Brush);
  st.weather.wind = { x: 6, y: 0 };
  st.weather.windTarget = { x: 6, y: 0 };
  st.weather.rain = rain;
  st.weather.rainTarget = rain;
  st.weather.wetness = rain;
  st.weather.nextShift = 99999;
  st.queues.effects.push({ target: { kind: 'tile', x: 5002, y: 5020 }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  let burnt = 0;
  for (let t = 0; t < 20 * 30; t++) {
    for (const e of sim.step()) if (e.type === 'burntOut') burnt++;
  }
  console.log(label, 'burning now', st.burning.size, 'burnt out', burnt);
}
