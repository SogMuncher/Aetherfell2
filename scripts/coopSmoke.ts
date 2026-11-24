// Headless co-op checks: two players in one world, friends' inputs arriving late, twice or in bursts,
// bad messages, the shared journal/quests/places reaching friends, saving and loading with a friend
// present, places keeping their creatures until you arrive, and places never filled twice.
import { Simulation, createState } from '../src/sim';
import { CONTENT, thingDef } from '../src/content';
import { REGION_SIZE, siteInRegion } from '../src/sim/world/sites';
import { SharedLogTracker, applySharedLog, cleanFriendId, cleanInput, isGuestMessage, snapshotFor } from '../src/net/messages';
import { GuestView } from '../src/net/prediction';
import type { InputQueues } from '../src/sim/inputQueue';
import type { EntitySnapshot } from '../src/types';
import type { Entity, InputSnapshot } from '../src/types';
import { CHUNK_SIZE, Tile, emptyInput, packKey } from '../src/types';

let failed = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function player(sim: Simulation, id: string): Entity {
  const eid = sim.state.players[id];
  const e = eid !== undefined ? sim.state.entities.get(eid) : undefined;
  if (!e?.player) throw new Error(`no player ${id}`);
  return e;
}
function party(seed = 777): Simulation {
  const sim = new Simulation(createState(seed));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Host' });
  sim.step();
  sim.enqueue({ type: 'join', playerId: 'friend', name: 'Friend' });
  sim.step();
  sim.state.weather.nextShift = 1e9;
  return sim;
}
function count(e: Entity, item: string): number {
  return e.actor?.inventory.find((s) => s.id === item)?.count ?? 0;
}
let hostSeq = 0;
/** One tick: the host's own input is always there, the friend's only when given. */
function tick(sim: Simulation, friend: Partial<InputSnapshot>[] = []): void {
  sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(++hostSeq) });
  for (const f of friend) sim.enqueue({ type: 'input', playerId: 'friend', input: { ...emptyInput(0), ...f } });
  sim.step();
}

// A friend's single press, then silence on the line: used once, not every tick.
{
  const sim = party();
  const f = player(sim, 'friend');
  f.actor?.inventory.push({ id: 'manaTonic', count: 10 });
  const before = count(f, 'manaTonic');
  tick(sim, [{ seq: 1, useItem: 'manaTonic' }]);
  for (let i = 0; i < 10; i++) tick(sim);
  check('a friend\'s press with no more messages is used once', count(f, 'manaTonic') === before - 1, `${before} → ${count(f, 'manaTonic')}`);

  // Two presses arriving in the same tick: both happen (one per tick), none lost.
  tick(sim, [{ seq: 2, useItem: 'manaTonic' }, { seq: 3, useItem: 'manaTonic' }]);
  tick(sim);
  tick(sim);
  check('two presses arriving together both happen', count(f, 'manaTonic') === before - 3, `left ${count(f, 'manaTonic')}`);

  // The same message twice, and an old one arriving late: ignored.
  tick(sim, [{ seq: 4, useItem: 'manaTonic' }, { seq: 4, useItem: 'manaTonic' }]);
  tick(sim, [{ seq: 3, useItem: 'manaTonic' }]);
  tick(sim);
  check('a repeated or late message is not played again', count(f, 'manaTonic') === before - 4, `left ${count(f, 'manaTonic')}`);

  // A press that went the slow, sure road and arrives after newer movement still happens, once.
  tick(sim, [{ seq: 41 }]);
  tick(sim, [{ seq: 40, useItem: 'manaTonic' }]);
  tick(sim);
  tick(sim, [{ seq: 40, useItem: 'manaTonic' }]);
  tick(sim);
  check('a late press still happens, once', count(f, 'manaTonic') === before - 5, `left ${count(f, 'manaTonic')}`);

  // Walking keeps going between messages (held keys carry on), presses do not.
  const x0 = f.pos.x;
  const y0 = f.pos.y;
  tick(sim, [{ seq: 42, forward: 1, yaw: f.player?.input.yaw ?? 0 }]);
  for (let i = 0; i < 6; i++) tick(sim);
  check('held movement carries on between a friend\'s messages', Math.hypot(f.pos.x - x0, f.pos.y - y0) > 0.5, `${Math.hypot(f.pos.x - x0, f.pos.y - y0).toFixed(2)} m`);
  check('the carried-on input has no presses in it', f.player?.input.useItem === null && f.player.input.jump === false);

  // A burst after a stall: the friend catches up within a few ticks, and every press still happens.
  const burst: Partial<InputSnapshot>[] = [];
  for (let s = 46; s < 56; s++) burst.push({ seq: s, forward: 0, useItem: s === 48 || s === 52 ? 'manaTonic' : null });
  tick(sim, burst);
  for (let i = 0; i < 12; i++) tick(sim);
  check('a burst of inputs keeps every press', count(f, 'manaTonic') === before - 7, `left ${count(f, 'manaTonic')}`);
  const waiting = (sim as unknown as { inputs: InputQueues }).inputs.waiting('friend');
  check('a burst of inputs is caught up on', waiting === 0, `${waiting} still waiting`);
}

