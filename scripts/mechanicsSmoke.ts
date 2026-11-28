// Headless checks for the core mechanics: content validation, frost and ice, throwables, glider,
// weapons, keys and locked chests, fire traps, and status rules. Prints PASS/FAIL per check.
import { Simulation, createState } from '../src/sim';
import { CONTENT, fillText, itemDef, siteBaseName, spellFor, validateContent } from '../src/content';
import { siteInRegion } from '../src/sim/world/sites';
import { ITEM_FORMS, paintItem } from '../src/render/entities/itemArt';
import type { Entity, InputSnapshot } from '../src/types';
import { Tile, emptyInput } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const problems = validateContent(CONTENT);
check('content validates', problems.length === 0, problems.join('; '));

function world(): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Tester' });
  sim.step();
  const id = sim.state.players['local'];
  const me = id !== undefined ? sim.state.entities.get(id) : undefined;
  if (!me) throw new Error('no player');
  sim.state.weather.rain = 0;
  sim.state.weather.rainTarget = 0;
  sim.state.weather.wetness = 0;
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
/** Flat dry floor of flagstones around (x, y), clear of anything else. */
function arena(sim: Simulation, x: number, y: number, r = 8, kind: number = Tile.Flagstone): void {
  for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) sim.tiles.setKind(x + i, y + j, kind as 0);
  for (const e of [...sim.state.entities.values()]) if (!e.player && Math.hypot(e.pos.x - x, e.pos.y - y) < 40) sim.state.entities.delete(e.id);
}
/** Reaches the sim's spawn service, which tests use to place things directly. */
function spawner(sim: Simulation): { spawn: (t: string, x: number, y: number, i?: object) => Entity } {
  return (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
}
function put(me: Entity, sim: Simulation, x: number, y: number): void {
  me.pos.x = me.prev.x = x;
  me.pos.y = me.prev.y = y;
  me.z = me.prevZ = sim.tiles.ground(x, y);
  me.vel.x = me.vel.y = me.vz = 0;
}

// Frost: freeze water into walkable ice that thaws.
{
  const { sim, me } = world();
  let wx = 0;
  let wy = 0;
  found: for (let r = 20; r < 3000; r += 9) {
    for (let a = 0; a < 6.28; a += 0.2) {
      const x = Math.floor(Math.cos(a) * r);
      const y = Math.floor(Math.sin(a) * r);
      if (sim.tiles.ground(x, y) < -1.2 && sim.tiles.kind(x, y) === Tile.Water) {
        wx = x;
        wy = y;
        break found;
      }
    }
  }
  put(me, sim, wx + 0.5, wy + 0.5);
  sim.state.queues.effects.push({ target: { kind: 'area', x: wx + 0.5, y: wy + 0.5, z: 0, radius: 2.8 }, effects: [{ type: 'chill', amount: 1 }], source: null, from: null });
  run(sim, 2);
  check('frost freezes water', sim.tiles.kind(wx, wy) === Tile.Ice, `ground ${sim.tiles.ground(wx, wy).toFixed(1)}`);
  run(sim, 20);
  check('you stand on the ice', Math.abs(me.z) < 0.05, `z ${me.z.toFixed(2)}`);
  check('chill makes you cold', (me.status.chilled ?? 0) > 0);
  run(sim, 20 * 70);
  check('ice thaws back to water', sim.tiles.kind(wx, wy) === Tile.Water);
}

// Throwables: an oil flask shatters and coats the ground; ember lights it.
{
  const { sim, me } = world();
  const x = 9000;
  const y = 9000;
  arena(sim, x, y, 12, Tile.Grass);
  put(me, sim, x + 0.5, y + 0.5);
  run(sim, 1, () => ({ useItem: 'oilFlask', pitch: -0.3 }));
  const ev = run(sim, 40);
  let oil = 0;
  for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) if (sim.tiles.oil(x + i, y + j) > 0) oil++;
  check('oil flask shatters', ev.includes('itemBroke'));
  check('oil coats the ground', oil > 3, `${oil} oily tiles`);
  sim.state.queues.effects.push({ target: { kind: 'area', x: x + 5, y: y + 0.5, z: 0, radius: 3 }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  const ev2 = run(sim, 4);
  check('oil catches fire', ev2.includes('ignited') && sim.state.burning.size > 0, `${sim.state.burning.size} burning`);
}

// Glider: hold jump in the air, sink slowly, rise over fire.
{
  const { sim, me } = world();
  const x = 12000;
  const y = 12000;
  arena(sim, x, y, 40, Tile.Grass);
  put(me, sim, x - 30, y + 0.5);
  me.z = me.prevZ = sim.tiles.ground(x, y) + 40;
  const z0 = me.z;
  run(sim, 40, () => ({ jumpHeld: true, forward: 1 }));
  const fell = z0 - me.z;
  check('glider opens and sinks slowly', !!me.player?.gliding && fell < 8, `fell ${fell.toFixed(1)} m in 2 s, speed ${Math.hypot(me.vel.x, me.vel.y).toFixed(1)}`);
  for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) sim.tiles.setFire(x + i, y + j, 200);
  me.pos.x = me.prev.x = x;
  me.pos.y = me.prev.y = y;
  me.z = me.prevZ = sim.tiles.ground(x, y) + 10;
  me.vz = -1.5;
  const zb = me.z;
  run(sim, 30, () => ({ jumpHeld: true }));
  check('fire below lifts the glider', me.z > zb, `${(me.z - zb).toFixed(1)} m up`);
}

// Weapons and wear.
{
  const { sim, me } = world();
  const x = 15000;
  const y = 15000;
  arena(sim, x, y);
  put(me, sim, x + 0.5, y + 0.5);
  me.actor?.inventory.push({ id: 'gear:hammer:iron:common', count: 1 });
  run(sim, 1, () => ({ useItem: 'gear:hammer:iron:common' }));
  check('wield a found weapon', me.actor?.weapon === 'gear:hammer:iron:common');
  check('old weapon goes back in the pack', !!me.actor?.inventory.some((s) => s.id === 'gear:sword:iron:common'));
  const c = spawner(sim).spawn('crate', x + 1.8, y + 0.5, { z: sim.tiles.ground(x + 1.8, y + 0.5) });
  const heldWear = (): number => (me.actor?.weapon ? (itemDef(CONTENT, me.actor.weapon)?.wear ?? 0) : 0);
  const wear0 = heldWear();
  const ev = run(sim, 60, (i) => ({ attack: i % 30 < 2, swingDir: 'thrust' }));
  check('hammer smashes a crate', c.dead || c.hp < c.maxHp, `crate hp ${c.hp}/${c.maxHp}`);
  check('weapon wears with use', heldWear() < wear0, `${wear0} → ${heldWear()}`);
  check('crate breaks noisily', ev.includes('propBroken') || !c.dead);
}

// Keys and locked chests.
{
  const { sim, me } = world();
  const x = 18000;
  const y = 18000;
  arena(sim, x, y);
  put(me, sim, x + 0.5, y + 0.5);
  const ctx = spawner(sim);
  const chest = ctx.spawn('ruinChest', x + 1.6, y + 0.5, { z: sim.tiles.ground(x + 1.6, y + 0.5) });
  let ev = run(sim, 6, (i) => ({ interact: i === 0 }));
  check('locked chest refuses', ev.includes('locked') && !chest.container?.opened);
  me.actor?.inventory.push({ id: 'ruinKey', count: 1 });
  ev = run(sim, 30, (i) => ({ interact: i === 0 }));
  const items = [...sim.state.entities.values()].filter((e) => e.item).length;
  check('the key opens it', ev.includes('unlocked') && !!chest.container?.opened, `${items} items spilled out`);
  check('the key is used up', !me.actor?.inventory.some((s) => s.id === 'ruinKey'));
  const urn = ctx.spawn('keyUrn', x - 2, y + 0.5, { z: sim.tiles.ground(x - 2, y + 0.5) });
  sim.state.queues.effects.push({ target: { kind: 'entity', id: urn.id }, effects: [{ type: 'damage', amount: 5, kind: 'blunt' }], source: me.id, from: null });
  run(sim, 20);
  const key = [...sim.state.entities.values()].some((e) => e.item?.id === 'ruinKey');
  check('a sealed urn breaks to reveal a key', urn.dead && key);
}

// Fire traps: something heavy on the plate makes the floor breathe fire.
{
  const { sim, me } = world();
  const x = 21000;
  const y = 21000;
  arena(sim, x, y, 8, Tile.Brush);
  put(me, sim, x + 6, y + 0.5);
  const ctx = spawner(sim);
  const g = sim.tiles.ground(x + 0.5, y + 0.5);
  ctx.spawn('fireTrap', x + 0.5, y + 0.5, { z: g });
  const barrel = ctx.spawn('barrel', x + 0.5, y + 0.5, { z: g });
  const ev = run(sim, 4);
  check('a barrel on the plate springs the trap', ev.includes('trapSprung'));
  check('the trap sets the brush alight', sim.state.burning.size > 0, `${sim.state.burning.size} burning`);
  check('and the barrel', (barrel.status.burning ?? 0) > 0 || barrel.dead);
}

// Status rules: water puts out burning and blocks it.
{
  const { sim, me } = world();
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'status', id: 'burning', ticks: 100 }], source: null, from: null });
  run(sim, 1);
  check('you can burn', (me.status.burning ?? 0) > 0);
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'soak', amount: 1 }], source: null, from: null });
  run(sim, 1);
  check('soaking puts it out', !me.status.burning && (me.status.wet ?? 0) > 0);
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'heat', amount: 1 }], source: null, from: null });
  run(sim, 1);
  check('wet bodies do not catch', !me.status.burning);
}

