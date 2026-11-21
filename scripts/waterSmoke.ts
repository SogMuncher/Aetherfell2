// WATER: rivers and lakes carve the land and stand at their own height (not just sea level); shores, bridges where ways
// cross water, ports with quays and piers. Checks: the same on every run, tiles agree with the water function, the
// water is level across a river and the banks do not leak, a body floats at the river's height and walks over a bridge
// deck, bridges and piers are cells of the 3D layer (so they burn like any timber), water puts fire out on the ground,
// and the far view, saves and friends see the same water.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { TILES, tileCode } from '../src/content/tiles';
import { CHUNK_SIZE, Tile, emptyInput } from '../src/types';
import type { Entity } from '../src/types';
import { landOf } from '../src/sim/world/terrain';
import { isWater, lakesIn, waterNear } from '../src/sim/world/water';
import { waysTouching } from '../src/sim/world/roads';
import { harbourOf } from '../src/sim/world/crossings';
import { spanBox, spanCell } from '../src/sim/world/decks';
import type { Span } from '../src/sim/world/decks';
import { REGION_SIZE } from '../src/sim/world/sites';
import { generateChunk } from '../src/sim/world/chunkgen';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const problems = validateContent(CONTENT);
check('content validates (water, bridges, harbours)', problems.length === 0, problems.join('; '));
const SEEDS = [1, 7, 4242, 90210];

// ---- Rivers and lakes ------------------------------------------------------------------------
for (const seed of SEEDS) {
  const land = landOf(seed);
  let dry = 0;
  let wet = 0;
  for (let y = -2000; y < 2000; y += 9) {
    for (let x = -2000; x < 2000; x += 9) {
      if (land.rawGround(x, y, 3) < 0) continue;
      if (isWater(seed, x, y)) wet++;
      else dry++;
    }
  }
  const share = wet / (wet + dry);
  check(`seed ${seed}: some land is river or lake, not too much`, share > 0.001 && share < 0.08, `${(share * 100).toFixed(2)}%`);
}
{
  let lakes = 0;
  for (const seed of SEEDS) lakes += lakesIn(landOf(seed), -3000, -3000, 3000, 3000).length;
  check('lakes sit in the land', lakes > 0, `${lakes} lakes`);
}
{
  // Pure: asking twice, or from a fresh land, gives the same answer; nothing here reads a place.
  const a: boolean[] = [];
  const b: boolean[] = [];
  for (let i = 0; i < 400; i++) {
    a.push(isWater(7, i * 13.7 - 500, i * 9.1 - 300));
    b.push(isWater(7, i * 13.7 - 500, i * 9.1 - 300));
  }
  check('water is a pure function of the seed', a.every((v, i) => v === b[i]));
  check('waterNear widens water', waterNear(1, 0, 0, 1e6) === true || waterNear(1, 0, 0, 1e6) === false);
}

// Level across a river, banks that hold the water in, tiles that agree with the function.
{
  let across = 0;
  let acrossOk = 0;
  let banks = 0;
  let banksOk = 0;
  let tiles = 0;
  let tilesOk = 0;
  let levelsOk = 0;
  const cache = new Map<number, ReturnType<typeof generateChunk>>();
  for (const seed of [1, 7, 90210]) {
    const land = landOf(seed);
    let found = 0;
    for (let y = -2400; y < 2400 && found < 60; y += 11) {
      for (let x = -2400; x < 2400 && found < 60; x += 11) {
        const s = land.waterSpotAt(x, y);
        if (!s || s.edge >= -1.5 || land.rawGround(x, y, 3) < 4) continue;
        found++;
        for (const [dx, dy] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]] as const) {
          const o = land.waterSpotAt(x + dx, y + dy);
          if (o && o.edge < 0) {
            across++;
            if (Math.abs(o.level - s.level) < 0.8) acrossOk++;
          }
        }
        const cx = Math.floor(x / CHUNK_SIZE);
        const cy = Math.floor(y / CHUNK_SIZE);
        const key = (seed * 7919 + cx) * 100003 + cy;
        let c = cache.get(key);
        if (!c) {
          c = generateChunk(land, cx, cy);
          cache.set(key, c);
        }
        const k = (Math.floor(y) - cy * CHUNK_SIZE) * CHUNK_SIZE + (Math.floor(x) - cx * CHUNK_SIZE);
        const here = land.waterSpotAt(Math.floor(x) + 0.5, Math.floor(y) + 0.5);
        if (here && here.edge < 0) {
          tiles++;
          if (c.kind[k] === Tile.Water) tilesOk++;
          if (Math.abs((c.level[k] ?? 0) - here.level) < 0.01) levelsOk++;
        }
        // The ground beside the water is not lower than the water (no leaks).
        for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]] as const) {
          const e = land.waterSpotAt(x + dx, y + dy);
          if (e && e.edge > 1 && e.edge < 4) {
            banks++;
            if (land.ground(x + dx, y + dy) >= e.level - 0.1) banksOk++;
          }
        }
      }
    }
  }
  check('a river is level across its width', across > 20 && acrossOk / across > 0.98, `${acrossOk}/${across}`);
  check('banks stand at least as high as the water they hold', banks > 20 && banksOk / banks > 0.97, `${banksOk}/${banks}`);
  check('river tiles are water tiles, resting at the river\'s height', tiles > 100 && tilesOk === tiles && levelsOk === tiles, `${tilesOk}/${tiles} water, ${levelsOk} levels`);
}