// A friend walking while their inputs arrive unevenly (none one tick, two the next): wherever the host
// says they are, it is where their own inputs alone would have put them, so their screen is not pulled back.
{
  const walk = (i: number): Partial<InputSnapshot> => ({ seq: 100 + i, forward: 1, strafe: i % 40 < 20 ? 0 : 1, yaw: 0.3 });
  const steady = party(31);
  const at: { x: number; y: number }[] = [];
  for (let i = 0; i < 80; i++) {
    tick(steady, [walk(i)]);
    const e = player(steady, 'friend');
    at[100 + i] = { x: e.pos.x, y: e.pos.y };
  }
  const bumpy = party(31);
  const arrive = [1, 0, 2, 1, 1, 0, 0, 3, 1, 0, 2, 1];
  let next = 0;
  let worst = 0;
  for (let t = 0; next < 80; t++) {
    const n = arrive[t % arrive.length] ?? 1;
    const batch: Partial<InputSnapshot>[] = [];
    for (let k = 0; k < n && next < 80; k++) batch.push(walk(next++));
    tick(bumpy, batch);
    const e = player(bumpy, 'friend');
    const want = at[e.player?.input.seq ?? 0];
    if (want) worst = Math.max(worst, Math.hypot(e.pos.x - want.x, e.pos.y - want.y));
  }
  check('uneven arrival of a friend\'s inputs does not pull them back', worst < 0.3, `${worst.toFixed(2)} m off at worst`);
}

// Bad messages from a friend never crash the host.
{
  check('an input message with no input is refused', !isGuestMessage({ t: 'input', input: null }) && !isGuestMessage({ t: 'input' }) && !isGuestMessage(null));
  let ok = true;
  let cleaned = emptyInput();
  try {
    cleaned = cleanInput(null);
    cleaned = cleanInput({ seq: 'x', forward: 99, useItem: { evil: 1 }, prepare: [1, 2], choice: 1.5, throwItem: { item: 'oilFlask', yaw: NaN } });
  } catch {
    ok = false;
  }
  check('a malformed input is cleaned, not thrown', ok && cleaned.forward === 1 && cleaned.useItem === null && cleaned.prepare === null && cleaned.choice === null && cleaned.throwItem === null && cleaned.seq === 0);
  check('a ping is a valid message', isGuestMessage({ t: 'ping' }));
}

// The shared record reaches friends: journal lines, quests, discovered places, faction feelings.
{
  const host = party(31337);
  for (let i = 0; i < 40; i++) tick(host);
  const guest = Simulation.fromSave(host.save());
  if (!guest) throw new Error('no guest copy');
  const tracker = new SharedLogTracker();
  const first = tracker.next(host.state);
  if (first) applySharedLog(guest.state, first);
  check('nothing new to send when nothing changed', tracker.next(host.state) === null);
  host.state.journal.push({ tick: host.state.tick, day: 1, text: 'Something happened.' });
  const loc = host.state.locations[0];
  if (loc) loc.discovered = true;
  host.state.quests.push({ id: 99, title: 'Test', giver: 0, giverName: 'Nell', kind: 'cull', targetKind: 'wolf', targetLocation: null, needed: 3, progress: 1, state: 'active', reward: 5 });
  const fk = Object.keys(host.state.factions)[0] ?? '';
  const fo = Object.keys(host.state.factions)[1] ?? '';
  const feels = host.state.factions[fk];
  if (feels) feels[fo] = -0.5;
  const log = tracker.next(host.state);
  check('a change produces a shared message', log !== null);
  if (log) applySharedLog(guest.state, log);
  check('the friend sees the new journal line', guest.state.journal.length === host.state.journal.length && guest.state.journal.at(-1)?.text === 'Something happened.');
  check('the friend sees quests and their progress', JSON.stringify(guest.state.quests) === JSON.stringify(host.state.quests));
  check('the friend sees discovered places', !loc || (guest.state.locations[0]?.discovered ?? false));
  check('the friend sees faction feelings', guest.state.factions[fk]?.[fo] === -0.5);
  check('only the new journal lines are sent', !log || log.journal.length === 1, `${log?.journal.length ?? 0} lines`);
}