// Bag throwing: let go of an item over the view and it flies toward that point.
{
  const x = 23000;
  const y = 23000;
  /** Throws one item with this aim and returns where it came to rest, and what happened. */
  const toss = (item: string, yaw: number, lift: number, power: number): { dx: number; dy: number; events: string[]; left: number; oil: number } => {
    const { sim, me } = world();
    arena(sim, x, y, 30);
    put(me, sim, x + 0.5, y + 0.5);
    me.actor?.inventory.push({ id: item, count: 2 });
    const before = new Set(sim.state.entities.keys());
    const events = run(sim, 60, (i) => (i === 0 ? { throwItem: { item, yaw, lift, power } } : {}));
    const thrown = [...sim.state.entities.values()].find((e) => !before.has(e.id) && !!e.item?.id.startsWith(item));
    let oil = 0;
    for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) oil += sim.tiles.oil(x + i, y + j);
    const left = me.actor?.inventory.find((s) => s.id === item)?.count ?? 0;
    return { dx: thrown ? thrown.pos.x - me.pos.x : NaN, dy: thrown ? thrown.pos.y - me.pos.y : NaN, events, left, oil };
  };
  const drop = toss('gear:sword:iron:fine', 0, -0.5, 0.05);
  const mid = toss('gear:sword:iron:fine', 0, 0, 0.5);
  const far = toss('gear:sword:iron:fine', 0, 0.5, 1);
  check('letting go low on the screen sets it down in front of you', drop.dx > 0.3 && drop.dx < 2.5, `${drop.dx.toFixed(2)} m`);
  check('higher up the screen throws further', mid.dx > drop.dx + 1 && far.dx > mid.dx + 2, `${drop.dx.toFixed(1)} < ${mid.dx.toFixed(1)} < ${far.dx.toFixed(1)} m`);
  check('the item leaves the bag', far.left === 1);
  const right = toss('gear:sword:iron:fine', 0.6, 0.2, 0.8);
  const leftward = toss('gear:sword:iron:fine', -0.6, 0.2, 0.8);
  check('letting go right of centre throws right', right.dy > 1.5 && leftward.dy < -1.5, `right ${right.dy.toFixed(1)}, left ${leftward.dy.toFixed(1)}`);
  const gentle = toss('oilFlask', 0, -0.5, 0.05);
  check('a flask set down does not break', gentle.oil === 0 && !gentle.events.includes('itemBroke'));
  const hurled = toss('oilFlask', 0, 0.3, 0.9);
  check('a flask thrown hard bursts where it lands', hurled.events.includes('itemBroke') && hurled.oil > 0);
}

