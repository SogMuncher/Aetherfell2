// Daggerfall-style topics: the "Where is..." and "Tell me about..." menus, and the answers townsfolk give from what they know.
import type { DialogueOption, Entity, SimContext, Vec2 } from '../../types';
import { fillText, hauntNow } from '../../content';

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
/** Most places or people a menu lists, nearest first (one number key each, with room for going back). */
const PEOPLE = 8;

export function direction(from: Vec2, to: Vec2): string {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return COMPASS[i] ?? 'north';
}

export function distanceWords(ctx: SimContext, d: number): string {
  const rows = ctx.content.talk.dist;
  return (rows.find(([m]) => d < m) ?? rows[rows.length - 1])?.[1] ?? 'a long road';
}

function capital(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function placeName(ctx: SimContext, key: string): string {
  return ctx.content.structures[key]?.name ?? key;
}

/** The other folk of the speaker's place, nearest first. */
function townsfolk(ctx: SimContext, npc: Entity): Entity[] {
  const loc = npc.npc?.locationId;
  const out: Entity[] = [];
  for (const e of ctx.state.entities.values()) if (e !== npc && e.npc && !e.dead && e.npc.locationId === loc) out.push(e);
  return out.sort((a, b) => Math.hypot(a.pos.x - npc.pos.x, a.pos.y - npc.pos.y) - Math.hypot(b.pos.x - npc.pos.x, b.pos.y - npc.pos.y));
}

/** The options of a submenu ('where', 'about', 'places', 'people'). */
export function submenu(ctx: SimContext, npc: Entity, which: string): DialogueOption[] {
  const ask = ctx.content.talk.ask;
  const back: DialogueOption = { label: ask.back, action: 'back' };
  if (which === 'where') return [{ label: ask.places, action: 'places' }, { label: ask.people, action: 'people' }, back];
  if (which === 'about') return [{ label: ask.rumour, action: 'rumour' }, { label: ask.self, action: 'self' }, back];
  if (which === 'places') {
    const marks = ctx.state.locations.find((l) => l.id === npc.npc?.locationId)?.landmarks ?? {};
    const near = Object.entries(marks).sort(([, a], [, b]) => Math.hypot(a.x - npc.pos.x, a.y - npc.pos.y) - Math.hypot(b.x - npc.pos.x, b.y - npc.pos.y));
    return [...near.slice(0, PEOPLE).map(([k]): DialogueOption => ({ label: `The ${placeName(ctx, k)}`, action: 'place', arg: k })), back];
  }
  const folk = townsfolk(ctx, npc).slice(0, PEOPLE);
  return [...folk.map((e): DialogueOption => ({ label: `${e.npc?.name ?? 'Someone'} the ${e.npc?.role ?? 'villager'}`, action: 'person', arg: String(e.id) })), back];
}

/** The answer to a topic: where a place or person is, or a few words about the speaker. Folk who dislike the party keep it to themselves. */
export function answer(ctx: SimContext, npc: Entity, opt: DialogueOption, mood: number): string {
  const talk = ctx.content.talk;
  const { rng } = ctx;
  const pick = (lines: readonly string[]): string => lines[rng.int(lines.length)] ?? '';
  if (opt.action === 'self') {
    const role = npc.npc?.role ?? 'villager';
    return ctx.content.roles[role]?.about ?? fillText(talk.self, { role });
  }
  if (mood < talk.refuseBelow) return pick(talk.refuse);
  if (opt.action === 'place') {
    const key = opt.arg ?? 'square';
    const at = ctx.state.locations.find((l) => l.id === npc.npc?.locationId)?.landmarks?.[key];
    if (!at) return pick(talk.refuse);
    const d = Math.hypot(at.x - npc.pos.x, at.y - npc.pos.y);
    return capital(fillText(pick(talk.place), { what: placeName(ctx, key), dir: direction(npc.pos, at), dist: distanceWords(ctx, d) }));
  }
  const who = ctx.state.entities.get(Number(opt.arg));
  if (!who?.npc) return pick(talk.refuse);
  if (who === npc) return talk.me;
  const word = hauntNow(ctx.content, ctx.state.weather, who);
  const at = word === 'home' || word === 'square' || word === 'edge' ? talk.at[word] : fillText(talk.at.building, { what: placeName(ctx, word) });
  const d = Math.hypot(who.pos.x - npc.pos.x, who.pos.y - npc.pos.y);
  return capital(fillText(pick(talk.person), { name: who.npc.name, role: who.npc.role, at, dir: direction(npc.pos, who.pos), dist: distanceWords(ctx, d) }));
}
