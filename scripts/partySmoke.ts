// Party: townsfolk join for a fee, follow and fight with the travellers, and carry and wear what they are given (ground and 3D floor).
import { CUBE, STONE, check, failures, run, world } from './matterKit';
import { spawner } from './smokeKit';
import { CONTENT, thingDef } from '../src/content';
import type { Entity } from '../src/types';
import { addItem, bagOf, countItem } from '../src/types';

const coin = CONTENT.rules.currency;
const fee = CONTENT.rules.hireFee;
const wears = thingDef(CONTENT, 'villager').wears ?? [];
const armour = Object.entries(CONTENT.items).find(([, d]) => d.armour && wears.includes(d.armour.region))?.[0] ?? '';

for (const raised of [false, true]) {
  const where = raised ? ' on a 3D floor' : '';
  const { sim, me } = world();
  const s = sim.state;
  const { spawn } = spawner(sim);
  // Only the people of this check: no roaming beasts.
  const calm = (ticks: number): void => {
    for (let t = 0; t < ticks; t++) {
      run(sim, 1);
      for (const o of [...s.entities.values()]) if (o.ai && !o.npc && !o.player && o.def !== 'wolf') s.entities.delete(o.id);
    }
  };
  if (raised) {
    const z0 = Math.floor(me.z) + 2;
    for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) s.volume.set(Math.floor(me.pos.x) + i, Math.floor(me.pos.y) + j, z0, CUBE, STONE);
    me.z = me.prevZ = z0 + 1;
  }
  const at = { z: me.z, prevZ: me.z };
  const v: Entity = spawn('villager', me.pos.x + 1.5, me.pos.y, { ...at, npc: { name: 'Tess', role: 'farmer', home: { x: me.pos.x, y: me.pos.y }, haunts: {}, locationId: 999, questId: null, stock: [] } });
  const talk = (action: string): void => {
    s.queues.use.push({ player: me.id, tileX: 0, tileY: 0, z: 0, entity: v.id });
    run(sim, 1);
    const i = me.player?.dialogue?.options.findIndex((o) => o.action === action) ?? -1;
    run(sim, 1, () => ({ choice: i }));
  };

  bagOf(me).splice(0, bagOf(me).length);
  addItem(bagOf(me), coin, fee - 1);
  talk('hire');
  check(`without the fee they will not join${where}`, v.faction !== me.faction && countItem(bagOf(me), coin) === fee - 1);
  addItem(bagOf(me), coin, 1);
  talk('hire');
  check(`for the fee a townsperson joins the party${where}`, v.faction === me.faction && countItem(bagOf(me), coin) === 0, v.faction);

  // Gear: a piece from your bag goes onto them; bread goes into their bag and back out.
  addItem(bagOf(me), armour, 1);
  addItem(bagOf(me), 'bread', 2);
  run(sim, 1, () => ({ wear: { do: 'wear', item: armour, on: v.id } }));
  const region = CONTENT.items[armour]?.armour?.region ?? '';
  check(`you can dress a party member from your bag${where}`, v.worn?.[region] === armour && countItem(bagOf(me), armour) === 0, `${armour} ${JSON.stringify(v.worn)}`);
  run(sim, 1, () => ({ stow: { entity: v.id, item: 'bread', put: true } }));
  check(`you can put things in a party member's bag${where}`, countItem(bagOf(v), 'bread') === 2 && countItem(bagOf(me), 'bread') === 0);
  run(sim, 1, () => ({ wear: { do: 'remove', region, on: v.id } }));
  check(`taking a piece off a party member puts it in their bag${where}`, !v.worn?.[region] && countItem(bagOf(v), armour) === 1);

  // Follow: walk off and they come after you.
  me.pos.x = me.prev.x = me.pos.x + 18;
  calm(200);
  const d = Math.hypot(v.pos.x - me.pos.x, v.pos.y - me.pos.y);
  check(`a party member follows the traveller${where}`, d < 6 && (!raised || v.z > me.z - 0.5), `${d.toFixed(1)} m behind, z ${v.z.toFixed(1)}`);

  // Fight: a wolf coming at the party is set upon.
  const w = spawn('wolf', me.pos.x + 6, me.pos.y + 3, { ...at, z: me.z, prevZ: me.z });
  let fought = false;
  for (let t = 0; t < 60 && !fought; t++) {
    calm(1);
    fought = v.ai?.target === w.id;
  }
  check(`a party member fights what threatens the party${where}`, fought, v.ai?.doing);
  s.entities.delete(w.id);

  // No friendly fire: a blast, a bolt of fire or a club from your side leaves a party member (and you) unhurt.
  const hp = v.hp;
  const myHp = me.hp;
  s.queues.effects.push({ target: { kind: 'area', x: v.pos.x, y: v.pos.y, z: v.z, radius: 3 }, effects: [{ type: 'damage', amount: 30, kind: 'fire' }, { type: 'heat', amount: 50 }, { type: 'push', force: 8 }], source: me.id, from: { x: me.pos.x, y: me.pos.y }, exclude: me.id });
  s.queues.effects.push({ target: { kind: 'entity', id: me.id }, effects: [{ type: 'damage', amount: 20, kind: 'blunt' }, { type: 'status', id: 'staggered', ticks: 20 }], source: v.id, from: { x: v.pos.x, y: v.pos.y } });
  calm(2);
  check(`party members cannot hurt each other${where}`, v.hp >= hp && me.hp >= myHp && !v.status.burning && !me.status.staggered, `${v.hp}/${hp} ${me.hp}/${myHp}`);

  // Realms: hired folk go down into the underworld with the party, and come back up with them.
  for (const to of ['underworld', 'overworld']) {
    s.queues.travel.push({ to, x: me.pos.x, y: me.pos.y, by: me.id });
    calm(1);
    const gap = Math.hypot(v.pos.x - me.pos.x, v.pos.y - me.pos.y);
    check(`a party member travels with the party to the ${to}${where}`, s.realm === to && s.entities.get(v.id) === v && gap < 5, `${s.realm} ${gap.toFixed(1)} m`);
  }

  me.pos.x = me.prev.x = v.pos.x + 1;
  me.pos.y = me.prev.y = v.pos.y;
  talk('dismiss');
  check(`a party member can be let go${where}`, v.faction === CONTENT.rules.factions.folk, v.faction);
}

console.log(failures() === 0 ? 'partySmoke: all passed' : `partySmoke: ${failures()} failed`);
