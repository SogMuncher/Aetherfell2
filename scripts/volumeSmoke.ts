// The 3D layer: shapes, the brick store, standing on stairs and ramps, bumping heads, buildings
// snapped together from recipes, walking in through a door and up a stair, saving and sending
// bricks, and drawing it all fast enough. Set SHOT=/some/dir to also write pictures.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { SHAPE_BOTTOM, SHAPE_HIT, SHAPE_SAMPLES, SHAPE_TOP, rayShape, shapeId } from '../src/content/shapes';
import { VolumeStore } from '../src/sim/world/volume';
import { buildStructure } from '../src/sim/structures';
import { tileCode } from '../src/content/tiles';
import { VolumeRenderer } from '../src/render/raycaster/volumeRenderer';
import { project } from '../src/render/raycaster/camera';
import { computeEnv, LightMap } from '../src/render/lighting';
import { TerrainRenderer } from '../src/render/raycaster/terrainRenderer';
import type { Viewport } from '../src/render/viewport';
import type { Entity, Rng, StructureSite } from '../src/types';
import { emptyInput, shapeByte } from '../src/types';

declare const process: { env: Record<string, string | undefined> };
const fsName = 'node:fs';
const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(path: string, data: Uint8Array): void };

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
function rngOf(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (a, b) => a + (b - a) * next(), int: (n) => Math.floor(next() * n), chance: (p) => next() < p, pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T };
}
const near = (a: number, b: number, e = 0.02): boolean => Math.abs(a - b) < e;

