// Settlements and cities in the 3D layer: villages raise real buildings with furniture inside,
// villagers go home through their doors, and walled cities lay out walls, gates, streets and a keep.
// Prints PASS/FAIL per check. Set DEBUG=1 for a walk-by-walk trace and an ASCII map of the first city.
import { Simulation, createState } from '../src/sim';
import { CONTENT, validateContent } from '../src/content';
import { siteInRegion } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';
import type { Entity, InputSnapshot } from '../src/types';
import { emptyInput } from '../src/types';

declare const process: { env: Record<string, string | undefined> };
let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const DEBUG = process.env['DEBUG'] === '1';

check('content validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

function world(seed = 4242): { sim: Simulation; me: Entity } {
  const sim = new Simulation(createState(seed));
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
function run(sim: Simulation, ticks: number, input?: (i: number) => Partial<InputSnapshot>): void {
  for (let i = 0; i < ticks; i++) {
    sim.enqueue({ type: 'input', playerId: 'local', input: { ...emptyInput(i, 0), ...(input ? input(i) : {}) } });
    sim.step();
  }
}
function find(sim: Simulation, kind: string, from = 0): SiteLayout | null {
  let best: SiteLayout | null = null;
  let bd = Infinity;
  for (let ry = -14; ry <= 14; ry++) {
    for (let rx = -14; rx <= 14; rx++) {
      const s = siteInRegion(sim.state.seed, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
      if (s?.kind !== kind) continue;
      const d = Math.hypot(s.cx, s.cy);
      if (d >= from && d < bd) {
        best = s;
        bd = d;
      }
    }
  }
  return best;
}
function visit(sim: Simulation, me: Entity, s: SiteLayout): void {
  // Move in stages so the world around is made and the place registers.
  me.pos.x = s.cx + 0.5;
  me.pos.y = s.cy - 60;
  me.vel.x = me.vel.y = 0;
  run(sim, 3);
  me.pos.x = s.cx + 0.5;
  me.pos.y = s.cy + 0.5;
  me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y) + 6;
  run(sim, 1);
}

// ---- Village -------------------------------------------------------------------------------
{
  const { sim, me } = world();
  const v = find(sim, 'village');
  check('a village with 3D houses exists', !!v && v.plan.length > 0 && v.houses.every((h) => !!h.structure), `${v?.plan.length ?? 0} buildings`);
  check('an average village is a large one', !!v && v.houses.length >= 6 && v.radius >= 50, `${v?.houses.length ?? 0} houses, radius ${v?.radius ?? 0}`);
  if (v) {
    visit(sim, me, v);
    run(sim, 60);
    const loc = sim.state.locations.find((l) => l.name === v.name);
    check('the buildings go up, then people move in', !!loc && (loc.built ?? 0) >= v.plan.length && loc.populated, `${loc?.built}/${v.plan.length}`);
    check('the 3D layer holds the houses', sim.state.volume.bricks.size > 0);
    const things = [...sim.state.entities.values()].filter((e) => e.site === loc?.id);
    const count = (id: string): number => things.filter((e) => e.def === id).length;
    check('houses hold beds, tables and chests inside', count('bed') > 0 && count('table') > 0, `beds ${count('bed')} tables ${count('table')} chests ${count('chest')} hearths ${count('hearth')} cupboards ${count('cupboard')}`);
    // Everything stands on a floor inside, not in a wall.
    let stuck = 0;
    for (const e of things) {
      if (!['bed', 'table', 'chest', 'cupboard', 'hearth'].includes(e.def)) continue;
      if (sim.state.volume.solidBetween(e.pos.x, e.pos.y, e.z + 0.05, e.z + 0.6)) stuck++;
    }
    check('furniture stands clear of walls and floors', stuck === 0, `${stuck} stuck`);
    // Press use in front of a bed: it heals and then needs a rest; a cupboard opens and spills its contents.
    {
      const bed = things.find((e) => e.def === 'bed');
      if (bed) {
        me.pos.x = bed.pos.x - Math.cos(bed.angle) * 1.2;
        me.pos.y = bed.pos.y - Math.sin(bed.angle) * 1.2;
        me.z = me.prevZ = bed.z + 0.1;
        me.angle = Math.atan2(bed.pos.y - me.pos.y, bed.pos.x - me.pos.x);
        me.hp = 40;
        run(sim, 2, (i) => (i === 0 ? { interact: true, yaw: me.angle } : {}));
        run(sim, 4);
        check('using a bed heals you, then it needs time before the next', me.hp > 40 && bed.cooldown > 0, `hp ${me.hp}, bed rests ${bed.cooldown}`);
      } else check('using a bed heals you', false, 'no bed');
    }
    const folk = [...sim.state.entities.values()].filter((e) => e.npc && e.npc.locationId === loc?.id);
    check('every villager has a door and a bed spot indoors', folk.length > 0 && folk.every((e) => !!e.npc?.door), `${folk.length} villagers`);
    // At night they go in through the door and stay out of the walls.
    sim.state.weather.time = 0.9;
    let wallTicks = 0;
    for (let t = 0; t < 20 * 90; t++) {
      run(sim, 1);
      // This is about walking home, not about wolves: the night's roaming beasts (which the land's luck may or may not
      // send to the village) are sent away, so what is left to hold a villager up is the village itself.
      if (t % 10 === 0) for (const o of sim.state.entities.values()) if (o.ai && o.actor && !o.npc && !o.player && Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y) < 120) o.dead = true;
      for (const e of folk) if (sim.state.volume.solidBetween(e.pos.x, e.pos.y, e.z + 0.3, e.z + 1.2)) wallTicks++;
      if (DEBUG && t % 400 === 0) {
        console.log(t, folk.map((e) => `${e.npc?.name}:${Math.hypot(e.npc!.home.x - e.pos.x, e.npc!.home.y - e.pos.y).toFixed(1)}`).join(' '));
        const e = folk[Number(process.env["WHO"] ?? 1)]!;
        if (t === 400) {
          const probe = [] as string[];
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2;
            const x = e.pos.x + Math.cos(a) * 1.2;
            const y = e.pos.y + Math.sin(a) * 1.2;
            probe.push(`${k}:${sim.tiles.blocked(x, y) ? 'T' : '-'}${sim.state.volume.solidBetween(x, y, e.z + 0.6, e.z + 1.5) ? 'V' : '-'}`);
          }
          console.log('  probes', probe.join(' '), 'tile', sim.tiles.info(Math.floor(e.pos.x), Math.floor(e.pos.y)).shape, 'near', [...sim.state.entities.values()].filter((o) => o !== e && Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) < 2).map((o) => o.def).join(','));
        }
        console.log('  pos', e.pos.x.toFixed(1), e.pos.y.toFixed(1), 'z', e.z.toFixed(2), 'goal', JSON.stringify(e.ai?.goal), e.ai?.mode, 'door', JSON.stringify(e.npc?.door), 'home', JSON.stringify(e.npc?.home));
      }
    }
    const inRoom = (e: Entity): boolean => {
      const r = e.npc?.door?.room;
      return !!r && e.pos.x >= r.x0 && e.pos.x < r.x1 + 1 && e.pos.y >= r.y0 && e.pos.y < r.y1 + 1;
    };
    const home = folk.filter(inRoom).length;
    check('villagers walk home through their doors at night', home >= Math.ceil(folk.length * 0.8), `${home}/${folk.length} indoors`);
    check('villagers never end up inside a wall', wallTicks === 0, `${wallTicks} wall ticks`);
    // And out again in the morning.
    sim.state.weather.time = 0.35;
    run(sim, 20 * 90);
    const out = folk.filter((e) => !inRoom(e)).length;
    check('they come out again in the morning', out >= Math.ceil(folk.length * 0.8), `${out}/${folk.length} outdoors`);
  }
}

