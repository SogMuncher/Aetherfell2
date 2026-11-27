// Settlements and cities in the 3D layer: villages raise real buildings with furniture inside,
// villagers go home through their doors and out to their day's places; forests and ruins too (cities: citySmoke).
// Prints PASS/FAIL per check. Set DEBUG=1 for a walk-by-walk trace and an ASCII map of the first city.
import { CONTENT, hauntNow, validateContent } from '../src/content';
import type { Entity } from '../src/types';
import { siteInRegion } from '../src/sim/world/sites';
import type { SiteLayout } from '../src/sim/world/sites';

declare const process: { env: Record<string, string | undefined> };
import { DEBUG, check, failures, find, run, visit, world } from './siteKit';

check('content validates', validateContent(CONTENT).length === 0, validateContent(CONTENT).join('; '));

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
    // In the morning each goes to the place their job names (the smithy, the square, the fields...), round houses and through doors.
    sim.state.weather.time = 0.35;
    run(sim, 20 * 90);
    const there = folk.filter((e) => {
      const spot = e.npc?.haunts[hauntNow(CONTENT, sim.state.weather, e)];
      return !!spot && Math.hypot(spot.x - e.pos.x, spot.y - e.pos.y) < 6;
    });
    const places = new Set(folk.map((e) => hauntNow(CONTENT, sim.state.weather, e)));
    check('in the morning they reach their own work places', there.length >= Math.ceil(folk.length * 0.8), `${there.length}/${folk.length} there, places ${[...places].join(',')}`);
    check('and those are not all the same place', places.size > 1);
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

if (failures() > 0) throw new Error(`${failures()} settlement check(s) failed`);
