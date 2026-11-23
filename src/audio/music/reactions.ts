// Which game events the music answers on the beat, and with which cue (one rule per event type).
import type { SimEvent } from '../../types';
import type { CueId } from './cues';

type Near = (x: number, y: number, r: number) => boolean;
type ReactionRule<K extends SimEvent['type']> = (ev: Extract<SimEvent, { type: K }>, me: number | null, near: Near) => CueId | null;
type ReactionTable = { [K in SimEvent['type']]?: ReactionRule<K> };

/** Unknown events are ignored; a rule returns null when the event is not about you. */
export const REACTIONS: ReactionTable = {
  hit: (ev, me) => {
    if (ev.target === me) return ev.parried ? 'parry' : ev.blocked ? 'block' : 'hurt';
    if (ev.source !== me) return null;
    if (ev.killed) return 'kill';
    if (ev.parried || ev.blocked) return 'block';
    return (ev.power ?? 0) > 0.75 ? 'strikeHeavy' : 'strike';
  },
  charge: (ev, me) => (ev.entity === me && ev.stage === 'full' ? 'charged' : null),
  spellCast: (ev, me) => (ev.entity === me ? 'spell' : null),
  fizzle: (ev, me) => (ev.entity === me ? 'fizzle' : null),
  death: (ev, me) => (ev.entity === me ? 'fallen' : null),
  land: (ev, me) => (ev.entity === me && ev.speed > 8 ? 'landHard' : null),
  glide: (ev, me) => (ev.entity === me && ev.open ? 'glide' : null),
  pickup: (ev, me) => (ev.player === me ? 'pickup' : null),
  containerOpened: (ev, _me, near) => (near(ev.x, ev.y, 3) ? 'open' : null),
  unlocked: (ev, _me, near) => (near(ev.x, ev.y, 4) ? 'unlock' : null),
  locked: (ev, _me, near) => (near(ev.x, ev.y, 3) ? 'jammed' : null),
  doorJammed: (ev, _me, near) => (near(ev.x, ev.y, 3) ? 'jammed' : null),
  itemBroke: (ev, _me, near) => (near(ev.x, ev.y, 2) ? 'broke' : null),
  shatter: (ev, _me, near) => (near(ev.x, ev.y, 15) ? 'shatter' : null),
  trapSprung: (ev, _me, near) => (near(ev.x, ev.y, 12) ? 'trap' : null),
  thunder: () => 'thunder',
  playerJoined: () => 'friend',
  realmChanged: () => 'realm',
  discovered: () => 'discover',
  runeLearned: (ev, me) => (ev.player === me ? 'rune' : null),
  skillUp: (ev, me) => (ev.player === me ? 'skill' : null),
};

export function reactionFor(ev: SimEvent, me: number | null, near: Near): CueId | null {
  const rule = (REACTIONS as Record<string, ReactionRule<SimEvent['type']> | undefined>)[ev.type];
  if (!rule) return null;
  try {
    return rule(ev as never, me, near);
  } catch {
    return null;
  }
}
