import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { Chunk, Entity, JournalEntry, Location, Quest, RealmId, RealmWorld, SimState, Volume, VolumeBrickData, WeatherState, FactionId } from '../../types';
import { emptyQueues, packKey } from '../../types';

/** Version 3: players know runes and carry a prepared spell. Older saves are refused. */
export const SAVE_VERSION = 3;

interface SavedChunk {
  cx: number;
  cy: number;
  kind: number[];
  wet: number[];
  fire: number[];
  fuel: number[];
  oil: number[];
  soot: number[];
  frost?: number[];
  door: number[];
}

/** A realm the party is not in, as saved: the same pieces as the active world. */
interface SavedRealm {
  chunks: SavedChunk[];
  volume: VolumeBrickData[];
  entities: Entity[];
  burning: number[];
  damp: number[];
  temp: [number, number][];
  later: [number, number][];
  wear: [number, number][];
  regions: number[];
  locations: Location[];
  leftAt: number;
}

interface SaveFile {
  version: number;
  seed: number;
  tick: number;
  rng: number;
  nextEntityId: number;
  entities: Entity[];
  players: Record<string, number>;
  chunks: SavedChunk[];
  burning: number[];
  damp: number[];
  temp: [number, number][];
  later?: [number, number][];
  /** Damage on doors and the like (added after version 3; older saves simply have none). */
  wear?: [number, number][];
  regions: number[];
  locations: Location[];
  weather: WeatherState;
  factions: Record<FactionId, Record<FactionId, number>>;
  journal: JournalEntry[];
  quests: Quest[];
  nextQuestId: number;
  /** Characters of travellers who were not present (added after version 3; older saves have none). */
  absent?: Record<string, Entity>;
  /** The 3D layer, a brick at a time (added after version 3; older saves have none). */
  volume?: VolumeBrickData[];
  /** Which realm the party is in (added later; older saves are all surface). */
  realm?: RealmId;
  /** The realms the party has left, as they were. */
  stash?: Record<RealmId, SavedRealm>;
}

function packChunks(chunks: ReadonlyMap<number, Chunk>): SavedChunk[] {
  const out: SavedChunk[] = [];
  for (const c of chunks.values()) {
    if (!c.dirty) continue;
    out.push({
      cx: c.cx,
      cy: c.cy,
      kind: Array.from(c.kind),
      wet: Array.from(c.wet),
      fire: Array.from(c.fire),
      fuel: Array.from(c.fuel),
      oil: Array.from(c.oil),
      soot: Array.from(c.soot),
      frost: Array.from(c.frost),
      door: Array.from(c.door),
    });
  }
  return out;
}

function unpackChunks(list: SavedChunk[], seed: number, realm: RealmId, regen: Regen): Map<number, Chunk> {
  const chunks = new Map<number, Chunk>();
  for (const sc of list) {
    const c = regen(seed, sc.cx, sc.cy, realm);
    c.kind.set(sc.kind);
    c.wet.set(sc.wet);
    c.fire.set(sc.fire);
    c.fuel.set(sc.fuel);
    c.oil.set(sc.oil);
    c.soot.set(sc.soot);
    if (sc.frost) c.frost.set(sc.frost);
    c.door.set(sc.door);
    c.dirty = true;
    c.version = 1;
    chunks.set(packKey(sc.cx, sc.cy), c);
  }
  return chunks;
}

type Regen = (seed: number, cx: number, cy: number, realm: RealmId) => Chunk;