// --- Places, villagers and rules are data ------------------------------------------------------
{
  // Every kind of place turns up somewhere, laid out from its definition, with a rumour that reads well.
  const seen = new Set<string>();
  let rumoursOk = true;
  for (let ry = -16; ry <= 16; ry++) {
    for (let rx = -16; rx <= 16; rx++) {
      const s = siteInRegion(4242, rx, ry, () => 20);
      if (!s) continue;
      seen.add(s.kind);
      const r = fillText(CONTENT.sites[s.kind]?.rumour ?? '', { name: s.name, base: siteBaseName(CONTENT, s.kind, s.name) });
      if (r.includes('{') || r.includes('Ruins of')) rumoursOk = false;
    }
  }
  check('every site kind appears from its share of regions', Object.keys(CONTENT.sites).every((k) => seen.has(k)), [...seen].join(', '));
  check('rumours fill in place names', rumoursOk);
  // A village hands out its roles' jobs: the elder's quest comes from the role, named for the place.
  const { sim, me } = world();
  const vil = (() => {
    for (let ry = -6; ry <= 6; ry++) for (let rx = -6; rx <= 6; rx++) {
      const s = siteInRegion(sim.state.seed, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
      if (s?.kind === 'village') return s;
    }
    return null;
  })();
  if (vil) {
    me.pos.x = vil.cx + 0.5;
    me.pos.y = vil.cy + 0.5;
    run(sim, 5);
    const loc = sim.state.locations.find((l) => l.name === vil.name);
    const roles = [...sim.state.entities.values()].flatMap((e) => (e.npc && e.npc.locationId === loc?.id ? [e.npc.role] : []));
    const q = sim.state.quests.find((qq) => qq.title.includes(vil.name));
    check('villagers take the roles their village lists', roles.length === vil.houses.length && roles[0] === CONTENT.sites.village?.villagers?.[0], roles.join(', '));
    check('the elder offers the quest from their role', !!q && CONTENT.roles.elder?.quest?.kind === 'cull' && q.targetKind === CONTENT.roles.elder.quest.target, q?.title ?? 'none');
    // Their daily routine is a brain behaviour too: they start at home, go out by day, and by night walk home.
    const folk = [...sim.state.entities.values()].filter((e) => e.npc && e.npc.locationId === loc?.id);
    const awayFromHome = (): number => folk.reduce((t, e) => t + (e.npc ? Math.hypot(e.npc.home.x - e.pos.x, e.npc.home.y - e.pos.y) : 0), 0) / Math.max(1, folk.length);
    sim.state.weather.time = 0.4;
    run(sim, 20 * 25);
    const before = awayFromHome();
    check('by day villagers leave their homes', before > 3, `${before.toFixed(1)} m from home`);
    sim.state.weather.time = 0.9;
    run(sim, 20 * 25);
    const after = awayFromHome();
    check('villagers keep their routine and go home at night', folk.length > 0 && after < before * 0.5 && folk.some((e) => e.ai?.doing === 'routine'), `${before.toFixed(1)} → ${after.toFixed(1)} m from home`);
  } else check('found a village to visit', false);
  // A fresh traveller carries the starting kit from the rules.
  const fresh = world().me;
  check('a new traveller carries the starting kit from the rules', JSON.stringify(fresh.actor?.inventory) === JSON.stringify(CONTENT.rules.start.inventory) && fresh.actor?.weapon === CONTENT.rules.start.wield);
}

// New content added purely as data (the fen round): cider warms you, quake composes, peat
// smoulders, fens hold toads and villages have a brewer.
{
  const { sim, me } = world();
  arena(sim, Math.floor(me.pos.x), Math.floor(me.pos.y));
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: CONTENT.items.spicedCider?.use ?? [], source: null, from: null });
  run(sim, 2);
  check('spiced cider warms you', (me.status.warmed ?? 0) > 0);
  sim.state.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'chill', amount: 1 }], source: null, from: null });
  run(sim, 2);
  check('while warmed, cold cannot chill you', !(me.status.chilled ?? 0));
  const quake = spellFor(CONTENT, 'quake+nova+grand');
  check('the quake rune combines with other runes', !!quake && quake.delivery.type === 'nova', quake?.name ?? 'none');
  // Peat holds a fire far longer than grass.
  const px = Math.floor(me.pos.x) + 3;
  const py = Math.floor(me.pos.y);
  sim.tiles.setKind(px, py, Tile.Peat);
  sim.tiles.setKind(px + 1, py, Tile.Grass);
  sim.tiles.setFuel(px, py, CONTENT.tiles[Tile.Peat].fuel);
  sim.tiles.setFuel(px + 1, py, CONTENT.tiles[Tile.Grass].fuel);
  sim.tiles.setFire(px, py, 200);
  sim.tiles.setFire(px + 1, py, 200);
  run(sim, 120);
  check('peat smoulders long after grass burns out', sim.tiles.fire(px, py) > 0 && sim.tiles.kind(px + 1, py) !== Tile.Grass, `peat fire ${sim.tiles.fire(px, py)}, grass now ${sim.tiles.info(px + 1, py).name}`);
  const fen = (() => {
    for (let ry = -16; ry <= 16; ry++) for (let rx = -16; rx <= 16; rx++) {
      const s = siteInRegion(sim.state.seed, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
      if (s?.kind === 'fen') return s;
    }
    return null;
  })();
  if (fen) {
    put(me, sim, fen.cx + 0.5, fen.cy + 0.5);
    run(sim, 5);
    const toads = [...sim.state.entities.values()].filter((e) => e.def === 'bogToad');
    // A trail may run to the fen's middle (ways cross a place's plain ground), so judge the ground by the whole bog, not one tile.
    let peat = 0;
    let bog = 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      if (Math.hypot(dx, dy) > 8) continue;
      bog++;
      if (sim.tiles.kind(fen.cx + dx, fen.cy + dy) === Tile.Peat) peat++;
    }
    check('a fen is peat ground with toads living in it', peat >= bog * 0.8 && toads.length >= 3, `${peat}/${bog} peat, ${toads.length} toads`);
  } else check('found a fen to visit', false);
  check('villages list a brewer', CONTENT.sites.village?.villagers?.includes('brewer') === true);
}

