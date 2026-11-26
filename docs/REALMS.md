# Realms, the 3D layer and crafts (sim/world/volume, realms, underworld; sim/structures; sim/craft)

**Purpose:** buildings with floors, roofs and overhangs, and whole other spaces (the underworld) using the same systems.
**Never:** write `if (state.realm === 'underworld')` in a system. A realm is only *which* tiles/cells/things are loaded.

## 3D layer (`types/volume.ts`, `types/structures.ts`, `sim/world/volume.ts`)
- Sparse 1 m cells in 16^3 bricks: shape byte (shape + quarter turn) + material byte (a tile kind). Each brick's `rev`
  goes up on any cell or state change (wet, frost, fire…); the GPU re-copies a brick by its own `rev`.
- Fine cells (`sim/world/volumeFine.ts`): any cell can be split into 2x2x2 half-metre cells (`setFine`, fine coords =
  2x cell coords), each any shape and material; the split cell keeps one material and one set of states, so fire/frost/
  blows and the ground tiles beside it work per whole 1 m cell (tiles need no finer grid). Physics reads them
  (`volumeColumns.ts`), the GPU walks them (a 4096² fine atlas, 512 split bricks in view), saves/net pack them. Splitting a shaped cell
  keeps its look (`splitShape` best fit); eight blocks of one stuff merge back.
- Shapes are data (`content/shapeTable.ts`, 44 shapes, ledger `SHAPE_LEDGER`, add at the end, max 63; compiled in
  `shapes.ts`); every shape fits a whole or a fine cell. Faces come from the material tile's
  `wall`/`floor` surfaces. Ground tile and 3D cell are one "spot" (`GROUND_Z` = ground) in `ctx.matter`.
- Builder (`sim/structures/builder.ts` + `builder/placer|house|roofs|furnish|arch.ts`) snaps shapes from recipes
  (`content/structures.ts`): 3 m storeys, walls with framed windows, floors, gable/hip roofs with a 1 m eave/verge of
  sloping planks (`putSoft`: only written where nothing stands), battlements (merlon + low wall), round arches, `round`
  towers (corner columns become quarter rounds), `columns` (nave colonnade with round arches), decay for ruins. Stairs
  are fine-cell flights entered from the side at the foot, under an open stairwell (`Placer.putFine`). Underworld roofs
  vault down into the rock walls (`archCurve`); bridge/pier decks have rails and round posts.
- Doors: a door is a cell of a door tile kind (`materials.door`, default `door`) in a shape with `swing` (shut
  `panelMid` <-> `doorOpen`). `matter.doorOpen/setDoor/leaf` serve ground door tiles and cell doors alike; using one
  swings the whole stacked leaf, villagers open theirs on the way through, blows break the whole leaf, fire/frost as any
  cell (`doorSmoke.ts`). Ruins (decay) have no door.
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

## Crafts: the airship (`sim/craft`, `content/crafts.ts`, `types/craft.ts`)
- A craft's hull is ordinary cells of the 3D layer kept at a quiet dock (`rules.crafts.dock`) and shown elsewhere as a
  moving **frame** (`VolumeFrame`, `sim/world/volumeFrames.ts`): `floorBelow/ceilingAbove/solidBetween/topAt` also ask
  every frame, `cellOf` maps a world point to the frame's cell, `placeOf` maps a cell back (fire light/smoke/sound). So
  standing, bumping, blows, fire, frost and rain work per cell with no craft code. GPU draws each frame by turning the
  eye into its cells (`gpuStructures.draw` views). Frames are set each tick from the craft entity (pos, z, angle).
