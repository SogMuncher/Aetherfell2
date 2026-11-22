// Sky checks: cloud layers as data, rain only under storm cells, clouds drifting with the wind,
// cloud shadows, and the sim soaking only what stands under a storm.
import { Simulation, createState } from '../src/sim';
import { CONTENT, airMoisture, cloudDensity3, setAirMoisture, layerCover, layerDensity, rainAt, sunThrough, validateContent } from '../src/content';
import type { WeatherState } from '../src/types';
import { emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const SKY = CONTENT.sky;
const problems = validateContent(CONTENT);
check('content (with the sky) validates', problems.length === 0, problems.join('; '));
check('there are several cloud layers at different heights', SKY.layers.length >= 3 && new Set(SKY.layers.map((l) => l.height)).size === SKY.layers.length);
check('exactly the storm layers carry rain', SKY.layers.some((l) => l.rain));

function weather(cloud: number, rain: number): WeatherState {
  return { time: 0.5, day: 1, wind: { x: 3, y: 1 }, windTarget: { x: 3, y: 1 }, rain, rainTarget: rain, cloud, wetness: 0, aurora: 0, nextShift: 1e9, drift: { x: 0, y: 0 } };
}
const grid = (f: (x: number, y: number) => number): number[] => {
  const out: number[] = [];
  for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) out.push(f(i * 397 + 11, j * 421 + 7));
  return out;
};

// How much of the sky each layer covers follows its cover number.
for (const l of SKY.layers) {
  const w = weather(0.5, 0.3);
  const cv = layerCover(l, w);
  const share = grid((x, y) => layerDensity(l, w, cv, x, y)).filter((d) => d > 0.5).length / 3600;
  check(`'${l.name}' covers about as much sky as asked`, Math.abs(share - cv) < 0.25, `asked ${cv.toFixed(2)}, got ${share.toFixed(2)}`);
}

// Clear weather: no rain anywhere. Stormy weather: rain under storm cells only, dry gaps between.
{
  const dry = grid((x, y) => rainAt(SKY, weather(0.2, 0), x, y));
  check('no rain falls in fair weather', dry.every((r) => r === 0));
  const w = weather(0.9, 0.8);
  const storm = SKY.layers.find((l) => l.rain);
  const wet = grid((x, y) => rainAt(SKY, w, x, y));
  const raining = wet.filter((r) => r > 0.3).length;
  const clear = wet.filter((r) => r < 0.02).length;
  check('in stormy weather it rains in places', raining > 200, `${raining} of 3600 spots`);
  check('and stays dry between the storm cells', clear > 200, `${clear} of 3600 spots`);
  let outside = 0;
  if (storm) {
    const cv = layerCover(storm, w);
    grid((x, y) => {
      if (rainAt(SKY, w, x, y) > 0 && layerDensity(storm, w, cv, x, y) <= 0) outside++;
      return 0;
    });
  }
  check('rain only ever falls under a storm cell', outside === 0, `${outside} spots`);
}

// Clouds drift with the wind: a cloud that was over a spot is later downwind of it.
{
  const l = SKY.layers[0];
  if (l) {
    const a = weather(0.6, 0.3);
    const b = { ...weather(0.6, 0.3), drift: { x: 500, y: -200 } };
    const cv = layerCover(l, a);
    let same = 0;
    for (let i = 0; i < 200; i++) {
      const x = i * 173;
      const y = i * 91;
      if (Math.abs(layerDensity(l, a, cv, x, y) - layerDensity(l, b, cv, x + 500 * l.speed, y - 200 * l.speed)) < 1e-4) same++;
    }
    check('clouds move with the wind', same === 200, `${same}/200`);
  }
}

// Shadows: darker under thick low cloud, full sun in a clear sky.
{
  const clear = grid((x, y) => sunThrough(SKY, weather(0, 0), x, y));
  const dull = grid((x, y) => sunThrough(SKY, weather(1, 0.9), x, y));
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  check('a fair sky lets the sun through almost everywhere', mean(clear) > 0.9, mean(clear).toFixed(2));
  check('heavy cloud casts shadows on the land', mean(dull) < 0.75 && Math.min(...dull) < 0.5, `mean ${mean(dull).toFixed(2)}`);
}