// Creature brains: every creature picks behaviours from one shared library, as listed in its brain.
{
  const { sim, me } = world();
  const cx = me.pos.x;
  const cy = me.pos.y;
  arena(sim, Math.floor(cx), Math.floor(cy), 14, Tile.Grass);
  put(me, sim, cx, cy);
  const sp = spawner(sim);
  const dist = (a: Entity, b: Entity): number => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);

  const deer = sp.spawn('deer', cx + 5, cy);
  run(sim, 30);
  // It runs while you are close and calms once far enough (when that happens depends on the ground).
  check('a deer keeps its distance from a traveller', dist(deer, me) > 8, `${deer.ai?.doing}, ${dist(deer, me).toFixed(1)} m`);
  sim.state.entities.delete(deer.id);

  const wolf = sp.spawn('wolf', cx + 9, cy);
  run(sim, 20);
  check('a wolf hunts the traveller', wolf.ai?.doing === 'hunt' && wolf.ai.target === me.id, `${wolf.ai?.doing} → ${wolf.ai?.target}`);
  sim.state.entities.delete(wolf.id);

  const vil = sp.spawn('villager', cx + 4, cy);
  run(sim, 30);
  check('a villager does not run from a friendly traveller', vil.ai?.doing !== 'avoid' && vil.ai?.mode !== 'flee', `${vil.ai?.doing}`);
  if (vil.actor) vil.actor.lastAttacker = me.id;
  if (vil.ai) vil.ai.think = 0;
  run(sim, 3);
  check('once hit, a villager fights back', vil.ai?.doing === 'defend' && vil.ai.target === me.id, `${vil.ai?.doing}`);
  sim.state.entities.delete(vil.id);

  const timid = sp.spawn('villager', cx - 4, cy);
  const prowler = sp.spawn('wolf', cx - 7, cy);
  if (prowler.ai) prowler.ai.think = 1e9; // it holds still: the villager runs because of what it is

  run(sim, 15);
  check('a villager runs from a hunting creature', timid.ai?.doing === 'avoid', `${timid.ai?.doing}`);
  sim.state.entities.delete(timid.id);
  sim.state.entities.delete(prowler.id);

  delete me.status.poisoned;
  me.hp = me.maxHp;
  const toad = sp.spawn('bogToad', cx + 1.2, cy);
  let bit = false;
  for (let i = 0; i < 120 && !bit; i++) {
    run(sim, 1);
    bit = (me.status.poisoned ?? 0) > 0;
    me.hp = me.maxHp;
  }
  check('a bog toad bite poisons (creature attacks carry effects)', bit, `${toad.ai?.doing}`);
  const lurker = CONTENT.brains.lurker;
  check('brains are lists of shared behaviours', !!lurker && lurker.behaviours.some((b) => b.do === 'lurk') && Object.values(CONTENT.brains).every((b) => b.behaviours.length > 0));
}

