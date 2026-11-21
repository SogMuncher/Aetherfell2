/**
 * Boots the BUNDLED game in a real browser (run `npm run build:vite` first, or use `npm run check:boot`):
 * no page errors on load, a new journey starts on the graphics-card renderer, and swapping the world
 * (save, then load, which makes a fresh Renderer like joining a friend does) leaves exactly one live view canvas.
 */
import { execSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// Playwright is not a project dependency: use a local install or the global one (the cloud sessions have it).
const req = createRequire(import.meta.url);
const { chromium } = req(req.resolve('playwright', { paths: [process.cwd(), execSync('npm root -g').toString().trim()] }));

const PORT = 4179;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const fail = async (msg, b) => {
  console.log('FAIL', msg);
  await b?.close();
  server.kill();
  process.exit(1);
};
try {
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.addInitScript(() => localStorage.setItem('aetherfell2.settings', JSON.stringify({ renderer: 'gpu', renderDistance: 3 })));
  await p.goto(`http://localhost:${PORT}/`);
  await p.waitForSelector('[data-a=solo]', { timeout: 15000 }).catch(() => fail('menu did not appear', b));
  await p.click('[data-a=solo]');
  await p.waitForTimeout(3000);
  const canvases = () => p.evaluate(() => document.querySelectorAll('canvas').length);
  const before = await canvases();
  await p.keyboard.press('F5');
  await p.waitForTimeout(500);
  await p.keyboard.press('F9');
  await p.waitForTimeout(3000);
  const after = await canvases();
  if (errs.length) await fail(`page errors: ${errs[0]}`, b);
  if (after !== before) await fail(`canvas count changed ${before} -> ${after} (a world swap left an old view behind)`, b);
  console.log('PASS boot: bundle loads, journey starts, world swap keeps one view');
  await b.close();
} finally {
  server.kill();
}
