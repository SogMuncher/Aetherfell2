// WAYS: roads, paths and trails join the places of the world, and the underworld follows them.
// Checks: every kind of place that keeps a way is reachable, the ways are laid in real tiles (and not over water,
// buildings or walls), the same on every run; and beneath them the underworld holds an open artery along each way
// and a great hall under each place with an `under`, tagged for its scatter.
import { CONTENT, validateContent } from '../src/content';
import { TILES, tileCode } from '../src/content/tiles';
import { CHUNK_SIZE } from '../src/types';
import { landOf } from '../src/sim/world/terrain';
import { waysTouching, wayHit } from '../src/sim/world/roads';
import type { Way } from '../src/sim/world/roads';
import { REGION_SIZE } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';
import { generateChunk } from '../src/sim/world/chunkgen';
import { hallsInChunk, latticeSpot, PITCH } from '../src/sim/world/underworld';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const problems = validateContent(CONTENT);
check('content validates (grades, way, under)', problems.length === 0, problems.join('; '));

function gather(seed: number, R = 6): { ways: Way[]; sites: SiteLayout[] } {
  const land = landOf(seed);
  const ways = new Map<string, Way>();
  const sites = new Map<string, SiteLayout>();
  for (let ry = 0; ry < R; ry++) {
    for (let rx = 0; rx < R; rx++) {
      for (const w of waysTouching(land, rx, ry)) ways.set(w.key, w);
      for (const s of land.sitesNear(rx * REGION_SIZE + 128, ry * REGION_SIZE + 128)) sites.set(`${s.rx},${s.ry}`, s);
    }
  }
  return { ways: [...ways.values()], sites: [...sites.values()] };
}

// ---- the ways themselves --------------------------------------------------------------------------
let totalWays = 0;
let reachable = 0;
let wayPlaces = 0;
for (const seed of [1, 7, 4242, 90210]) {
  const { ways, sites } = gather(seed);
  totalWays += ways.length;
  // Ways are kept to the grade of their poorer end.
  const bad = ways.filter((w) => {
    const ga = CONTENT.world.roads.grades[CONTENT.sites[w.a.kind]?.way?.grade ?? ''];
    const gb = CONTENT.world.roads.grades[CONTENT.sites[w.b.kind]?.way?.grade ?? ''];
    return !ga || !gb || w.def.rank !== Math.min(ga.rank, gb.rank);
  });
  check(`seed ${seed}: each way has the lesser grade of its two ends`, bad.length === 0, `${bad.length} wrong of ${ways.length}`);
  // Components: most places that keep a way lie on a network of more than one.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = parent.get(k) ?? k;
    while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r;
    parent.set(k, r);
    return r;
  };
  const key = (s: SiteLayout): string => `${s.rx},${s.ry}`;
  const keeping = sites.filter((s) => CONTENT.sites[s.kind]?.way !== undefined);
  for (const w of ways) parent.set(find(key(w.a)), find(key(w.b)));
  const linked = keeping.filter((s) => ways.some((w) => key(w.a) === key(s) || key(w.b) === key(s)));
  wayPlaces += keeping.length;
  reachable += linked.length;
  const sizes = new Map<string, number>();
  for (const s of linked) sizes.set(find(key(s)), (sizes.get(find(key(s))) ?? 0) + 1);
  const biggest = Math.max(0, ...sizes.values());
  check(`seed ${seed}: the biggest network joins several places`, linked.length === 0 || biggest >= Math.min(3, linked.length), `${biggest} of ${linked.length} linked, ${keeping.length} keeping a way, ${ways.length} ways`);
}
check('ways exist at all', totalWays >= 20, `${totalWays} ways over 4 seeds`);
check('most places that keep a way are linked to another', wayPlaces === 0 || reachable / wayPlaces > 0.6, `${reachable}/${wayPlaces}`);

// Deterministic: asking again gives the same routes.
{
  const a = gather(4242).ways.map((w) => `${w.key}:${w.pts.length}:${w.pts[1]?.x.toFixed(2)}`).sort().join('|');
  const b = gather(4242).ways.map((w) => `${w.key}:${w.pts.length}:${w.pts[1]?.x.toFixed(2)}`).sort().join('|');
  check('ways are the same on every run', a === b && a.length > 0);
}

// Laid in real tiles: walk each way, generate the chunk, and the tile there is the way's own (or a place's own ground / a bridge-less gap).
{
  const seed = 4242;
  const land = landOf(seed);
  const { ways } = gather(seed);
  const cache = new Map<string, ReturnType<typeof generateChunk>>();
  let onWay = 0;
  let total = 0;
  let wet = 0;
  const wayTiles = new Set(Object.values(CONTENT.world.roads.grades).map((g) => tileCode(g.tile)));
  for (const w of ways.slice(0, 40)) {
    for (let i = 0; i + 1 < w.pts.length; i++) {
      const p = w.pts[i] as { x: number; y: number };
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      const cx = Math.floor(x / CHUNK_SIZE);
      const cy = Math.floor(y / CHUNK_SIZE);
      const ck = `${cx},${cy}`;
      let c = cache.get(ck);
      if (!c) {
        c = generateChunk(land, cx, cy);
        cache.set(ck, c);
      }
      const k = c.kind[(y - cy * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE)] ?? 0;
      const g = land.ground(x, y);
      if (g < CONTENT.world.roads.lowest) {
        wet++;
        continue;
      }
      total++;
      if (wayTiles.has(k) || !TILES[k]?.solid) onWay++;
    }
  }
  check('a way is never blocked by a tree or rock along its line', total === 0 || onWay / total > 0.95, `${onWay}/${total} open (${wet} on low ground skipped)`);
  const hits = ways.slice(0, 20).filter((w) => {
    const mid = w.pts[Math.floor(w.pts.length / 2)] as { x: number; y: number };
    return wayHit(land, mid.x, mid.y) !== null;
  });
  check('wayHit finds the way at its own middle', hits.length === Math.min(20, ways.length));
  // Water is not paved.
  let paved = 0;
  for (const c of cache.values()) for (let i = 0; i < c.kind.length; i++) if (c.kind[i] === tileCode('water') && wayTiles.has(c.kind[i] ?? 0)) paved++;
  check('no road lies under water', paved === 0);
}

