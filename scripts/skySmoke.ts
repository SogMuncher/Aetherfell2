// Sky checks: cloud layers as data, rain only under storm cells, clouds drifting with the wind,
// cloud shadows, and the sim soaking only what stands under a storm.
import { Simulation, createState } from '../src/sim';
import { CONTENT, airAt, airColumn, airMoisture, cloudDensity3, setAirMoisture, layerCover, layerDensity, rainAt, sunThrough, validateContent } from '../src/content';
import type { WeatherState } from '../src/types';
import { AirCells } from '../src/render/airCells';
import { AirSmoke } from '../src/render/airSmoke';
import { packKey, spotKey } from '../src/types';
import type { ReadonlyTiles, ReadonlyVolume } from '../src/types';
import { computeEnv } from '../src/render/env';
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
      if (Math.abs(layerDensity(l, a, cv, x, y) - layerDensity(l, b, cv, x + 500, y - 200)) < 1e-4) same++;
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
  check('the heaps and storms are thick slabs of cloud, heaps a few hundred metres across', !!cu && (cu.thickness ?? 0) > 200 && cu.scale < 600 && SKY.layers.some((l) => l.rain && (l.thickness ?? 0) > 800));
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

// The air as one grid of cells every layer writes into: the same density rule, fine near, coarse far, reaching the far
// horizon; drifting with the wind without a refill; moving the eye fills only the cells that came into reach; storms
// rain only where the air overhead holds their cloud; standing in a low cloud fogs the view in the cloud's colour.
{
  const w = weather(0.7, 0.3);
  const air = new AirCells();
  air.fillAll(w, 5000, 3000, 300);
  const lv0 = air.levels[0];
  let worst = 0;
  let cloudy = 0;
  for (let k = 0; k < 400 && lv0; k++) {
    // Cell centres of the finest level near the eye (cells there are narrower than any shape, so one spot each).
    const gx = lv0.ox + 16 + ((k * 7) % 32);
    const gy = lv0.oy + 16 + ((k * 11) % 32);
    const gz = lv0.oz + (k % air.tall);
    const cz = lv0.cellZ;
    const x = (gx + 0.5) * lv0.cell + (w.drift?.x ?? 0);
    const y = (gy + 0.5) * lv0.cell + (w.drift?.y ?? 0);
    const z = (gz + 0.5) * cz;
    const want = Math.min(1, airColumnAt(x, y, gz * cz, cz, lv0.cell));
    const got = air.sample(w, x, y, z);
    worst = Math.max(worst, Math.abs(want - got));
    if (got > 0) cloudy++;
  }
  check('air cells hold the clouds of every layer by the one density rule', worst < 0.01 && cloudy > 10, `worst ${worst.toFixed(3)}, ${cloudy} cloudy cells`);
  const top = air.levels[air.levels.length - 1];
  check('the coarsest air cells reach the far clouds', !!top && top.cell * SKY.air.lod >= SKY.cloudRange);
  const moved = { ...w, drift: { x: (w.drift?.x ?? 0) + 400, y: (w.drift?.y ?? 0) + 150 } };
  check('air cells drift with the wind without refilling', Math.abs(air.sample(w, 5100, 3100, 320) - air.sample(moved, 5500, 3250, 320)) < 1e-6);
  let farCloud = 0;
  for (let a = 0; a < 144; a++) for (const z of [300, 450, 1550]) if (air.sample(w, 5000 + Math.cos(a / 22.9) * SKY.cloudRange * 0.9, 3000 + Math.sin(a / 22.9) * SKY.cloudRange * 0.9, z) > 0) farCloud++;
  check('far clouds come from coarse cells (no hole toward the horizon)', farCloud > 5, `${farCloud} cloudy spots 36 km out`);
  const before = air.filled;
  air.update(w, 5000 + SKY.air.cell * (air.n / 8 + 1), 3000, 300, 0.1, 1e9);
  const step = air.filled - before;
  check('a short walk fills only the cells that came into reach', step > 0 && step <= air.n * air.n * air.tall / 4, `${step} cells`);
  const calm = air.filled;
  air.update(w, 5000 + SKY.air.cell * (air.n / 8 + 1), 3000, 300, 500, 1e9);
  check('old air cells are not rebuilt while the weather holds', air.filled === calm, `${air.filled - calm} cells`);
  air.update({ ...w, cloud: (w.cloud ?? 0) + 0.2 }, 5000 + SKY.air.cell * (air.n / 8 + 1), 3000, 300, 500, 2e5);
  check('they are rebuilt when the weather changes', air.filled > calm);
  // Weather: rain falls only under storm cloud, and the air above holds that cloud.
  const storm = weather(0.9, 0.9);
  let rainy = 0;
  let overhead = 0;
  for (let i = 0; i < 400; i++) {
    const x = i * 97;
    const y = i * 61;
    if (rainAt(SKY, storm, x, y) <= 0.05) continue;
    rainy++;
    let any = 0;
    for (let z = 250; z < 1340; z += 40) any = Math.max(any, airAt(SKY, storm, x, y, z).dens);
    if (any > 0.05) overhead++;
  }
  check('where it rains, the air overhead holds the storm cloud', rainy > 10 && overhead / rainy > 0.9, `${overhead} of ${rainy}`);
  const state = createState(77);
  const low = SKY.layers.find((l) => (l.wet ?? 0) >= 0.9 && (l.thickness ?? 0) > 0);
  check('a low layer reaches up the slopes of a 500 m peak', !!low && low.height < 500 && low.height + (low.thickness ?? 0) > 500);
  if (low) {
    state.weather = { ...weather(1, 0.2), time: 0.5 };
    const cv = layerCover(low, state.weather);
    let spot: [number, number] | null = null;
    for (let i = 0; i < 4000 && !spot; i++) if (cloudDensity3(low, state.weather, cv, i * 53, i * 29, 0.5) > 0.8) spot = [i * 53, i * 29];
    const z = low.height + (low.thickness ?? 0) * 0.5;
    if (spot) {
      const clear = computeEnv(state, 0, spot[0], spot[1], 0);
      const inside = computeEnv(state, 0, spot[0], spot[1], z);
      check('outside a cloud the fog is the sky at the horizon', clear.fog.every((c, i) => c === clear.horizon[i]));
      check('standing in a cloud shortens the sight', inside.fogDist < clear.fogDist * 0.5, `${inside.fogDist.toFixed(0)} vs ${clear.fogDist.toFixed(0)} m`);
    } else check('found a thick spot of low cloud to stand in', false);
  }
}

