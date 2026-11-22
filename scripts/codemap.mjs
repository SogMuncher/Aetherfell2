// Keeps docs/CODE-MAP.md true by itself: refreshes every line count, adds new files (purpose taken
// from the file's first comment line), drops deleted ones, and lists files over 300 lines.
// Hand-written purposes are kept. Run: `npm run codemap` (also run by `npm run check`).
// --check: change nothing, exit 1 if the map is stale.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAP = 'docs/CODE-MAP.md';
const ROOTS = ['scripts', 'src'];
const EXT = /\.(ts|tsx|mjs|js)$/;

function walk(dir, out) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f).replace(/\\/g, '/');
    if (statSync(p).isDirectory()) walk(p, out);
    else if (EXT.test(f)) out.push(p);
  }
  return out;
}

function purpose(text) {
  for (const raw of text.split('\n').slice(0, 15)) {
    const l = raw.trim().replace(/^(\/\/+|\/\*+|\*+)\s?/, '').replace(/\*\/$/, '').trim();
    if (l && (raw.trim().startsWith('//') || raw.trim().startsWith('/*') || raw.trim().startsWith('*'))) return l.slice(0, 110);
  }
  return '(purpose?)';
}

// Pure re-export files are left out of the map (nothing to find there).
const barrel = (t) => t.split('\n').every((l) => !l.trim() || /^export .* from /.test(l.trim()));

const files = ROOTS.flatMap((r) => walk(r, []));
const byDir = new Map();
for (const p of files) {
  const i = p.lastIndexOf('/');
  const dir = `${p.slice(0, i)}/`;
  if (!byDir.has(dir)) byDir.set(dir, new Map());
  byDir.get(dir).set(p.slice(i + 1), readFileSync(p, 'utf8'));
}

const old = readFileSync(MAP, 'utf8');
const head = [];
const known = new Map(); // dir -> [{name, desc}] in map order
let dir = null;
for (const line of old.split('\n')) {
  const h = line.match(/^## (.+\/)$/);
  if (h) { dir = h[1]; if (!known.has(dir)) known.set(dir, []); continue; }
  if (dir === null) { head.push(line); continue; }
  const e = line.match(/^- `([^`]+)`\s*(?:\([~0-9]+\))?\s*(?:- )?(.*)$/);
  if (e) known.get(dir).push({ name: e[1], desc: e[2].trim() });
}

const big = [];
const out = [...head];
while (out.length && out[out.length - 1] === '') out.pop();
const dirs = [...known.keys(), ...[...byDir.keys()].filter((d) => !known.has(d)).sort()];
for (const d of dirs) {
  const present = byDir.get(d);
  if (!present) continue;
  const entries = (known.get(d) ?? []).filter((e) => present.has(e.name));
  for (const name of [...present.keys()].sort()) {
    if (!entries.some((e) => e.name === name) && !barrel(present.get(name))) entries.push({ name, desc: purpose(present.get(name)) });
  }
  out.push('', `## ${d}`);
  for (const e of entries) {
    const t = present.get(e.name);
    const n = t.split('\n').length - (t.endsWith('\n') ? 1 : 0);
    if (n > 300) big.push(`${d}${e.name} (${n})`);
    out.push(`- \`${e.name}\` (${n}) ${e.desc}`);
  }
}
const next = `${out.join('\n')}\n`;

if (process.argv.includes('--check')) {
  if (next !== old) { console.log('CODE-MAP is stale: run `npm run codemap`'); process.exit(1); }
  console.log('ok   CODE-MAP');
} else {
  if (next !== old) writeFileSync(MAP, next);
  console.log(`${next === old ? 'ok  ' : 'upd '} CODE-MAP (${files.length} files, ${big.length} over 300 lines)`);
}
if (process.argv.includes('--big')) console.log(big.join('\n'));
