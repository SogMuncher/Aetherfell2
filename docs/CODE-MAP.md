# Code map (file -> purpose, line count)

Search this first, then open only the file you need. Update the entry (and line count) when you add or split a file.
(D) = pure data table, grep by id; (C) = one big class, split by extracting methods when next touched.

## scripts/
- `buildPlay.mjs` - `npm run build`: typecheck + one-file play.html (CI also runs it; see docs/PIPELINE.md)
- `artSmoke.ts` (79) check: every picture is built from parts, none hand-drawn
- `cheatsSmoke.ts` (167) Headless checks for the settings list and the debug cheats (which travel as sim commands).
- `coopSmoke.ts` (357) check: host/guest inputs, snapshots, prediction, shared record
- `dataSmoke.ts` (140) Data-friendliness checks: one day clock, tile numbers from the ledger, effects and
- `fireBench.ts` (30) Benchmark (manual): lights a big brush field, prints burning count, burn-out time and tick cost.
- `fireSmoke.ts` (21) Headless check that a grass/brush fire spreads with wind and stops in rain.
- `gearSmoke.ts` (~300) check: gear (weapons, armour, enchantments), hand slot, wear/break on ground and 3D cell, G throw
- `matterSmoke.ts` (338) MATTER: ground tiles and cells of the 3D layer obey the same rules. A timber wall burns like brush,
- `mechanicsSmoke.ts` (519) check: core mechanics (combat, items, fire, traps, statuses) on ground and cells
- `realmSmoke.ts` (159) REALMS: the underworld is a second set of tiles, cells and things swapped in for the surface; every
- `runebookSmoke.ts` (275) Headless checks for the runebook: composing spells from runes, preparing them, learning runes
- `settlementSmoke.ts` (303) Settlements and cities in the 3D layer: villages raise real buildings with furniture inside,
- `simSmoke.ts` (26) Headless smoke test: run the sim for a while and report what happened.
- `bootSmoke.mjs` (~50) Boots the bundled game in a real browser (`npm run check:boot`, needs Playwright): no load errors, journey starts, a world swap keeps one view canvas
- `skySmoke.ts` (163) Sky checks: cloud layers as data, rain only under storm cells, clouds drifting with the wind,
- `torchSmoke.ts` (94) Headless checks for torches: the wall-mounted kind in buildings and halls, and the one you hold
- `viewmodelShot.ts` (151) renders held-weapon PNGs (owned by the viewmodel thread)
- `volumeSmoke.ts` (359) The 3D layer: shapes, the brick store, standing on stairs and ramps, bumping heads, buildings
- `waterSmoke.ts` (385) check: rivers, lakes, bridges, piers, harbours
- `waysSmoke.ts` (166) WAYS: roads, paths and trails join the places of the world, and the underworld follows them.
- `worldSmoke.ts` (257) Headless checks for data-driven world generation and the far-away terrain: biomes come from

## src/audio/
- `engine.ts` (254) Sound building blocks. Every sound in the game is made from three things: an oscillator,
- `gameAudio.ts` (650) GameAudio class: reacts to sim events/state, owns ambience, steps, voices, spells, music hookup (C)

## src/audio/music/
- `composer.ts` (234) The composer writes sections: a key, a tempo, a meter, a chord progression, a melody motif
- `conductor.ts` (642) MusicEngine: picks the style that fits the mood and plays it bar by bar (C)
- `instruments.ts` (42) INSTRUMENTS table collecting the patches
- `mixer.ts` (188) The music mixing desk: one bus per style (with its own tone filter and reverb sends), one
- `patchesPercussion.ts` (160) drum, noise and effect patches (taiko, snare, swell, rise...)
- `patchesSustained.ts` (141) winds, bowed, choir and pad patches
- `patchesTuned.ts` (80) plucked and bell-like patches (harp, lute, kalimba...)
- `signalProbes.ts` (197) probes that read the game into mood signals, smoothing constants
- `signals.ts` (219) MoodSignals types, event impulses, MoodTracker
- `styleTypes.ts` (139) Meter/Layer/StyleDef types, METERS, shared rhythm cells
- `styles.ts` (17) collects the style tables into STYLES / StyleId
- `stylesDanger.ts` (154) Moods of danger and loss: tension … lament.
- `stylesDay.ts` (179) Moods of daylight, travel and rest: wander … aurora.
- `stylesPlaces.ts` (117) Moods of settlements and seasons: village … hearth.
- `synth.ts` (127) Synth: oscillators, noise, FM voices; Note and Patch types
- `theory.ts` (181) Music theory helpers: scales and modes, chords stacked inside a mode, voice leading, Euclidean

