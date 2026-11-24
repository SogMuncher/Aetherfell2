# Code map (file -> purpose, line count)

Grep this (`grep -i <word> docs/CODE-MAP.md`), then open only the file you need. `npm run codemap` (also run by
`npm run check`) keeps counts, new and deleted files in step; only fix a purpose by hand if it is wrong.
(D) = pure data table, grep by id; (C) = one big class, split by extracting methods when next touched.

## scripts/
- `buildPlay.mjs` (24) `npm run build`: typecheck + one-file play.html (CI also runs it; see docs/PIPELINE.md)
- `artSmoke.ts` (179) check: every picture is built from parts, none hand-drawn
- `cheatsSmoke.ts` (182) Headless checks for the settings list and the debug cheats (which travel as sim commands).
- `coopSmoke.ts` (385) check: host/guest inputs, snapshots, prediction, shared record
- `dataSmoke.ts` (140) Data-friendliness checks: one day clock, tile numbers from the ledger, effects and
- `fireBench.ts` (30) Benchmark (manual): lights a big brush field, prints burning count, burn-out time and tick cost.
- `fireSmoke.ts` (21) Headless check that a grass/brush fire spreads with wind and stops in rain.
- `gearSmoke.ts` (269) check: gear (weapons, armour, enchantments), hand slot, wear/break on ground and 3D cell, G throw
- `matterSmoke.ts` (245) MATTER: ground tiles and cells of the 3D layer obey the same rules. A timber wall burns like brush,
- `mechanicsSmoke.ts` (520) check: core mechanics (combat, items, fire, traps, statuses) on ground and cells
- `realmSmoke.ts` (239) REALMS: the underworld is a second set of tiles, cells and things swapped in for the surface; every
- `runebookSmoke.ts` (275) Headless checks for the runebook: composing spells from runes, preparing them, learning runes
- `settlementSmoke.ts` (373) Settlements and cities in the 3D layer: villages raise real buildings with furniture inside,
- `simSmoke.ts` (26) Headless smoke test: run the sim for a while and report what happened.
- `bootSmoke.mjs` (46) Boots the bundled game in a real browser (`npm run check:boot`, needs Playwright): no load errors, journey starts, a world swap keeps one view canvas
- `skySmoke.ts` (297) Sky checks: cloud layers as data, rain only under storm cells, clouds drifting with the wind,
- `torchSmoke.ts` (94) Headless checks for torches: the wall-mounted kind in buildings and halls, and the one you hold
- `viewmodelShot.ts` (150) renders held-weapon PNGs (owned by the viewmodel thread)
- `volumeSmoke.ts` (289) The 3D layer: shapes, the brick store, standing on stairs and ramps, bumping heads, buildings
- `waterSmoke.ts` (427) check: rivers, lakes, bridges, piers, harbours
- `waysSmoke.ts` (205) WAYS: roads, paths and trails join the places of the world, and the underworld follows them.
- `worldSmoke.ts` (257) Headless checks for data-driven world generation and the far-away terrain: biomes come from
- `check.mjs` (78) One runner for every check, with short output (only failures + one summary line per script).
- `codemap.mjs` (81) Keeps docs/CODE-MAP.md true by itself: refreshes every line count, adds new files (purpose taken
- `senseSmoke.ts` (108) Checks: creatures see in 3D (height and line of sight), one "is it dark here" check, and what bodies stand in
- `outfitSmoke.ts` (105) Headless checks: creatures are found wearing and holding real gear (their outfit), fight with what they hold
- `smokeKit.ts` (63) Shared helpers for the headless smoke checks: seeded rng, flat arena, a joined traveller, PASS/FAIL counting
- `matterFireSmoke.ts` (85) MATTER and fire: a timber wall burns like brush, thatch catches from burning grass, fire climbs, and fire
- `matterKit.ts` (52) Shared helpers for the matter checks: a calm world, flat ground, stepping, PASS/FAIL counting, common cells
- `handsSmoke.ts` (67) Headless checks: creatures carry a bag (players' own kind), spill all of it when they die, and their brains
- `musicSmoke.ts` (181) Music checks (no WebAudio needed): cues land on the beat in the key, events pick the right cue, combos climb,

## src/audio/
- `engine.ts` (268) Sound building blocks. Every sound in the game is made from three things: an oscillator,
- `gameAudio.ts` (547) GameAudio class: reacts to sim events/state, owns ambience, steps, voices, spells, music hookup (C)
- `ambience.ts` (186) The ambient bed: wind, rain, fire, water and cave air that follow your surroundings, plus one-shots from ambie
- `ambientSounds.ts` (77) Ambient one-shots as data: birds, owls, frogs, drips, rumbles… each says where it belongs (under open sky or d

## src/audio/music/
- `composer.ts` (237) The composer writes sections: a key, a tempo, a meter, a chord progression, a melody motif
- `conductor.ts` (299) MusicEngine: picks the style that fits the mood and plays it bar by bar (C)
- `instruments.ts` (90) INSTRUMENTS table collecting the patches
- `mixer.ts` (188) The music mixing desk: one bus per style (with its own tone filter and reverb sends), one
- `patchesPercussion.ts` (198) drum, noise and effect patches (taiko, snare, swell, rise...)
- `patchesSustained.ts` (141) winds, bowed, choir and pad patches
- `patchesTuned.ts` (69) Plucked and bell-like patches: harp, lute, celesta, bell, glass, pluck bass.
- `signalProbes.ts` (197) probes that read the game into mood signals, smoothing constants
- `signals.ts` (219) MoodSignals types, event impulses, MoodTracker
- `styleTypes.ts` (155) Meter/Layer/StyleDef types, METERS, shared rhythm cells
- `styles.ts` (56) collects the style tables into STYLES / StyleId
- `stylesDanger.ts` (187) Moods of danger and loss: tension … lament.
- `stylesDay.ts` (199) Moods of daylight, travel and rest: wander … aurora.
- `stylesPlaces.ts` (135) Moods of settlements and seasons: village … hearth.
- `synth.ts` (136) Synth: oscillators, noise, FM voices; Note and Patch types
- `theory.ts` (182) Music theory helpers: scales and modes, chords stacked inside a mode, voice leading, Euclidean
- `band.ts` (286) The band: turns one step of the current section into notes for every active layer (read by the conductor).
- `cuePlayer.ts` (233) Plays cues on the music's grid: next step/eighth/beat/bar, in the current key, chord and band.
- `cues.ts` (187) Cues as data: stingers, style changes and on-beat reactions, each a few notes in the current key and band.
- `modulators.ts` (49) Generic mood -> music dials: every signal may nudge tempo, energy and brightness (data, read by the conductor)
- `patchesExtra.ts` (125) More instruments: wooden mallets, hammered strings, reeds, low brass, organ, gong and small hand percussion.
- `reactions.ts` (42) Which game events the music answers on the beat, and with which cue (one rule per event type).
- `chaos.ts` (46) A little chaos in the music, as data: nothing ever plays for sure, and now and then a bar strays.
- `patchesDark.ts` (120) Dark-fantasy voices: hurdy-gurdy, duduk, bone flute, wraith, monks, music box, lyre, war horn, bowed bass, dar
- `patchesDrones.ts` (76) Drones that fill the air between sparse notes: tuned wind, a hollow cave moan and a low choir, each fading slo

## src/audio/sfx/
- `materials.ts` (128) What stuff sounds like when it is struck, dropped, broken or walked on, as one small recipe per
- `spells.ts` (318) Spell and status sounds, built from what the magic actually does.
- `vary.ts` (82) Variation helpers for procedural sound effects. Audio lives outside the simulation, so it may use
- `voices.ts` (286) Creature voices, grown from the creature's own definition instead of picked from a list.

## src/clock/
- `ticker.ts` (20) A steady beat that keeps going when the page is in the background. Browsers stop drawing

## src/content/
- `biomes.ts` (102) Kinds of landscape. Each point of land takes the first biome (in this order) whose `when` fits
- `cheats.ts` (72) Every debug cheat, as data. The Debug cheats menu builds one row per entry (in this order, under
- `day.ts` (41) The one day-and-night clock. Times are a share of the day: 0 is midnight, 0.25 six in the
- `effects.ts` (38) Bursts of motes for things that happen in the world (not spells: those have their own look in
- `forms.ts` (187) trees, bushes, rocks, stones, plants as pieces (D)
- `gear.ts` (62) gear as data: body parts, hand slot, forms (garments + weapons), materials, qualities, enchantments
- `gearItems.ts` (164) gear ids -> item definitions, random rolls, outfits, which body part a blow lands on
- `gearCheck.ts` (60) gearProblems: the gear tables are sound
- `itemDefs.ts` (107) itemDef for every id (wear `@N`, durability), held-item weapon stats, break reactions, wear helpers
- `helpers.ts` (102) content lookups: thingDef, weaponStats, rollLoot, fillText, isDisabled...
- `hud.ts` (45) Colours of the screen furniture (bars, panels, menus, map marks). The interface turns each into a
- `index.ts` (86) collects every table into CONTENT, re-exports helpers, runs validation
- `items.ts` (103) Inventory goods. A new potion, food, throwable or weapon is just a new entry here.
- `living.ts` (128) Creature minds. Each brain lists behaviours from the shared library (sim/ai/behaviours.ts) in
- `looks.ts` (175) creature looks as solid parts (D)
- `loot.ts` (110) Drop tables: each entry rolls on its own.
- `materials.ts` (29) How stuff reacts physically. Every tile and thing made of a material behaves the same way.
- `palettes.ts` (62) Palettes: the colours that fill the colour regions of every picture (creatures, trees, rocks,
- `props.ts` (232) Props as forms: barrels, crates, chests, urns, torches, campfires and trap plates are put
- `realms.ts` (67) The spaces the world is made of. A realm is a place with its own ground, light and sky; the whole
- `roles.ts` (108) Villager jobs: what they add to a greeting, what they keep on the rack, the trouble they ask
- `rules.ts` (127) World-wide rules that are not one definition: how bodies react to heat, water and cold, how
- `runes.ts` (254) Runes, the syllables of magic. Up to three make a spell in the runebook:
- `shapes.ts` (234) The simple shapes every 3D structure is snapped together from. A shape is one or more convex
- `sites.ts` (364) named places: odds, layout, population (D)
- `sky.ts` (38) The sky and air. Each cloud/mist layer is a sheet of drifting shapes at its own height, size and speed, and
- `skyField.ts` (293) Where the clouds are (`airColumn`: every layer into air cells). One pure function of the sky data, the weather (cover, storminess, how far
- `spellcraft.ts` (286) composes a spell from up to 3 runes; spell descriptions
- `matterStates.ts` (20) How soot, wet, oil, frost and fire look blended over the stuff they are on (never replacing it).
- `statuses.ts` (37) Ongoing conditions. Each one can cancel or block others, tick effects and change movement.
- `structures.ts` (466) building recipes for the 3D layer (D)
- `surfaces.ts` (223) Procedural surfaces: every ground, wall and floor look, as a base colour plus layers of noise,
- `things.ts` (196) entity archetypes by trait (D)
- `tileCodes.ts` (17) The tile ledger: the lasting number of each tile kind, which chunks and saves store.
- `tiles.ts` (201) all tile kinds + code assignment from the ledger
- `validate.ts` (268) validateContent: every reference must point at something that exists
- `viewmodel.ts` (36) held-item hand poses (viewmodel thread)
- `world.ts` (54) World-wide generation choices. The land is the sum of its layers (continents, hills, ridged
- `artCheck.ts` (41) Checks every art recipe (creatures, trees, props): known colour slots, parents and features, sane gait
- `smallForms.ts` (253) Bushes, rocks, plants and small heaps (haystacks, woodpiles, wells, rubble) grown from parts, like trees (form
- `itemGearArt.ts` (124) Gear pictures as art pieces: weapon parts (grip, guard, blade, haft, heads) and the four kinds of armour
- `itemGoodsArt.ts` (125) Everyday item pictures as art pieces: vessels, torch, coin, key, food, pelt, shard, rune stone, bundle, lump
- `creatures.ts` (153) Creatures and people as thing definitions: bodies, natural weapons, brains, and the outfit (real gear) they ar
- `handling.ts` (87) How a weapon handles, worked out: its damage kind's profile, its weight, then its own overrides (data in rules
- `bodyPlans.ts` (172) Body plans as reusable parts (two legs, four legs, hopper, antlers): segmented limbs on joints, roles for body
- `moves.ts` (78) Body moves seen from outside: how arms, torso, head (or a beast's neck) turn through each swing direction and

## src/input/
- `input.ts` (177) keyboard+mouse -> InputSnapshot per tick and local UI actions
- `keyboard.ts` (37) Tracks held keys and keys pressed since the last poll (edge-triggered).
- `mouse.ts` (61) Pointer-lock mouse look plus button state. Yaw is applied instantly so looking feels smooth at any sim rate.
- `quickSlots.ts` (37) The quick-use keys 1..4 (H and G still work as keys 1 and 2). Each holds an item id, or

## src/
- `main.ts` (347) the only wiring: input -> sim (or guest replica) -> net/audio/render

## src/net/
- `messages.ts` (193) validate and shape every co-op message
- `net.ts` (275) PeerJS transport: host/guest connections, snapshots
- `prediction.ts` (76) guest-side view and input replay

## src/render/
- `color.ts` (50) packed pixel colour helpers
- `env.ts` (144) the light and air of the moment (Env): sun path, sky colours, cloud light, fog = sky at the horizon or the cloud you stand in
- `lighting.ts` (163) gathers every light from shared data (`LightMap.lights`; fire from the `fire` matter state); 1 m grid for the held item; re-exports Env
- `airSmoke.ts` (169) smoke: the live level of the air cells; burning spots feed it, it rises, spreads and thins in steps
- `airCells.ts` (228) ONE grid of air cells around the eye that every sky layer writes into; LOD levels, wrapped storage (moving fills only new cells)
- `stateLooks.ts` (68) matter-state looks flattened for the GPU uniforms and far-land tint (`tintFar`)
- `palette.ts` (82) Turns colour choices ('#rrggbb' or '@palette', see types/palettes.ts) into packed pixels, and
- `adaptiveRes.ts` (50) adaptive pixel size from frame time
- `renderer.ts` (173) frame orchestration: camera, env, lights, billboards, particles, then the GPU frame
- `viewport.ts` (33) the low-resolution frame size; the GPU canvas lies over it

## src/render/entities/
- `bodyMath.ts` (49) 3x3 matrix helpers for posing parts
- `bodyPaint.ts` (293) ray-intersect solids into colour-region pixels
- `itemArt.ts` (165) paints an item: its parts in order (one picture per item), other base forms, world size
- `spriteRenderer.ts` (140) gathers billboards (trees, creatures, props, items) for the GPU
- `sprites.ts` (55) sprite type and registry
- `viewModel.ts` (270) held weapon as small 3D scene (being replaced by sprites)
- `spriteWarp.ts` (168) Flat sprites made to read as 3D motion. A held item is just its item picture (itemArt.ts); a
- `artGrow.ts` (264) Builds one individual of any art recipe into placed solids: fixed parts at their spots (joints), grown parts b
- `artSprites.ts` (137) Picks the picture for any entity drawn from art (creature, person, prop): which individual, pose, frame and si
- `assembler.ts` (246) The one sprite assembler: builds any art recipe (creature, tree, prop), poses it and paints it from 8 sides, o
- `itemLook.ts` (93) What an item looks like, worked out from its definition: base shape, colours, size, gear parts (no item ids)
- `gearArt.ts` (96) Worn armour and the held item laid onto any creature's art recipe: shells over the parts each slot covers, the
- `viewFx.ts` (109) Motes over the held item: flames at a burning head, sparks, drops and puffs, advanced and painted each frame.
- `viewPose.ts` (129) Held-item motion: poses as a hand position + blade direction, swing paths along arcs, and smooth settling betw
- `itemCard.ts` (46) An item's bag picture as a card a body holds: where its grip is and which way it points on the picture
- `paintFinish.ts` (112) Last touches on a painted body picture: dark outlines, and flat item pictures (held items) stamped facing the

## src/render/gpu/
- `gpuRenderer.ts` (200) GPU pipeline orchestration: one WebGL2 canvas, passes sky, terrain, air, post (docs/GPU-RENDER.md)
- `gpuTerrain.ts` (274) LOD clipmap: height/colour textures from `TerrainLod` blocks, displaced grids, tile edge blend, far lift + canopy, depth fog
- `gpuTerrainState.ts` (54) every matter state of live ground cells as a texture array for the finest levels
- `gpuStates.ts` (63) STATE_SHADER `blendStates` + uniform looks + packing; used by terrain, tile blocks, structures
- `gpuStructures.ts` (211) 3D bricks in an atlas texture; each brick box is rasterised, pixels walk its cells, shared depth
- `gpuStructShader.ts` (126) shader text for structures: shapes, DDA, surface textures, sun/cover light
- `gpuTileBlocks.ts` (159) tile walls/doors/windows as boxes from tile data, with their matter states
- `gpuSprites.ts` (254) billboards: sprite atlas + instanced quads
- `gpuLight.ts` (194) THE light pass: every pixel's sky light + AO, sun/moon and nearest point lights, each with shadow rays
- `gpuCasters.ts` (125) every drawn sprite as a shadow-casting card of its own shape, filed per 1 m column
- `gpuFarShade.ts` (86) cloud shade + sun rays over terrain height levels far from the eye
- `gpuSolid.ts` (218) 1 m solid field + ground heights around the eye for shadow rays (`shadowRay` GLSL)
- `gpuSurfaces.ts` (113) shared tile surface atlas (+ the surfaces matter states cover things with); `SURFACE_OUT` for the light pass
- `gpuParticles.ts` (155) motes as point sprites and rain streaks
- `gpuOverlay.ts` (61) held item buffer composited on top
- `gpuSky.ts` (82) full-screen sky: gradient, sun, moon, stars, aurora
- `gpuClouds.ts` (306) air cells in a texture array, walked nearest first per pixel; each clump one solid shape (look set at its entry face, no inside faces), cut at the scene depth
- `gpuPost.ts` (142) low-res colour+depth target and the dither/vignette/tint finish
- `gpuAir.ts` (56) floating air motes from `AirDef` (biome/realm data)
- `glUtil.ts` (84) shader/texture helpers, camera basis and view-projection

## src/render/materials/
- `textures.ts` (197) tileable procedural textures from surface layers

## src/render/raycaster/
- `camera.ts` (58) per-frame projection values
- `cloudShadow.ts` (78) cloud shadows on the land
- `lodLooks.ts` (57) far colours of biomes
- `terrainLod.ts` (263) cached LOD pyramid for far land (C)
- `terrainLodPaint.ts` (184) paints changed chunks (tiles, matter states) over a LOD block's seed picture
- `tileBillboards.ts` (169) tree/rock billboards from tiles

## src/render/ui/
- `bag.ts` (486) BagWindow: draggable inventory window (C)
- `bagParts.ts` (149) bag constants, icon urls, item description, layout store
- `paperdoll.ts` (254) C key: armour slots and the hand slot, drag to take off
- `paperdollStats.ts` (52) the paperdoll's side panel: health, protection, hands, skills
- `settingsMenu.ts` (258) Esc/O menu built from settings data + cheat tab
- `style.ts` (132) HUD CSS from content/hud.ts
- `ui.ts` (658) GameUI: HUD, dialogue, journal, map, runebook (C)
- `paperdollFigure.ts` (81) The paperdoll's figure: your own body sprite in what you wear and hold, turned with the mouse wheel

## src/render/vfx/
- `particleKinds.ts` (90) particle kinds, physics, mote look tables
- `particles.ts` (458) Particles: visual effects from events and state (C)
- `fireEmitter.ts` (46) Where fire's motes go: the particle system draws them from the palette in the fire rules.
- `glow.ts` (86) Light painted straight over the frame: glows, lines, specks. Shared by the held item and its sparks.

## src/settings/
- `settings.ts` (222) settings as data + localStorage store

## src/sim/ai/
- `aiSystem.ts` (173) Every creature (animal, monster or villager) thinks the same way: now and then it senses what is
- `behaviours.ts` (153) The shared library of behaviours every creature brain picks from (content/living.ts).
- `handling.ts` (51) Brain behaviours for hands: grabbing loose items into the bag and throwing them at enemies (the player's own p
- `senses.ts` (127) What a creature notices when it stops to think, and the small moves every behaviour shares.

## src/sim/cheats/
- `cheatSystem.ts` (225) debug cheats executed as sim actions

## src/sim/ecology/
- `ecologySystem.ts` (107) The living world: wildlife comes and goes around the party according to habitat and time of

## src/sim/effects/
- `effectsSystem.ts` (81) effect queue loop
- `entityEffects.ts` (265) effects on bodies: guard, armour, reactions, death
- `spotEffects.ts` (123) effects on tiles/cells: ignite, strike, soak, coat
- `temperature.ts` (107) temperature of tiles/cells: heat dries then burns, cold freezes wet, spots settle back
- `touch.ts` (53) What bodies get from what they stand in or on: one data-driven pass over ground tiles and 3D cells alike

## src/sim/
- `breakage.ts` (18) ctx.breakItem: an item's onBreak burst + what it breaks into
- `inputQueue.ts` (141) queueing/folding of guest inputs
- `simLoop.ts` (446) Simulation class: step order, commands, realm travel, wipe check, prediction (C)
- `simState.ts` (96) rng, createState, newPlayer
- `templates.ts` (65) Builds an entity from its definition. Only instance data lives on the entity.

## src/sim/interaction/
- `interactionSystem.ts` (261) The world's own rules: fire grows, spreads (faster downwind and through oil), throws sparks on

## src/sim/magic/
- `magicSystem.ts` (188) Casting. The prepared spell is composed from runes (content/spellcraft.ts): a delivery (bolt,

## src/sim/melee/
- `meleeSurface.ts` (91) striking walls/doors/trees; wearHeld (held item wears and breaks)
- `meleeSystem.ts` (233) How hard a shove of weight 1 pushes, in m/s (the weapon's own push and the swing's knock scale it).

## src/sim/persistence/
- `persistence.ts` (263) save/load with fflate

## src/sim/physics/
- `impacts.ts` (79) fast loose things hurt, onImpact bursts, thrown items take a blow and break
- `physicsSystem.ts` (266) Knockback left after each tick (it fades in about a third of a second).
- `spatialHash.ts` (41) Uniform grid of entities, rebuilt once per tick. Answers "what is near here?" cheaply.

## src/sim/player/
- `playerSystem.ts` (222) First-person control: walking, sprinting, swimming, jumping, gliding, carrying and throwing,

## src/sim/rpg/
- `gearHandling.ts` (67) put on / take off armour, hold anything in the hands
- `throwing.ts` (113) throw from the bag, G throw/drop from the hands, pick up from the view
- `rpgSystem.ts` (184) Progression: skills that grow by doing (blade, evocation, athletics, speech), picking things up,

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
- `chunkgen.ts` (202) Builds a chunk from the seed alone. Same seed, same chunk — on every machine.
- `city.ts` (237) cityLayout: walls, gates, streets, wards
- `cityParts.ts` (84) city constants, houses
- `cityWall.ts` (153) one wall round the merged outline of rectangles: towers, runs, gates
- `cityWard.ts` (152) one ward: keep, landmarks, blocks
- `crossings.ts` (201) Where water meets people. Bridges come with the ways (sim/world/roads.ts routes each way straight across the water it
- `decks.ts` (174) Decks over water: bridges where a way crosses a river or lake, piers where a port meets the water. One shape of thing
- `matter.ts` (224) ctx.matter: stuff at (x,y,z) for tiles and cells
- `noise.ts` (59) Small, fast, seedable noise helpers. Pure functions of (seed, coords).
- `realms.ts` (93) Who goes along when the party changes realm: the travellers and what they carry.
- `roads.ts` (112) ways per region: waysTouching, wayHit
- `sites.ts` (294) World is divided into 256 m regions; each may hold one site (kinds and odds in content/sites.ts).
- `terrain.ts` (223) The shape of the land: continents, rolling hills, ridged mountains, a moisture field for biomes,
- `underworld.ts` (164) The underworld's chunks: tiles, water and ground from `underAt`, a sealed rock roof as 3D cells, hall spots, far sampler
- `underSpot.ts` (132) `underAt`: what the underworld is at a tile (river, deck, cave, ruin street, hall, corridor, way artery, rock), read from the land
- `underPlan.ts` (112) per-region plan of what the places above ask of the rock: caves, great halls, denser tunnels
- `volume.ts` (283) VolumeStore: sparse 3D brick store (C)
- `brickData.ts` (87) a brick as data: run-packing for saves/network, fresh cell-state arrays
- `water.ts` (224) Rivers and lakes: a pure function of the seed that reads no places (cities and roads read it, never the other way).
- `wayParts.ts` (137) way types, site neighbours, nets
- `wayRoute.ts` (213) route cost, bridging, way between two places
- `worldPopulate.ts` (203) raises buildings, furnishes halls, spawns people
- `worldSystem.ts` (144) keeps world around the party: places, chunk unloading
- `worldTiles.ts` (239) The tile world: lazily generated chunks held in SimState, with change tracking.
- `gateRule.ts` (13) Says which street ends of a walled place roads really use (set by roads.ts, which knows the land). A gate open

## src/types/
- `cheats.ts` (71) Debug cheats: shapes only. The list of cheats is data (src/content/cheats.ts), the menu builds
- `commands.ts` (10) The only way the outside world (input, network) changes the simulation.
- `defs.ts` (82) Content type + re-exports of defs/*
- `effects.ts` (63) Kinds of harm. Materials scale each one (stone shrugs off cuts, wood hates fire).
- `entities.ts` (231) Entity and its components
- `events.ts` (64) Things that happened during a tick. Audio, render effects, UI and the network react to these.
- `gear.ts` (199) gear types: body parts, HAND_SLOT, forms, materials, qualities, enchantments, rolls, wear requests
- `index.ts` (20) re-exports all types
- `input.ts` (93) Letting go of an item from the bag over the view: where the cursor was decides the throw.
- `items.ts` (48) Inventory helpers shared by every system that touches items.
- `math.ts` (10) 
- `matter.ts` (94) MATTER — one way to talk about "the stuff at a place", whatever holds it.
- `net.ts` (53) co-op message types
- `palettes.ts` (22) Colour as data. Pictures are never painted in fixed colours: every part of a creature, tree,
- `sky.ts` (95) RGB, 0..255.
- `state.ts` (133) SimState and queues
- `structures.ts` (173) StructureDef, planned structures, house geometry
- `tiles.ts` (217) tile/chunk types, TileInfo, keys
- `vfx.ts` (86) World motes that are not spells: fire, smoke, sparks, splashes, blood, dust, frost glitter.
- `volume.ts` (135) 3D layer brick/volume types
- `world.ts` (70) A named place in the world. Registered by the world system as players come near.
- `worldgen.ts` (202) surface, biome, water and world-generation defs
- `art.ts` (203) One recipe type for every picture built from parts: creatures, people, trees, rocks, plants, props (one assemb

## src/types/defs/
- `brains.ts` (115) BehaviourDef, BrainDef, loot, habitats, population
- `ids.ts` (23) id string types
- `items.ts` (96) ItemDef, ItemLook
- `magic.ts` (194) SpellDef, RuneDef, StatusDef and spell look
- `rules.ts` (229) RulesDef, SwingDef, DayRules, HudTheme
- `sites.ts` (146) SiteDef, layouts, city, districts
- `social.ts` (62) quests, trade, roles, factions
- `things.ts` (190) MaterialDef, ThingDef, RealmDef, light, weapon stats
- `handling.ts` (51) How a weapon handles: per-angle timing, damage, knockback and stamina, charging, impact and throwing (all mult
