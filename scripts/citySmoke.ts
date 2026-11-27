// Walled cities and megacities in the 3D layer: walls, gates, streets, districts and a keep, with no buildings overlapping.
// Prints PASS/FAIL per check. Set DEBUG=1 for an ASCII map of the first city.
import { DEBUG, check, failures, find, run, visit, world } from './siteKit';

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

if (failures() > 0) throw new Error(`${failures()} city check(s) failed`);