// Saving with a friend present, then loading: nobody is left standing unplayed, and both get their character back.
{
  const sim = party(2024);
  const f = player(sim, 'friend');
  const fid = f.id;
  f.actor?.inventory.push({ id: 'manaTonic', count: 7 });
  const hid = player(sim, 'local').id;
  const bytes = sim.save();
  const loaded = Simulation.fromSave(bytes);
  if (!loaded) throw new Error('no load');
  loaded.parkPlayers();
  check('after loading, no character stands in the world unplayed', Object.keys(loaded.state.players).length === 0 && ![...loaded.state.entities.values()].some((e) => e.player));
  loaded.enqueue({ type: 'join', playerId: 'local', name: 'Host' });
  loaded.step();
  check('the host gets their own character back', loaded.state.players['local'] === hid);
  for (let i = 0; i < 100; i++) {
    loaded.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i + 1) });
    loaded.step();
  }
  check('an absent friend is not counted as a player', Object.keys(loaded.state.players).length === 1);
  loaded.enqueue({ type: 'join', playerId: 'friend', name: 'Friend' });
  loaded.step();
  const back = loaded.state.players['friend'] !== undefined ? loaded.state.entities.get(loaded.state.players['friend'] ?? -1) : undefined;
  check('a friend rejoining gets their character back', back?.id === fid && (back ? count(back, 'manaTonic') : 0) === 7);

  // Leaving and coming back in the same session.
  const left = loaded.state.players['friend'];
  loaded.enqueue({ type: 'leave', playerId: 'friend' });
  loaded.step();
  check('a friend who leaves is set aside, not deleted', loaded.state.absent['friend']?.id === left && !loaded.state.entities.has(left ?? -1));
  loaded.enqueue({ type: 'join', playerId: 'friend', name: 'Friend' });
  loaded.step();
  check('and comes back as they were', loaded.state.players['friend'] === left);
  const again = Simulation.fromSave(loaded.save());
  check('absent friends survive saving', again !== null && Object.keys(again.state.absent).length === 0 && Object.keys(again.state.players).length === 2);
}

// A ruin approached from 300 m still has its keepers when you arrive (they used to wander off first).
{
  let found: { seed: number; x: number; y: number } | null = null;
  for (let seed = 1; seed < 40 && !found; seed++) {
    const t = new Simulation(createState(seed));
    for (let r = 2; r < 14 && !found; r++) {
      for (let rx = -r; rx <= r && !found; rx++) {
        for (const ry of [-r, r]) {
          const s = siteInRegion(seed, rx, ry, (x, y) => t.terrain.rawGround(x, y, 3));
          if (s?.kind === 'ruin') {
            found = { seed, x: s.cx + 0.5, y: s.cy + 0.5 };
            break;
          }
        }
      }
    }
  }
  check('a ruin exists to test with', found !== null);
  if (found) {
    let seen = 0;
    let kept = 0;
    let tries = 0;
    let gone = -1;
    for (let attempt = 0; attempt < 8 && seen === 0; attempt++) {
      tries++;
      const sim = new Simulation(createState(found.seed));
      sim.state.rng = (sim.state.rng + attempt * 7919) | 0;
      sim.enqueue({ type: 'join', playerId: 'local', name: 'Walker' });
      sim.step();
      sim.state.weather.nextShift = 1e9;
      const me = player(sim, 'local');
      const start = { x: found.x + 300, y: found.y };
      const walk = (to: { x: number; y: number }, steps: number, from: { x: number; y: number }): void => {
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          me.pos.x = me.prev.x = from.x + (to.x - from.x) * k;
          me.pos.y = me.prev.y = from.y + (to.y - from.y) * k;
          me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y);
          me.vel.x = me.vel.y = me.vz = 0;
          sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i + 1) });
          sim.step();
        }
      };
      // Walk in at a steady 6 m/s, from 300 m out to 20 m from the middle.
      walk({ x: found.x + 20, y: found.y }, Math.round(280 / 0.3), start);
      const loc = sim.state.locations.find((l) => l.kind === 'ruin' && Math.hypot(l.pos.x - found.x, l.pos.y - found.y) < 40);
      const keepers = [...sim.state.entities.values()].filter((e) => e.site === loc?.id && thingDef(CONTENT, e.def).despawn !== undefined && e.ai);
      // How many creatures the ruin rolled: count them by their site tag even if (before the fix) they vanished.
      seen = keepers.length;
      kept = keepers.filter((e) => !e.dead).length;
      if (seen > 0 && loc) {
        // Walk far away again: they wander off once everyone is beyond the keep distance.
        walk({ x: found.x + CONTENT.rules.sites.keep + 120, y: found.y }, 400, { x: found.x + 20, y: found.y });
        gone = [...sim.state.entities.values()].filter((e) => e.site === loc.id && e.ai && thingDef(CONTENT, e.def).despawn !== undefined).length;
      }
    }
    check('the ruin rolled some keepers (hexer, raiders)', seen > 0, `after ${tries} tries`);
    check('approached from 300 m, the ruin\'s keepers are still there', seen > 0 && kept === seen, `${kept} of ${seen}`);
    check('far away again, they wander off (memory stays flat)', gone === 0, `${gone} left`);
  }
}