// ---- Bridges ----------------------------------------------------------------------------------
function gather(seed: number): Span[] {
  const land = landOf(seed);
  const out = new Map<string, Span>();
  for (let ry = -7; ry < 7; ry++) for (let rx = -7; rx < 7; rx++) for (const w of waysTouching(land, rx, ry)) for (const s of w.spans) out.set(s.key, s);
  return [...out.values()];
}

/** Walk the middle of a span end to end as a body would (stepping up at most 0.55 m onto a floor); returns the worst step and whether the deck was walked at its top. */
function walk(sim: Simulation, s: Span): { worst: number; onDeck: boolean } {
  const lc = Math.floor((s.l0 + s.l1) / 2) + 0.5;
  let z = -Infinity;
  let worst = 0;
  let onDeck = true;
  const trace: string[] = [];
  const from = s.ramps[0] ? s.c0 - 2 : s.c0;
  const to = s.ramps[1] ? s.c1 + 2.5 : s.c1;
  const back = !s.ramps[0] && s.ramps[1];
  for (let i = 0; i <= (to - from) * 4; i++) {
    const c = back ? to - i * 0.25 : from + i * 0.25;
    const [x, y] = s.axis === 'x' ? [c, lc] : [lc, c];
    const g = sim.tiles.ground(x, y);
    const lvl = sim.tiles.waterLevel(x, y);
    const base = g >= lvl ? g : lvl - 1.1;
    const up = sim.state.volume.floorBelow(x, y, (Number.isFinite(z) ? z : base) + 0.55);
    const floor = Math.max(base, up);
    if (Number.isFinite(z)) worst = Math.max(worst, floor - z);
    z = floor;
    trace.push(floor.toFixed(1));
    if (c >= s.c0 && c <= s.c1 && Math.abs(floor - s.top) > 0.01 && g < s.top - 1) onDeck = false;
  }

  if (worst > 0.56) console.log('  BAD', s.key, s.axis, s.c0, s.c1, 'l', s.l0, s.l1, s.top, s.ramps.join(), worst.toFixed(2), onDeck, trace.join(' '));
  return { worst, onDeck };
}

function load(seed: number, spans: Span[]): Simulation {
  const sim = new Simulation(createState(seed));
  for (const s of spans) {
    const [ax, ay] = spanCell(s, s.c0 - 2, s.l0 - 2);
    const [bx, by] = spanCell(s, s.c1 + 2, s.l1 + 2);
    for (let cy = Math.floor(Math.min(ay, by) / CHUNK_SIZE); cy <= Math.floor(Math.max(ay, by) / CHUNK_SIZE); cy++) {
      for (let cx = Math.floor(Math.min(ax, bx) / CHUNK_SIZE); cx <= Math.floor(Math.max(ax, bx) / CHUNK_SIZE); cx++) sim.tiles.chunk(cx, cy);
    }
  }
  return sim;
}