check('content (with structures) validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

// ---- Shapes -------------------------------------------------------------------------------
{
  const cube = shapeByte(shapeId('cube'), 0);
  check('a ray meets the face of a block', rayShape(cube, 0.5, 0.5, 2, 0, 0, -1) && near(SHAPE_HIT.t, 1) && SHAPE_HIT.nz === 1);
  const ramp = shapeByte(shapeId('ramp'), 0);
  check('a ramp rises toward +x', near(SHAPE_TOP[ramp * SHAPE_SAMPLES * SHAPE_SAMPLES + 0 * SHAPE_SAMPLES + 7] ?? 0, 0.94, 0.07) && near(SHAPE_TOP[ramp * SHAPE_SAMPLES * SHAPE_SAMPLES] ?? 9, 0.06, 0.07));
  const ramp1 = shapeByte(shapeId('ramp'), 1);
  check('turned a quarter, the ramp rises toward +y', (SHAPE_TOP[ramp1 * SHAPE_SAMPLES * SHAPE_SAMPLES + 7 * SHAPE_SAMPLES] ?? 0) > 0.85 && (SHAPE_TOP[ramp1 * SHAPE_SAMPLES * SHAPE_SAMPLES] ?? 9) < 0.15);
  const slabHigh = shapeByte(shapeId('slabHigh'), 0);
  check('a high slab is a thin floor at the top of its cell', near(SHAPE_TOP[slabHigh * SHAPE_SAMPLES * SHAPE_SAMPLES] ?? 0, 1) && near(SHAPE_BOTTOM[slabHigh * SHAPE_SAMPLES * SHAPE_SAMPLES] ?? 0, 0.5));
  const stair = shapeByte(shapeId('stair'), 0);
  check('a stair has two half-metre steps', near(SHAPE_TOP[stair * 64] ?? 0, 0.5) && near(SHAPE_TOP[stair * 64 + 7] ?? 0, 1));
  const bracket = shapeByte(shapeId('bracket'), 0);
  check('an arch shoulder is solid above its slope only', near(SHAPE_TOP[bracket * 64] ?? 0, 1) && (SHAPE_BOTTOM[bracket * 64 + 7] ?? 0) > 0.8 && (SHAPE_BOTTOM[bracket * 64] ?? 9) < 0.2);
}

// ---- The store ----------------------------------------------------------------------------
{
  const v = new VolumeStore();
  const cube = shapeByte(shapeId('cube'), 0);
  const slab = shapeByte(shapeId('slabHigh'), 0);
  const ver = v.version;
  v.set(3, 4, 5, cube, 7);
  v.set(3, 4, 9, slab, 7);
  check('cells go in and come back out', v.shapeAt(3, 4, 5) === cube && v.matAt(3, 4, 5) === 7 && v.shapeAt(3, 4, 6) === 0 && v.version > ver);
  check('a column knows its top', v.topAt(3.5, 4.5) === 10 && v.topAt(0, 0) === -Infinity);
  check('floors are found below, ceilings above', near(v.floorBelow(3.5, 4.5, 8), 6) && near(v.floorBelow(3.5, 4.5, 12), 10) && near(v.ceilingAbove(3.5, 4.5, 7), 9.5));
  check('open sky is lost under a roof', !v.openSky(3.5, 4.5, 6) && v.openSky(3.5, 4.5, 10.1) && v.openSky(8, 8, 1));
  check('bodies hit solids in the way', v.solidBetween(3.5, 4.5, 5.2, 7) && !v.solidBetween(3.5, 4.5, 6.1, 9.4) && v.solidBetween(3.5, 4.5, 8, 10));
  v.set(3, 4, 9, 0, 0);
  check('taking the roof off lowers the column top', v.topAt(3.5, 4.5) === 6);
  v.set(3, 4, 5, 0, 0);
  check('an emptied column is gone, and so is its brick', v.topAt(3.5, 4.5) === -Infinity && v.bricks.size === 0);
  // Round trip through packed bricks.
  const a = new VolumeStore();
  for (let i = 0; i < 40; i++) a.set(i, 2, 3 + (i % 4), i % 3 === 0 ? slab : cube, 5 + (i % 2));
  a.takeDirty();
  const b = new VolumeStore();
  for (const d of a.allBricks()) b.importBrick(JSON.parse(JSON.stringify(d)));
  let same = true;
  for (let i = 0; i < 40; i++) if (a.shapeAt(i, 2, 3 + (i % 4)) !== b.shapeAt(i, 2, 3 + (i % 4)) || a.matAt(i, 2, 3 + (i % 4)) !== b.matAt(i, 2, 3 + (i % 4))) same = false;
  check('bricks survive packing, saving and sending', same && b.topAt(5, 2) === a.topAt(5, 2));
  a.set(1, 1, 1, cube, 1);
  const dirty = a.takeDirty();
  check('only changed bricks are reported', dirty.length === 1 && a.takeDirty().length === 0);
}

// ---- Buildings ----------------------------------------------------------------------------
const flat = (): number => 0;
function build(id: string, seed: number, x = 0, y = 0, z = 0, rot = 0, into = new VolumeStore()): { v: VolumeStore; r: ReturnType<typeof buildStructure> } {
  const def = CONTENT.structures[id];
  if (!def) throw new Error(`no structure ${id}`);
  const site: StructureSite = { x, y, z, rot, ground: flat };
  return { v: into, r: buildStructure(def, into, site, rngOf(seed)) };
}
const signature = (v: VolumeStore): string => {
  let h = 0;
  for (const b of v.bricks.values()) for (let i = 0; i < b.shape.length; i++) h = (Math.imul(h, 31) + (b.shape[i] ?? 0) * 7 + (b.mat[i] ?? 0) + b.bx * 3 + b.by * 5 + b.bz * 11) | 0;
  return `${v.bricks.size}:${h}`;
};
{
  for (const id of Object.keys(CONTENT.structures)) {
    const { v, r } = build(id, 11, 100, 100);
    check(`'${id}' builds something sensible`, r.cells > 40 && r.x1 - r.x0 >= 4 && r.z1 > 2, `${r.cells} cells, ${r.x1 - r.x0 + 1}×${r.y1 - r.y0 + 1}×${r.z1 - r.z0 + 1}`);
    const again = build(id, 11, 100, 100);
    check(`'${id}' is the same every time from the same seed`, signature(v) === signature(again.v));
  }
  const cottage = build('cottage', 5, 0, 0, 0, 0);
  check('a cottage has a doorway you can walk through', !cottage.v.solidBetween(cottage.r.doorX + 0.5, cottage.r.doorY + 1.5, 0.1, 1.9) && !cottage.v.solidBetween(cottage.r.doorX + 0.5, cottage.r.doorY + 0.5, 0.1, 1.9));
  const rots = [0, 1, 2, 3].map((r) => build('hall', 3, 0, 0, 0, r).r);
  check('turning a building swaps its footprint', rots[0] !== undefined && rots[1] !== undefined && rots[0].width === rots[1]?.width && (rots[0].x1 - rots[0].x0) === (rots[2]?.x1 ?? 0) - (rots[2]?.x0 ?? 0) && (rots[0].x1 - rots[0].x0) === (rots[1].y1 - rots[1].y0));
  const dry = build('cottage', 5, 0, 0, 0, 0);
  const cx = dry.r.x0 + (dry.r.width >> 1);
  const cy = dry.r.y0 + (dry.r.depth >> 1);
  check('rain stops at a cottage roof but not outside', !dry.v.openSky(cx + 0.5, cy + 0.5, 1) && dry.v.openSky(cx + 0.5, dry.r.y0 - 3, 1));
  const ruin = build('ruinedKeep', 9, 0, 0, 0, 0).r;
  const keep = CONTENT.structures.ruinedKeep;
  check('a ruin has lost height against a whole building', keep !== undefined && ruin.cells > 100 && ruin.z1 < 3 * (keep.storeys?.[1] ?? 3) + 2);
}

// ---- Walking about ------------------------------------------------------------------------
function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  sim.state.weather.rain = 0;
  sim.state.weather.rainTarget = 0;
  sim.state.weather.nextShift = 1e9;
  return { sim, me };
}
function walk(sim: Simulation, me: Entity, yaw: number, ticks: number, forward = 1): void {
  for (let i = 0; i < ticks; i++) {
    const input = emptyInput(i, 0);
    input.forward = forward;
    input.yaw = yaw;
    sim.enqueue({ type: 'input', playerId: 'local', input });
    sim.step();
  }
  void me;
}
function flatSpot(sim: Simulation, from: Entity): { x: number; y: number; z: number } {
  // Find a patch of land at least 14 × 14 that is dry and nearly level.
  for (let r = 6; r < 200; r += 6) {
    for (let a = 0; a < 16; a++) {
      const x = Math.floor(from.pos.x + Math.cos((a / 16) * Math.PI * 2) * r);
      const y = Math.floor(from.pos.y + Math.sin((a / 16) * Math.PI * 2) * r);
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 14; i += 1) for (let j = 0; j < 14; j += 1) {
        const g = sim.tiles.ground(x + i, y + j);
        lo = Math.min(lo, g);
        hi = Math.max(hi, g);
        if (sim.tiles.blocked(x + i, y + j)) hi = 1e9;
      }
      if (lo > 0.5 && hi - lo < 1.2) return { x, y, z: Math.ceil(hi) };
    }
  }
  throw new Error('no level ground');
}
{
  const { sim, me } = world();
  const spot = flatSpot(sim, me);
  const def = CONTENT.structures.cottage;
  if (!def) throw new Error('no cottage');
  const site: StructureSite = { x: spot.x, y: spot.y, z: spot.z, rot: 0, ground: (x, y) => sim.tiles.ground(x, y) };
  const r = buildStructure(def, sim.state.volume, site, rngOf(2));
  // Trees and boulders in the way come down first (the build cheat does the same).
  for (let x = r.x0 - 1; x <= r.x1 + 1; x++) for (let y = r.y0 - 3; y <= r.y1 + 1; y++) if (sim.tiles.blocked(x + 0.5, y + 0.5)) sim.tiles.setKind(x, y, tileCode('grass'));
  // Stand outside the door, look in, and walk.
  me.pos.x = r.doorX + 0.5;
  me.pos.y = r.doorY + 0.5;
  me.z = spot.z;
  me.vel.x = 0;
  me.vel.y = 0;
  walk(sim, me, Math.PI / 2, 30);
  check('you can walk in through the door', me.pos.y > spot.y + 2 && Math.abs(me.z - spot.z) < 0.6, `y ${me.pos.y.toFixed(1)} (wall at ${spot.y}), z ${me.z.toFixed(2)} (floor ${spot.z})`);
  me.pos.x = spot.x + 0.5;
  me.pos.y = r.doorY + 0.5;
  me.z = spot.z;
  walk(sim, me, Math.PI / 2, 20);
  check('but not through a wall', me.pos.y < spot.y + 0.1, `y ${me.pos.y.toFixed(2)}`);
  // Jump inside: the roof stops you only if it is in reach; the floor holds you up.
  me.pos.x = r.doorX + 0.5;
  me.pos.y = spot.y + 2.5;
  me.z = spot.z + 0.0;
  me.vel.x = 0;
  me.vel.y = 0;
  walk(sim, me, 0, 10, 0);
  check('the floor holds you up', Math.abs(me.z - spot.z) < 0.1, `z ${me.z.toFixed(2)}`);
}
{
  const { sim, me } = world();
  const spot = flatSpot(sim, me);
  const def = CONTENT.structures.tower;
  if (!def) throw new Error('no tower');
  const site: StructureSite = { x: spot.x, y: spot.y, z: spot.z, rot: 0, ground: (x, y) => sim.tiles.ground(x, y) };
  const r = buildStructure(def, sim.state.volume, site, rngOf(4));
  const st = r.stairs;
  check('a tower with several floors has a stair', r.storeys > 1 && st !== null);
  if (st) {
    me.pos.x = st.x + 0.5 - 0.0;
    me.pos.y = st.y + 0.5;
    me.z = spot.z;
    me.vel.x = 0;
    me.vel.y = 0;
    walk(sim, me, 0, 26);
    check('you can climb the stair to the next floor', me.z > spot.z + 2.7, `z ${me.z.toFixed(2)} (next floor ${spot.z + 3})`);
    // Walk back and down, then jump up under the stairwell's ceiling.
    check('and it holds you there', Math.abs(me.z - (spot.z + 3)) < 0.4);
  }
}
{
  // Head bump: jump under a low ceiling.
  const { sim, me } = world();
  const spot = flatSpot(sim, me);
  const slab = shapeByte(shapeId('slabHigh'), 0);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) sim.state.volume.set(spot.x + i, spot.y + j, spot.z + 2, slab, tileCode('flagstone'));
  me.pos.x = spot.x + 0.5;
  me.pos.y = spot.y + 0.5;
  me.z = spot.z;
  me.vz = 9;
  let peak = 0;
  for (let i = 0; i < 6; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i, 0) });
    sim.step();
    peak = Math.max(peak, me.z - spot.z);
  }
  const body = CONTENT.things.player?.body.height ?? 1.8;
  check('heads bump on a low ceiling', peak + body <= 2.5 + 0.05, `peak ${peak.toFixed(2)} + height ${body}`);
}

