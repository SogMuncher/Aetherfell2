// Headless checks for data-driven world generation and the far-away terrain: biomes come from
// content, marshes grow sedge and peat, and changed tiles (burnt forest, fire) show in the distant
// LOD blocks; tree pictures fade out where the far canopy takes over. Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { tileCode } from '../src/content/tiles';
import { CHUNK_SIZE } from '../src/types';
import { BLOCK, TerrainLod } from '../src/render/raycaster/terrainLod';
import type { LodBlock } from '../src/render/raycaster/terrainLod';
import { FLORA_FADE, FLORA_RANGE, TileBillboards } from '../src/render/raycaster/tileBillboards';
import { TILES } from '../src/content/tiles';
import { FormBank, formVariants, growForm } from '../src/render/entities/formArt';
import { REGION_SIZE, siteInRegion } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const problems = validateContent(CONTENT);
check('content validates (tiles, surfaces, biomes, world)', problems.length === 0, problems.join('; '));

const sim = new Simulation(createState(4242));
const terrain = sim.terrain;
const tiles = sim.tiles;

// 1. Every biome in content turns up somewhere.
const found = new Map<string, { x: number; y: number }>();
for (let y = -60000; y < 60000 && found.size < Object.keys(CONTENT.biomes).length; y += 613) {
  for (let x = -60000; x < 60000; x += 587) {
    const s = terrain.sample(x, y, 1);
    if (!found.has(s.biome)) found.set(s.biome, { x, y });
  }
}
const missing = Object.keys(CONTENT.biomes).filter((b) => !found.has(b));
check('every biome in content appears in the world', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : [...found.keys()].join(', '));

// 2. A marsh is made of its data: sedge ground with peat pools.
function biomeChunkTiles(biome: string): Map<number, number> | null {
  const at = found.get(biome);
  if (!at) return null;
  const c = tiles.chunk(Math.floor(at.x / CHUNK_SIZE), Math.floor(at.y / CHUNK_SIZE));
  const counts = new Map<number, number>();
  for (const k of c.kind) counts.set(k, (counts.get(k) ?? 0) + 1);
  return counts;
}
let marshOk = false;
let marshDetail = 'no marsh found';
for (let y = -60000; y < 60000 && !marshOk; y += 211) {
  for (let x = -60000; x < 60000 && !marshOk; x += 197) {
    if (terrain.sample(x, y, 1).biome !== 'marsh') continue;
    found.set('marsh', { x, y });
    const counts = biomeChunkTiles('marsh');
    const sedge = counts?.get(tileCode('sedge')) ?? 0;
    const peat = counts?.get(tileCode('peat')) ?? 0;
    marshDetail = `sedge ${sedge}, peat ${peat}`;
    if (sedge > 50 && peat > 10) marshOk = true;
  }
}
check('marshes grow sedge with pools of peat', marshOk, marshDetail);

