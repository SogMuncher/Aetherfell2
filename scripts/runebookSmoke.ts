// Headless checks for the runebook: composing spells from runes, preparing them, learning runes
// from stones, and casting each shape. Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, composeSpell, describeSpell, spellFor, spellKey, validateContent } from '../src/content';
import type { Entity, InputSnapshot, RuneId } from '../src/types';
import { Tile, bagOf, emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(777));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  sim.state.weather.rain = sim.state.weather.rainTarget = sim.state.weather.wetness = 0;
  sim.state.weather.nextShift = 1e9;
  return { sim, me };
}
function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): string[] {
  const seen: string[] = [];
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    for (const e of sim.step()) seen.push(e.type);
  }
  return seen;
}
function arena(sim: Simulation, me: Entity, x: number, y: number, r = 10): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, Tile.Flagstone as 0);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < 60) sim.state.entities.delete(e.id);
  me.pos.x = me.prev.x = x + 0.5;
  me.pos.y = me.prev.y = y + 0.5;
  me.z = me.prevZ = sim.tiles.ground(x + 0.5, y + 0.5);
  me.vel.x = me.vel.y = me.vz = 0;
  me.angle = 0;
}
function spawn(sim: Simulation, thing: string, x: number, y: number): Entity {
  const ctx = (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
  return ctx.spawn(thing, x, y, { z: sim.tiles.ground(x, y) });
}
function prepare(sim: Simulation, runes: RuneId[]): string[] {
  return run(sim, 1, () => ({ prepare: runes }));
}
function cast(sim: Simulation, pitch = 0): string[] {
  return run(sim, 1, () => ({ cast: true, pitch }));
}

// Composing.
{
  check('content validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));
  const ember = spellFor(CONTENT, 'ember');
  check('one essence makes a spell in its natural shape', ember?.name === 'Ember Bolt' && ember.delivery.type === 'bolt' && ember.cost === 12, ember?.name);
  const big = composeSpell(CONTENT, ['ember', 'nova', 'grand']);
  check('essence + shape + power compose', big.ok && big.spell.name === 'Grand Ember Nova' && big.spell.delivery.type === 'nova', big.ok ? big.spell.name : big.problem);
  check('a power rune raises the cost', big.ok && big.spell.cost > (spellFor(CONTENT, 'ember+nova')?.cost ?? 999));
  check('two essences mix their effects', (spellFor(CONTENT, 'frost+tide')?.hit.some((e) => e.type === 'soak') ?? false) && (spellFor(CONTENT, 'frost+tide')?.hit.some((e) => e.type === 'chill') ?? false));
  check('a ward uses the essence’s effect on yourself', spellFor(CONTENT, 'frost+ward')?.hit.some((e) => e.type === 'cure') === true);
  const bad: [RuneId[], string][] = [
    [[], 'empty'],
    [['wave'], 'no essence'],
    [['ember', 'wave', 'nova'], 'two shapes'],
    [['ember', 'ember'], 'repeat'],
    [['ember', 'tide', 'frost', 'gust'], 'four runes'],
    [['ember', 'nonsense'], 'unknown rune'],
  ];
  for (const [r, why] of bad) check(`refuses a spell with ${why}`, !composeSpell(CONTENT, r).ok);
  // Every legal combination composes into something castable and describable.
  const ids = CONTENT.runeOrder;
  let made = 0;
  let broken = '';
  for (const a of ids)
    for (const b of ['', ...ids])
      for (const c of ['', ...ids]) {
        const runes = [a, b, c].filter((x) => x);
        const r = composeSpell(CONTENT, runes);
        if (!r.ok) continue;
        made++;
        const s = r.spell;
        if (!(s.cost > 0) || !(s.power > 0) || describeSpell(CONTENT, s).length === 0 || spellFor(CONTENT, spellKey(runes))?.id !== s.id) broken = s.id;
      }
  check('every legal rune combination makes a working spell', made > 200 && !broken, `${made} spells${broken ? `, broken: ${broken}` : ''}`);
}

// Spell looks are built from the runes: always sane numbers, the same every time, and different
// for different combinations.
{
  const ids = CONTENT.runeOrder;
  const finite = (o: object): boolean => Object.values(o).every((v) => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'object' && v !== null ? finite(v as object) : true));
  const looks = new Map<string, string>();
  let clash = '';
  const seen = new Set<string>();
  // Spells made of the same runes with the same leading essence are the same spell to a player.
  const kinds = new Set<string>();
  let made = 0;
  let bad = '';
  for (const a of ids)
    for (const b of ['', ...ids])
      for (const c of ['', ...ids]) {
        const r = composeSpell(CONTENT, [a, b, c].filter((x) => x));
        if (!r.ok || seen.has(r.spell.id)) continue;
        seen.add(r.spell.id);
        const lead = r.spell.runes.find((x) => CONTENT.runes[x]?.essence) ?? '';
        const kind = `${lead}|${[...r.spell.runes].sort().join('+')}`;
        kinds.add(kind);
        made++;
        const l = r.spell.look;
        const m = l.motes;
        if (!finite(l) || m.size <= 0 || m.life <= 0 || m.density < 1 || l.strands < 0 || l.seed < 0 || l.seed >= 1) bad = r.spell.id;
        const key = JSON.stringify({ ...l, seed: 0 });
        const other = looks.get(key);
        if (other && other !== kind) clash = `${other} / ${kind}`;
        looks.set(key, kind);
      }
  check('every spell gets a sane look from its runes', !bad, bad ? `bad look: ${bad}` : `${made} spells`);
  check('and every different combination looks different', !clash, clash ? `same look: ${clash}` : `${kinds.size} kinds of spell, ${looks.size} looks`);
  const once = JSON.stringify(spellFor(CONTENT, 'ember+frost')?.look);
  const again = JSON.stringify(composeSpell(CONTENT, ['ember', 'frost']).ok ? spellFor(CONTENT, 'ember+frost')?.look : null);
  const flipped = JSON.stringify(spellFor(CONTENT, 'frost+ember')?.look);
  check('the same runes always look the same', once === again);
  check('the first essence leads the look', once !== flipped);
  const fire = spellFor(CONTENT, 'ember')?.look.motes;
  const water = spellFor(CONTENT, 'tide')?.look.motes;
  const steam = spellFor(CONTENT, 'ember+tide')?.look.motes;
  check('mixed essences look halfway between', !!fire && !!water && !!steam && steam.lift < fire.lift && steam.lift > water.lift, `lift ${steam?.lift.toFixed(1)}`);
  const big = spellFor(CONTENT, 'ember+grand')?.look.motes;
  check('a Grand spell is bigger and fuller', !!fire && !!big && big.size > fire.size && big.density > fire.density);
  const plain = { ...CONTENT, runes: { ...CONTENT.runes, glim: { name: 'Glim', word: 'Gl', glyph: '*', cost: 5, text: 'test', essence: { ...(CONTENT.runes['ember']?.essence ?? (() => { throw new Error('no ember'); })()), look: undefined } } } };
  const g = composeSpell(plain, ['glim']);
  check('a rune with no look still gets one from its colour', g.ok && g.spell.look.motes.density > 0);
}

// Starting runebook and preparing.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  check('a new traveller knows the starting runes', CONTENT.startingRunes.every((r) => p.runes.includes(r)));
  check('and starts with Ember prepared', spellKey(p.prepared) === 'ember');
  p.runes.push('wave');
  const ev = prepare(sim, ['frost', 'wave']);
  check('the runebook prepares a new spell', spellKey(p.prepared) === 'frost+wave' && ev.includes('spellPrepared'));
  prepare(sim, ['mend']);
  check('runes you have not found cannot be used', spellKey(p.prepared) === 'frost+wave');
  prepare(sim, ['wave', 'nova', 'frost']);
  check('an invalid spell is refused and the old one kept', spellKey(p.prepared) === 'frost+wave');

  // Casting the prepared spell over and over until the aether runs out.
  arena(sim, me, 40000, 40000);
  const wolf = spawn(sim, 'wolf', 40003.5, 40000.5);
  p.mana = p.maxMana;
  const cost = spellFor(CONTENT, 'frost+wave')?.cost ?? 0;
  const before = p.mana;
  cast(sim);
  check('casting spends the spell’s cost', Math.abs(before - p.mana - cost) < 1, `${before.toFixed(1)} → ${p.mana.toFixed(1)}, cost ${cost}`);
  run(sim, 1);
  check('a Frost Wave chills what is in front', (wolf.status.chilled ?? 0) > 0);
  let casts = 0;
  let fizzled = false;
  for (let i = 0; i < 20 && !fizzled; i++) {
    const e = cast(sim);
    if (e.includes('spellCast')) casts++;
    if (e.includes('fizzle')) fizzled = true;
  }
  check('the same spell casts again and again until you run dry', casts >= 2 && fizzled, `${casts} more casts then fizzle`);
  check('the spell stays prepared after running dry', spellKey(p.prepared) === 'frost+wave');
}