## src/audio/sfx/
- `materials.ts` (128) What stuff sounds like when it is struck, dropped, broken or walked on, as one small recipe per
- `spells.ts` (318) Spell and status sounds, built from what the magic actually does.
- `vary.ts` (82) Variation helpers for procedural sound effects. Audio lives outside the simulation, so it may use
- `voices.ts` (286) Creature voices, grown from the creature's own definition instead of picked from a list.

## src/clock/
- `ticker.ts` (20) A steady beat that keeps going when the page is in the background. Browsers stop drawing

## src/content/
- `biomes.ts` (97) Kinds of landscape. Each point of land takes the first biome (in this order) whose `when` fits
- `cheats.ts` (43) Every debug cheat, as data. The Debug cheats menu builds one row per entry (in this order, under
- `day.ts` (36) The one day-and-night clock. Times are a share of the day: 0 is midnight, 0.25 six in the
- `effects.ts` (38) Bursts of motes for things that happen in the world (not spells: those have their own look in
- `forms.ts` (458) trees, bushes, rocks, stones, plants as pieces (D)
- `gear.ts` (59) gear as data: body parts, hand slot, forms (garments + weapons), materials, qualities, enchantments
- `gearItems.ts` (159) gear ids -> item definitions, random rolls, outfits, which body part a blow lands on
- `gearCheck.ts` (56) gearProblems: the gear tables are sound
- `itemDefs.ts` (107) itemDef for every id (wear `@N`, durability), held-item weapon stats, break reactions, wear helpers
- `helpers.ts` (112) content lookups: thingDef, weaponStats, rollLoot, fillText, isDisabled...
- `hud.ts` (45) Colours of the screen furniture (bars, panels, menus, map marks). The interface turns each into a
- `index.ts` (76) collects every table into CONTENT, re-exports helpers, runs validation
- `items.ts` (137) Inventory goods. A new potion, food, throwable or weapon is just a new entry here.
- `living.ts` (126) Creature minds. Each brain lists behaviours from the shared library (sim/ai/behaviours.ts) in
- `looks.ts` (304) creature looks as solid parts (D)
- `loot.ts` (104) Drop tables: each entry rolls on its own.
- `materials.ts` (29) How stuff reacts physically. Every tile and thing made of a material behaves the same way.
- `palettes.ts` (62) Palettes: the colours that fill the colour regions of every picture (creatures, trees, rocks,
- `props.ts` (231) Props as forms: barrels, crates, chests, urns, torches, campfires and trap plates are put
- `realms.ts` (58) The spaces the world is made of. A realm is a place with its own ground, light and sky; the whole
- `roles.ts` (108) Villager jobs: what they add to a greeting, what they keep on the rack, the trouble they ask
- `rules.ts` (86) World-wide rules that are not one definition: how bodies react to heat, water and cold, how
- `runes.ts` (254) Runes, the syllables of magic. Up to three make a spell in the runebook:
- `shapes.ts` (234) The simple shapes every 3D structure is snapped together from. A shape is one or more convex
- `sites.ts` (341) named places: odds, layout, population (D)
- `gateRule.ts` (12) where roads tell sites which city gates to open (own file so the start-up order never breaks)
- `sky.ts` (32) The sky and air. Each cloud/mist layer is a sheet of drifting shapes at its own height, size and speed, and
- `skyField.ts` (~290) Where the clouds are (`airColumn`: every layer into air cells). One pure function of the sky data, the weather (cover, storminess, how far
- `spellcraft.ts` (286) composes a spell from up to 3 runes; spell descriptions
- `matterStates.ts` (20) How soot, wet, oil, frost and fire look blended over the stuff they are on (never replacing it).
- `statuses.ts` (34) Ongoing conditions. Each one can cancel or block others, tick effects and change movement.
- `structures.ts` (416) building recipes for the 3D layer (D)
- `surfaces.ts` (202) Procedural surfaces: every ground, wall and floor look, as a base colour plus layers of noise,
- `things.ts` (330) entity archetypes by trait (D)
- `tileCodes.ts` (17) The tile ledger: the lasting number of each tile kind, which chunks and saves store.
- `tiles.ts` (200) all tile kinds + code assignment from the ledger
- `validate.ts` (256) validateContent: every reference must point at something that exists
- `viewmodel.ts` (33) held-item hand poses (viewmodel thread)
- `world.ts` (54) World-wide generation choices. The land is the sum of its layers (continents, hills, ridged

## src/input/
- `input.ts` (176) keyboard+mouse -> InputSnapshot per tick and local UI actions
- `keyboard.ts` (37) Tracks held keys and keys pressed since the last poll (edge-triggered).
- `mouse.ts` (61) Pointer-lock mouse look plus button state. Yaw is applied instantly so looking feels smooth at any sim rate.
- `quickSlots.ts` (37) The quick-use keys 1..4 (H and G still work as keys 1 and 2). Each holds an item id, or

## src/
- `main.ts` (337) the only wiring: input -> sim (or guest replica) -> net/audio/render

## src/net/
- `messages.ts` (171) validate and shape every co-op message
- `net.ts` (271) PeerJS transport: host/guest connections, snapshots
- `prediction.ts` (76) guest-side view and input replay

## src/render/
- `color.ts` (50) packed pixel colour helpers
- `env.ts` (147) the light and air of the moment (Env): sun path, sky colours, cloud light, fog = sky at the horizon or the cloud you stand in
- `lighting.ts` (~150) gathers every light from shared data (`LightMap.lights`; fire from the `fire` matter state); Classic grid; re-exports Env
- `airSmoke.ts` (~170) smoke: the live level of the air cells; burning spots feed it, it rises, spreads and thins in steps
- `airCells.ts` (~220) ONE grid of air cells around the eye that every sky layer writes into; LOD levels, wrapped storage (moving fills only new cells)
- `stateLooks.ts` (~70) matter-state looks flattened for the GPU uniforms and far-land tint (`tintFar`)
- `palette.ts` (82) Turns colour choices ('#rrggbb' or '@palette', see types/palettes.ts) into packed pixels, and
- `adaptiveRes.ts` (60) adaptive pixel size from frame time
- `renderer.ts` (149) frame orchestration: terrain, volume, sky, sprites, vfx, post
- `viewport.ts` (47) The low-resolution retro frame. Everything is drawn into `pixels` (one Uint32 per pixel) with a

## src/render/entities/
- `bodyArt.ts` (249) creature sprites: poses, individuals, BodyBank
- `bodyMath.ts` (49) 3x3 matrix helpers for posing parts
- `bodyPaint.ts` (324) ray-intersect solids into colour-region pixels
- `creatures.ts` (82) picks the sprite for a creature look and individual
- `formArt.ts` (257) grows trees, rocks, objects from content forms
- `itemArt.ts` (192) paints an item: its parts in order (one picture per item), other base forms, world size
- `itemPaint.ts` (218) item painting tools (Pix, axis, palette materials) and the resolved look
- `itemParts.ts` (182) weapon parts (grip, guard, blade, pommel, haft, axe bit, heads) + ITEM_PARTS table
- `itemPlates.ts` (131) armour parts: headgear, torsowear, armwear, legwear
- `itemVessel.ts` (157) flasks, bottles, vials, jugs, pots
- `mesh.ts` (402) tiny 3D painter for the held weapon (being replaced)
- `props.ts` (55) props grown from forms
- `spriteRenderer.ts` (217) depth-tested billboards, dithered
- `sprites.ts` (55) sprite type and registry
- `viewModel.ts` (794) held weapon as small 3D scene (being replaced by sprites)

## src/render/gpu/
- `gpuRenderer.ts` (123) GPU pipeline orchestration: one WebGL2 canvas, passes sky, terrain, air, post (docs/GPU-RENDER.md)
- `gpuTerrain.ts` (260) LOD clipmap: height/colour textures from `TerrainLod` blocks, displaced grids, far lift + canopy, depth fog
- `gpuTerrainState.ts` (~45) every matter state of live ground cells as a texture array for the finest levels
- `gpuStates.ts` (~70) STATE_SHADER `blendStates` + uniform looks + packing; used by terrain, tile blocks, structures
- `gpuStructures.ts` (~165) 3D bricks in an atlas texture; each brick box is rasterised, pixels walk its cells, shared depth
- `gpuStructShader.ts` (~110) shader text for structures: shapes, DDA, surface textures, sun/cover light
- `gpuTileBlocks.ts` (~165) tile walls/doors/windows as boxes from tile data, with their matter states
- `gpuSprites.ts` (~165) billboards: sprite atlas + instanced quads
- `gpuLight.ts` (~190) THE light pass: every pixel's sky light + AO, sun/moon and nearest point lights, each with shadow rays
- `gpuCasters.ts` (~110) every drawn sprite as a shadow-casting card of its own shape, filed per 1 m column
- `gpuFarShade.ts` (~85) cloud shade + sun rays over terrain height levels far from the eye
- `gpuSolid.ts` (~140) 1 m solid field + ground heights around the eye for shadow rays (`shadowRay` GLSL)
- `gpuSurfaces.ts` (~50) shared tile surface atlas (+ the surfaces matter states cover things with); `SURFACE_OUT` for the light pass
- `gpuParticles.ts` (~140) motes as point sprites and rain streaks
- `gpuOverlay.ts` (~55) held item buffer composited on top
- `gpuSky.ts` (~70) full-screen sky: gradient, sun, moon, stars, aurora
- `gpuClouds.ts` (~260) air cells in a texture array, walked nearest first per pixel; each clump one solid shape (look set at its entry face, no inside faces), cut at the scene depth
- `gpuPost.ts` (98) low-res colour+depth target and the dither/vignette/tint finish
- `gpuAir.ts` (56) floating air motes from `AirDef` (biome/realm data)
- `glUtil.ts` (71) shader/texture helpers, camera basis and view-projection

## src/render/materials/
- `textures.ts` (172) tileable procedural textures from surface layers

## src/render/post/
- `post.ts` (66) ordered dither to reduced palette, vignette

## src/render/raycaster/
- `camera.ts` (47) per-frame projection values
- `cloudShadow.ts` (73) cloud shadows on the land
- `lodLooks.ts` (57) far colours of biomes
- `sky.ts` (295) ray-marched cloud slabs, sun, moon, stars, aurora
- `terrainLod.ts` (263) cached LOD pyramid for far land (C)
- `terrainLodPaint.ts` (184) paints changed chunks (tiles, matter states) over a LOD block's seed picture
- `terrainRenderer.ts` (416) voxel-space column marcher (C)
- `tileBillboards.ts` (171) tree/rock billboards from tiles
- `volumeRenderer.ts` (407) ray-casts 3D-layer bricks (C)

## src/render/ui/
- `bag.ts` (476) BagWindow: draggable inventory window (C)
- `bagParts.ts` (148) bag constants, icon urls, item description, layout store
- `paperdoll.ts` (293) C key: armour slots and the hand slot, drag to take off
- `paperdollStats.ts` (52) the paperdoll's side panel: health, protection, hands, skills
- `settingsMenu.ts` (257) Esc/O menu built from settings data + cheat tab
- `style.ts` (132) HUD CSS from content/hud.ts
- `ui.ts` (656) GameUI: HUD, dialogue, journal, map, runebook (C)

## src/render/vfx/
- `particleKinds.ts` (88) particle kinds, physics, mote look tables
- `particles.ts` (556) Particles: visual effects from events and state (C)

## src/settings/
- `settings.ts` (196) settings as data + localStorage store

## src/sim/ai/
- `aiSystem.ts` (172) Every creature (animal, monster or villager) thinks the same way: now and then it senses what is
- `behaviours.ts` (255) The shared library of behaviours every creature brain picks from (content/living.ts).

## src/sim/cheats/
- `cheatSystem.ts` (216) debug cheats executed as sim actions

## src/sim/ecology/
- `ecologySystem.ts` (107) The living world: wildlife comes and goes around the party according to habitat and time of

## src/sim/effects/
- `effectsSystem.ts` (77) effect queue loop
- `entityEffects.ts` (261) effects on bodies: guard, armour, reactions, death
- `spotEffects.ts` (124) effects on tiles/cells: ignite, strike, soak, coat
- `temperature.ts` (107) temperature of tiles/cells: heat dries then burns, cold freezes wet, spots settle back

## src/sim/
- `breakage.ts` (18) ctx.breakItem: an item's onBreak burst + what it breaks into
- `inputQueue.ts` (44) queueing/folding of guest inputs
- `simLoop.ts` (497) Simulation class: step order, commands, realm travel, wipe check, prediction (C)
- `simState.ts` (97) rng, createState, newPlayer
- `templates.ts` (37) Builds an entity from its definition. Only instance data lives on the entity.

## src/sim/interaction/
- `interactionSystem.ts` (262) The world's own rules: fire grows, spreads (faster downwind and through oil), throws sparks on

## src/sim/magic/
- `magicSystem.ts` (188) Casting. The prepared spell is composed from runes (content/spellcraft.ts): a delivery (bolt,

## src/sim/melee/
- `meleeSurface.ts` (91) striking walls/doors/trees; wearHeld (held item wears and breaks)
- `meleeSystem.ts` (222) How hard a shove of weight 1 pushes, in m/s (the weapon's own push and the swing's knock scale it).

## src/sim/persistence/
- `persistence.ts` (260) save/load with fflate

## src/sim/physics/
- `impacts.ts` (77) fast loose things hurt, onImpact bursts, thrown items take a blow and break
- `physicsSystem.ts` (273) Knockback left after each tick (it fades in about a third of a second).
- `spatialHash.ts` (41) Uniform grid of entities, rebuilt once per tick. Answers "what is near here?" cheaply.

## src/sim/player/
- `playerSystem.ts` (222) First-person control: walking, sprinting, swimming, jumping, gliding, carrying and throwing,

## src/sim/rpg/
- `gearHandling.ts` (67) put on / take off armour, hold anything in the hands
- `throwing.ts` (107) throw from the bag, G throw/drop from the hands, pick up from the view
- `rpgSystem.ts` (173) Progression: skills that grow by doing (blade, evocation, athletics, speech), picking things up,

## src/sim/social/
- `socialSystem.ts` (227) Conversation: greetings that depend on the hour and on what the party has done, rumours that

## src/sim/statuses/
- `statusSystem.ts` (32) Ticks ongoing conditions: counts them down and queues their repeating effects (burning hurts

## src/sim/structures/
- `builder.ts` (89) buildStructure entry: recipe -> cells

## src/sim/structures/builder/
- `arch.ts` (90) arches, walls, ruin decay
- `house.ts` (253) houses: floors, stairs, roofs, furnishing spots
- `placer.ts` (113) Placer: snap cells into the structure grid and world

## src/sim/weather/
- `weatherSystem.ts` (54) One in-game day lasts this many real seconds.

## src/sim/world/
- `chunkgen.ts` (201) Builds a chunk from the seed alone. Same seed, same chunk — on every machine.
- `city.ts` (190) cityLayout: walls, gates, streets, wards
- `cityParts.ts` (84) city constants, houses
- `cityWall.ts` (150) one wall round the merged outline of rectangles: towers, runs, gates
- `cityWard.ts` (157) one ward: keep, landmarks, blocks
- `crossings.ts` (201) Where water meets people. Bridges come with the ways (sim/world/roads.ts routes each way straight across the water it
- `decks.ts` (174) Decks over water: bridges where a way crosses a river or lake, piers where a port meets the water. One shape of thing
- `matter.ts` (198) ctx.matter: stuff at (x,y,z) for tiles and cells
- `noise.ts` (59) Small, fast, seedable noise helpers. Pure functions of (seed, coords).
- `realms.ts` (93) Who goes along when the party changes realm: the travellers and what they carry.
- `roads.ts` (90) ways per region: waysTouching, wayHit
- `sites.ts` (266) World is divided into 256 m regions; each may hold one site (kinds and odds in content/sites.ts).
- `terrain.ts` (216) The shape of the land: continents, rolling hills, ridged mountains, a moisture field for biomes,
- `underworld.ts` (256) The ground of the underworld: a lattice of halls joined by corridors, laid on a 16 m grid exactly
- `volume.ts` (347) VolumeStore: sparse 3D brick store (C)
- `water.ts` (217) Rivers and lakes: a pure function of the seed that reads no places (cities and roads read it, never the other way).
- `wayParts.ts` (135) way types, site neighbours, nets
- `wayRoute.ts` (193) route cost, bridging, way between two places
- `worldPopulate.ts` (200) raises buildings, furnishes halls, spawns people
- `worldSystem.ts` (131) keeps world around the party: places, chunk unloading
- `worldTiles.ts` (230) The tile world: lazily generated chunks held in SimState, with change tracking.

## src/types/
- `cheats.ts` (68) Debug cheats: shapes only. The list of cheats is data (src/content/cheats.ts), the menu builds
- `commands.ts` (10) The only way the outside world (input, network) changes the simulation.
- `defs.ts` (79) Content type + re-exports of defs/*
- `effects.ts` (60) Kinds of harm. Materials scale each one (stone shrugs off cuts, wood hates fire).
- `entities.ts` (225) Entity and its components
- `events.ts` (62) Things that happened during a tick. Audio, render effects, UI and the network react to these.
- `forms.ts` (98) How a world object is put together, as data: trees, bushes, rocks, standing stones, haystacks,
- `gear.ts` (184) gear types: body parts, HAND_SLOT, forms, materials, qualities, enchantments, rolls, wear requests
- `index.ts` (21) re-exports all types
- `input.ts` (90) Letting go of an item from the bag over the view: where the cursor was decides the throw.
- `items.ts` (26) Inventory helpers shared by every system that touches items.
- `looks.ts` (96) How a creature looks, as data. Every creature (people included) is a small set of solid parts
- `math.ts` (10) 
- `matter.ts` (60) MATTER — one way to talk about "the stuff at a place", whatever holds it.
- `net.ts` (53) co-op message types
- `palettes.ts` (22) Colour as data. Pictures are never painted in fixed colours: every part of a creature, tree,
- `sky.ts` (62) RGB, 0..255.
- `state.ts` (131) SimState and queues
- `structures.ts` (173) StructureDef, planned structures, house geometry
- `tiles.ts` (212) tile/chunk types, TileInfo, keys
- `fireEmitter.ts` (46) Feeds flames, smoke and embers for burning spots near the eye from one shared per-view budget.
- `vfx.ts` (59) World motes that are not spells: fire, smoke, sparks, splashes, blood, dust, frost glitter.
- `volume.ts` (131) 3D layer brick/volume types
- `world.ts` (70) A named place in the world. Registered by the world system as players come near.
- `worldgen.ts` (186) surface, biome, water and world-generation defs

## src/types/defs/
- `brains.ts` (103) BehaviourDef, BrainDef, loot, habitats, population
- `ids.ts` (23) id string types
- `items.ts` (68) ItemDef, ItemLook
- `magic.ts` (194) SpellDef, RuneDef, StatusDef and spell look
- `rules.ts` (154) RulesDef, SwingDef, DayRules, HudTheme
- `sites.ts` (122) SiteDef, layouts, city, districts
- `social.ts` (62) quests, trade, roles, factions
- `things.ts` (168) MaterialDef, ThingDef, RealmDef, light, weapon stats
