// Headless checks that every picture is built, not hand-drawn: props grow from forms, colour
// regions survive painting, and each individual wears its own colours over a shared shape.
// Prints PASS/FAIL per check.
import { CONTENT, validateContent } from '../src/content';
import { ArtBank, artPaintBudget, assemble } from '../src/render/entities/assembler';
import { artColours } from '../src/render/entities/artGrow';
import { swatch } from '../src/render/palette';
import { outfitted } from '../src/render/entities/gearArt';
import { itemCard } from '../src/render/entities/itemCard';
import type { ArtDef, Entity } from '../src/types';
import { SpriteRenderer } from '../src/render/entities/spriteRenderer';
import { moveFrame } from '../src/render/entities/artSprites';
import { project, type Camera } from '../src/render/raycaster/camera';
import { spawner, world } from './smokeKit';

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
  // A walk shows from the front and back too (feet lift, body sways), not only side on: the outline changes.
  for (const [id, least] of [['villager', 40], ['deer', 22]] as const) {
    const d = CONTENT.art[id];
    if (!d) continue;
    const bank = new ArtBank(assemble(id, d, 0), 1);
    for (const dir of [2, 6]) {
      const a = bank.sprite('walk', 0, dir).px;
      let most = 0;
      for (let f = 1; f < 8; f++) {
        const b = bank.sprite('walk', f, dir).px;
        let n = 0;
        for (let i = 0; i < a.length; i++) if ((a[i] ?? 0) >>> 24 !== 0 !== ((b[i] ?? 0) >>> 24 !== 0)) n++;
        most = Math.max(most, n);
      }
      check(`a walking ${id} visibly steps seen ${dir === 2 ? 'from the front' : 'from behind'}`, most >= least, `outline changes by ${most} px`);
    }
  }
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

// Out of painting time, a creature never stands in with a picture from another side (it would face the wrong way).
{
  const bank = new ArtBank(assemble('wolf', CONTENT.art['wolf'] as ArtDef, 0), -1);
  artPaintBudget(1000);
  const side = bank.sprite('idle', 0, 0);
  artPaintBudget(-1);
  const walking = bank.sprite('walk', 3, 0);
  const front = bank.sprite('overhead', 1, 6);
  artPaintBudget(1000);
  check('out of time, a stand-in picture faces the same way', walking === side && front !== side);
}

// Gear shows on bodies: a shell per covered part in the piece's colour and texture, the held item at the hand.
{
  const bare = CONTENT.art['raider'] as ArtDef;
  const dressed = (worn: Record<string, string>, held: string | null): ArtDef => outfitted('raider', bare, { id: 3, worn, actor: { weapon: held } } as unknown as Entity)?.def ?? bare;
  const iron = dressed({ torso: 'gear:cuirass:iron:common', head: 'gear:helm:iron:common' }, null);
  const hide = dressed({ torso: 'gear:cuirass:leather:common@4', head: 'gear:helm:leather:common' }, null);
  const added = (d: ArtDef) => d.parts.slice(bare.parts.length);
  const covered = bare.parts.filter((p) => p.wear === 'torso' || p.wear === 'head').length;
  check('worn armour is a shell over every part it covers', added(iron).length === covered && covered > 0, `${added(iron).length} shells, ${covered} parts`);
  const same = added(iron).every((p, i) => JSON.stringify([p.at, p.size, p.shape]) === JSON.stringify([added(hide)[i]?.at, added(hide)[i]?.size, added(hide)[i]?.shape]));
  check('iron and leather share a silhouette, not a colour or texture', same && added(iron)[0]?.color !== added(hide)[0]?.color && added(iron)[0]?.surface === 'metal' && added(hide)[0]?.surface !== 'metal');
  const armed = dressed({}, 'gear:sword:steel:common');
  const hand = bare.parts.find((p) => p.wear === 'hand');
  const card = added(armed);
  check('a held item is its bag picture on one card in the hand, swinging with its arm', card.length === 1 && card[0]?.card === 'gear:sword:steel:common' && card[0]?.parent === hand?.parent);
  const pix = (d: ArtDef): number => new ArtBank(assemble('raider', d, 0), 1, itemCard).sprite('idle', 0, 2).px.filter((c) => c).length;
  check('the held picture is stamped onto the body picture', pix(armed) > pix(bare), `${pix(armed)} vs ${pix(bare)} pixels`);
  const plain = outfitted('raider', bare, { id: 4, actor: { weapon: null } } as unknown as Entity);
  check('nothing worn or held leaves the body as it is', plain === null);
}