// ---- City ----------------------------------------------------------------------------------
{
  const { sim, me } = world();
  const c = find(sim, 'city');
  check('a walled city exists', !!c, c ? `${c.name} at ${c.cx},${c.cy}` : 'none in range');
  if (c) {
    const kinds = new Map<string, number>();
    for (const s of c.plan) kinds.set(s.id, (kinds.get(s.id) ?? 0) + 1);
    console.log([...kinds.entries()].map(([k, n]) => `${k} ${n}`).join(', '));
    check('it has gates, towers, walls and a keep', (kinds.get('cityGate') ?? 0) >= 2 && (kinds.get('wallTower') ?? 0) >= 8 && (kinds.get('cityWall') ?? 0) >= 8 && (kinds.get('keep') ?? 0) === 1);
    check('it has a church and houses in several districts', (kinds.get('church') ?? 0) === 1 && (kinds.get('townhouse') ?? 0) > 3 && (kinds.get('cottage') ?? 0) + (kinds.get('hovel') ?? 0) > 3);
    // No two buildings share ground.
    let overlaps = 0;
    for (let i = 0; i < c.plan.length; i++) {
      const a = c.plan[i];
      if (!a) continue;
      for (let j = i + 1; j < c.plan.length; j++) {
        const b = c.plan[j];
        if (!b) continue;
        if (a.x < b.x + b.fx && a.x + a.fx > b.x && a.y < b.y + b.fy && a.y + a.fy > b.y) {
          overlaps++;
          if (DEBUG) console.log('overlap', a.id, a.x, a.y, a.fx, a.fy, b.id, b.x, b.y, b.fx, b.fy);
        }
      }
    }
    check('no two buildings overlap', overlaps === 0, `${overlaps} overlaps`);
    if (DEBUG) {
      const rows: string[] = [];
      const hx = 100;
      for (let y = c.cy - hx; y <= c.cy + hx; y += 2) {
        let line = '';
        for (let x = c.cx - 110; x <= c.cx + 110; x += 1) {
          const s = c.plan.find((p) => x >= p.x && x < p.x + p.fx && y >= p.y && y < p.y + p.fy);
          line += s ? s.id[0]!.toUpperCase() : c.paint?.(x, y) === 7 ? '=' : c.paint?.(x, y) === null ? ' ' : '.';
        }
        rows.push(line);
      }
      console.log(rows.join('\n'));
    }
    visit(sim, me, c);
    const t0 = Date.now();
    let ticks = 0;
    const loc = () => sim.state.locations.find((l) => l.name === c.name);
    while (ticks < 20 * 120 && !loc()?.populated) {
      run(sim, 1);
      ticks++;
    }
    const l = loc();
    check('the city goes up over a few seconds, not in one stall', !!l?.populated && ticks > 5 && ticks < 20 * 60, `${ticks} ticks, ${Date.now() - t0} ms, ${sim.state.volume.bricks.size} bricks`);
    const folk = [...sim.state.entities.values()].filter((e) => e.npc && e.npc.locationId === l?.id);
    check('its people live in its houses', folk.length > 0 && folk.length <= 30, `${folk.length} residents`);
    // A city full of furniture and people still ticks well inside the 50 ms budget.
    {
      const things = sim.state.entities.size;
      const t1 = Date.now();
      run(sim, 100);
      const per = (Date.now() - t1) / 100;
      check('a populated city ticks within budget', per < 25, `${per.toFixed(1)} ms per tick with ${things} things`);
    }
    // Walk through the south gate: nothing solid in the opening.
    const gate = c.plan.find((p) => p.id === 'cityGate' && p.rot === 2);
    if (gate) {
      const gx = gate.x + Math.floor(gate.w / 2) + 0.5;
      let blocked = false;
      for (let y = gate.y; y < gate.y + gate.fy; y++) if (sim.state.volume.solidBetween(gx, y + 0.5, sim.tiles.ground(gx, y) + 0.2, sim.tiles.ground(gx, y) + 2.5)) blocked = true;
      check('the south gate is open to walk through', !blocked);
    }
  }
}