- `CraftDef` = hull boxes (`fine: true` = half-metre grid; the airship's curved hull and envelope are swept by
  `content/hullSweep.ts`, which keeps the shell of a solid and shapes each cell by which sides face the air: bilge,
  rounded slope, rounded corner) + fittings (`fill` = a station's starting value, the tank starts with fuel) + what each
  named channel does (thrust, turn, climb, fuel), wind share, thin air, clearance, horn cruise. Stations
  (`ThingDef.station`) write a channel: E takes it, movement keys move it, it eases to the middle while manned, holds
  when left; `feed` stations take items (rune shard = 300 s, burnt only under power). No fuel: it sinks and moors.
  `ThingDef.store` = hold (shown as a bag, drag to and from your own), `onJump` = launching plank, item `calls` = sky horn.
  Hull sweeps keep every cell with air even diagonally beside it, so shaped skin cells always have a block behind them
  (`scripts/hullTight.ts` floods the real shapes and fails on any pinhole). A call ignores the wind until touchdown.
  `Fitting.loose` = lies aboard and rides like anyone on deck (crates, barrels and lanterns are fixed fittings);
  `Fitting.tie` + `ThingDef.chain` = a chained thing (the anchor, carried and thrown with G): `Entity.tether`,
  `sim/craft/tether.ts` keeps it within the chain, a taut chain to one lying still holds the craft and swings its bow
  round; `CraftDef.weigh` names a channel (the anchor winch lever) that, pushed hard over, hauls it back aboard (`haulIn`, as a
  horn call does); climbing any hanging chain is `sim/player/climbing.ts` (forward climbs, looking down climbs down, jump lets go,
  forward at the top steps onto a floor). A fixed fitting with a `tie` (the rope ladder) only hangs, never holds the
  craft; `ThingDef.links` = what its line is drawn with (rungs). A horn call hauls loose chained things back aboard
  (`haulIn`). `ThingDef.vane` = a fitting that points downwind (windsock); `spin` = frames turned through with the
  craft's speed (propeller), `smoke.fx/pace` = its trail. Crates and barrels in the hold are loose. Area effects
  (blasts) reach frame cells too (`volume.framePoints`), so a fireball or frost spell burns or freezes the ship.
- `craftMotion` (host and a guest's foresight, `sim/foresight.ts`) moves the craft and carries every body inside its
  box (`Entity.aboard`): standing, on stairs, jumping, falling. Entering, a body's speed becomes relative to the craft;
  leaving (over the side, off the plank) it keeps the craft's speed. In the air bodies keep their momentum (air control
  only adds; knockback fades only on the ground). Fire on a ship's cells spreads: `matter.place` gives a spot's world
  position, so it is never "far from everyone". Ships cast shadows (`render/gpu/gpuFrameShade.ts`).
  Only a body over the craft's own cells comes aboard (`volume.floorOn`), so the box sweeping past a house takes nothing.
  `CraftDef.low` lets the box start before the keel's corner (the envelope overhangs hull on all sides). Ground is
  sampled every 2 m under the whole box: below it the craft is lifted out at once, ground rising faster than it can
  climb stops it. Within `still` m of its resting height the wind leaves it be (full share at twice that).
  Render: frames, chains (their tie follows the drawn craft) and lights use `poseBetween`; on a guest, what it
  foresees (crafts, fittings, itself) is drawn by its own tick time. Not yet: view does not turn with it.

## Ruins
Ruins are settlements gone to ruin: `village` layout in `content/sites.ts` with weighted `styles` (ring, street, cross, scatter) over decayed recipes
(`ruinedKeep|Tower|Hall|Cottage`, `brokenWall`, `brokenGate`), so they share the builder, wall faces and far LOD. Their `descent` sits in the courtyard.

## Add / change
- New realm: a `REALMS` entry + portals/habitats naming it; new ground kind only if needed (ground generator).
- New building: `structures` recipe. New shape: append to `shapeTable.ts` (never renumber). New door kind: a tile with `shape: 'door'` named in `materials.door`.

## Checks
`scripts/volumeSmoke.ts`, `fineSmoke.ts`, `doorSmoke.ts`, `realmSmoke.ts`, `matterSmoke.ts`, `matterFireSmoke.ts`, `craftSmoke.ts`, `shipSmoke.ts`.
