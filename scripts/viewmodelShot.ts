// Draws the first-person weapon in a row of poses into PNG pictures (SHOT=/some/dir) and checks it
// paints something sensible. Pictures are scaled up 3× so the pixels can be judged by eye.
import { Simulation, createState } from '../src/sim';
import { ViewModel } from '../src/render/entities/viewModel';
import { computeEnv, LightMap } from '../src/render/lighting';
import type { Surface } from '../src/render/vfx/glow';
import type { Entity, SwingDir } from '../src/types';

declare const process: { env: Record<string, string | undefined> };
const fsName = 'node:fs';
const zName = 'node:zlib';
const fs = (await import(/* @vite-ignore */ fsName)) as { writeFileSync(path: string, data: Uint8Array): void; mkdirSync(path: string, o: { recursive: boolean }): void };
const zlib = (await import(/* @vite-ignore */ zName)) as { deflateSync(b: Uint8Array): Uint8Array };

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const x of b) c = (crcTable[(c ^ x) & 255] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function png(w: number, h: number, px: Uint32Array, scale: number): Uint8Array {
  const W = w * scale;
  const H = h * scale;
  const raw = new Uint8Array((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const c = px[Math.floor(y / scale) * w + Math.floor(x / scale)] as number;
      const o = y * (W * 4 + 1) + 1 + x * 4;
      raw[o] = c & 255;
      raw[o + 1] = (c >>> 8) & 255;
      raw[o + 2] = (c >>> 16) & 255;
      raw[o + 3] = 255;
    }
  }
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const head = new Uint8Array(13);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  head[8] = 8;
  head[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const W = 320;
const H = 200;
function backdrop(s: Surface, night: boolean): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sky = y < H * 0.5;
      const t = sky ? y / (H * 0.5) : (y - H * 0.5) / (H * 0.5);
      const n = ((x * 7 + y * 13) % 5) / 90;
      const r = night ? (sky ? 8 + t * 10 : 14 + t * 6) : sky ? 110 + t * 60 : 70 + t * 20;
      const g = night ? (sky ? 10 + t * 14 : 20 + t * 8) : sky ? 150 + t * 50 : 100 + t * 25;
      const b = night ? (sky ? 24 + t * 22 : 16 + t * 6) : sky ? 210 : 60 + t * 10;
      s.pixels[y * W + x] = (0xff000000 | (Math.min(255, b * (1 + n)) << 16) | (Math.min(255, g * (1 + n)) << 8) | Math.min(255, r * (1 + n))) >>> 0;
    }
  }
  // A dummy to hit: a post.
  for (let y = 60; y < 140; y++) for (let x = 150; x < 170; x++) s.pixels[y * W + x] = 0xff2a4a6a;
}

const sim = new Simulation(createState(4242));
sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
sim.step();
const me = sim.state.entities.get(sim.state.players['local'] as number) as Entity;
const lm = new LightMap();
const surface: Surface = { width: W, height: H, pixels: new Uint32Array(W * H) };
const dir = process.env.SHOT;
if (dir) fs.mkdirSync(dir, { recursive: true });

function pose(weapon: string | null, kind: 'rest' | 'guard' | SwingDir, t: number, power = 0.6): Entity {
  const a = me.actor;
  if (!a) throw new Error('no actor');
  a.weapon = weapon;
  a.swing = null;
  a.charge = null;
  a.guard = null;
  if (kind === 'guard') a.guard = 'left';
  else if (kind !== 'rest') a.swing = { dir: kind, t: Math.floor(t * 20), strikeAt: 10, recover: 28, struck: false, power };
  return me;
}

let frame = 0;
function shot(name: string, night: boolean, warm = true, vm = new ViewModel()): number {
  for (let w = 0; w < 24 && warm; w++) {
    backdrop(surface, night);
    vm.draw(surface, me, computeEnv(sim.state, 0, me.pos.x, me.pos.y), lm, { yaw: 0.3, pitch: 0, bob: 0, alpha: 0, dt: 1 / 60, time: 0.5 + w / 60 });
  }
  backdrop(surface, night);
  const env = computeEnv(sim.state, 0, me.pos.x, me.pos.y);
  const f = { yaw: 0.3, pitch: 0, bob: 0, alpha: 0, dt: 1 / 60, time: 1 + frame++ / 60 };
  vm.draw(surface, me, env, lm, f);
  if (dir) fs.writeFileSync(`${dir}/${name}.png`, png(W, H, surface.pixels, 3));
  let lit = 0;
  for (let i = 0; i < surface.pixels.length; i++) if (((surface.pixels[i] as number) & 0xffffff) !== ((surface.pixels[i - 1] ?? 0) & 0xffffff)) lit++;
  return lit;
}

const weapons = ['gear:sword:iron:common', 'gear:axe:iron:common', 'gear:hammer:iron:common', 'gear:spear:iron:common', 'torch', null];
for (const w of weapons) {
  pose(w, 'rest', 0);
  const n = shot(`rest_${w ?? 'fist'}`, false);
  check(`${w ?? 'fist'} draws at rest`, n > 400, `${n} edges`);
}
for (const w of ['gear:sword:iron:common', 'torch']) {
  for (const dirn of ['left', 'right', 'thrust', 'overhead'] as const) {
    // A run of frames through one swing so the ribbon builds up.
    const vm = new ViewModel();
    pose(w, dirn, 0);
    for (let k = 0; k <= 14; k++) {
      me.actor!.swing!.t = 0;
      pose(w, dirn, 0);
      (me.actor!.swing as { t: number }).t = Math.floor((k / 14) * 12);
      const last = k === 14;
      const n = shot(`${w}_${dirn}_${k}`, w === 'torch', k === 0 && false, vm);
      if (last) check(`${w} ${dirn} swing draws`, n > 400, `${n}`);
    }
  }
}
pose('gear:sword:iron:common', 'guard', 0);
shot('guard_sword', false);
console.log(failed === 0 ? 'viewmodelShot: all passed' : `viewmodelShot: ${failed} failed`);
if (failed) throw new Error('viewmodel checks failed');
