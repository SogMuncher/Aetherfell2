import type { StatusDef, StatusId } from '../types';

function status(p: Partial<StatusDef> & { name: string }): StatusDef {
  return { tags: [], cancels: [], blockedBy: [], every: [], move: 1, disables: false, panic: false, ...p };
}

/** Ongoing conditions. Each one can cancel or block others, tick effects and change movement. */
export const STATUSES: Record<StatusId, StatusDef> = {
  burning: status({
    name: 'Burning',
    tags: ['fire'],
    cancels: ['frozen'],
    blockedBy: ['wet'],
    every: [
      { ticks: 5, effects: [{ type: 'damage', amount: 2, kind: 'fire' }], at: 'self' },
      // Burning bodies set the ground they run through alight.
      { ticks: 8, effects: [{ type: 'heat', amount: 1 }], at: 'ground' },
    ],
    panic: true,
    light: { r: 1, g: 0.55, b: 0.2, radius: 5, flicker: 0.4 },
    tint: { r: 255, g: 140, b: 40 },
  }),
  wet: status({ name: 'Soaked', tags: ['water'], cancels: ['burning'] }),
  chilled: status({ name: 'Chilled', tags: ['cold'], cancels: ['burning'], blockedBy: ['warmed'], move: 0.5, tint: { r: 150, g: 200, b: 255 } }),
  /** Wet and chilled: stiff and helpless until it thaws; heat that catches breaks it free. */
  frozen: status({ name: 'Frozen', tags: ['cold'], cancels: ['wet', 'burning', 'chilled'], blockedBy: ['warmed'], move: 0, disables: true, tint: { r: 190, g: 225, b: 255 } }),
  /** Warm right through (a hot drink): cold cannot get a grip, and it shakes off a chill. */
  warmed: status({ name: 'Warmed', tags: ['warm'], cancels: ['chilled'], blockedBy: ['wet'], tint: { r: 255, g: 200, b: 150 } }),
  staggered: status({ name: 'Staggered', tags: ['stun'], move: 0.2, disables: true }),
  poisoned: status({
    name: 'Poisoned',
    tags: ['poison'],
    every: [{ ticks: 10, effects: [{ type: 'damage', amount: 2, kind: 'poison' }], at: 'self' }],
    move: 0.85,
    tint: { r: 140, g: 220, b: 90 },
  }),
};
