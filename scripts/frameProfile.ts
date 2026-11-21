// Frame budget: runs the real Renderer headless (a stub canvas) and prints the time per pass.
// Not part of check:sim. Run: npx esbuild scripts/frameProfile.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/fp.mjs && node node_modules/.cache/fp.mjs [lines]
import { Simulation, createState } from '../src/sim';
import { Renderer } from '../src/render/renderer';

declare const process: { argv: string[] };
const lines = Number(process.argv[2] ?? 200);
const g = globalThis as unknown as Record<string, unknown>;
g.window = { innerWidth: 1920, innerHeight: 1080, addEventListener: () => undefined };
const ctx = { createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => undefined };
const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx } as unknown as HTMLCanvasElement;

const sim = new Simulation(createState(4242));
sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
const r = new Renderer(canvas, sim.sampler, sim.tiles);
r.viewport.setTargetHeight(lines);
for (let i = 0; i < 40; i++) sim.step();
const localId = sim.state.players['local'] ?? null;
const me = localId !== null ? sim.state.entities.get(localId) : null;
let yaw = 0;
const frame = (): void => {
  yaw += 0.01;
  r.render({ state: sim.state, tiles: sim.tiles, localId, alpha: 0.5, yaw, pitch: -0.05, dt: 0.016 });
};
for (let i = 0; i < 30; i++) frame();
const t0 = performance.now();
const N = 120;
for (let i = 0; i < N; i++) frame();
const ms = (performance.now() - t0) / N;
const s = r.stats;
console.log(`${r.viewport.width}x${r.viewport.height}  ${ms.toFixed(1)} ms/frame (${(1000 / ms).toFixed(0)} fps)  player=${!!me}`);
console.log(`light ${s.lightMs.toFixed(1)}  terrain ${s.terrainMs.toFixed(1)}  sky ${s.skyMs.toFixed(1)}  volume ${s.volumeMs.toFixed(1)}  sprites ${s.spritesMs.toFixed(1)}  vfx+hand ${s.vfxMs.toFixed(1)}  post ${s.postMs.toFixed(1)}`);