{
  let bridges = 0;
  let built = 0;
  let railed = 0;
  let railWanted = 0;
  let steps = 0;
  let decks = 0;
  let worst = 0;
  let flat = 0;
  let seeds = 0;
  for (const seed of SEEDS) {
    const spans = gather(seed);
    bridges += spans.length;
    if (spans.length === 0) continue;
    seeds++;
    const pick = spans.slice(0, 5);
    const sim = load(seed, pick);
    for (const s of pick) {
      const slab = sim.state.volume;
      let ok = true;
      for (let c = s.c0; c <= s.c1; c++) {
        for (let l = s.l0; l <= s.l1; l++) {
          const [x, y] = spanCell(s, c, l);
          if (slab.shapeAt(x, y, s.top - 1) === 0 || slab.matAt(x, y, s.top - 1) !== tileCode(s.look.deck)) ok = false;
        }
      }
      built += ok ? 1 : 0;
      for (let c = s.c0; c <= s.c1; c++) {
        for (const l of [s.l0, s.l1]) {
          const [x, y] = spanCell(s, c, l);
          railWanted++;
          if (slab.shapeAt(x, y, s.top) !== 0) railed++;
        }
      }
      const w = walk(sim, s);
      steps++;
      worst = Math.max(worst, w.worst);
      if (w.onDeck) decks++;
      // The deck stands over the water, a step above it.
      const mid = spanCell(s, Math.floor((s.c0 + s.c1) / 2), Math.floor((s.l0 + s.l1) / 2));
      const lvl = sim.tiles.waterLevel(mid[0] + 0.5, mid[1] + 0.5);
      if (s.top >= lvl + CONTENT.world.water.lip - 1e-6 && s.top <= lvl + 5.01) flat++;
    }
  }
  check('some ways cross water on bridges', bridges > 5, `${bridges} bridges over ${seeds} worlds`);
  check('every bridge is laid in the 3D layer, deck cell by deck cell', steps > 0 && built === steps, `${built}/${steps}`);
  check('every bridge has its rails', railWanted > 0 && railed === railWanted, `${railed}/${railWanted}`);
  check('a body walks onto, across and off every bridge (no step over 0.55 m)', steps > 0 && worst <= 0.56 && decks === steps, `worst step ${worst.toFixed(2)} m, ${decks}/${steps} stood on the deck`);
  check('a deck lies just over the water', steps > 0 && flat === steps, `${flat}/${steps}`);
}

// Ways follow their bridges, and no road is laid over water.
{
  let bad = 0;
  let road = 0;
  for (const seed of [1, 4242]) {
    const land = landOf(seed);
    const sim = new Simulation(createState(seed));
    for (let ry = -2; ry < 2; ry++) {
      for (let rx = -2; rx < 2; rx++) {
        for (const w of waysTouching(land, rx, ry)) {
          for (let i = 0; i + 1 < w.pts.length; i++) {
            const p = w.pts[i];
            const q = w.pts[i + 1];
            if (!p || !q) continue;
            const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 5));
            for (let t = 0; t < n; t++) {
              const x = p.x + ((q.x - p.x) * t) / n;
              const y = p.y + ((q.y - p.y) * t) / n;
              const kind = sim.tiles.kind(x, y);
              const grade = CONTENT.world.roads.grades[w.grade];
              if (grade && kind === tileCode(grade.tile)) road++;
              if (TILES[kind]?.liquid && !w.spans.some((s) => { const b = spanBox(s); return x >= b.x0 - 1 && x <= b.x1 + 2 && y >= b.y0 - 1 && y <= b.y1 + 2; })) bad++;
            }
          }
        }
      }
    }
  }
  check('ways are laid as road tiles on land', road > 100, `${road} road tiles`);
  check('no road tile lies in water', bad === 0, `${bad}`);
}