/** Only changed chunks are stored — everything else regrows from the seed. */
export function serialize(state: SimState): Uint8Array {
  const chunks = packChunks(state.chunks);
  const stash: Record<RealmId, SavedRealm> = {};
  for (const [id, w] of Object.entries(state.stash)) {
    stash[id] = {
      chunks: packChunks(w.chunks),
      volume: w.volume.allBricks(),
      entities: w.entities.filter((e) => !e.dead),
      burning: w.burning,
      damp: w.damp,
      temp: w.temp,
      later: w.later,
      wear: w.tileWear,
      regions: w.regions,
      locations: w.locations,
      leftAt: w.leftAt,
    };
  }
  const file: SaveFile = {
    version: SAVE_VERSION,
    seed: state.seed,
    tick: state.tick,
    rng: state.rng,
    nextEntityId: state.nextEntityId,
    entities: [...state.entities.values()].filter((e) => !e.dead),
    players: state.players,
    chunks,
    burning: [...state.burning],
    damp: [...state.damp],
    temp: [...state.temp],
    later: [...state.later],
    wear: [...state.tileWear],
    regions: [...state.regions],
    locations: state.locations,
    weather: state.weather,
    factions: state.factions,
    journal: state.journal,
    quests: state.quests,
    nextQuestId: state.nextQuestId,
    absent: state.absent,
    volume: state.volume.allBricks(),
    realm: state.realm,
    stash,
  };
  return zlibSync(strToU8(JSON.stringify(file)), { level: 6 });
}

function isSaveFile(v: unknown): v is SaveFile {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    o.version === SAVE_VERSION &&
    typeof o.seed === 'number' &&
    typeof o.tick === 'number' &&
    Array.isArray(o.entities) &&
    Array.isArray(o.chunks) &&
    typeof o.weather === 'object' &&
    typeof o.players === 'object'
  );
}

/**
 * Rebuilds a state from bytes. `regen` regrows a pristine chunk from the seed so saved
 * values can be laid over it (heights are never stored).
 */
export function deserialize(bytes: Uint8Array, regen: Regen, makeVolume: () => Volume): SimState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(strFromU8(unzlibSync(bytes)));
  } catch {
    return null;
  }
  if (!isSaveFile(parsed)) return null;
  const f = parsed;
  const realm = typeof f.realm === 'string' ? f.realm : 'overworld';
  const chunks = unpackChunks(f.chunks, f.seed, realm, regen);
  const stash: Record<RealmId, RealmWorld> = {};
  for (const [id, w] of Object.entries(f.stash ?? {})) {
    stash[id] = {
      chunks: unpackChunks(w.chunks, f.seed, id, regen),
      volume: loadVolume(makeVolume(), w.volume),
      entities: w.entities,
      burning: w.burning,
      damp: w.damp,
      temp: w.temp,
      later: w.later,
      tileWear: w.wear,
      regions: w.regions,
      locations: w.locations,
      leftAt: w.leftAt,
    };
  }
  return {
    version: f.version,
    seed: f.seed,
    tick: f.tick,
    rng: f.rng,
    nextEntityId: f.nextEntityId,
    entities: new Map(f.entities.map((e) => [e.id, e])),
    players: f.players,
    chunks,
    realm,
    stash,
    volume: loadVolume(makeVolume(), f.volume),
    tileChanges: new Set(),
    burning: new Set(f.burning),
    damp: new Set(f.damp),
    temp: new Map(Array.isArray(f.temp) ? f.temp : []),
    later: new Map(Array.isArray(f.later) ? f.later : []),
    tileWear: new Map(Array.isArray(f.wear) ? f.wear : []),
    regions: new Set(f.regions),
    locations: f.locations,
    weather: f.weather,
    factions: f.factions,
    journal: f.journal,
    quests: f.quests,
    nextQuestId: f.nextQuestId,
    absent: typeof f.absent === 'object' && f.absent !== null ? f.absent : {},
    queues: emptyQueues(),
  };
}

function loadVolume(v: Volume, bricks: VolumeBrickData[] | undefined): Volume {
  if (Array.isArray(bricks)) for (const b of bricks) v.importBrick(b);
  v.takeDirty();
  return v;
}

const SLOT = 'aetherfell2.save';

export function saveToBrowser(state: SimState): boolean {
  try {
    const bytes = serialize(state);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    localStorage.setItem(SLOT, btoa(bin));
    return true;
  } catch {
    return false;
  }
}

export function loadFromBrowser(regen: Regen, makeVolume: () => Volume): SimState | null {
  try {
    const b64 = localStorage.getItem(SLOT);
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return deserialize(bytes, regen, makeVolume);
  } catch {
    return null;
  }
}