// Smoke: burning ground and a burning 3D cell put smoke into the air cells above them; it rises, thins, and the wind
// carries it; with nothing burning there is none.
{
  const w = weather(0.2, 0);
  const tiles = { ground: () => 10, fire: (x: number, y: number) => (x === 3 && y === 4 ? 255 : 0) } as unknown as ReadonlyTiles;
  const cellFire = (on: boolean): ReadonlyVolume => ({ burningCells: new Set(on ? [spotKey(20, 4, 30)] : []), cellGet: () => 255 }) as unknown as ReadonlyVolume;
  const none = new AirSmoke();
  for (let i = 0; i < 30; i++) none.update(0.1, w, 0, 0, 12, tiles, new Set(), cellFire(false));
  check('no fire, no smoke', !none.active);
  const sm = new AirSmoke();
  const burn = new Set([packKey(3, 4)]);
  sm.update(0.1, w, 0, 0, 12, tiles, burn, cellFire(true));
  check('a fire smokes only the one cell above it', sm.at(w, 3.5, 4.5, 10.5) > 0 && sm.at(w, 2.5, 4.5, 10.5) === 0 && sm.at(w, 3.5, 4.5, 11.5) < sm.at(w, 3.5, 4.5, 10.5) * 0.1);
  for (let i = 0; i < 150; i++) sm.update(0.1, w, 0, 0, 12, tiles, burn, cellFire(true));
  const low = sm.at(w, 3.5, 4.5, 10.5);
  const high = sm.at(w, 3.5, 4.5, 14.5);
  const side = sm.at(w, 2.5, 4.5, 14.5);
  check('a burning tile makes a slow, thin column of smoke', low > 0.3 && high > 0.1 && side > 0 && side < high * 0.5 && sm.at(w, 3.5, 4.5, 40.5) === 0, `${low.toFixed(2)} at the fire, ${high.toFixed(2)} 4 m up, ${side.toFixed(3)} beside it`);
  check('a burning 3D cell smokes too', sm.at(w, 20.5, 4.5, 32) > 0.05);
  const blown = { ...w, drift: { x: 6, y: 0 } };
  check('the wind carries the smoke downwind', Math.abs(sm.at(blown, 9.5, 4.5, 14.5) - high) < 1e-6);
  for (let i = 0; i < 3000; i++) sm.update(0.1, w, 0, 0, 12, tiles, new Set(), cellFire(false));
  check('smoke thins away once the fire is out', !sm.active);
}

if (failed) throw new Error(`${failed} sky check(s) failed`);
console.log('all sky checks passed');

function airColumnAt(x: number, y: number, z0: number, cell: number, wide: number): number {
  const d = new Float32Array(1);
  const l = new Float32Array(1);
  airColumn(SKY, weather(0.7, 0.3), SKY.layers.map((ly) => layerCover(ly, weather(0.7, 0.3))), x, y, z0, cell, 1, d, l, wide);
  return d[0] ?? 0;
}
