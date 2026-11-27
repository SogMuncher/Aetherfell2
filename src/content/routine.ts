// Where a townsperson means to be right now: their role's routine for this part of the day, one place per day.
import type { Content, Entity, WeatherState } from '../types';
import { dayPart, isNight } from './day';
import { rainAt } from './skyField';

const PARTS = ['night', 'morning', 'afternoon', 'evening'];

/**
 * The place word ('home', 'square', 'tavern'...) this person is heading for now. The role's routine
 * for the part of the day (or the shared `rules.routine`) lists choices; each person keeps one for
 * the whole of a day part, picked from their id and the day, so folk scatter differently every day.
 * Rain by day sends them to its own list. Words they have no spot for are skipped (then the shared list); home is the last resort.
 * The AI walks there and the social system tells you where someone is from the same answer.
 */
export function hauntNow(content: Content, w: WeatherState, e: Entity): string {
  const n = e.npc;
  if (!n) return 'home';
  const { day } = content.rules;
  const role = content.roles[n.role]?.routine ?? {};
  const shared = content.rules.routine;
  const part = dayPart(day, w.time);
  const wet = !isNight(day, w.time) && rainAt(content.sky, w, e.pos.x, e.pos.y) > 0.3;
  const has = (l: readonly string[] | undefined): string[] => (l ?? []).filter((k) => k in n.haunts);
  // Their own list first; if this place has none of it (no smithy here), the shared one.
  let list = has(wet ? (role.rain ?? shared.rain) : role[part]);
  if (list.length === 0) list = has(wet ? shared.rain : shared[part]);
  if (list.length === 0) return 'home';
  const pick = Math.abs((e.id * 73856093) ^ (w.day * 19349663) ^ ((PARTS.indexOf(part) + (wet ? 4 : 0)) * 83492791)) % list.length;
  return list[pick] ?? 'home';
}