// Learning a rune from a stone, then using it.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  bagOf(me).push({ id: 'rune:mend', count: 1 });
  const ev = run(sim, 1);
  check('carrying a rune stone teaches its rune', p.runes.includes('mend') && ev.includes('runeLearned'));
  check('and the stone is used up', !bagOf(me).some((s) => s.id === 'rune:mend'));
  bagOf(me).push({ id: 'rune:mend', count: 1 });
  run(sim, 1);
  check('a stone for a rune you know is kept', bagOf(me).some((s) => s.id === 'rune:mend'));
  prepare(sim, ['mend']);
  me.hp = 20;
  p.mana = p.maxMana;
  cast(sim);
  run(sim, 1);
  check('Mend on its own heals you', me.hp > 30, `hp ${me.hp}`);
}

// Gust as a ward lifts you, Ember Nova burns all around but spares you, Ember Lance flies fast.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  arena(sim, me, 42000, 42000);
  run(sim, 5);
  prepare(sim, ['gust', 'ward']);
  p.mana = p.maxMana;
  const z0 = me.z;
  cast(sim);
  let top = me.z;
  for (let i = 0; i < 12; i++) {
    run(sim, 1);
    top = Math.max(top, me.z);
  }
  check('a Gust Ward lifts you into the air', top > z0 + 1, `rose ${(top - z0).toFixed(2)} m`);
  run(sim, 40);

  p.runes.push('nova', 'lance');
  arena(sim, me, 42000, 42000);
  const wolves = [spawn(sim, 'wolf', 42003, 42000.5), spawn(sim, 'wolf', 41998, 42000.5), spawn(sim, 'wolf', 42000.5, 42003)];
  prepare(sim, ['ember', 'nova']);
  p.mana = p.maxMana;
  const hp0 = me.hp;
  cast(sim);
  run(sim, 2);
  const hurt = wolves.filter((w) => w.hp < w.maxHp || w.dead).length;
  check('an Ember Nova hits everything around you', hurt === 3, `${hurt}/3 wolves hurt`);
  check('but not you', me.hp >= hp0 && !me.status.burning);

  arena(sim, me, 44000, 44000);
  const target = spawn(sim, 'wolf', 44009, 44000.5);
  prepare(sim, ['ember', 'lance']);
  p.mana = p.maxMana;
  cast(sim, -0.25);
  const bolt = [...sim.state.entities.values()].find((e) => e.projectile);
  check('an Ember Lance flies as a bolt carrying its spell', bolt?.projectile?.spell === 'ember+lance');
  run(sim, 20);
  check('and strikes what it is aimed at', target.hp < target.maxHp || target.dead);
}

