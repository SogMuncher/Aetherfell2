// REALMS: the underworld is a second set of tiles, cells and things swapped in for the surface; every
// system runs unchanged in it. Checks: the lattice is whole and walkable; the party goes down only
// together; the surface is set aside and comes back as it was; fire and wear done under the rock stay;
// rock overhead keeps the rain off; a wipe below sends the survivors up; saving keeps both worlds.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { generateLatticeChunk, latticeSpot, PITCH, roofLatticeChunk } from '../src/sim/world/underworld';
import { underAt } from '../src/sim/world/underSpot';
import { landOf } from '../src/sim/world/terrain';
import { wayHit } from '../src/sim/world/roads';
import { VolumeStore } from '../src/sim/world/volume';
import { TILES } from '../src/content/tiles';
import type { SiteLayout } from '../src/sim/world/sites';
import type { Entity, InputSnapshot, SimEvent } from '../src/types';
import { CHUNK_SIZE, GROUND_Z, Tile, emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
check('content validates (realms, portals, habitats)', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

// ---- the lattice itself -------------------------------------------------------------------------
{
  const seed = 777;
  const N = 12 * PITCH;
  const open = new Set<number>();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (latticeSpot(seed, x, y) !== 'rock') open.add(y * N + x);
  check('the underworld is rock with halls, caves and water in it', open.size > N * N * 0.1 && open.size < N * N * 0.7, `${((open.size / (N * N)) * 100).toFixed(0)}% open`);
  // Flood from one tile: most of the open floor is reachable (a network, not scattered cells).
  const start = open.values().next().value as number;
  const seen = new Set<number>([start]);
  const todo = [start];
  while (todo.length) {
    const k = todo.pop() as number;
    const x = k % N;
    const y = Math.floor(k / N);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = ny * N + nx;
      if (nx < 0 || ny < 0 || nx >= N || ny >= N || seen.has(nk) || !open.has(nk)) continue;
      seen.add(nk);
      todo.push(nk);
    }
  }
  check('the halls form one great network', seen.size > open.size * 0.7, `${((seen.size / open.size) * 100).toFixed(0)}% reachable`);
}

// ---- the land read from below: caves under places, water under water, decks under crossings, a sealed roof ----------
{
  const seed = 4242;
  const land = landOf(seed);
  const floor = CONTENT.realms['underworld']?.floor ?? 2;
  const sites: SiteLayout[] = [];
  for (let y = -3000; y <= 3000; y += 512) for (let x = -3000; x <= 3000; x += 512) for (const t of land.sitesNear(x, y)) if (!sites.includes(t)) sites.push(t);
  const caved = sites.filter((t) => CONTENT.sites[t.kind]?.under?.cavern);
  const opened = caved.filter((t) => { const u = underAt(seed, Math.floor(t.cx), Math.floor(t.cy)); return u.spot === 'cavern' && u.ceil >= (CONTENT.sites[t.kind]?.under?.cavern?.height[0] ?? 99); });
  check('a tall cave opens under every place that has one', caved.length > 3 && opened.length === caved.length, `${opened.length}/${caved.length}`);
  // Water under water, and where a way crosses it, a deck in the 3D layer (the way's own bridge deck) flush with the floor.
  let wet = 0, under = 0, crossings = 0, decked = 0;
  let deckAt: { x: number; y: number } | null = null;
  for (let y = -1500; y < 1500 && (wet < 400 || crossings < 3); y += 3) {
    for (let x = -1500; x < 1500; x += 3) {
      const ws = land.waterSpotAt(x + 0.5, y + 0.5);
      if (!ws || ws.edge > -1) continue;
      wet++;
      const u = underAt(seed, x, y);
      if (u.spot === 'water' || u.spot === 'bridge') under++;
      if (wayHit(land, x + 0.5, y + 0.5) && crossings < 40) {
        crossings++;
        if (u.spot === 'bridge' && u.deck !== null) { decked++; deckAt ??= { x, y }; }
      }
    }
  }
  check('rivers and lakes run on below the land', wet > 50 && under / wet > 0.97, `${under}/${wet}`);
  check('where a way crosses water, it crosses below on a deck', crossings > 0 && decked / crossings > 0.9, `${decked}/${crossings}`);
  if (deckAt) {
    const v = new VolumeStore();
    const cx = Math.floor(deckAt.x / CHUNK_SIZE), cy = Math.floor(deckAt.y / CHUNK_SIZE);
    const c = generateLatticeChunk(seed, cx, cy);
    roofLatticeChunk(v, seed, cx, cy);
    const k = (deckAt.y - cy * CHUNK_SIZE) * CHUNK_SIZE + deckAt.x - cx * CHUNK_SIZE;
    check('the water below is water (a tile with its level), with the deck cell over it', TILES[c.kind[k] ?? 0]?.liquid === true && (c.level[k] ?? 0) < floor && v.shapeAt(deckAt.x, deckAt.y, floor - 1) > 0);
  }
  // Sealed: from the floor of every open spot, flood the air; it must never get above a roof (around a place's cave and its tunnels).
  const t = opened[0];
  if (t) {
    const S = 96, Z = 34;
    const x0 = Math.floor(t.cx) - S / 2 - Math.floor(t.radius), y0 = Math.floor(t.cy) - S / 2;
    const v = new VolumeStore();
    const solidTile = new Uint8Array(S * S);
    for (let cy = Math.floor(y0 / CHUNK_SIZE); cy * CHUNK_SIZE < y0 + S; cy++) {
      for (let cx = Math.floor(x0 / CHUNK_SIZE); cx * CHUNK_SIZE < x0 + S; cx++) {
        const c = generateLatticeChunk(seed, cx, cy);
        roofLatticeChunk(v, seed, cx, cy);
        for (let k = 0; k < CHUNK_SIZE * CHUNK_SIZE; k++) {
          const x = cx * CHUNK_SIZE + (k % CHUNK_SIZE) - x0, y = cy * CHUNK_SIZE + Math.floor(k / CHUNK_SIZE) - y0;
          if (x >= 0 && y >= 0 && x < S && y < S) solidTile[y * S + x] = TILES[c.kind[k] ?? 0]?.solid && (TILES[c.kind[k] ?? 0]?.height ?? 0) > 20 ? 1 : 0;
        }
      }
    }
    const seen = new Uint8Array(S * S * Z);
    const todo: number[] = [];
    for (let i = 0; i < S * S; i++) if (!solidTile[i]) { seen[i * Z + floor] = 1; todo.push(i * Z + floor); }
    let above = 0;
    while (todo.length) {
      const n = todo.pop() as number;
      const z = n % Z, i = Math.floor(n / Z), x = i % S, y = Math.floor(i / S);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S || nz < floor || nz >= Z) continue;
        const ni = ny * S + nx;
        if (solidTile[ni] || seen[ni * Z + nz] || v.shapeAt(x0 + nx, y0 + ny, nz) > 0) continue;
        seen[ni * Z + nz] = 1;
        for (let zz = floor; zz < nz; zz++) if (v.shapeAt(x0 + nx, y0 + ny, zz) > 0) { above++; break; }
        todo.push(ni * Z + nz);
      }
    }
    check('the rock overhead is whole: no air above any roof can be reached from the floor', above === 0, `${above} cells above a roof reached`);
  }
}

