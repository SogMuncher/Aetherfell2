import type { CheatDef } from '../types';
import { REALMS } from './realms';

/**
 * Every debug cheat, as data. The Debug cheats menu builds one row per entry (in this order, under
 * its group), and the host's sim applies the action (sim/cheats/cheatSystem.ts).
 *
 * To add a cheat: add an entry here. If it can be said with an existing action and argument, that
 * is all. A new kind of action is one new case in CheatAction (types/cheats.ts) and in the sim.
 */
export const CHEATS: readonly CheatDef[] = [
  { id: 'god', group: 'You', name: 'God mode', help: 'Nothing can hurt you.', arg: { kind: 'none' }, action: { type: 'toggle', flag: 'god' } },
  { id: 'fly', group: 'You', name: 'Fly', help: 'No gravity. Walk the way you look (look down to go down); Space rises, Shift goes faster.', arg: { kind: 'none' }, action: { type: 'toggle', flag: 'fly' } },
  { id: 'endless', group: 'You', name: 'Endless aether and stamina', help: 'Cast and sprint as much as you like.', arg: { kind: 'none' }, action: { type: 'toggle', flag: 'endless' } },
  { id: 'restore', group: 'You', name: 'Heal fully', help: 'Full health, aether and stamina, and every ailment gone. Also gets you up if you are down.', arg: { kind: 'none' }, action: { type: 'restore' } },
  { id: 'skills', group: 'You', name: 'Train every skill', help: 'Every skill goes up five levels.', arg: { kind: 'none' }, action: { type: 'addSkill', levels: 5 } },

  { id: 'giveItem', group: 'Things', name: 'Give item', help: 'Puts some of the chosen item in your bag.', arg: { kind: 'item', count: 5 }, action: { type: 'giveItem' } },
  { id: 'learnRune', group: 'Things', name: 'Learn rune', help: 'Teaches you the chosen rune.', arg: { kind: 'rune' }, action: { type: 'learnRune' } },
  { id: 'allRunes', group: 'Things', name: 'Learn every rune', help: 'Your runebook fills up.', arg: { kind: 'none' }, action: { type: 'learnAllRunes' } },

  { id: 'toPlace', group: 'Travel', name: 'Teleport to a place', help: 'Places appear here once the world has noticed them (roughly within a few hundred metres of anyone).', arg: { kind: 'place' }, action: { type: 'teleportPlace' } },
  { id: 'ahead', group: 'Travel', name: 'Teleport ahead', help: 'Jumps you forward along where you are looking.', arg: { kind: 'number', min: 50, max: 3000, step: 50, value: 250, unit: 'm' }, action: { type: 'teleportAhead' } },
  { id: 'realm', group: 'Travel', name: 'Go to another realm', help: 'Takes the whole party to the same spot in the chosen realm (the underworld lies beneath the land, metre for metre).', arg: { kind: 'choice', options: Object.entries(REALMS).map(([value, r]) => ({ value, label: r.name })) }, action: { type: 'travelRealm' } },
  { id: 'reveal', group: 'Travel', name: 'Reveal known places', help: 'Marks every place the world knows about as discovered (map and compass).', arg: { kind: 'none' }, action: { type: 'revealPlaces' } },

  { id: 'time', group: 'World', name: 'Set time of day', help: 'Moves the sun to the chosen hour.', arg: { kind: 'number', min: 0, max: 23.5, step: 0.5, value: 12, unit: ':00' }, action: { type: 'setTime' } },
  {
    id: 'weather',
    group: 'World',
    name: 'Set weather',
    help: 'Changes the sky right away (it will drift on by itself later).',
    arg: { kind: 'choice', options: [{ value: 'clear', label: 'Clear' }, { value: 'rain', label: 'Rain' }, { value: 'storm', label: 'Storm' }] },
    action: { type: 'setWeather' },
  },
  { id: 'build', group: 'World', name: 'Build a building', help: 'Raises the chosen building a few steps ahead of you, door facing you. Trees in its way come down.', arg: { kind: 'structure' }, action: { type: 'build', distance: 8 } },
  { id: 'spawn', group: 'World', name: 'Spawn creature', help: 'Brings the chosen creature to life a few steps in front of you.', arg: { kind: 'creature' }, action: { type: 'spawn', distance: 5 } },
  { id: 'banish', group: 'World', name: 'Banish nearby creatures', help: 'Removes every animal and monster within 40 m. Villagers and friends stay.', arg: { kind: 'none' }, action: { type: 'banish', radius: 40 } },
];

export function cheatDef(id: string): CheatDef | undefined {
  return CHEATS.find((c) => c.id === id);
}
