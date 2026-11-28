// UNDERWORLD BIOMES: regions dug their own way, rooms, galleries, pits and pools, dark rivers, doors and locks, traps, old roads, wall mounts
import { check, failures, run, world } from './matterKit';
import { CONTENT, thingDef } from '../src/content';
import { tileCode, TILES } from '../src/content/tiles';
import { shapeId } from '../src/content/shapes';
import { underAt, underFloor } from '../src/sim/world/underSpot';
import { biomeOf } from '../src/sim/world/underBiome';
import { roofLatticeChunk } from '../src/sim/world/underworld';
import { VolumeStore } from '../src/sim/world/volume';
import { landOf } from '../src/sim/world/terrain';
import { CHUNK_SIZE, GROUND_Z, shapeByte } from '../src/types';

const seed = 4242;
const floor = underFloor();
const L = CONTENT.realms['underworld']?.lattice;
const land = landOf(seed);

// ---- a wide sweep of the plan -----------------------------------------------------------------------------
const biomes = new Set<string>();
for (let j = -60; j < 60; j += 3) for (let i = -60; i < 60; i += 3) biomes.add(biomeOf(seed, i, j).id);
check('the underworld has many regions, each dug its own way', biomes.size >= 5, [...biomes].join(', '));

let walls = new Set<string>();
let doors = 0, locked = 0, framed = 0, pits = 0, pools = 0, galleries = 0, stairs = 0, dark = 0, paved = 0, ways = 0, shelves = 0;
let stairAt: { x: number; y: number } | null = null;
let lockedAt: { x: number; y: number } | null = null;
const N = 1400;
for (let y = -N; y < N; y += 1) {
  for (let x = -N; x < N; x += (y % 4 === 0 ? 1 : 7)) {
    const u = underAt(seed, x, y);
    if (u.spot === 'rock') {
      if (x % 9 === 0) walls.add(TILES[u.tile ?? u.wall]?.id ?? '?');
      continue;
    }
    const t = u.tile !== null ? TILES[u.tile]?.id : undefined;
    if (TILES[u.tile ?? -1]?.shape === 'door') {
      doors++;
      if (TILES[u.tile ?? -1]?.lock) { locked++; lockedAt ??= { x, y }; }
      const across = underAt(seed, x + 1, y).spot === 'rock' && underAt(seed, x - 1, y).spot === 'rock';
      const along = underAt(seed, x, y + 1).spot === 'rock' && underAt(seed, x, y - 1).spot === 'rock';
      if (across || along) framed++;
    }
    if (u.spot === 'hall' && u.bed < floor - 0.9) pits++;
    if (u.spot === 'hall' && !Number.isNaN(u.level)) pools++;
    if (u.upper === 3) galleries++;
    if (u.upper === 0) { stairs++; stairAt ??= { x, y }; }
    if (t === 'bookshelf') shelves++;
    if ((u.spot === 'water' || u.spot === 'bridge') && !land.waterSpotAt(x + 0.5, y + 0.5)) dark++;
    if (u.spot === 'way') {
      ways++;
      if (t && ['gravel', 'setts', 'greatPaving', 'kerb'].includes(t)) paved++;
    }
  }
}
check('the rock itself changes with the region (tomb masonry, hewn rock, ore, flowstone...)', walls.size >= 4, [...walls].join(', '));
check('doors stand where corridors meet halls, framed by rock', doors > 20 && framed / doors > 0.9, `${framed}/${doors}`);
check('some doors are locked', locked > 3, `${locked}`);
check('some halls are sunk into pits, some of them flooded', pits > 30 && pools > 10, `${pits} pit tiles, ${pools} pool tiles`);
check('some halls have a gallery above and a stair up to it', galleries > 20 && stairs > 2, `${galleries} gallery tiles, ${stairs} stair feet`);
check('archives are lined with bookshelves', shelves > 10, `${shelves}`);
check('rivers of the dark run where no river runs above', dark > 200, `${dark} tiles`);
check('the old roads below are paved and kerbed, not plain floor', ways > 50 && paved / ways > 0.95, `${paved}/${ways}`);

