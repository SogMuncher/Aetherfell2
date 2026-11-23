// Headless checks that every picture is built, not hand-drawn: props grow from forms, colour
// regions survive painting, and each individual wears its own colours over a shared shape.
// Prints PASS/FAIL per check.
import { CONTENT, validateContent } from '../src/content';
import { ArtBank, assemble } from '../src/render/entities/assembler';
import { artColours } from '../src/render/entities/artGrow';
import { swatch } from '../src/render/palette';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

check('content (palettes, prop forms, dress colours) validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

// 1. Every thing with a picture is a look, a form or a loose item: nothing falls back to hand-drawn art.
{
  const missing = Object.entries(CONTENT.things)
    .filter(([, t]) => t.sprite !== null && t.sprite !== 'item' && !(t.sprite in CONTENT.art))
    .map(([k]) => k);
  check('every prop and creature is built from parts', missing.length === 0, missing.join(', '));
  const empty: string[] = [];
  for (const [id, t] of Object.entries(CONTENT.things)) {
    const f = t.sprite ? CONTENT.art[t.sprite] : undefined;
    if (!f || !t.sprite) continue;
    const s = new ArtBank(assemble(t.sprite, f, 0), 1).sprite('idle', 0, 0);
    const filled = s.px.reduce((n, c) => n + (c !== 0 ? 1 : 0), 0);
    if (filled < 20) empty.push(`${id} (${filled} px)`);
  }
  check('every prop and creature paints a picture', empty.length === 0, empty.join(', '));
}

// 2. Colour regions: one painted shape, many colourings.
{
  const oak = CONTENT.art.oak;
  if (oak) {
    const s = new ArtBank(assemble('oak', oak, 1), 1).sprite('idle', 0, 0);
    const regions = s.regions ? s.regions.reduce((n, r) => n + (r ? 1 : 0), 0) : 0;
    check('grown pictures keep their colour regions', regions > 50 && !!s.shade, `${regions} region pixels`);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) seen.add(Array.from(artColours(oak, i * 101 + 5)).join(','));
    check('placed copies of one shape wear different colours', seen.size >= 10, `${seen.size} of 12 distinct`);
  } else check('oak form exists', false);
  const wolf = CONTENT.art.wolf;
  if (wolf) {
    const a = assemble('wolf', wolf, 2);
    const shared = a.key === assemble('wolf', wolf, 2).key;
    const differ = Array.from(artColours(wolf, 1)).join(',') !== Array.from(artColours(wolf, 2)).join(',');
    const bank = new ArtBank(a, 1);
    const walk = bank.sprite('walk', 2, 3);
    const moves = Array.from(walk.px).join(',') !== Array.from(bank.sprite('walk', 6, 3).px).join(',');
    check('wolves share a picture but not their colours', shared && differ && !!walk.regions, `same picture ${shared}, own colours ${differ}`);
    check('things with a gait animate their joints', moves);
  } else check('wolf art exists', false);
}

// 3. Palettes drift a little, never wildly, and stay stable per seed.
{
  let worst = 0;
  let stable = true;
  for (let i = 0; i < 200; i++) {
    const c = swatch('@bark', i);
    if (c !== swatch('@bark', i)) stable = false;
    const r = c & 255;
    const g = (c >>> 8) & 255;
    const b = (c >>> 16) & 255;
    // Distance to the nearest bark swatch.
    let best = Infinity;
    for (const h of CONTENT.palettes.bark?.swatches ?? []) {
      const n = parseInt(h.slice(1), 16);
      best = Math.min(best, Math.hypot(r - ((n >> 16) & 255), g - ((n >> 8) & 255), b - (n & 255)));
    }
    worst = Math.max(worst, best);
  }
  check('palette picks stay near their swatches and repeat per seed', stable && worst < 40, `furthest ${worst.toFixed(1)} away`);
  check('a fixed #colour stays exact', swatch('#102030', 9) === (0xff000000 | (0x30 << 16) | (0x20 << 8) | 0x10) >>> 0);
}

if (failed) throw new Error(`${failed} art check(s) failed`);
console.log('all art checks passed');