// ---- The build cheat ----------------------------------------------------------------------
{
  const { sim, me } = world();
  me.angle = 0;
  const before = sim.state.volume.bricks.size;
  for (const id of Object.keys(CONTENT.structures)) {
    sim.enqueue({ type: 'cheat', playerId: 'local', cheat: 'build', value: id });
    me.pos.x += 40;
    sim.step();
  }
  check('the build cheat raises every recipe', sim.state.volume.bricks.size > before + 6, `${sim.state.volume.bricks.size} bricks`);
  // A cottage built right ahead has its door toward you: walk straight in.
  const w2 = world();
  w2.me.angle = 0;
  w2.me.pos.y = Math.floor(w2.me.pos.y) + 0.5;
  w2.sim.enqueue({ type: 'cheat', playerId: 'local', cheat: 'build', value: 'cottage' });
  w2.sim.step();
  const start = { x: w2.me.pos.x, y: w2.me.pos.y };
  // The cheat only fells what stands in the building's own way. Whatever the land happens to grow (or a footpath
  // happens to cross) in the steps between you and it is not the point of this check, so clear a lane to the door.
  for (let dx = 0; dx < 8; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = Math.floor(start.x) + dx;
      const ty = Math.floor(start.y) + dy;
      if (w2.sim.tiles.blocked(tx + 0.5, ty + 0.5) || w2.sim.tiles.info(tx, ty).shape === 'billboard') w2.sim.tiles.setKind(tx, ty, CONTENT.tileIds.grass ?? 0);
    }
  }
  let inside = false;
  for (let i = 0; i < 80 && !inside; i++) {
    const input = emptyInput(i, 0);
    input.forward = 1;
    input.yaw = 0;
    w2.sim.enqueue({ type: 'input', playerId: 'local', input });
    w2.sim.step();
    inside = !w2.sim.state.volume.openSky(w2.me.pos.x, w2.me.pos.y, w2.me.z + 1);
  }
  check('you can walk from where you stood into the building the cheat raised', inside, `from (${start.x.toFixed(0)},${start.y.toFixed(0)}) to (${w2.me.pos.x.toFixed(1)},${w2.me.pos.y.toFixed(1)})`);
}