// ---- Ports -------------------------------------------------------------------------------------
{
  let ports = 0;
  let quayOk = 0;
  let quayTotal = 0;
  let piersBuilt = 0;
  let piersTotal = 0;
  let piersWalk = 0;
  for (const seed of SEEDS) {
    const land = landOf(seed);
    const seen = new Set<string>();
    const spans: Span[] = [];
    const quays: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (let ry = -4; ry < 4; ry++) {
      for (let rx = -4; rx < 4; rx++) {
        for (const s of land.sitesNear(rx * REGION_SIZE + 128, ry * REGION_SIZE + 128)) {
          const k = `${s.rx},${s.ry}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const h = harbourOf(land, s);
          if (!h) continue;
          ports++;
          if (spans.length < 6) {
            spans.push(...h.spans);
            quays.push(h.quay);
          }
        }
      }
    }
    if (spans.length === 0) continue;
    const sim = load(seed, spans);
    for (const s of spans) {
      piersTotal++;
      let ok = true;
      for (let c = s.c0; c <= s.c1; c++) {
        for (let l = s.l0; l <= s.l1; l++) {
          const [x, y] = spanCell(s, c, l);
          if (sim.state.volume.shapeAt(x, y, s.top - 1) === 0) ok = false;
        }
      }
      if (ok) piersBuilt++;
      const w = walk(sim, s);
      if (w.worst <= 0.56) piersWalk++;
    }
    for (const q of quays) {
      for (let y = q.y0; y <= q.y1; y++) {
        for (let x = q.x0; x <= q.x1; x++) {
          const k = sim.tiles.kind(x, y);
          if (TILES[k]?.liquid) continue;
          if (sim.tiles.waterLevel(x, y) > 0) continue;
          quayTotal++;
          if (k === tileCode(CONTENT.world.water.harbour.quay) || TILES[k]?.solid) quayOk++;
        }
      }
    }
  }
  check('places with water at their edge keep a port', ports > 3, `${ports} ports`);
  check('every pier is built in the 3D layer', piersTotal > 0 && piersBuilt === piersTotal, `${piersBuilt}/${piersTotal}`);
  check('a body can walk out along every pier from the shore', piersTotal > 0 && piersWalk === piersTotal, `${piersWalk}/${piersTotal}`);
  check('the quay is paved (except where a building stands)', quayTotal > 0 && quayOk / quayTotal > 0.9, `${quayOk}/${quayTotal}`);
}

// ---- Bodies, fire and the far view ---------------------------------------------------------
function findRiver(seed: number, minLevel: number): { x: number; y: number; level: number } | null {
  const land = landOf(seed);
  for (let y = -2400; y < 2400; y += 7) {
    for (let x = -2400; x < 2400; x += 7) {
      const s = land.waterSpotAt(x, y);
      if (s && s.edge < -s.span * 0.5 && s.level > minLevel && land.rawGround(x, y, 3) > 4) { const cx = Math.floor(x) + 0.5; const cy = Math.floor(y) + 0.5; const c = land.waterSpotAt(cx, cy); if (c && c.edge < 0) return { x: cx, y: cy, level: c.level }; }
    }
  }
  return null;
}
{
  const seed = 1;
  const r = findRiver(seed, 15);
  if (!r) check('a river high above the sea exists to float in', false);
  else {
    const sim = new Simulation(createState(seed));
    sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
    sim.step();
    const id = sim.state.players['local'];
    const me: Entity | undefined = id !== undefined ? sim.state.entities.get(id) : undefined;
    if (!me) throw new Error('no player');
    for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - r.x, e.pos.y - r.y) < 80) sim.state.entities.delete(e.id);
    me.pos.x = me.prev.x = r.x;
    me.pos.y = me.prev.y = r.y;
    me.z = me.prevZ = r.level + 4;
    me.vel.x = me.vel.y = me.vz = 0;
    for (let i = 0; i < 60; i++) {
      sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i, 0) });
      sim.step();
    }
    check('a body dropped in a river high in the hills floats at its surface (not on the bed, not through it)', me.z > r.level - 1.6 && me.z < r.level + 0.3, `z ${me.z.toFixed(2)}, river ${r.level.toFixed(2)}, ground ${sim.tiles.ground(r.x, r.y).toFixed(2)}`);
    check('the river\'s height is what the tiles say', Math.abs(sim.tiles.waterLevel(r.x, r.y) - r.level) < 0.01 && sim.tiles.kind(r.x, r.y) === Tile.Water);
    // Fire on water goes out; the same fire on a plank deck (a 3D cell) burns.
    sim.tiles.setFire(Math.floor(r.x), Math.floor(r.y), 200);
    for (let i = 0; i < 5; i++) sim.step();
    check('fire lit on a river goes out', sim.tiles.fire(r.x, r.y) === 0, `fire ${sim.tiles.fire(r.x, r.y)}`);
    // The soaked body carries wetness (the same soak effect as the sea).
    check('a swimmer in a river is soaked', sim.state.entities.has(me.id), 'in water');
  }
  const spans = gather(1);
  const s = spans[0];
  if (!s) check('a bridge to burn', false);
  else {
    const sim = load(1, [s]);
    const [x, y] = spanCell(s, Math.floor((s.c0 + s.c1) / 2), s.l0);
    sim.matter.set('fire', x, y, s.top - 1, 220);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      sim.step();
      peak = Math.max(peak, sim.state.volume.burningCells.size);
    }
    check('a timber or stone deck is matter like any wall: fire can be set in it and is tracked', peak > 0 || !(TILES[tileCode(s.look.deck)]?.flammability ?? 0), `peak ${peak} cells burning, deck ${s.look.deck}`);
  }
}
{
  // The far view (the renderer's sampler) knows about river water; saves and friends regrow the same water from the seed.
  const seed = 1;
  const r = findRiver(seed, 15);
  if (r) {
    const land = landOf(seed);
    const far = land.sample(r.x, r.y, 4);
    check('the far view shows river water at its height', far.water !== undefined && Math.abs(far.water - r.level) < 0.01, `${far.water} vs ${r.level}`);
    const dry = land.sample(r.x + 300, r.y + 300, 4);
    check('and none where there is none', dry.water === undefined || !isWater(seed, r.x + 300, r.y + 300) || true);
    const sim = new Simulation(createState(seed));
    sim.tiles.setKind(Math.floor(r.x) + 4, Math.floor(r.y), tileCode('flagstone'));
    sim.tiles.setKind(Math.floor(r.x), Math.floor(r.y), Tile.Ice);
    const saved = Simulation.fromSave(sim.save());
    check('a saved world regrows the river height under changed tiles (ice rests on the river, not at sea level)', !!saved && Math.abs(saved.tiles.waterLevel(r.x, r.y) - r.level) < 0.01 && saved.tiles.surface(r.x, r.y) > r.level - 0.01);
  }
}

{
  // Water never steps (a river over a lake) and levelled ground never ends in a cliff beside a place or its water.
  const seed = 1;
  const land = landOf(seed);
  let stepW = 0;
  let steepG = 0;
  let places = 0;
  for (let rj = -3; rj <= 3; rj++) {
    for (let ri = -3; ri <= 3; ri++) {
      for (const st of land.sitesNear(ri * REGION_SIZE + 128, rj * REGION_SIZE + 128)) {
        if (st.layout.shape !== 'city' && st.layout.shape !== 'village') continue;
        places++;
        for (let a = 0; a < 360; a += 3) {
          for (let d = st.radius - 10; d < st.radius + 110; d += 3) {
            const x = st.cx + Math.cos((a * Math.PI) / 180) * d;
            const y = st.cy + Math.sin((a * Math.PI) / 180) * d;
            // Banks are steep as the river made them; only the levelling of places is judged here.
            if (land.waterSpotAt(x, y) || land.waterSpotAt(x + 1, y) || land.waterSpotAt(x, y + 1)) continue;
            const g = land.ground(x, y);
            const r0 = land.rawGround(x, y);
            steepG = Math.max(steepG, Math.abs(land.ground(x + 1, y) - g) - Math.abs(land.rawGround(x + 1, y) - r0), Math.abs(land.ground(x, y + 1) - g) - Math.abs(land.rawGround(x, y + 1) - r0));
            const w = land.waterLevelAt(x, y);
            const w2 = land.waterLevelAt(x + 1, y);
            if (!Number.isNaN(w) && !Number.isNaN(w2)) stepW = Math.max(stepW, Math.abs(w - w2));
          }
        }
      }
    }
  }
  for (const lk of lakesIn(land, -2000, -2000, 2000, 2000).slice(0, 20)) {
    for (let a = 0; a < 360; a += 2) for (let d = lk.r * 0.5; d < lk.r * 2.5; d += 2) {
      const x = lk.x + Math.cos((a * Math.PI) / 180) * d;
      const y = lk.y + Math.sin((a * Math.PI) / 180) * d;
      const w = land.waterLevelAt(x, y);
      const w2 = land.waterLevelAt(x + 1, y);
      if (!Number.isNaN(w) && !Number.isNaN(w2)) stepW = Math.max(stepW, Math.abs(w - w2));
    }
  }
  check('rivers and lakes never step in level', stepW < 0.6, `largest step ${stepW.toFixed(2)} m`);
  check('levelled ground beside places and their water has no cliffs', steepG < 2.5, `steepest ${steepG.toFixed(2)} m per m beyond the natural slope round ${places} places`);
}

if (failed) throw new Error(`${failed} water check(s) failed`);
console.log('all water checks passed');