// ---- Megacity ------------------------------------------------------------------------------
{
  const { sim, me } = world();
  const c = find(sim, 'megacity');
  check('a megacity exists', !!c, c ? `${c.name} at ${c.cx},${c.cy}` : 'none in range');
  if (c) {
    const fp = c.footprint;
    check('it is made of many wards', fp.length >= 6, `${fp.length} wards, ${c.plan.length} buildings, radius ${c.radius}`);
    // Not a rectangle: the wards fill well under their bounding box.
    const bx0 = Math.min(...fp.map((r) => r.x0));
    const bx1 = Math.max(...fp.map((r) => r.x1));
    const by0 = Math.min(...fp.map((r) => r.y0));
    const by1 = Math.max(...fp.map((r) => r.y1));
    const area = fp.reduce((t, r) => t + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
    const fill = area / ((bx1 - bx0 + 1) * (by1 - by0 + 1));
    check('its outline is irregular, not a box', fill < 0.8, `fills ${(fill * 100).toFixed(0)}% of its bounding box`);
    // Wards may touch across their gaps, but no wall stands inside one: a single wall rings the lot.
    const innerWall = c.plan.filter((q) => /wall|gate/i.test(q.id) && fp.some((r) => q.x > r.x0 + 1 && q.x + q.fx < r.x1 && q.y > r.y0 + 1 && q.y + q.fy < r.y1 && c.layout.shape === 'city' && !(Math.abs(q.x - c.cx) < 14 && Math.abs(q.y - c.cy) < 14))).length;
    check('no walls inside the districts', innerWall === 0, `${innerWall} inner wall pieces`);
    check('gates open on the outer wall', c.gates.length >= 4, `${c.gates.length} gates`);
    let overlaps = 0;
    for (let i = 0; i < c.plan.length; i++) {
      const a = c.plan[i]!;
      for (let j = i + 1; j < c.plan.length; j++) {
        const b = c.plan[j]!;
        if (a.x < b.x + b.fx && a.x + a.fx > b.x && a.y < b.y + b.fy && a.y + a.fy > b.y) {
          overlaps++;
          if (DEBUG) console.log('mega overlap', a.id, a.x, a.y, a.fx, a.fy, b.id, b.x, b.y, b.fx, b.fy);
        }
      }
    }
    check('no two buildings overlap', overlaps === 0, `${overlaps} overlaps`);
    // Every ward is joined to the first by paved ground: flood over street tiles from the middle.
    const groundTile = c.layout.shape === 'city' ? c.layout.tiles.ground : -1;
    const paved = (x: number, y: number): boolean => {
      const t = c.paint?.(x, y);
      return t !== null && t !== undefined && t !== groundTile;
    };
    const seen = new Set<number>();
    const stack: [number, number][] = [[c.cx, c.cy]];
    const key = (x: number, y: number): number => (x + 5000) * 10000 + (y + 5000);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (seen.has(key(x, y)) || !paved(x, y)) continue;
      seen.add(key(x, y));
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const joined = fp.filter((r) => seen.has(key(Math.floor((r.x0 + r.x1) / 2), Math.floor((r.y0 + r.y1) / 2)))).length;
    check('every ward is joined to the heart by streets', joined === fp.length, `${joined}/${fp.length}`);
    check('roads can leave it', (c.mouths?.length ?? 0) >= 3, `${c.mouths?.length ?? 0} gates to the world`);
    check('it has a keep and gates only where roads leave it', c.plan.filter((p) => p.id === 'keep').length === 1 && c.plan.filter((p) => p.id === 'cityGate').length >= 3, `${c.plan.filter((p) => p.id === 'cityGate').length} gates`);
    visit(sim, me, c);
    const t0 = Date.now();
    let ticks = 0;
    const loc = () => sim.state.locations.find((l) => l.name === c.name);
    while (ticks < 20 * 240 && !loc()?.populated) {
      run(sim, 1);
      ticks++;
    }
    check('it goes up in well under a minute', !!loc()?.populated && ticks < 20 * 60, `${ticks} ticks, ${Date.now() - t0} ms, ${sim.state.volume.bricks.size} bricks`);
    const folk = [...sim.state.entities.values()].filter((e) => e.npc && e.npc.locationId === loc()?.id);
    check('a great many people live in it', folk.length >= 40, `${folk.length} residents`);
    const t1 = Date.now();
    run(sim, 60);
    const per = (Date.now() - t1) / 60;
    check('a populated megacity ticks within budget', per < 25, `${per.toFixed(1)} ms per tick with ${sim.state.entities.size} things`);
  }
}

// ---- Forests -------------------------------------------------------------------------------
{
  const { sim } = world();
  // Count tree tiles in forest-biome ground; a walker must be able to get through.
  let forest = 0;
  let trees = 0;
  for (let y = -1500; y < 1500; y += 3) {
    for (let x = -1500; x < 1500; x += 3) {
      const g = sim.terrain.ground(x, y);
      if (sim.terrain.biomeAt(x, y, g) !== 'forest') continue;
      forest++;
      if (sim.tiles.blocked(x + 0.5, y + 0.5)) trees++;
    }
  }
  const share = forest > 0 ? trees / forest : 0;
  check('forests are thin enough to walk through', forest > 100 && share < 0.12, `${(share * 100).toFixed(1)}% of ${forest} forest tiles blocked`);
}

{
  // Villages roll a layout style by weight: some are long streets, some round, and none stack houses on each other.
  const vs: SiteLayout[] = [];
  for (let rx = -40; rx < 40 && vs.length < 40; rx++) for (let ry = -3; ry < 3 && vs.length < 40; ry++) {
    const v = siteInRegion(777, rx, ry, () => 10);
    if (v && v.kind === 'village') vs.push(v);
  }
  // How stretched is the spread of buildings along its main direction (1 = round, high = a street)?
  const aspects = vs.map((v) => {
    const n = v.plan.length || 1;
    const mx = v.plan.reduce((t, q) => t + q.x, 0) / n;
    const my = v.plan.reduce((t, q) => t + q.y, 0) / n;
    const sxx = v.plan.reduce((t, q) => t + (q.x - mx) ** 2, 0) / n;
    const syy = v.plan.reduce((t, q) => t + (q.y - my) ** 2, 0) / n;
    const sxy = v.plan.reduce((t, q) => t + (q.x - mx) * (q.y - my), 0) / n;
    const tr = sxx + syy;
    const disc = Math.sqrt(Math.max(0, (sxx - syy) ** 2 / 4 + sxy * sxy));
    return Math.sqrt((tr / 2 + disc) / Math.max(1e-6, tr / 2 - disc));
  });
  if (DEBUG) console.log(aspects.map((a) => a.toFixed(1)).join(' '));
  check('villages come in different layouts', vs.length >= 10 && aspects.some((a) => a > 2) && aspects.some((a) => a < 1.4), `${vs.length} villages`);
  check('hearths smoke (data)', (CONTENT.things['hearth']?.smoke?.rate ?? 0) > 0);
}

{
  // Cities: every paved tile runs back to the heart or a gate road (no stray path fragments), and only the outer wall stands (no keep court wall).
  let cities = 0;
  let stray = 0;
  let inner = 0;
  for (let rx = -30; rx < 30 && cities < 12; rx++) for (let ry = -3; ry < 3 && cities < 12; ry++) {
    const c = siteInRegion(4321, rx, ry, () => 10);
    if (!c || c.layout.shape !== 'city' || !c.paint) continue;
    cities++;
    const ground = c.layout.tiles.ground;
    const r = Math.ceil(c.radius);
    const key = (x: number, y: number): number => (x + 20000) * 40000 + (y + 20000);
    const seen = new Set<number>();
    const stack: [number, number][] = [[c.cx, c.cy], ...(c.mouths ?? []).map((m): [number, number] => [m.x, m.y])];
    const paved = (x: number, y: number): boolean => {
      const t = c.paint?.(x, y);
      return t !== null && t !== undefined && t !== ground;
    };
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      if (seen.has(key(x, y)) || !paved(x, y)) continue;
      seen.add(key(x, y));
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (let x = c.cx - r; x <= c.cx + r; x++) for (let y = c.cy - r; y <= c.cy + r; y++) if (paved(x, y) && !seen.has(key(x, y))) stray++;
    inner += c.plan.filter((p) => (p.id === 'wallTower' || p.id === 'cityWall' || p.id === 'cityGate') && Math.abs(p.x - c.cx) < 24 && Math.abs(p.y - c.cy) < 24).length;
  }
  check('city streets never leave stray fragments', cities > 0 && stray === 0, `${stray} stray tiles in ${cities} cities`);
  check('no wall loop inside a city', inner === 0, `${inner} inner wall pieces`);
}

// ---- Ruins (dungeon entrances) ---------------------------------------------------------------
{
  const { sim, me } = world();
  const r = find(sim, 'ruin');
  check('a ruin is a plan of 3D structures', !!r && r.plan.length >= 6, `${r?.plan.length ?? 0} pieces`);
  if (r) {
    visit(sim, me, r);
    run(sim, 80);
    const loc = sim.state.locations.find((l) => l.kind === 'ruin' && l.pos.x === r.cx && l.pos.y === r.cy);
    check('the ruin goes up and is populated', !!loc && (loc.built ?? 0) >= r.plan.length && loc.populated, `${loc?.built}/${r.plan.length}`);
    const way = [...sim.state.entities.values()].find((e) => e.site === loc?.id && e.def === 'descent');
    check('the stair down stands free of the walls', !!way && sim.state.volume.topAt(way.pos.x, way.pos.y) <= sim.tiles.ground(way.pos.x, way.pos.y) + 0.05);
  }
}

if (failed > 0) throw new Error(`${failed} settlement check(s) failed`);