// 3. Far terrain shows burnt land, lost treetops and fire glow.
let forestChunk: { cx: number; cy: number } | null = null;
for (let y = -30000; y < 30000 && !forestChunk; y += 331) {
  for (let x = -30000; x < 30000 && !forestChunk; x += 307) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const c = tiles.chunk(cx, cy);
    let trees = 0;
    for (const k of c.kind) if ((CONTENT.tiles[k]?.crown ?? 0) > 0) trees++;
    if (trees > 70) forestChunk = { cx, cy };
  }
}
if (!forestChunk) check('found a thick forest to burn', false);
else {
  const { cx, cy } = forestChunk;
  const lod = new TerrainLod(terrain, tiles);
  const level = 1;
  const wx = cx * CHUNK_SIZE + 3;
  const wy = cy * CHUNK_SIZE + 3;
  const frames = (n: number): LodBlock => {
    let b: LodBlock | null = null;
    for (let i = 0; i < n; i++) {
      lod.beginFrame(50);
      b = lod.get(level, wx, wy);
    }
    if (!b) throw new Error('no block');
    return b;
  };
  const cells = (b: LodBlock): number[] => {
    const out: number[] = [];
    const i0 = (cx * CHUNK_SIZE - b.ox) / b.cs;
    const j0 = (cy * CHUNK_SIZE - b.oy) / b.cs;
    for (let j = 0; j < CHUNK_SIZE / b.cs; j++) for (let i = 0; i < CHUNK_SIZE / b.cs; i++) out.push((j0 + j) * BLOCK + i0 + i);
    return out;
  };
  const stats = (b: LodBlock): { canopy: number; green: number; glow: number } => {
    let canopy = 0;
    let green = 0;
    let glow = 0;
    const qs = cells(b);
    for (const q of qs) {
      canopy += b.canopy[q] ?? 0;
      green += ((b.col[q] ?? 0) >>> 8) & 255;
      glow += b.glow[q] ?? 0;
    }
    return { canopy: canopy / qs.length, green: green / qs.length, glow: glow / qs.length };
  };
  const before = stats(frames(2));
  check('far forest has treetops before the fire', before.canopy > 20, `canopy ${before.canopy.toFixed(1)} dm`);
  // Burn the whole chunk: trees to charred trunks, grass to ash, soot everywhere, a few tiles still alight.
  const c = tiles.chunk(cx, cy);
  for (let j = 0; j < CHUNK_SIZE; j++) {
    for (let i = 0; i < CHUNK_SIZE; i++) {
      const x = cx * CHUNK_SIZE + i;
      const y = cy * CHUNK_SIZE + j;
      const info = tiles.info(x, y);
      if (info.liquid) continue;
      tiles.setKind(x, y, info.flammability > 0 ? info.burnsInto : info.code);
      tiles.setSoot(x, y, 200);
      if (j < 8) tiles.setFire(x, y, 120);
    }
  }
  check('the burnt chunk is marked changed', c.dirty && c.version > 0);
  const after = stats(frames(8));
  check('far terrain loses its treetops where the forest burnt', after.canopy < before.canopy * 0.2, `canopy ${before.canopy.toFixed(1)} → ${after.canopy.toFixed(1)} dm`);
  check('far terrain turns dark where the land burnt', after.green < before.green * 0.75, `green ${before.green.toFixed(0)} → ${after.green.toFixed(0)}`);
  check('far terrain glows where fire still burns', after.glow > 5 && before.glow === 0, `glow ${after.glow.toFixed(1)}`);
  // A block built after the fire (say, after walking away and back) shows it too.
  const fresh = new TerrainLod(terrain, tiles);
  let fb: LodBlock | null = null;
  for (let i = 0; i < 8; i++) {
    fresh.beginFrame(50);
    fb = fresh.get(3, wx, wy);
  }
  if (fb) {
    const i0 = Math.floor((cx * CHUNK_SIZE - fb.ox) / fb.cs);
    const j0 = Math.floor((cy * CHUNK_SIZE - fb.oy) / fb.cs);
    let can = 0;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) can += fb.canopy[(j0 + j) * BLOCK + i0 + i] ?? 0;
    check('coarser far blocks show the burn as well', can / 16 < before.canopy * 0.2, `canopy ${(can / 16).toFixed(1)} dm at 8 m cells`);
  }
  // Put the fire out: the glow goes away.
  for (let j = 0; j < 8; j++) for (let i = 0; i < CHUNK_SIZE; i++) tiles.setFire(cx * CHUNK_SIZE + i, cy * CHUNK_SIZE + j, 0);
  const out = stats(frames(8));
  check('the glow fades once the fire is out', out.glow === 0, `glow ${out.glow.toFixed(1)}`);
}

// 4. Tree pictures fade out with distance instead of stopping dead.
{
  const at = found.get('forest') ?? { x: 0, y: 0 };
  const flora = new TileBillboards();
  let near = 0;
  let fading = 0;
  let beyond = 0;
  let minFade = 1;
  flora.each(tiles, at.x, at.y, 1, 0, 0, 1, (b, fade) => {
    const d = Math.hypot(b.x - at.x, b.y - at.y);
    if (d < FLORA_FADE) near += fade === 1 ? 1 : 0;
    else if (d <= FLORA_RANGE) {
      fading++;
      minFade = Math.min(minFade, fade);
    } else beyond++;
  });
  check('trees fade out between the near and far ranges', near > 0 && fading > 0 && minFade < 0.2 && beyond === 0, `near ${near}, fading ${fading} (lowest ${minFade.toFixed(2)}), beyond ${beyond}`);
}

