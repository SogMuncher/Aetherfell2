// One runner for every check, with short output (only failures + one summary line per script).
// Usage: node scripts/check.mjs [area|script ...] [--no-tsc] [--verbose]
//   npm run check combat        tsc + the combat checks
//   npm run check all           tsc + every scripts/*Smoke.ts (what CI runs)
//   npm run check gearSmoke     tsc + one script
// Runs every listed script even if one fails; exits 1 if anything failed.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

// Area -> checks. Keep in step with the "Checks" line of each docs/<area>.md.
const AREAS = {
  combat: ['mechanicsSmoke', 'runebookSmoke', 'fireSmoke', 'gearSmoke', 'outfitSmoke', 'torchSmoke', 'senseSmoke'],
  realms: ['volumeSmoke', 'fineSmoke', 'doorSmoke', 'realmSmoke', 'matterSmoke', 'matterFireSmoke', 'craftSmoke', 'shipSmoke'],
  world: ['worldSmoke', 'settlementSmoke', 'citySmoke', 'waysSmoke', 'waterSmoke', 'matterSmoke', 'matterFireSmoke'],
  render: ['artSmoke', 'skySmoke'],
  rpg: ['townSmoke', 'barkSmoke', 'partySmoke', 'mechanicsSmoke', 'simSmoke', 'cheatsSmoke', 'dataSmoke', 'gearSmoke', 'outfitSmoke', 'senseSmoke', 'handsSmoke', 'glideSmoke'],
  content: ['dataSmoke', 'mechanicsSmoke'],
  audio: ['mechanicsSmoke', 'musicSmoke'],
  multiplayer: ['coopSmoke'],
  ui: [],
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const names = args.filter((a) => !a.startsWith('--'));
const allSmokes = readdirSync('scripts').filter((f) => f.endsWith('Smoke.ts')).map((f) => f.slice(0, -3)).sort();

const wanted = new Set();
for (const n of names.length ? names : ['all']) {
  if (n === 'all') allSmokes.forEach((s) => wanted.add(s));
  else if (n in AREAS) AREAS[n].forEach((s) => wanted.add(s));
  else if (allSmokes.includes(n)) wanted.add(n);
  else if (allSmokes.includes(`${n}Smoke`)) wanted.add(`${n}Smoke`);
  else {
    console.error(`unknown area/script "${n}". Areas: ${Object.keys(AREAS).join(', ')}, all`);
    process.exit(2);
  }
}

const verbose = flags.has('--verbose');
let bad = 0;
const tail = (s, n) => s.trim().split('\n').slice(-n).join('\n');

if (!flags.has('--no-tsc')) {
  const t = spawnSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (t.status === 0) console.log('ok   tsc');
  else {
    bad++;
    const out = (t.stdout + t.stderr).trim().split('\n');
    console.log(`FAIL tsc (${out.filter((l) => l.includes('error TS')).length} errors)`);
    console.log(out.slice(0, 20).join('\n'));
  }
}

const list = [...wanted];
if (list.length) {
  const outdir = 'node_modules/.cache/check';
  await build({
    entryPoints: list.map((s) => `scripts/${s}.ts`),
    bundle: true, platform: 'node', format: 'esm', outdir, logLevel: 'warning',
  });
  for (const s of list) {
    const r = spawnSync('node', [`${outdir}/${s}.js`], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const lines = out.split('\n');
    const pass = lines.filter((l) => l.startsWith('PASS')).length;
    const fails = lines.filter((l) => l.startsWith('FAIL'));
    const ok = r.status === 0 && fails.length === 0;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${s} (${pass} pass, ${fails.length} fail)`);
    if (verbose) console.log(out.trim());
    else if (!ok) console.log(fails.length ? fails.slice(0, 15).join('\n') : tail(out, 12));
  }
}

console.log(bad ? `${bad} check(s) failed` : 'all green');
process.exit(bad ? 1 : 0);