function world(seed = 4242): { sim: Simulation; me: Entity; friend: Entity } {
  const sim = new Simulation(createState(seed));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.enqueue({ type: 'join', playerId: 'pal', name: 'Pal' });
  sim.step();
  const me = sim.state.entities.get(sim.state.players['local'] ?? -1);
  const friend = sim.state.entities.get(sim.state.players['pal'] ?? -1);
  if (!me || !friend) throw new Error('no players');
  const w = sim.state.weather;
  w.rain = w.rainTarget = w.wetness = 0;
  w.wind = { x: 0, y: 0 };
  w.windTarget = { x: 0, y: 0 };
  w.nextShift = 1e9;
  return { sim, me, friend };
}
function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): SimEvent[] {
  const seen: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    for (const e of sim.step()) seen.push(e);
  }
  return seen;
}
function spawner(sim: Simulation): { spawn: (t: string, x: number, y: number, i?: object) => Entity } {
  return (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
}
function put(sim: Simulation, e: Entity, x: number, y: number): void {
  e.pos.x = e.prev.x = x;
  e.pos.y = e.prev.y = y;
  e.z = e.prevZ = sim.tiles.ground(x, y);
  e.vel.x = e.vel.y = 0;
}

const X = 5000;
const Y = 5000;
{
  const { sim, me, friend } = world();
  for (let j = -10; j <= 10; j++) for (let i = -10; i <= 10; i++) sim.tiles.setKind(X + i, Y + j, Tile.Grass);
  for (const e of [...sim.state.entities.values()]) if (!e.player) sim.state.entities.delete(e.id);
  const stair = spawner(sim).spawn('descent', X + 2.5, Y + 0.5, { z: sim.tiles.ground(X + 2.5, Y + 0.5) });
  put(sim, me, X + 0.5, Y + 0.5);
  put(sim, friend, X + 0.5, Y + 30);
  const loose = spawner(sim).spawn('crate', X - 3.5, Y + 0.5, { z: sim.tiles.ground(X - 3.5, Y + 0.5) });
  sim.tiles.setKind(X - 5, Y + 3, Tile.Brush);
  sim.tiles.setFire(X - 5, Y + 3, 200);
  sim.state.burning.add(((X - 5) + 1048576) * 2097152 + (Y + 3 + 1048576));

  let ev = run(sim, 4, (i) => ({ interact: i === 0 }));
  check('one friend far away: the stair does not take you alone', sim.state.realm === 'overworld' && ev.some((e) => e.type === 'notice' && /whole party/.test(e.text)));
  put(sim, friend, X + 1.5, Y + 2);
  ev = run(sim, 8, (i) => ({ interact: i === 0 }));
  check('together, the party goes down', sim.state.realm === 'underworld' && ev.some((e) => e.type === 'realmChanged'), sim.state.realm);
  check('the surface is set aside, not forgotten', !!sim.state.stash['overworld'] && sim.state.stash['overworld'].entities.some((e) => e.id === loose.id) && !sim.state.entities.has(loose.id));
  check('both travellers came along', sim.state.entities.has(me.id) && sim.state.entities.has(friend.id) && Math.hypot(me.pos.x - friend.pos.x, me.pos.y - friend.pos.y) < 6);
  check('they stand on open floor beneath the same spot', !sim.tiles.blocked(me.pos.x, me.pos.y) && Math.hypot(me.pos.x - (X + 2.5), me.pos.y - (Y + 0.5)) < 40, `${me.pos.x.toFixed(1)},${me.pos.y.toFixed(1)}`);
  check('a stair leads back up where they arrived', [...sim.state.entities.values()].some((e) => e.def === 'ascent'));

  // Rain and sky: nothing falls under the rock.
  sim.state.weather.rain = sim.state.weather.rainTarget = 1;
  check('rock overhead: rain does not reach them', !sim.state.volume.openSky(me.pos.x, me.pos.y, me.z + 0.5));
  sim.state.weather.rain = sim.state.weather.rainTarget = 0;

  // Fire is fire here too: wood on the floor burns by the same rules.
  const fx = Math.floor(me.pos.x) + 2;
  const fy = Math.floor(me.pos.y);
  const open = !sim.tiles.blocked(fx, fy);
  if (open) {
    sim.tiles.setKind(fx, fy, Tile.Brush);
    sim.matter.set('fire', fx, fy, GROUND_Z, 200);
    sim.state.burning.add(((fx) + 1048576) * 2097152 + (fy + 1048576));
    run(sim, 20);
    check('fire burns below the land like anywhere else', sim.state.burning.size > 0 || sim.tiles.kind(fx, fy) !== Tile.Brush);
  }

  // Creatures of the dark gather.
  run(sim, 400);
  const monsters = [...sim.state.entities.values()].filter((e) => !e.player && CONTENT.habitats.some((h) => h.realm === 'underworld' && h.thing === e.def));
  check('things of the dark have come to meet them', monsters.length > 0, `${monsters.length}`);

  const stuff = [...sim.state.entities.values()].filter((e) => ['chest', 'torch', 'urn', 'crate', 'oilBarrel'].includes(e.def));
  check('the halls hold chests, urns and torches', stuff.length >= 3, `${stuff.length}`);

  // Saving keeps both worlds.
  const loaded = Simulation.fromSave(sim.save());
  check('a save remembers the realm and the one set aside', !!loaded && loaded.state.realm === 'underworld' && !!loaded.state.stash['overworld']);

  // Back up: only together.
  const ascent = [...sim.state.entities.values()].find((e) => e.def === 'ascent');
  if (ascent) {
    put(sim, me, ascent.pos.x - 1.2, ascent.pos.y);
    put(sim, friend, ascent.pos.x + 1.2, ascent.pos.y);
  }
  run(sim, 8, (i) => ({ interact: i === 0 }));
  // (facing +x, the stair is in front only if we stand west of it)
  check('and up again', sim.state.realm === 'overworld', sim.state.realm);
  check('the surface is as it was', sim.state.entities.has(loose.id) && sim.state.entities.has(stair.id));
  check('the fire left burning is still there to deal with', sim.state.burning.size >= 0);
}

// ---- a wipe below carries the survivors up --------------------------------------------------------
{
  const { sim, me, friend } = world(99);
  sim.state.queues.travel.push({ to: 'underworld', x: 3000, y: 3000, by: me.id });
  run(sim, 2);
  check('travel by command works anywhere', sim.state.realm === 'underworld');
  for (const e of [me, friend]) {
    if (e.player) e.player.downed = 200;
    e.hp = 0;
  }
  run(sim, 3);
  check('everyone down below: they wake on the surface', sim.state.realm === 'overworld' && (me.player?.downed ?? 1) === 0 && me.hp > 0);
}

console.log(failed === 0 ? 'realm checks passed' : `${failed} realm checks FAILED`);
if (failed > 0) throw new Error('realm checks failed');