// Pulling loose items from the view into the bag: only within reach and not through walls.
{
  const { sim, me } = world();
  // Somewhere on dry, fairly level land (reaching is judged in 3D).
  let x = 0;
  let y = 0;
  found: for (let r = 40; r < 4000; r += 13) {
    for (let a = 0; a < 6.28; a += 0.3) {
      x = Math.floor(Math.cos(a) * r);
      y = Math.floor(Math.sin(a) * r);
      const g = sim.tiles.ground(x, y);
      if (g > 2 && Math.abs(sim.tiles.ground(x + 9, y) - g) < 0.6) break found;
    }
  }
  arena(sim, x, y, 12);
  put(me, sim, x + 0.5, y + 0.5);
  const lay = (dx: number, dy: number): Entity => {
    const it = spawner(sim).spawn('looseItem', x + 0.5 + dx, y + 0.5 + dy, { item: { id: 'antidote', count: 1 } });
    it.z = it.prevZ = sim.tiles.ground(it.pos.x, it.pos.y);
    return it;
  };
  const has = (): number => me.actor?.inventory.find((s) => s.id === 'antidote')?.count ?? 0;
  const near = lay(3, 0);
  run(sim, 1, () => ({ pickUp: near.id }));
  check('drag a nearby item into the bag', has() === 1 && near.dead);
  const far = lay(9, 0);
  run(sim, 1, () => ({ pickUp: far.id }));
  check('items out of reach stay put', has() === 1 && !far.dead);
  for (let j = -2; j <= 2; j++) sim.tiles.setKind(x + 2, y + j, Tile.StoneWall as 0);
  const walled = lay(3.5, 0);
  run(sim, 1, () => ({ pickUp: walled.id }));
  check('no reaching through a wall', has() === 1 && !walled.dead);
}

