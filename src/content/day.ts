import type { DayRules } from '../types';

/**
 * The one day-and-night clock. Times are a share of the day: 0 is midnight, 0.25 six in the
 * morning, 0.5 noon. Every system that cares whether it is night (creatures waking, birdsong,
 * auroras, greetings, the sun's path) asks here, so changing the hours in content/rules.ts
 * changes them everywhere at once.
 */
export type DayPart = 'night' | 'morning' | 'afternoon' | 'evening';

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
