import type { Content, DayPart, DayRules, RealmId } from '../types';
export type { DayPart };

/**
 * The one day-and-night clock. Times are a share of the day: 0 is midnight, 0.25 six in the
 * morning, 0.5 noon. Every system that cares whether it is night (creatures waking, birdsong,
 * auroras, greetings, the sun's path) asks here, so changing the hours in content/rules.ts
 * changes them everywhere at once.
 */

/** How high the sun stands, -1 (straight down) .. 1 (overhead). Above 0 it is up. */
export function sunHeight(day: DayRules, time: number): number {
  return Math.sin((time - day.sunrise) * Math.PI * 2);
}

/** Angle of the sun along its path (radians), for drawing it and its light. */
export function sunAngle(day: DayRules, time: number): number {
  return (time - day.sunrise) * Math.PI * 2;
}

/** Night for creatures and people: from nightFrom until nightUntil. */
export function isNight(day: DayRules, time: number): boolean {
  return time >= day.nightFrom || time < day.nightUntil;
}

/** Is it dark here right now? Night under the sky; always under rock (a realm without sky). Creatures and wildlife ask this. */
export function isDark(content: Pick<Content, 'rules' | 'realms'>, realm: RealmId, time: number): boolean {
  return content.realms[realm]?.sky === false || isNight(content.rules.day, time);
}

export function dayPart(day: DayRules, time: number): DayPart {
  if (isNight(day, time)) return 'night';
  if (time < day.morningUntil) return 'morning';
  if (time < day.afternoonUntil) return 'afternoon';
  return 'evening';
}

/** True on the tick that night begins (time moved from `before` to `now`). */
export function nightFalls(day: DayRules, before: number, now: number): boolean {
  return before < day.nightFrom && now >= day.nightFrom;
}