// 5. World objects grow from their forms: pictures as tall as what you bump into, every one different.
{
  const off: string[] = [];
  for (const t of Object.values(TILES)) {
    if (t.shape !== 'billboard' || !t.solid || !t.sprite) continue;
    const f = CONTENT.forms[t.sprite];
    if (!f) continue;
    let sum = 0;
    const n = formVariants(f);
    for (let v = 0; v < n; v++) sum += growForm(f, v * 7919 + 3).top;
    const avg = sum / n;
    if (Math.abs(avg - t.height) > t.height * 0.35) off.push(`${t.id} looks ${avg.toFixed(1)} m, blocks ${t.height} m`);
  }
  check('grown objects stand about as tall as their collision height', off.length === 0, off.join('; ') || 'all within 35%');
  const oak = CONTENT.forms.oak;
  if (oak) {
    const a = new FormBank(oak, 11, 1).sprite(0);
    const b = new FormBank(oak, 11, 1).sprite(0);
    const c = new FormBank(oak, 12, 1).sprite(0);
    const same = a.px.length === b.px.length && a.px.every((p, i) => p === b.px[i]);
    const differs = a.px.length !== c.px.length || a.px.some((p, i) => p !== c.px[i]);
    const side = new FormBank(oak, 11, 1).sprite(2);
    const turns = side.px.length !== a.px.length || side.px.some((p, i) => p !== a.px[i]);
    check('the same seed grows the same oak; another seed grows another; its sides differ', same && differs && turns);
  }
}

// 6. Villages and other built places are laid out as plans of 3D buildings from recipes.
{
  const sites: SiteLayout[] = [];
  const probe = (x: number, y: number): number => terrain.rawGround(x, y, 3);
  for (let ry = -40; ry < 40 && sites.length < 80; ry++) {
    for (let rx = -40; rx < 40; rx++) {
      const s = siteInRegion(terrain.seed, rx, ry, probe);
      if (s && s.layout.shape === 'village' && s.plan.length) sites.push(s);
    }
  }
  const kinds = new Set(sites.map((s) => s.kind));
  const plan = sites.flatMap((s) => s.plan);
  const recipes = new Set(plan.map((p) => p.id));
  const sizes = new Set(plan.map((p) => `${p.id}:${p.w}x${p.d}`));
  check(
    'buildings come in many kinds and sizes, turned to face the square',
    plan.length > 20 && recipes.size >= 5 && sizes.size > recipes.size * 2 && new Set(plan.map((p) => p.rot)).size === 4,
    `${plan.length} buildings in ${sites.length} places (${[...kinds].join(', ')}), ${recipes.size} recipes, ${sizes.size} sizes`,
  );
  // No two buildings of a place share ground, and every dwelling has a door cell outside it.
  let overlaps = 0;
  let walled = 0;
  for (const s of sites) {
    for (let i = 0; i < s.plan.length; i++) {
      const a = s.plan[i];
      if (!a) continue;
      for (let j = i + 1; j < s.plan.length; j++) {
        const b = s.plan[j];
        if (b && a.x < b.x + b.fx && a.x + a.fx > b.x && a.y < b.y + b.fy && a.y + a.fy > b.y) overlaps++;
      }
    }
    for (const h of s.houses) {
      const inside = h.doorX >= h.x0 && h.doorX <= h.x1 && h.doorY >= h.y0 && h.doorY <= h.y1;
      const touching = Math.abs(h.geometry.out.x - h.geometry.in.x) + Math.abs(h.geometry.out.y - h.geometry.in.y) === 2;
      if (inside || !touching) walled++;
    }
  }
  check('buildings never overlap, and each door opens onto open ground', overlaps === 0 && walled === 0, `${overlaps} overlaps, ${walled} bad doors`);
  // The real world has them: a village's plots are cleared of trees, the well stands in the square, and the far view sees its buildings.
  const v = sites.find((s) => s.kind === 'village');
  if (v) {
    let trees = 0;
    let cells = 0;
    for (const h of v.houses) {
      for (let y = h.y0; y <= h.y1; y++) {
        for (let x = h.x0; x <= h.x1; x++) {
          cells++;
          if (TILES[tiles.kind(x, y)]?.shape === 'billboard') trees++;
        }
      }
    }
    const well = tiles.kind(v.cx, v.cy) === tileCode('well');
    const h = v.houses[0];
    const far = h ? terrain.sample(h.x0, h.y0, 2).built : null;
    check('a village stands in the world as laid out: plots cleared, well in the square, buildings seen from afar', cells > 0 && trees === 0 && well && far !== null, `${trees} trees in ${cells} plot cells, well ${well}, far ${far === null ? 'none' : TILES[far]?.id}`);
  } else check('a village stands in the world as laid out', false, 'no village found');
  void REGION_SIZE;
}

if (failed) throw new Error(`${failed} world check(s) failed`);
console.log('all world checks passed');
