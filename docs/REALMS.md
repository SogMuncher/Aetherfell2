# Realms and the 3D layer (sim/world/volume, realms, underworld; sim/structures)

**Purpose:** buildings with floors, roofs and overhangs, and whole other spaces (the underworld) using the same systems.
**Never:** write `if (state.realm === 'underworld')` in a system. A realm is only *which* tiles/cells/things are loaded.

## 3D layer (`types/volume.ts`, `types/structures.ts`, `sim/world/volume.ts`)
- Sparse 1 m cells in 16^3 bricks: shape byte (shape + quarter turn) + material byte (a tile kind). Each brick's `rev`
  goes up on any cell or state change (wet, frost, fire…); the GPU re-copies a brick by its own `rev`.
- Shapes are data (`content/shapes.ts`, ledger `SHAPE_LEDGER`, add numbers at the end). Faces come from the material tile's
  `wall`/`floor` surfaces. Ground tile and 3D cell are one "spot" (`GROUND_Z` = ground) in `ctx.matter`.
- Builder (`sim/structures/builder.ts` + `builder/placer|house|arch.ts`) snaps shapes from recipes
  (`content/structures.ts`): 3 m storeys, walls, floors, stairs, gable/hip/flat roofs, arches, decay for ruins.
- Physics asks `floorBelow`, `ceilingAbove`, `solidBetween`; weather asks `openSky`. Changes go out as one
  `volumeChanged` event per brick. Cheat "Build a building" raises any recipe.

## Realms (`content/realms.ts`, `sim/world/realms.ts`, `underworld.ts`)
- `state.realm` is active; the others sit in `state.stash`. Travel = `swapRealm`, run by `simLoop.travel()`.
- `RealmDef.ground`: `'surface'` or `'lattice'` (the underworld, 1:1 under the land, roof = 3D cells).
  Dispatch points: `WorldTiles.chunk()` and `Simulation.regenChunk()`.
- The underworld is the land read again (`underSpot.ts` `underAt`, data `RealmDef.lattice` + `SiteDef.under`):
  rivers/lakes run on below with shores (a way crossing them = a deck of its bridge tile); places with `under.cavern`
  get a big open cave (`under.ruin` > 0: the place's own buildings stand in it, decayed); every road/path/trail is an
  artery on its exact line, taller for greater ways; the rest is tight halls + corridors on a 16 m grid (`underPlan.ts`).
  Improve the land and the underworld follows. Roof: every open tile is capped from its ceiling to its tallest
  neighbour's + `shell`, so there is no gap to climb through (realmSmoke floods it to prove it).
  `RealmDef.places.name` names the caves on the compass ("the depths beneath {name}").
- `sky:false` = no sun/stars/clouds/rain; `ambient`, `fog`, `glow` (lamp carried), `mood` (music).
- Ways: `ThingDef.portal` (`descent` / `ascent`). Whole party must be within `RealmDef.gather` m. On return the
  surface catches up (<= 200 interaction passes). `RealmDef.wipe` = where a downed party wakes.
- `RealmDef.scatter` lines what lies in each hall (`under` limits it to halls under given places); `habitats[].realm`
  says where a creature lives. There is one dungeon: every way down reaches the same network.

## Ruins
Ruins are settlements gone to ruin: `village` layout in `content/sites.ts` with weighted `styles` (ring, street, cross, scatter) over decayed recipes
(`ruinedKeep|Tower|Hall|Cottage`, `brokenWall`, `brokenGate`), so they share the builder, wall faces and far LOD. Their `descent` sits in the courtyard.

## Add / change
- New realm: a `REALMS` entry + portals/habitats naming it; new ground kind only if needed (ground generator).
- New building: `structures` recipe. New shape: append to `shapes.ts` (never renumber).

## Checks
`scripts/volumeSmoke.ts`, `realmSmoke.ts`, `matterSmoke.ts`.
