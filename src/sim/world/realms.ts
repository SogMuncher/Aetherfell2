import type { Entity, RealmId, RealmWorld, SimState, TileAccess } from '../../types';
import { VolumeStore } from './volume';

/** Who goes along when the party changes realm: the travellers and what they carry. */
function travelling(state: SimState, e: Entity): boolean {
  if (e.player) return true;
  if (e.heldBy === null) return false;
  const holder = state.entities.get(e.heldBy);
  return holder?.player !== undefined;
}

function emptyRealm(tick: number): RealmWorld {
  return {
    chunks: new Map(),
    volume: new VolumeStore(),
    entities: [],
    burning: [],
    damp: [],
    thaw: [],
    later: [],
    tileWear: [],
    regions: [],
    locations: [],
    leftAt: tick,
  };
}

/**
 * Sets the world the party stands in aside and brings another in. Exactly the fields of SimState that
 * describe "the world around you" move (RealmWorld); the travellers stay. Every system then simply
 * works on whatever is loaded — there is no realm-specific code in them.
 * Returns how many ticks the realm being entered was left alone (0 for a new one).
 */
export function swapRealm(state: SimState, to: RealmId): number {
  if (to === state.realm) return 0;
  const left: RealmWorld = {
    chunks: state.chunks,
    volume: state.volume as VolumeStore,
    entities: [],
    burning: [...state.burning],
    damp: [...state.damp],
    thaw: [...state.thaw],
    later: [...state.later],
    tileWear: [...state.tileWear],
    regions: [...state.regions],
    locations: state.locations,
    leftAt: state.tick,
  };
  for (const [id, e] of state.entities) {
    if (travelling(state, e)) continue;
    left.entities.push(e);
    state.entities.delete(id);
  }
  state.stash[state.realm] = left;

  const next = state.stash[to] ?? emptyRealm(state.tick);
  delete state.stash[to];
  state.realm = to;
  state.chunks = next.chunks;
  state.volume = next.volume;
  state.burning = new Set(next.burning);
  state.damp = new Set(next.damp);
  state.thaw = new Map(next.thaw);
  state.later = new Map(next.later);
  state.tileWear = new Map(next.tileWear);
  state.regions = new Set(next.regions);
  state.locations = next.locations;
  for (const e of next.entities) state.entities.set(e.id, e);
  state.tileChanges.clear();
  return Math.max(0, state.tick - next.leftAt);
}

/** The nearest clear, dry floor tile to (x, y): where a travelling party can stand. */
export function openFloorNear(tiles: TileAccess, x: number, y: number, maxR = 40): { x: number; y: number } {
  const ok = (px: number, py: number): boolean => {
    for (const [dx, dy] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const) {
      if (tiles.blocked(px + dx, py + dy) || tiles.info(px + dx, py + dy).liquid) return false;
    }
    return true;
  };
  const fx = Math.floor(x) + 0.5;
  const fy = Math.floor(y) + 0.5;
  if (ok(fx, fy)) return { x: fx, y: fy };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(fx + dx, fy + dy)) return { x: fx + dx, y: fy + dy };
      }
    }
  }
  return { x: fx, y: fy };
}