// ---- Co-op and saves ----------------------------------------------------------------------
{
  const { sim } = world();
  sim.state.volume.set(1000, 1000, 5, shapeByte(shapeId('cube'), 0), tileCode('stoneWall'));
  // Bridges and piers (sim/world/crossings.ts) also write bricks when the land around is first made; look for the one we placed.
  const ev = sim.step().filter((e) => e.type === 'volumeChanged' && e.brick.bx === 1000 >> 4 && e.brick.by === 1000 >> 4 && e.brick.bz === 0);
  check('building announces the changed brick', ev.length === 1);
  const guest = Simulation.fromSave(sim.save());
  check('a saved world (and a joining friend) gets the 3D layer', !!guest && guest.state.volume.shapeAt(1000, 1000, 5) !== 0 && guest.state.volume.matAt(1000, 1000, 5) === tileCode('stoneWall'));
  const other = new Simulation(createState(1));
  const first = ev[0];
  if (first && first.type === 'volumeChanged') other.state.volume.importBrick(first.brick);
  check('events rebuild it on the other side', other.state.volume.shapeAt(1000, 1000, 5) !== 0);
}

// ---- Drawing ------------------------------------------------------------------------------
{
  const W = 356;
  const H = 200;
  const vp = { width: W, height: H, pixels: new Uint32Array(W * H), depth: new Float32Array(W * H) } as unknown as Viewport;
  const state = createState(7);
  state.weather.time = 0.35;
  const v = state.volume;
  const tower = build('tower', 21, 20, -3, 0, 0, v as unknown as VolumeStore);
  build('gatehouse', 8, -14, -9, 0, 1, v as unknown as VolumeStore);
  build('cottage', 3, 10, 18, 0, 2, v as unknown as VolumeStore);
  build('hall', 6, -20, 20, 0, 0, v as unknown as VolumeStore);
  build('ruinedKeep', 2, 40, 24, 0, 3, v as unknown as VolumeStore);
  build('watchtower', 2, 30, -22, 0, 0, v as unknown as VolumeStore);
  const vr = new VolumeRenderer();
  const lm = new LightMap();
  const floorGreen = (): void => {
    for (let i = 0; i < W * H; i++) {
      const y = Math.floor(i / W);
      vp.pixels[i] = y < H / 2 ? 0xffe0b070 : 0xff3a6628;
      vp.depth[i] = y < H / 2 ? 1e9 : 20 + (y - H / 2) * 0.8;
    }
  };
  const views: { name: string; x: number; y: number; z: number; yaw: number }[] = [
    { name: 'tower', x: -10, y: 0, z: 1.7, yaw: 0 },
    { name: 'gate', x: -8, y: -25, z: 1.7, yaw: Math.PI / 2 + 0.3 },
    { name: 'inside', x: 20 + 3.5, y: -3 + 1.5, z: 1.7, yaw: 0.4 },
    { name: 'far', x: -60, y: 0, z: 6, yaw: 0.1 },
    { name: 'empty', x: 300, y: 300, z: 1.7, yaw: 0 },
  ];
  for (const view of views) {
    const cam = { x: view.x, y: view.y, z: view.z, yaw: view.yaw, pitch: 0.05, shakeX: 0, shakeY: 0 };
    const p = project(cam, W, H, 0.5 / Math.tan((60 * Math.PI) / 360));
    const env = computeEnv(state, 0, view.x, view.y);
    floorGreen();
    vr.draw(vp, p, env, lm, v);
    let ms = Infinity;
    const N = 20;
    for (let k = 0; k < N; k++) {
      floorGreen();
      const t0 = performance.now();
      vr.draw(vp, p, env, lm, v);
      ms = Math.min(ms, performance.now() - t0);
    }
    let drawn = 0;
    for (let i = 0; i < W * H; i++) if ((vp.depth[i] ?? 0) < 1e8 && (vp.pixels[i] ?? 0) !== 0xff3a6628 && (vp.pixels[i] ?? 0) !== 0xffe0b070) drawn++;
    console.log(`     view '${view.name}': ${ms.toFixed(2)} ms, ${vr.traced} pixels traced, ${vr.bricksDrawn} bricks, ${drawn} pixels changed`);
    if (view.name === 'empty') check('far from any building the 3D layer costs nothing', ms < 0.5 && vr.traced === 0);
    else if (view.name === 'inside') check('inside a tower the frame is still fast', ms < 35 && drawn > W * H * 0.3, `${ms.toFixed(1)} ms`);
    else check(`'${view.name}' view draws in good time and shows structures`, ms < 25 && drawn > 500, `${ms.toFixed(1)} ms, ${drawn} px`);
    const dir = process.env.SHOT;
    if (dir) {
      const head = new TextEncoder().encode(`P6 ${W} ${H} 255\n`);
      const out = new Uint8Array(head.length + W * H * 3);
      out.set(head);
      for (let i = 0; i < W * H; i++) {
        const c = vp.pixels[i] ?? 0;
        out[head.length + i * 3] = c & 255;
        out[head.length + i * 3 + 1] = (c >>> 8) & 255;
        out[head.length + i * 3 + 2] = (c >>> 16) & 255;
      }
      fs.writeFileSync(`${dir}/${view.name}.ppm`, out);
    }
  }
  check('tower is tall enough to see from afar', tower.r.z1 > 8);
  void TerrainRenderer;
}

if (failed) throw new Error(`${failed} volume check(s) failed`);
console.log('all volume checks passed');
