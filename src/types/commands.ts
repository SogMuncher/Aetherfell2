import type { InputSnapshot } from './input';
import type { CheatValue } from './cheats';

/** The only way the outside world (input, network) changes the simulation. */
export type Command =
  | { type: 'join'; playerId: string; name: string }
  | { type: 'leave'; playerId: string }
  | { type: 'input'; playerId: string; input: InputSnapshot }
  /** A debug cheat from the menu (content/cheats.ts). Only the host's sim applies it. */
  | { type: 'cheat'; playerId: string; cheat: string; value: CheatValue };