// Bolts fly over low rocks but burst on a tall tree trunk.
{
  const { sim, me } = world();
  arena(sim, me, 46000, 46000);
  sim.tiles.setKind(46004, 46000, Tile.Rock as 0);
  cast(sim, 0);
  let burstAt = -1;
  for (let i = 0; i < 30 && burstAt < 0; i++) {
    const b = [...sim.state.entities.values()].find((e) => e.projectile);
    const ev = run(sim, 1);
    if (ev.includes('spellBurst')) burstAt = b?.pos.x ?? 0;
  }
  check('an Ember Bolt sails over a low boulder', burstAt < 0 || burstAt > 46006, `burst at ${burstAt.toFixed(1)}`);
  arena(sim, me, 46000, 46000);
  sim.tiles.setKind(46004, 46000, Tile.Tree as 0);
  me.player && (me.player.mana = me.player.maxMana);
  cast(sim, 0);
  burstAt = -1;
  for (let i = 0; i < 30 && burstAt < 0; i++) {
    const b = [...sim.state.entities.values()].find((e) => e.projectile);
    const ev = run(sim, 1);
    if (ev.includes('spellBurst')) burstAt = b?.pos.x ?? 0;
  }
  check('but bursts on a tree in its way', burstAt > 0 && burstAt < 46005.5, `burst at ${burstAt.toFixed(1)}`);
}

// Saves keep what you know and what you prepared.
{
  const { sim, me } = world();
  const p = me.player;
  if (!p) throw new Error('no player data');
  p.runes.push('venom');
  prepare(sim, ['venom', 'tide']);
  const back = Simulation.fromSave(sim.save());
  const id = back?.state.players['local'];
  const p2 = id !== undefined ? back?.state.entities.get(id)?.player : undefined;
  check('a save keeps your runes and prepared spell', !!p2 && p2.runes.includes('venom') && spellKey(p2.prepared) === 'venom+tide');
}

if (failed) throw new Error(`${failed} runebook check(s) failed`);
console.log('all runebook checks passed');