// 9. Creatures and people animate in the real draw order: each frame's painting time opens before
// anything picks a picture, so a walker shows new moments of its stride from every side, not one still per side.
{
  const { sim, me } = world();
  const { spawn } = spawner(sim);
  const sprites = new SpriteRenderer();
  for (const kind of ['wolf', 'villager']) {
    const w = spawn(kind, me.pos.x + 6, me.pos.y, {});
    if (w.ai) w.ai.think = 1e9;
    const pics = new Set<unknown>();
    for (let f = 0; f < 240; f++) {
      const a = (f / 240) * Math.PI * 2;
      w.vel.x = Math.cos(a) * 1.5;
      w.vel.y = Math.sin(a) * 1.5;
      const cam = { x: me.pos.x, y: me.pos.y, z: me.z + 1.6, yaw: 0, pitch: 0 } as Camera;
      artPaintBudget(-1); // last frame's painting time is long over
      const bb = sprites.collect(project(cam, 320, 200), sim.state, sim.tiles, me.id, () => 1, f / 60, new Map());
      const mine = bb.find((b) => Math.abs(b.x - w.pos.x) < 0.01 && Math.abs(b.y - w.pos.y) < 0.01);
      if (mine) pics.add(mine.sprite);
    }
    sim.state.entities.delete(w.id);
    check(`a walking ${kind} shows many pictures while turning a full circle (stride frames from every side)`, pics.size >= 24, `${pics.size} pictures`);
  }
}

// Body moves: every swing direction and the throw is its own picture, and the picture follows the sim's timing.
{
  const bank = new ArtBank(assemble('raider', CONTENT.art['raider'] as ArtDef, 0), 1);
  artPaintBudget(1000);
  const sig = (s: { px: Uint32Array; w: number }): string => `${s.w}:${s.px.reduce((n, c, i) => (n + ((c >>> 24) > 0 ? i * 7 : 0)) % 1000003, 0)}`;
  const looks = (['overhead', 'thrust', 'left', 'right', 'throw'] as const).map((m) => sig(bank.sprite(m, 1, 2)));
  check('each swing direction and the throw winds up its own way', new Set(looks).size === looks.length && !looks.includes(sig(bank.sprite('idle', 0, 2))));
  const actor = (a: object): Entity => ({ actor: { swing: null, charge: null, ...a } }) as unknown as Entity;
  const sw = (t: number) => moveFrame(actor({ swing: { dir: 'left', t, strikeAt: 8, recover: 20, struck: false, power: 0 } }), undefined, 0);
  const ch = moveFrame(actor({ charge: { dir: 'overhead', t: 30, hold: 0, full: true } }), undefined, 0);
  check('the body winds up while charging and holds it, lands its blow on the tick it strikes, then follows through', ch?.[0] === 'overhead' && ch[1] === 1 && sw(0)?.[1] === 1 && sw(8)?.[1] === 3 && sw(19)?.[1] === 5);
  const th = moveFrame(actor({}), 10, 10.03);
  check('a throw plays from the moment the item leaves the hand, then ends', th?.[0] === 'throw' && th[1] === 3 && moveFrame(actor({}), 10, 12) === null);
  check('every move role a body uses is known to the moves table', validateContent(CONTENT).every((p) => !p.includes('move')));
}

if (failed) throw new Error(`${failed} art check(s) failed`);
console.log('all art checks passed');
