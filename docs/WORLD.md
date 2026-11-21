# World (sim/world): terrain, water, ways, places

**Purpose:** the ground you walk on, made from the seed alone, plus what stands on it.
**Never:** write a rule "for tiles" (ask `ctx.matter`), branch on a realm id, or hand-place anything.

- Terrain: unbounded height field, 1 tile = 1 m, 32x32 chunks (`terrain.ts`, `chunkgen.ts`, `worldTiles.ts`).
  Beyond loaded chunks the same seed is sampled (`WorldSampler`), so far land always shows. Only changed chunks save.
- Biomes/materials/colours are data: `content/biomes.ts`, `tiles.ts`, `surfaces.ts`, `world.ts`.
- Matter: `matter.ts` is `ctx.matter`, the one answer to "what is at (x,y,z)" for tiles and 3D cells alike.
- Places: `sites.ts` (villages roll a layout style by weight: ring/scatter/street/cross, own house count and building mix, `styles` rows in `content/sites.ts`), `city.ts` + `cityParts.ts` + `cityWard.ts` + `cityWall.ts` (cities: wards, each with a street pattern from `streetStyles`; ONE wall round the merged outline of all wards, `walls.margin` out, gates in line with ward main streets, no inner walls, not even round the keep; street tiles not joined to a ward middle or gate road are painted as plain ground, no stray fragments),
  all pure and seeded. `worldSystem.ts` runs them; `worldPopulate.ts` raises buildings through `ctx.build` a few per
  tick (`Location.built` lets saves resume), then spawns furnishings and people. Layout data: `content/sites.ts`.
- Ways (roads/paths): `roads.ts` (queries `waysTouching`, `wayHit`), `wayParts.ts` (types, site neighbours),
  `wayRoute.ts` (cost, bridging, routing). Pure functions of the seed; grades in `content/world.ts`.
- Water: `water.ts` (rivers = one contour of a noise field, lakes = blobs; every water tile has its own height,
  `Chunk.level`, never saved). `decks.ts` + `crossings.ts` build bridges/piers/harbours as 3D cells.
  Tunables are in `content/world.ts` `water`.
- Realms and the 3D layer: see `REALMS.md`.

- Bodies sleep (no physics) beyond `rules.awake` metres from every player, so far chunks are never dragged back in.
- Things with `smoke` (hearth, campfire) puff smoke from `rise` m above them (particles.ts, near only).

## Add / change
- New biome, tile, place, road grade: a data entry (see CONTENT.md). Only a new *layout shape* needs code
  (`chunkgen.ts` stamping, `sites.ts`/`city.ts`).
- Each site kind rolls for its region by its own id, so adding one never reshuffles old places (except overlaps, `priority`).
- Anything that must be the same on host and guest uses `ctx.rng` or seed hashes, never `Math.random()`.

## Checks
`scripts/worldSmoke.ts` (terrain, far view), `settlementSmoke.ts`, `waysSmoke.ts`, `waterSmoke.ts`, `matterSmoke.ts`.

- Gates and roads agree: ways are routed from the all-gates layout (`rawSiteInRegion`); `siteInRegion` then returns a walled city with gates only where a way leaves (`setGateRule` in roads.ts), so no gate leads nowhere. A route that would run through a city wall is dropped (`crossesWall` in wayRoute.ts). Checked in waysSmoke.
- Water vs places/rivers: water keeps out of a place and fades out over 60 m beyond its radius (`waterSpotAt`), and water cuts its bed BEFORE the plateau levels the ground (`groundWith`, plateau blend 80 m), so no cliff stands beside a levelled place. A river inside or beside a lake becomes the lake and its surface settles to the lake's level (`waterSpot`). Checked in waterSmoke / settlementSmoke.
