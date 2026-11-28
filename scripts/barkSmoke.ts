// Barks: talkers say a line from their bark set when hurt or when their plan changes, keep quiet a while after, and only remark on rain under open sky (ground and 3D cell roof)
import { CUBE, STONE, check, failures, flatten, gz, run, world } from './matterKit';
import { spawner } from './smokeKit';
import { CONTENT } from '../src/content';
import { tileCode } from '../src/content/tiles';
import { barkSystem } from '../src/sim/social';
import type { Entity, SimContext, SimEvent } from '../src/types';

const { sim, me } = world();
const s = sim.state;
const ctx = (sim as unknown as { ctx: SimContext }).ctx;
const { spawn } = spawner(sim);
const X = 7600;
const Y = 7600;
flatten(sim, X, Y, 20, tileCode('grass'));
me.pos.x = X;
me.pos.y = Y;
(CONTENT.barkRules as { odds: Record<string, number> }).odds = {};
(CONTENT.barkRules as { chance: number }).chance = 1;
const folk = (x: number, y: number): Entity => spawn('villager', x, y, { npc: { name: 'Tess', role: 'farmer', home: { x, y }, haunts: {}, locationId: 999, questId: null, stock: [] } });
/** Runs the bark system once over these events; returns what was said. */
const barks = (heard: SimEvent[]): { speaker: number; text: string }[] => {
  const said: { speaker: number; text: string }[] = [];
  barkSystem({ ...ctx, heard, emit: (e: SimEvent) => (e.type === 'say' ? said.push(e) : undefined) } as SimContext);
  return said;
};
const lines = (moment: string): readonly string[] => CONTENT.barks.folk?.[moment] ?? [];

// ---- Hurt, on the ground: a line from the folk 'hurt' list; struck again at once, they keep quiet. ----
const tess = folk(X + 2, Y);
const blow = (t: Entity): SimEvent => ({ type: 'hit', target: t.id, source: me.id, damage: 3, blocked: false, parried: false, x: t.pos.x, y: t.pos.y, z: t.z } as SimEvent);
let said = barks([blow(tess)]);
check('a villager hit on the ground cries a hurt line', said.length === 1 && lines('hurt').includes(said[0]?.text ?? ''), JSON.stringify(said));
check('struck again at once they keep quiet', barks([blow(tess)]).length === 0);

// ---- A plan change is spoken: the brain turns to panic. ----
s.tick += 400;
tess.ai!.bark = { at: -1e9, doing: 'routine', place: '', follower: false, loot: -1, greet: s.tick };
tess.ai!.doing = 'panic';
while ((s.tick + tess.id) % 20 !== 0) s.tick++;
said = barks([]);
check('a change of plan (panic) is barked', said.some((l) => lines('do.panic').includes(l.text)), JSON.stringify(said));

// ---- Rain: remarked on under open sky, not under a 3D cell roof. ----
s.tick += 400;
const dry = folk(X - 4, Y + 4);
const z0 = gz(sim, X - 4, Y + 4) + 3;
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) s.volume.set(X - 4 + dx, Y + 4 + dy, z0, CUBE, STONE);
const rain: SimEvent = { type: 'weatherShift', rain: 0.8, wind: 0 } as SimEvent;
for (const e of s.entities.values()) if (e.ai && e !== dry) s.entities.delete(e.id);
run(sim, 1); // files everyone in the spatial hash
dry.pos.x = X - 4;
dry.pos.y = Y + 4;
said = barks([rain]);
check('nobody under a 3D cell roof remarks on the rain', said.length === 0, JSON.stringify(said));
const wet = folk(X + 4, Y - 4);
s.tick += 400;
run(sim, 1);
said = barks([rain]);
check('a villager under open sky remarks on the rain', said.length === 1 && said[0]?.speaker === wet.id && lines('rain').includes(said[0]?.text ?? ''), JSON.stringify(said));

console.log(failures() === 0 ? 'barkSmoke: all passed' : `barkSmoke: ${failures()} failed`);
if (failures() > 0) (globalThis as unknown as { process: { exit: (n: number) => void } }).process.exit(1);