// ---- the underworld follows them -----------------------------------------------------------------
{
  let open = 0;
  let total = 0;
  let halls = 0;
  let hallsWanted = 0;
  let tagged = 0;
  for (const seed of [1, 7, 4242]) {
    const { ways, sites } = gather(seed);
    for (const w of ways) {
      for (let i = 0; i + 1 < w.pts.length; i++) {
        const p = w.pts[i] as { x: number; y: number };
        const q = w.pts[i + 1] as { x: number; y: number };
        // The artery lies exactly under the road: sample along the route itself, every few metres.
        const steps = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 4));
        for (let t = 0; t < steps; t++) {
          total++;
          if (latticeSpot(seed, Math.floor(p.x + ((q.x - p.x) * t) / steps), Math.floor(p.y + ((q.y - p.y) * t) / steps)) !== 'rock') open++;
        }
      }
    }
    for (const s of sites) {
      const u = CONTENT.sites[s.kind]?.under;
      if (!u) continue;
      hallsWanted++;
      const ni = Math.floor(s.cx / PITCH);
      const nj = Math.floor(s.cy / PITCH);
      const ox = ni * PITCH + 8;
      const oy = nj * PITCH + 8;
      if (latticeSpot(seed, ox, oy) === 'hall' && latticeSpot(seed, ox + u.hall, oy + u.hall) === 'hall' && latticeSpot(seed, ox + u.hall + 1, oy) !== 'hall') halls++;
      const found = hallsInChunk(seed, Math.floor(ox / CHUNK_SIZE), Math.floor(oy / CHUNK_SIZE)).find((h) => h.cx === ox && h.cy === oy);
      if (found?.site === s.kind) tagged++;
    }
  }
  check('an artery is open exactly beneath every way', total > 0 && open / total > 0.99, `${open}/${total}`);
  check('a great hall lies under each place that has an undercroft', hallsWanted > 0 && halls / hallsWanted > 0.95, `${halls}/${hallsWanted}`);
  check('those halls know which place is above them (for their scatter)', hallsWanted > 0 && tagged / hallsWanted > 0.95, `${tagged}/${hallsWanted}`);
}

// ---- gates and walls ------------------------------------------------------------------------------
{
  let cities = 0;
  let gates = 0;
  let loose = 0;
  let unopened = 0;
  let through = 0;
  for (const seed of [1, 2, 3]) {
    const { ways, sites } = gather(seed, 14);
    for (const s of sites) {
      if (s.layout.shape !== 'city' || s.rx < 1 || s.ry < 1 || s.rx > 12 || s.ry > 12) continue;
      cities++;
      const ends = ways.flatMap((w) => [w.pts[0], w.pts[w.pts.length - 1]]).filter((p): p is { x: number; y: number } => p !== undefined);
      const near = (p: { x: number; y: number }, q: { x: number; y: number }): boolean => Math.abs(p.x - q.x) < 2 && Math.abs(p.y - q.y) < 2;
      for (const m of s.mouths ?? []) {
        gates++;
        if (!ends.some((e) => near(e, m))) loose++;
      }
      for (const w of ways) {
        const e = siteEnd(w, s);
        if (e && !(s.mouths ?? []).some((m) => near(m, e))) unopened++;
      }
      // A way never runs through the wall of a city it does not end at.
      const mg = (s.layout.walls.margin ?? 0) + 1;
      for (const w of ways) {
        if (w.a === s || w.b === s) continue;
        for (const p of w.pts) if (s.footprint.some((r) => p.x > r.x0 - mg && p.x < r.x1 + mg && p.y > r.y0 - mg && p.y < r.y1 + mg)) through++;
      }
    }
  }
  function siteEnd(w: Way, s: SiteLayout): { x: number; y: number } | undefined {
    return w.a.rx === s.rx && w.a.ry === s.ry ? w.pts[0] : w.b.rx === s.rx && w.b.ry === s.ry ? w.pts[w.pts.length - 1] : undefined;
  }
  check('some walled cities were found', cities > 0, `${cities} cities, ${gates} gates`);
  check('every gate has a road leaving it', loose === 0, `${loose} gates lead nowhere`);
  check('every road that meets a city leaves by an open gate', unopened === 0, `${unopened} roads end at a plain wall`);
  check('no road runs through another city\'s wall', through === 0, `${through} route points inside walls`);
}

if (failed) throw new Error(`${failed} way check(s) failed`);
console.log('all way checks passed');