// ---- the upper level is real cells: walk up the stair onto the gallery ------------------------------------
if (stairAt) {
  const vol = new VolumeStore();
  const cx = Math.floor(stairAt.x / CHUNK_SIZE);
  const cy = Math.floor(stairAt.y / CHUNK_SIZE);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) roofLatticeChunk(vol, seed, cx + i, cy + j);
  const top = vol.floorBelow(stairAt.x + 2.9, stairAt.y + 0.5, floor + 3.5, floor);
  const foot = vol.floorBelow(stairAt.x + 0.2, stairAt.y + 0.5, floor + 1, floor - 1);
  const gal = vol.floorBelow(stairAt.x + 2.5, stairAt.y - 0.5, floor + 3.5, floor);
  const under = vol.solidBetween(stairAt.x + 2.5, stairAt.y - 0.5, floor + 0.1, floor + 2.3);
  check('a stair climbs from the floor to the gallery, and the gallery is a floor to stand on', foot < floor + 0.6 && Math.abs(top - (floor + 3)) < 0.3 && Math.abs(gal - (floor + 3)) < 0.05, `foot ${foot}, top ${top}, gallery ${gal}`);
  check('there is room to walk under the gallery', !under);
}

// ---- in play: furnishing, mounts and traps ---------------------------------------------------------------
{
  const { sim, me } = world(seed);
  sim.state.queues.travel.push({ to: 'underworld', x: 400, y: 400, by: me.id });
  run(sim, 2);
  const spots = [[400, 400], [-700, 300], [900, -800], [-500, -900], [1200, 1100], [0, 1300]];
  for (const [x, y] of spots) {
    me.pos.x = me.prev.x = (x ?? 0) + 0.5;
    me.pos.y = me.prev.y = (y ?? 0) + 0.5;
    run(sim, 3);
  }
  const all = [...sim.state.entities.values()];
  const mounted = all.filter((e) => thingDef(CONTENT, e.def).mount);
  const onWall = mounted.filter((e) => {
    const m = thingDef(CONTENT, e.def).mount;
    const r = (m?.flush ?? 0) + 0.12;
    return [[r, 0], [-r, 0], [0, r], [0, -r]].some(([dx, dy]) => sim.tiles.blocked(e.pos.x + (dx ?? 0), e.pos.y + (dy ?? 0)));
  });
  check('every torch and lamp hangs against a wall, none in the air', mounted.length > 20 && onWall.length === mounted.length, `${onWall.length}/${mounted.length}`);
  const traps = all.filter((e) => thingDef(CONTENT, e.def).contact && e.def !== 'campfire');
  check('trap plates wait in the corridors', traps.length > 3 && traps.every((e) => underAt(seed, Math.floor(e.pos.x), Math.floor(e.pos.y)).spot === 'corridor'), `${traps.length}`);
  const kinds = new Set(all.map((e) => e.def));
  const props = ['sarcophagus', 'bonePile', 'candles', 'mineLamp', 'lectern', 'altar', 'weaponRack'].filter((k) => kinds.has(k));
  check('the rooms hold all sorts (tombs, bones, candles, lamps, lecterns, altars, racks)', props.length >= 4, props.join(', '));
}

// ---- locks: a locked door on the ground and in a wall of the 3D layer --------------------------------------
{
  const { sim, me } = world(seed);
  const s = sim.state;
  const X = 6000, Y = 6000;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) sim.tiles.setKind(X + i, Y + j, tileCode('flagstone'));
  sim.tiles.setKind(X, Y, tileCode('lockedDoor'));
  const z = Math.floor(sim.tiles.ground(X + 0.5, Y + 0.5));
  const cz = 8;
  s.volume.set(X + 3, Y, cz, shapeByte(shapeId('panelMid'), 0), tileCode('lockedDoor'));
  const use = (x: number, y: number, zz: number): string[] => {
    me.pos.x = x + 0.5; me.pos.y = y - 0.7; me.z = zz;
    s.queues.use.push({ player: me.id, tileX: x, tileY: y, z: zz === z ? GROUND_Z : zz, entity: null });
    return run(sim, 1).map((e) => e.type);
  };
  const inv = me.actor?.inventory;
  check('without its key a locked door stays shut', use(X, Y, z).includes('locked') && sim.tiles.blocked(X + 0.5, Y + 0.5));
  check('a locked door in a wall of cells stays shut too', use(X + 3, Y, cz).includes('locked') && s.volume.matAt(X + 3, Y, cz) === tileCode('lockedDoor'));
  const keys = (): number => (inv ?? []).reduce((n, st) => n + (st.id === 'ruinKey' ? st.count : 0), 0);
  inv?.push({ id: 'ruinKey', count: 2 });
  const before = keys();
  use(X, Y, z);
  run(sim, 1);
  check('its key unlocks it (used up) and it opens', sim.tiles.kind(X, Y) === tileCode('boundDoor') && keys() === before - 1);
  use(X + 3, Y, cz);
  check('and the same on a cell door', s.volume.matAt(X + 3, Y, cz) === tileCode('boundDoor') && keys() === before - 2);
}

console.log(failures() === 0 && L ? 'underworld checks passed' : `${failures()} underworld checks FAILED`);
if (failures() > 0) throw new Error('underworld checks failed');
