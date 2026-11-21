import { CONTENT } from '../content';
import { type PlayerData, type Rng, type SimState, emptyInput, emptyQueues } from '../types';
import { VolumeStore } from './world';


/** Seeded mulberry32 whose state lives in SimState, so saves and hosts reproduce it. */
export function makeRng(state: { rng: number }): Rng {
  const next = (): number => {
    state.rng = (state.rng + 0x6d2b79f5) | 0;
    let t = state.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    chance: (p) => next() < p,
    pick: <T,>(arr: readonly T[]): T => {
      const v = arr[Math.floor(next() * arr.length)];
      if (v === undefined) throw new Error('pick from empty array');
      return v;
    },
  };
}

export function createState(seed: number): SimState {
  return {
    version: 3,
    seed,
    tick: 0,
    rng: seed ^ 0x9e3779b9,
    nextEntityId: 1,
    entities: new Map(),
    players: {},
    chunks: new Map(),
    realm: 'overworld',
    stash: {},
    volume: new VolumeStore(),
    tileChanges: new Set(),
    burning: new Set(),
    damp: new Set(),
    thaw: new Map(),
    later: new Map(),
    tileWear: new Map(),
    locations: [],
    regions: new Set(),
    weather: {
      time: 0.3,
      day: 1,
      wind: { x: 2, y: 1 },
      windTarget: { x: 2, y: 1 },
      rain: 0,
      rainTarget: 0,
      cloud: 0.2,
      wetness: 0,
      aurora: 0,
      nextShift: 20 * 120,
      drift: { x: 0, y: 0 },
    },
    factions: Object.fromEntries(
      Object.keys(CONTENT.factions).map((f) => [f, Object.fromEntries(Object.keys(CONTENT.factions).map((o) => [o, f === o ? 1 : (CONTENT.factions[f]?.feels[o] ?? 0)]))]),
    ),
    journal: [{ tick: 0, day: 1, text: 'You set out from the old road with a sword, a satchel, a folded glider and a head full of runes.' }],
    quests: [],
    nextQuestId: 1,
    absent: {},
    queues: emptyQueues(),
  };
}

/** A fresh traveller's pack and stats (what they carry comes from content.rules.start). */
export function newPlayer(peerId: string, name: string, at: { x: number; y: number }): PlayerData {
  return {
    peerId,
    name,
    input: emptyInput(),
    prevAttack: false,
    stamina: 100,
    maxStamina: 100,
    mana: 60,
    maxMana: 60,
    runes: [...CONTENT.startingRunes],
    prepared: CONTENT.rules.start.prepared.filter((r) => CONTENT.startingRunes.includes(r)),
    holding: null,
    stats: { might: 5, grace: 5, will: 5 },
    skills: { blade: { level: 1, xp: 0 }, evocation: { level: 1, xp: 0 }, athletics: { level: 1, xp: 0 }, speech: { level: 1, xp: 0 } },
    inventory: CONTENT.rules.start.inventory.map((s) => ({ ...s })),
    dialogue: null,
    cooldown: 0,
    respawn: { x: at.x, y: at.y },
    stride: 0,
    downed: 0,
    gliding: false,
  };
}