// Item pictures are built from data: every item paints something, and weapons differ by their stats.
{
  const art = (id: string): Uint32Array => paintItem(itemDef(CONTENT, id));
  const filled = (px: Uint32Array): number => px.reduce((n, c) => n + (c !== 0 ? 1 : 0), 0);
  const empty = Object.keys(CONTENT.items).filter((id) => filled(art(id)) < 12);
  check('every item has a picture', empty.length === 0, empty.join(', '));
  const sword = itemDef(CONTENT, 'gear:sword:iron:fine');
  const longer = sword?.weapon ? paintItem({ ...sword, weapon: { ...sword.weapon, reach: sword.weapon.reach + 0.8 } }) : null;
  check('a longer reach paints a longer blade', !!longer && filled(longer) > filled(art('gear:sword:iron:fine')));
  const looks = new Set(Object.keys(CONTENT.items).map((id) => art(id).join(',')));
  check('different items look different', looks.size >= Object.keys(CONTENT.items).length - 2, `${looks.size} distinct of ${Object.keys(CONTENT.items).length}`);
  check('every named look form exists', Object.values(CONTENT.items).every((d) => !d.look?.form || ITEM_FORMS.includes(d.look.form)));
}

// Combat: wound-up blows, directional knockback, hitstop, hitstun, striking surfaces, casting creatures.
{
  const x = 21000;
  const y = 21000;
  /** Holds the button for `hold` ticks, lets go, and reports what the first hit did. */
  const duel = (dir: 'left' | 'right' | 'thrust' | 'overhead', hold: number, weapon = 'gear:sword:iron:common'): { dmg: number; kb: { x: number; y: number }; stamina: number; frozen: number; them: Entity; me: Entity; sim: Simulation } => {
    const { sim, me } = world();
    arena(sim, x, y);
    put(me, sim, x + 0.5, y + 0.5);
    if (me.actor) me.actor.weapon = weapon;
    const them = spawner(sim).spawn('villager', x + 1.5, y + 0.5, { z: sim.tiles.ground(x + 1.5, y + 0.5) });
    them.hp = them.maxHp = 500;
    const stamina0 = me.player?.stamina ?? 0;
    let kb = { x: 0, y: 0 };
    let frozen = 0;
    let spent = 0;
    for (let i = 0; i < 80; i++) {
      // Hold the dummy still so only the blow decides where it ends up.
      if (them.ai) {
        them.ai.mode = 'idle';
        them.ai.think = 50;
      }
      them.vel.x = them.vel.y = 0;
      sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), attack: i < hold + 1, swingDir: dir } });
      const evs = sim.step();
      spent = Math.max(spent, stamina0 - (me.player?.stamina ?? 0));
      if (evs.some((e) => e.type === 'hit' && e.target === them.id)) {
        kb = { x: them.kb?.x ?? 0, y: them.kb?.y ?? 0 };
        frozen = Math.min(them.freeze ?? 0, me.freeze ?? 0);
        break;
      }
    }
    return { dmg: them.maxHp - them.hp, kb, stamina: spent, frozen, them, me, sim };
  };
  const tap = duel('thrust', 1);
  const full = duel('thrust', 24);
  check('a held blow hits harder', full.dmg > tap.dmg * 1.4, `${tap.dmg.toFixed(1)} → ${full.dmg.toFixed(1)}`);
  check('a held blow throws farther', Math.hypot(full.kb.x, full.kb.y) > Math.hypot(tap.kb.x, tap.kb.y) * 1.3, `${Math.hypot(tap.kb.x, tap.kb.y).toFixed(1)} → ${Math.hypot(full.kb.x, full.kb.y).toFixed(1)}`);
  check('a held blow costs more stamina', full.stamina > tap.stamina, `${tap.stamina.toFixed(1)} → ${full.stamina.toFixed(1)}`);
  const L = duel('left', 1);
  const Rr = duel('right', 1);
  check('left and right sweeps throw foes opposite ways', L.kb.y * Rr.kb.y < 0, `left ${L.kb.y.toFixed(2)}, right ${Rr.kb.y.toFixed(2)}`);
  check('a thrust drives straight back', tap.kb.x > Math.abs(tap.kb.y) * 2 && tap.kb.x > L.kb.x, `thrust ${tap.kb.x.toFixed(2)} sweep ${L.kb.x.toFixed(2)}`);
  check('a solid hit holds both bodies still (hitstop)', tap.frozen > 0, `${tap.frozen} ticks`);
  const stun = duel('overhead', 1, 'gear:hammer:iron:common');
  check('a heavy blow staggers (hitstun)', (stun.them.status[CONTENT.rules.combat.hitstun.status] ?? 0) > 0);
  check('wild creatures do not hurt their own kind', CONTENT.factions.wild?.friendlyFire === true);

  // Striking surfaces: doors break, hard things wear the weapon more than soft ones.
  const strikeTile = (kind: number, hits: number, weapon: string): { sim: Simulation; me: Entity; wearLost: number; broke: boolean } => {
    const { sim, me } = world();
    arena(sim, x, y + 40);
    put(me, sim, x + 0.5, y + 40.5);
    if (me.actor) me.actor.weapon = weapon;
    sim.tiles.setKind(x + 2, y + 40, kind as 0);
    const wearNow = (): number => (me.actor?.weapon ? (itemDef(CONTENT, me.actor.weapon)?.wear ?? 0) : 0);
    const w0 = wearNow();
    let n = 0;
    for (let i = 0; i < hits * 40; i++) {
      sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), attack: i % 40 < 2, swingDir: 'thrust' } });
      for (const ev of sim.step()) if (ev.type === 'strike') n++;
      if (me.player) me.player.stamina = 100;
      if (sim.tiles.kind(x + 2, y + 40) !== kind) break;
    }
    return { sim, me, wearLost: (w0 - wearNow()) / Math.max(1, n), broke: sim.tiles.kind(x + 2, y + 40) !== kind };
  };
  const door = strikeTile(Tile.Door, 30, 'gear:hammer:steel:masterwork:enduring');
  check('a door can be broken down', door.broke && door.sim.tiles.kind(x + 2, y + 40) === Tile.WoodFloor, `now tile ${door.sim.tiles.kind(x + 2, y + 40)}`);
  const stone = strikeTile(Tile.StoneWall, 10, 'gear:sword:steel:masterwork:enduring');
  const wood = strikeTile(Tile.WoodWall, 10, 'gear:sword:steel:masterwork:enduring');
  check('stone walls do not give', !stone.broke);
  check('hard stone wears a blade more than wood (per blow)', stone.wearLost > wood.wearLost, `stone ${stone.wearLost}, wood ${wood.wearLost}`);

  // A hexer casts: aether is spent and a spell flies.
  {
    const { sim, me } = world();
    arena(sim, x, y + 80);
    put(me, sim, x + 0.5, y + 80.5);
    me.hp = me.maxHp = 9999;
    const hx = spawner(sim).spawn('hexer', x + 9.5, y + 80.5, { z: sim.tiles.ground(x + 9.5, y + 80.5) });
    const mana0 = hx.actor?.mana ?? 0;
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0) } });
      for (const e of sim.step()) seen.add(e.type);
      if (seen.has('spellCast')) break;
    }
    check('a hexer gathers and casts a spell', seen.has('charge') && seen.has('spellCast'), [...seen].join(','));
    check('casting spends the creature\'s aether', (hx.actor?.mana ?? 0) < mana0, `${mana0} → ${hx.actor?.mana}`);
  }
}

if (failed) throw new Error(`${failed} mechanics check(s) failed`);
console.log('all mechanics checks passed');