// A region forgotten after a long journey is not filled again on return.
{
  const sim = new Simulation(createState(4242));
  sim.enqueue({ type: 'join', playerId: 'local', name: 'Walker' });
  for (let i = 0; i < 20; i++) sim.step();
  const me = player(sim, 'local');
  let village: { x: number; y: number } | null = null;
  for (let r = 0; r < 12 && !village; r++) {
    for (let rx = -r; rx <= r && !village; rx++) {
      for (let ry = -r; ry <= r; ry++) {
        const s = siteInRegion(4242, rx, ry, (x, y) => sim.terrain.rawGround(x, y, 3));
        if (s?.kind === 'village') {
          village = { x: s.cx + 0.5, y: s.cy + 0.5 };
          break;
        }
      }
    }
  }
  check('a village exists to test with', village !== null);
  if (village) {
    const visit = (): void => {
      me.pos.x = me.prev.x = village.x + 5;
      me.pos.y = me.prev.y = village.y + 5;
      me.z = me.prevZ = sim.tiles.ground(me.pos.x, me.pos.y);
      for (let i = 0; i < 10; i++) {
        sim.enqueue({ type: 'input', playerId: 'local', input: emptyInput(i + 1) });
        sim.step();
      }
    };
    visit();
    const places = sim.state.locations.length;
    const villagers = [...sim.state.entities.values()].filter((e) => e.npc).length;
    // Forget every region, as happens after travelling about 100 km.
    sim.state.regions.clear();
    visit();
    check('a forgotten region is not registered again', sim.state.locations.length === places, `${places} → ${sim.state.locations.length}`);
    check('a village is not filled twice', [...sim.state.entities.values()].filter((e) => e.npc).length === villagers, `${villagers} villagers`);
    void REGION_SIZE;
  }
}

// A friend's copy of the world forgets far-away untouched land, but keeps changed land.
{
  const sim = new Simulation(createState(55));
  for (let i = 0; i < 40; i++) sim.tiles.kind(i * CHUNK_SIZE * 3, 0);
  sim.tiles.setKind(30 * CHUNK_SIZE * 3, 5, sim.tiles.kind(30 * CHUNK_SIZE * 3, 5) === Tile.Flagstone ? Tile.Grass : Tile.Flagstone);
  const before = sim.state.chunks.size;
  sim.trimAround(0, 0);
  const changed = sim.state.chunks.has(packKey(Math.floor((30 * CHUNK_SIZE * 3) / CHUNK_SIZE), 0));
  check('a friend\'s far untouched land is forgotten', sim.state.chunks.size < before, `${before} → ${sim.state.chunks.size}`);
  check('changed land is kept', changed);
}