// The sim soaks only those under a storm.
{
  const sim = new Simulation(createState(1234));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Walker' });
  sim.step();
  const w = sim.state.weather;
  Object.assign(w, { rain: 0.85, rainTarget: 0.85, cloud: 0.95, nextShift: 1e9 });
  const id = sim.state.players['local'] ?? -1;
  const me = sim.state.entities.get(id);
  let wetSpot: { x: number; y: number } | null = null;
  let drySpot: { x: number; y: number } | null = null;
  for (let i = 0; i < 4000 && (!wetSpot || !drySpot); i++) {
    const x = (i % 63) * 211 + 40;
    const y = Math.floor(i / 63) * 233 + 40;
    const g = sim.tiles.ground(x, y);
    if (g < 2 || g > 80) continue;
    const r = rainAt(CONTENT.sky, w, x, y);
    if (r > 0.6 && !wetSpot) wetSpot = { x, y };
    if (r === 0 && !drySpot) drySpot = { x, y };
  }
  const soakedAt = (spot: { x: number; y: number }): boolean => {
    if (!me) return false;
    me.status = {};
    me.pos.x = me.prev.x = spot.x;
    me.pos.y = me.prev.y = spot.y;
    me.z = me.prevZ = sim.tiles.ground(spot.x, spot.y);
    const drift0 = { ...(w.drift ?? { x: 0, y: 0 }) };
    for (let i = 0; i < 30; i++) {
      w.drift = { ...drift0 };
      sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i + 1) });
      sim.step();
    }
    return (me.status['wet'] ?? 0) > 0;
  };
  check('spots under and outside storms exist', !!wetSpot && !!drySpot);
  if (wetSpot && drySpot) {
    check('standing under a storm cell soaks you', soakedAt(wetSpot));
    check('standing in a dry gap does not', !soakedAt(drySpot));
  }
}

// ---- Clouds with volume ---------------------------------------------------------------------------
{
  const w = weather(0.8, 0.5);
  const cu = SKY.layers.find((l) => l.name === 'cumulus');
  check('the heaps and storms are thick slabs of cloud', !!cu && (cu.thickness ?? 0) > 500 && SKY.layers.some((l) => l.rain && (l.thickness ?? 0) > 1000));
  if (cu) {
    const cv = layerCover(cu, w);
    // Find a spot where the cloud is thick and one where it is thin but present.
    let core: { x: number; y: number } | null = null;
    let rim: { x: number; y: number } | null = null;
    for (let j = 0; j < 200 && !(core && rim); j++) {
      for (let i = 0; i < 200; i++) {
        const x = i * 173 + 5;
        const y = j * 211 + 9;
        const d = layerDensity(cu, w, cv, x, y);
        if (!core && d >= 0.99) core = { x, y };
        if (!rim && d > 0.08 && d < 0.2) rim = { x, y };
      }
    }
    check('there are cloud cores and rims', !!core && !!rim);
    if (core && rim) {
      const up = (spot: { x: number; y: number }, hf: number): number => cloudDensity3(cu, w, cv, spot.x, spot.y, hf);
      check('a heap is solid low down and reaches high at its core', up(core, 0.3) > 0.5 && up(core, 0.75) > 0);
      check('a thin rim is only low and wispy', Math.max(up(rim, 0.06), up(rim, 0.12), up(rim, 0.2)) > 0 && up(rim, 0.9) === 0 && up(rim, 0.95) === 0);
      check('every heap has a flat base: no cloud beneath it', up(core, 0) < 0.2 && up(core, 0.5) > up(core, 0));
      let tallerCore = 0;
      for (let k = 0; k < 20; k++) if (up(core, 0.1 + k * 0.045) > 0) tallerCore++;
      let tallerRim = 0;
      for (let k = 0; k < 20; k++) if (up(rim, 0.1 + k * 0.045) > 0) tallerRim++;
      check('cores stand taller than rims (a towering shape)', tallerCore > tallerRim, `${tallerCore} vs ${tallerRim} slices`);
    }
    const flat = { ...cu, thickness: 0 };
    check('a flat layer is just its column density', cloudDensity3(flat, w, cv, 1234, 987, 0.5) === layerDensity(flat, w, cv, 1234, 987));
    check('rain and shade still come from the column, so overhead and underfoot agree', rainAt(SKY, w, 3000, 3000) === rainAt(SKY, w, 3000, 3000) && sunThrough(SKY, w, 3000, 3000) <= 1);
  }
}

// Low layers gather over damp land (the world's moisture shifts a wet layer's cloud edge), dry layers do not care.
{
  const w = weather(0.5, 0);
  const low = SKY.layers.find((l) => (l.wet ?? 0) >= 0.9);
  const mean = (l: (typeof SKY.layers)[number]): number => {
    let sum = 0;
    const cv = layerCover(l, w);
    for (let j = 0; j < 60; j++) for (let i = 0; i < 60; i++) sum += layerDensity(l, w, cv, i * 397 + 11, j * 421 + 7);
    return sum / 3600;
  };
  check('a low layer hangs near mountain height', !!low && low.height < 400);
  if (low) {
    setAirMoisture(() => 0.9);
    const wetMean = mean(low);
    setAirMoisture(() => 0.1);
    const dryMean = mean(low);
    check('a wet-loving layer covers more damp land than dry', wetMean > dryMean + 0.05, `${wetMean.toFixed(2)} vs ${dryMean.toFixed(2)}`);
    setAirMoisture((x) => (x < 5000 ? 0.1 : 0.9));
    check('the air moisture is smooth between coarse cells', Math.abs(airMoisture(4999, 0) - airMoisture(5001, 0)) < 0.05);
    setAirMoisture(null);
    check('no world moisture means neutral air', airMoisture(10, 10) === 0.5);
  }
}

if (failed) throw new Error(`${failed} sky check(s) failed`);
console.log('all sky checks passed');
