// Speaking voices (ranges each person picks from) and how often talkers bark; the lines are in barks*.ts
import type { BarkRules, VoiceDef } from '../types';

/** Townsfolk: deep to high, slow to quick, every one of them a little different. */
export const FOLK_VOICE: VoiceDef = { pitch: [88, 235], pace: [3.6, 6.2], lilt: [0.2, 0.75], breath: [0.05, 0.35], rasp: [0, 0.35], throat: [0.82, 1.2], nasal: [0, 0.4] };
/** Travellers (the players): a plain, middling voice for cries and grunts. */
export const TRAVELLER_VOICE: VoiceDef = { pitch: [105, 190], pace: [4.2, 5.4], lilt: [0.25, 0.5], breath: [0.1, 0.25], rasp: [0.05, 0.25], throat: [0.92, 1.08] };
/** Raiders: low, quick and rough, barked more than spoken. */
export const RAIDER_VOICE: VoiceDef = { pitch: [80, 150], pace: [4.8, 6.8], lilt: [0.1, 0.4], breath: [0.1, 0.3], rasp: [0.35, 0.8], throat: [1.05, 1.3] };
/** Hexers: thin, breathy, sing-song and through the nose. */
export const HEXER_VOICE: VoiceDef = { pitch: [140, 260], pace: [2.8, 4.4], lilt: [0.6, 1], breath: [0.35, 0.65], rasp: [0.1, 0.4], throat: [0.75, 0.95], nasal: [0.4, 0.8] };

export const BARK_RULES: BarkRules = {
  quiet: 7,
  heard: 30,
  sees: 14,
  chance: 0.35,
  odds: {
    hurt: 0.45,
    block: 0.3,
    lowHealth: 0.7,
    kill: 0.6,
    allyDied: 0.8,
    deathNear: 0.5,
    fire: 0.7,
    hired: 1,
    dismissed: 1,
    'do.panic': 0.8,
    'do.fleeFire': 0.8,
    'do.hunt': 0.6,
    'do.follow': 0.25,
    'do.defend': 0.6,
    'go.home': 0.3,
    'go.work': 0.25,
    loot: 0.4,
    greet: 0.3,
    greetNight: 0.35,
    idle: 0.012,
    idleNight: 0.012,
    rain: 0.25,
    thunder: 0.3,
  },
};