// A guest on a laggy line (150 ms each way): their own walking shows at once, and settles exactly where the host has them.
{
  const host = party(9090);
  for (let i = 0; i < 20; i++) tick(host);
  const guest = Simulation.fromSave(host.save());
  if (!guest) throw new Error('no guest copy');
  const view = new GuestView();
  const LAG = 3;
  const toHost: { at: number; input: InputSnapshot }[] = [];
  const toGuest: { at: number; snap: EntitySnapshot }[] = [];
  const f = player(host, 'friend');
  const gid = guest.state.players['friend'] ?? -1;
  const startHost = { x: f.pos.x, y: f.pos.y };
  let firstMove = -1;
  let biggestFix = 0;
  let seq = 0;
  for (let t = 0; t < 140; t++) {
    const walking = t >= 5 && t < 45;
    const input: InputSnapshot = { ...emptyInput(++seq, 0.7), forward: walking ? 1 : 0 };
    const before = guest.state.entities.get(gid);
    const bx = before?.pos.x ?? 0;
    view.tick(guest, 'friend', input);
    const after = guest.state.entities.get(gid);
    if (firstMove < 0 && walking && after && Math.hypot(after.pos.x - bx, after.pos.y - (before?.pos.y ?? 0)) > 0.01) firstMove = t;
    toHost.push({ at: t + LAG, input });
    while (toHost[0] && toHost[0].at <= t) {
      const m = toHost.shift();
      if (m) host.enqueue({ type: 'input', playerId: 'friend', input: m.input });
    }
    tick(host);
    if (t % 2 === 0) toGuest.push({ at: t + LAG, snap: JSON.parse(JSON.stringify(snapshotFor(host.state, 'friend', 220))) as EntitySnapshot });
    while (toGuest[0] && toGuest[0].at <= t) {
      const m = toGuest.shift();
      const shown = guest.state.entities.get(gid);
      const sx = shown?.pos.x ?? 0;
      const sy = shown?.pos.y ?? 0;
      if (m) view.adopt(guest, 'friend', m.snap);
      const now = guest.state.entities.get(gid);
      if (now && t > 8) biggestFix = Math.max(biggestFix, Math.hypot(now.pos.x - sx, now.pos.y - sy));
    }
  }
  const g = guest.state.entities.get(gid);
  const hf = player(host, 'friend');
  const walked = Math.hypot(hf.pos.x - startHost.x, hf.pos.y - startHost.y);
  check('a guest\'s own movement shows on the very tick they press', firstMove === 5, `first moved on tick ${firstMove}`);
  check('the host moved the guest the same way', walked > 5, `${walked.toFixed(1)} m`);
  check('corrections while walking on a laggy line are small nudges', biggestFix < 0.35, `largest ${biggestFix.toFixed(2)} m`);
  check('after stopping, the guest is exactly where the host has them', !!g && Math.hypot(g.pos.x - hf.pos.x, g.pos.y - hf.pos.y) < 0.05, g ? `${Math.hypot(g.pos.x - hf.pos.x, g.pos.y - hf.pos.y).toFixed(3)} m apart` : 'missing');
  check('an older update arriving late is ignored', !view.adopt(guest, 'friend', { tick: 1, entities: [], weather: guest.state.weather, players: guest.state.players }));
}

// Each friend is sent only what is near them (plus every traveller); friends keep a lasting id.
{
  const sim = party(4545);
  const me = player(sim, 'friend');
  const far = spawnFar(sim, me.pos.x + 900, me.pos.y);
  const near = spawnFar(sim, me.pos.x + 20, me.pos.y);
  const snap = snapshotFor(sim.state, 'friend', 220);
  check('far things are left out of a friend\'s update', !snap.entities.some((e) => e.id === far) && snap.entities.some((e) => e.id === near));
  check('every traveller is in every update', snap.entities.filter((e) => e.player).length === 2);
  check('a lasting friend id is accepted, odd ones are not', cleanFriendId('abc123def456gh78') === 'f-abc123def456gh78' && cleanFriendId('local') === null && cleanFriendId('../x') === null && cleanFriendId(5) === null);
}
function spawnFar(sim: Simulation, x: number, y: number): number {
  const ctx = (sim as unknown as { ctx: { spawn: (t: string, x: number, y: number, i?: object) => Entity } }).ctx;
  return ctx.spawn('crate', x, y, { z: sim.tiles.ground(x, y) }).id;
}

if (failed) throw new Error(`${failed} co-op check(s) failed`);
console.log('all co-op checks passed');
