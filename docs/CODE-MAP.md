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
- `settlementSmoke.ts` (198) Settlements and cities in the 3D layer: villages raise real buildings with furniture inside,
- `simSmoke.ts` (26) Headless smoke test: run the sim for a while and report what happened.
- `bootSmoke.mjs` (46) Boots the bundled game in a real browser (`npm run check:boot`, needs Playwright): no load errors, journey starts, a world swap keeps one view canvas
- `skySmoke.ts` (285) Sky checks: cloud layers as data, rain only under storm cells, clouds drifting with the wind,
- `torchSmoke.ts` (94) Headless checks for torches: the wall-mounted kind in buildings and halls, and the one you hold
- `viewmodelShot.ts` (150) renders held-weapon PNGs (owned by the viewmodel thread)
- `volumeSmoke.ts` (295) The 3D layer: shapes, the brick store, standing on stairs and ramps, bumping heads, buildings
- `waterSmoke.ts` (427) check: rivers, lakes, bridges, piers, harbours
- `waysSmoke.ts` (205) WAYS: roads, paths and trails join the places of the world, and the underworld follows them.
- `worldSmoke.ts` (260) Headless checks for data-driven world generation and the far-away terrain: biomes come from
- `check.mjs` (78) One runner for every check, with short output (only failures + one summary line per script).
- `codemap.mjs` (81) Keeps docs/CODE-MAP.md true by itself: refreshes every line count, adds new files (purpose taken
- `senseSmoke.ts` (108) Checks: creatures see in 3D (height and line of sight), one "is it dark here" check, and what bodies stand in
- `outfitSmoke.ts` (105) Headless checks: creatures are found wearing and holding real gear (their outfit), fight with what they hold
- `smokeKit.ts` (63) Shared helpers for the headless smoke checks: seeded rng, flat arena, a joined traveller, PASS/FAIL counting
- `matterFireSmoke.ts` (89) MATTER and fire: a timber wall burns like brush, thatch catches from burning grass, fire climbs, and fire
- `matterKit.ts` (52) Shared helpers for the matter checks: a calm world, flat ground, stepping, PASS/FAIL counting, common cells
- `handsSmoke.ts` (96) Headless checks: creatures carry a bag (players' own kind), spill all of it when they die, and their brains
- `musicSmoke.ts` (188) Music checks (no WebAudio needed): cues land on the beat in the key, events pick the right cue, combos climb,
- `craftSmoke.ts` (253) CRAFTS: the airship is cells of the 3D layer flown as one frame: decks hold you up and carry you, stations, fu
- `fineSmoke.ts` (64) FINE CELLS: a 3D cell split into 2 x 2 x 2 half-metre cells; the shape palette, splitting, standing, saving, f
- `doorSmoke.ts` (70) DOORS: one rule for a door tile on the ground and a door leaf in a wall of the 3D layer: open, shut, burn, fre
- `hullTight.ts` (74) Is a swept hull tight? Fills its fine cells' real shapes at an eighth of a metre and floods the outside air: n
- `shipSmoke.ts` (298) THE AIRSHIP'S BUILD: a tight hull and envelope, stations on both decks, a hold among crates, lanterns, windsoc
- `glideSmoke.ts` (77) GLIDERS: each cloth flies its own way (data): burlap only slows your fall, wyvern hide soars, dives and climbs
- `townSmoke.ts` (127) Townsfolk: they find their way round walls and in through doors (ground and 3D cells), keep routines, and answ
- `citySmoke.ts` (157) Walled cities and megacities in the 3D layer: walls, gates, streets, districts and a keep, with no buildings o
- `siteKit.ts` (64) Shared helpers for the settlement and city checks: a calm world, stepping, finding a site of a kind, walking i
- `partySmoke.ts` (96) Party: townsfolk join for a fee, follow and fight with the travellers, and carry and wear what they are given
- `underSmoke.ts` (133) UNDERWORLD BIOMES: regions dug their own way, rooms, galleries, pits and pools, dark rivers, doors and locks,
- `barkSmoke.ts` (63) Barks: talkers say a line from their bark set when hurt or when their plan changes, keep quiet a while after,

## src/audio/
- `engine.ts` (268) Sound building blocks. Every sound in the game is made from three things: an oscillator,
- `gameAudio.ts` (243) GameAudio class: reacts to sim events/state, owns ambience, steps, voices, spells, music hookup (C)
- `ambience.ts` (187) The ambient bed: wind, rain, fire, water and cave air that follow your surroundings, plus one-shots from ambie
- `ambientSounds.ts` (77) Ambient one-shots as data: birds, owls, frogs, drips, rumbles… each says where it belongs (under open sky or d
- `bodySounds.ts` (195) Sounds of bodies and blows: steps, swings, strikes, hits, deaths, voices, spells, traps, frost, breakage, gear
- `craftSounds.ts` (211) The airship's sounds: a hum, drive rumble and rigging wind that follow its speed, creaks aboard, lever notches
- `worldSounds.ts` (163) Sounds of things in the world: statuses, doors, throws, impacts, fire, water, jumps, pickups, chests, speech,

## src/audio/music/
- `composer.ts` (237) The composer writes sections: a key, a tempo, a meter, a chord progression, a melody motif
- `conductor.ts` (299) MusicEngine: picks the style that fits the mood and plays it bar by bar (C)
- `instruments.ts` (90) INSTRUMENTS table collecting the patches
- `mixer.ts` (188) The music mixing desk: one bus per style (with its own tone filter and reverb sends), one
- `patchesPercussion.ts` (198) drum, noise and effect patches (taiko, snare, swell, rise...)
- `patchesSustained.ts` (141) winds, bowed, choir and pad patches
- `patchesTuned.ts` (69) Plucked and bell-like patches: harp, lute, celesta, bell, glass, pluck bass.
- `signalProbes.ts` (199) probes that read the game into mood signals, smoothing constants
- `signals.ts` (221) MoodSignals types, event impulses, MoodTracker
- `styleTypes.ts` (155) Meter/Layer/StyleDef types, METERS, shared rhythm cells
- `styles.ts` (56) collects the style tables into STYLES / StyleId
- `stylesDanger.ts` (187) Moods of danger and loss: tension … lament.
- `stylesDay.ts` (234) Moods of daylight, travel and rest: wander … aurora.
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
- `voices.ts` (293) Creature voices, grown from the creature's own definition instead of picked from a list.
- `speech.ts` (166) Speaking voices: one synth that reads a VoiceDef (pitch, pace, lilt, breath, rasp, throat) and sings words or

## src/clock/
- `ticker.ts` (20) A steady beat that keeps going when the page is in the background. Browsers stop drawing

## src/content/
- `biomes.ts` (102) Kinds of landscape. Each point of land takes the first biome (in this order) whose `when` fits
- `cheats.ts` (72) Every debug cheat, as data. The Debug cheats menu builds one row per entry (in this order, under
- `day.ts` (41) The one day-and-night clock. Times are a share of the day: 0 is midnight, 0.25 six in the
- `effects.ts` (40) Bursts of motes for things that happen in the world (not spells: those have their own look in
- `forms.ts` (187) trees, bushes, rocks, stones, plants as pieces (D)
- `gear.ts` (63) gear as data: body parts, hand slot, forms (garments + weapons), materials, qualities, enchantments
- `gearItems.ts` (164) gear ids -> item definitions, random rolls, outfits, which body part a blow lands on
- `gearCheck.ts` (60) gearProblems: the gear tables are sound
- `itemDefs.ts` (117) itemDef for every id (wear `@N`, durability), held-item weapon stats, break reactions, wear helpers
- `helpers.ts` (124) content lookups: thingDef, weaponStats, rollLoot, fillText, isDisabled...
- `hud.ts` (45) Colours of the screen furniture (bars, panels, menus, map marks). The interface turns each into a
- `index.ts` (96) collects every table into CONTENT, re-exports helpers, runs validation
- `items.ts` (112) Inventory goods. A new potion, food, throwable or weapon is just a new entry here.
- `living.ts` (133) Creature minds. Each brain lists behaviours from the shared library (sim/ai/behaviours.ts) in
- `looks.ts` (175) creature looks as solid parts (D)
- `loot.ts` (134) Drop tables: each entry rolls on its own.
- `materials.ts` (30) How stuff reacts physically. Every tile and thing made of a material behaves the same way.
- `palettes.ts` (62) Palettes: the colours that fill the colour regions of every picture (creatures, trees, rocks,
- `props.ts` (232) Props as forms: barrels, crates, chests, urns, torches, campfires and trap plates are put
- `realms.ts` (66) The spaces the world is made of. A realm is a place with its own ground, light and sky; the whole
- `roles.ts` (124) Villager jobs: what they add to a greeting, what they keep on the rack, the trouble they ask
- `rules.ts` (131) World-wide rules that are not one definition: how bodies react to heat, water and cold, how
- `runes.ts` (254) Runes, the syllables of magic. Up to three make a spell in the runebook:
- `shapes.ts` (268) The simple shapes every 3D structure is snapped together from. A shape is one or more convex
- `sites.ts` (287) named places: odds, layout, population (D)
- `sky.ts` (41) The sky and air. Each cloud/mist layer is a sheet of drifting shapes at its own height, size and speed, and
- `skyField.ts` (262) Where the clouds are (`airColumn`: every layer into air cells). One pure function of the sky data, the weather (cover, storminess, how far
- `spellcraft.ts` (286) composes a spell from up to 3 runes; spell descriptions
- `matterStates.ts` (20) How soot, wet, oil, frost and fire look blended over the stuff they are on (never replacing it).
- `statuses.ts` (37) Ongoing conditions. Each one can cancel or block others, tick effects and change movement.
- `structures.ts` (213) building recipes for the 3D layer (D)
- `surfaces.ts` (248) Procedural surfaces: every ground, wall and floor look, as a base colour plus layers of noise,
- `things.ts` (300) entity archetypes by trait (D)
- `tileCodes.ts` (22) The tile ledger: the lasting number of each tile kind, which chunks and saves store.
- `tiles.ts` (229) all tile kinds + code assignment from the ledger
- `validate.ts` (288) validateContent: every reference must point at something that exists
- `viewmodel.ts` (36) held-item hand poses (viewmodel thread)
- `world.ts` (54) World-wide generation choices. The land is the sum of its layers (continents, hills, ridged
- `artCheck.ts` (41) Checks every art recipe (creatures, trees, props): known colour slots, parents and features, sane gait
- `smallForms.ts` (253) Bushes, rocks, plants and small heaps (haystacks, woodpiles, wells, rubble) grown from parts, like trees (form
- `itemGearArt.ts` (124) Gear pictures as art pieces: weapon parts (grip, guard, blade, haft, heads) and the four kinds of armour
- `itemGoodsArt.ts` (137) Everyday item pictures as art pieces: vessels, torch, coin, key, food, pelt, shard, rune stone, bundle, lump
- `creatures.ts` (158) Creatures and people as thing definitions: bodies, natural weapons, brains, and the outfit (real gear) they ar
- `handling.ts` (87) How a weapon handles, worked out: its damage kind's profile, its weight, then its own overrides (data in rules
- `bodyPlans.ts` (172) Body plans as reusable parts (two legs, four legs, hopper, antlers): segmented limbs on joints, roles for body
- `moves.ts` (78) Body moves seen from outside: how arms, torso, head (or a beast's neck) turn through each swing direction and
- `crafts.ts` (165) Crafts as data: the airship's hull (boxes of cells), what is fitted aboard, and how it flies
- `shipProps.ts` (216) Airship fittings as art: the wheel, lever and aether tank, each in five pictures that show its state (gauge fr
- `shapeTable.ts` (124) The shape palette of the 3D layer as data: every shape a cell (1 m) or a fine cell (half a metre) can take
- `hullSweep.ts` (64) Curved hulls as fine cells: every half-metre cell inside a solid is kept where it shows, shaped by which sides
- `routine.ts` (30) Where a townsperson means to be right now: their role's routine for this part of the day, one place per day.
- `talk.ts` (23) The words of conversation: topic labels and answer templates for asking townsfolk about places and people.
- `sitesWards.ts` (107) City districts and megacity wards as data: what each quarter builds, what it is built of, how it is paved and
- `structuresCivic.ts` (242) Recipes for stone and civic buildings in the 3D layer: towers, ruins, gatehouses, barracks, church, keep, city
- `surfacesBuild.ts` (179) Building surfaces: brick, dressed stone, timber frame, daub, washes, roofs, floors and street paving (merged i
- `propsUnder.ts` (103) Underworld prop pictures: sarcophagus, bones, candles, lectern, altar, weapon rack, trap plates (merged into t
- `surfacesUnder.ts` (88) Underworld surfaces: tomb stone, grave slabs, hewn rock, ore, flowstone, books, iron-bound boards, great pavin
- `thingsUnder.ts` (90) Underworld things: sarcophagi, bone heaps, candles, mine lamps, lecterns, altars, weapon racks and trap plates
- `tilesUnder.ts` (26) Underworld tiles: tomb masonry, mine rock and ore, flowstone, timber props, bookshelves, iron-bound doors, pav
- `underBiomes.ts` (159) Underworld biomes: halls, caves, crypts, mines, archives and drowned grottoes, each with its rooms and what li
- `barks.ts` (56) Bark lines of townsfolk (and the folk hired into the party), by moment (see BarkSet in types/defs/speech.ts)
- `barksFoes.ts` (65) Bark lines of raiders and hexers, by moment (see BarkSet in types/defs/speech.ts)
- `speech.ts` (43) Speaking voices (ranges each person picks from) and how often talkers bark; the lines are in barks*.ts
- `airWet.ts` (77) How damp the air is over a map spot: the land's moisture (coarse) and open water close by (fine), which clouds

## src/input/
- `input.ts` (185) keyboard+mouse -> InputSnapshot per tick and local UI actions
- `keyboard.ts` (37) Tracks held keys and keys pressed since the last poll (edge-triggered).
- `mouse.ts` (61) Pointer-lock mouse look plus button state. Yaw is applied instantly so looking feels smooth at any sim rate.
- `quickSlots.ts` (37) The quick-use keys 1..4 (H and G still work as keys 1 and 2). Each holds an item id, or

## src/
- `main.ts` (313) the only wiring: input -> sim (or guest replica) -> net/audio/render
- `settingsLink.ts` (66) Hands the remembered settings to sound, view and controls (on start and on every change), and sizes the view's

## src/net/
- `messages.ts` (201) validate and shape every co-op message
- `net.ts` (275) PeerJS transport: host/guest connections, snapshots
- `prediction.ts` (76) guest-side view and input replay

## src/render/
- `color.ts` (50) packed pixel colour helpers
- `env.ts` (144) the light and air of the moment (Env): sun path, sky colours, cloud light, fog = sky at the horizon or the cloud you stand in
- `lighting.ts` (136) gathers every light from shared data (`LightMap.lights`; fire from the `fire` matter state); lights the held item in 3D (`sample`); `poseBetween` = a craft drawn between ticks; re-exports Env
- `airSmoke.ts` (170) smoke: the live level of the air cells; burning spots feed it, it rises, spreads and thins in steps
- `stateLooks.ts` (70) matter-state looks flattened for the GPU uniforms and far-land tint (`tintFar`)
- `palette.ts` (82) Turns colour choices ('#rrggbb' or '@palette', see types/palettes.ts) into packed pixels, and
- `adaptiveRes.ts` (50) adaptive pixel size from frame time
- `renderer.ts` (218) frame orchestration: camera, env, lights, billboards, particles, then the GPU frame
- `viewport.ts` (33) the low-resolution frame size; the GPU canvas lies over it
- `airGrids.ts` (45) A square grid of map cells round the eye, stored wrapped and filled nearest first within a time budget (moistu
- `airLevels.ts` (89) Plans the air cells round the eye: LOD levels (each twice as wide), where each sits and which to rebuild this 

## src/render/entities/
- `bodyMath.ts` (49) 3x3 matrix helpers for posing parts
- `bodyPaint.ts` (294) ray-intersect solids into colour-region pixels
- `itemArt.ts` (165) paints an item: its parts in order (one picture per item), other base forms, world size
- `spriteRenderer.ts` (224) gathers billboards (trees, creatures, props, items) for the GPU
- `sprites.ts` (55) sprite type and registry
- `viewModel.ts` (272) held weapon as small 3D scene (being replaced by sprites)
- `spriteWarp.ts` (168) Flat sprites made to read as 3D motion. A held item is just its item picture (itemArt.ts); a
- `artGrow.ts` (264) Builds one individual of any art recipe into placed solids: fixed parts at their spots (joints), grown parts b
- `artSprites.ts` (166) Picks the picture for any entity drawn from art (creature, person, prop): which individual, pose, frame and si
- `assembler.ts` (246) The one sprite assembler: builds any art recipe (creature, tree, prop), poses it and paints it from 8 sides, o
- `itemLook.ts` (93) What an item looks like, worked out from its definition: base shape, colours, size, gear parts (no item ids)
- `gearArt.ts` (96) Worn armour and the held item laid onto any creature's art recipe: shells over the parts each slot covers, the
- `viewFx.ts` (109) Motes over the held item: flames at a burning head, sparks, drops and puffs, advanced and painted each frame.
- `viewPose.ts` (152) Held-item motion: poses as a hand position + blade direction, swing paths along arcs, and smooth settling betw
- `itemCard.ts` (46) An item's bag picture as a card a body holds: where its grip is and which way it points on the picture
- `paintFinish.ts` (117) Last touches on a painted body picture: dark outlines, and flat item pictures (held items) stamped facing the
- `viewGlider.ts` (235) Your own open glider in first person: a cloth canopy that snaps open overhead, ripples with your speed and ban

## src/render/gpu/
- `gpuRenderer.ts` (220) GPU pipeline orchestration: one WebGL2 canvas, passes sky, terrain, air, post (docs/GPU-RENDER.md)
- `gpuTerrain.ts` (278) LOD clipmap: height/colour textures from `TerrainLod` blocks, displaced grids, tile edge blend, far lift + canopy, depth fog
- `gpuTerrainState.ts` (54) every matter state of live ground cells as a texture array for the finest levels
- `gpuStates.ts` (65) STATE_SHADER `blendStates` + uniform looks + packing; used by terrain, tile blocks, structures
- `gpuStructures.ts` (286) 3D bricks in an atlas texture; each brick box is rasterised, pixels walk its cells, shared depth
- `gpuStructShader.ts` (165) shader text for structures: shapes, DDA, surface textures, sun/cover light
- `gpuTileBlocks.ts` (159) tile walls/doors/windows as boxes from tile data, with their matter states
- `gpuSprites.ts` (256) billboards: sprite atlas + instanced quads
- `gpuLight.ts` (253) THE light pass: every pixel's sky light + AO, sun/moon and nearest point lights, each with shadow rays
- `gpuCasters.ts` (125) every drawn sprite as a shadow-casting card of its own shape, filed per 1 m column
- `gpuFarShade.ts` (70) cloud shade + sun rays over terrain height levels far from the eye
- `gpuSolid.ts` (243) 1 m solid field + ground heights around the eye for shadow rays (`shadowRay` GLSL)
- `gpuSurfaces.ts` (116) shared tile surface atlas (+ the surfaces matter states cover things with); `SURFACE_OUT` for the light pass
- `gpuParticles.ts` (169) motes as point sprites and rain streaks
- `gpuOverlay.ts` (61) held item buffer composited on top
- `gpuSky.ts` (82) full-screen sky: gradient, sun, moon, stars, aurora
- `gpuClouds.ts` (255) air cells in a texture array, walked nearest first per pixel; each clump one solid shape (look set at its entry face, no inside faces), cut at the scene depth
- `gpuPost.ts` (142) low-res colour+depth target and the dither/vignette/tint finish
- `gpuAir.ts` (65) floating air motes from `AirDef` (biome/realm data)
- `glUtil.ts` (96) shader/texture helpers, camera basis and view-projection
- `gpuFrameShade.ts` (125) Shadows of moving frames (an airship): each frame's cells as a small 1 m grid the light rays march through, tu
- `gpuSpeedLines.ts` (81) Speed lines: thin streaks hanging still in the air around the eye, each drawn stretched along how fast the eye
- `gpuLightSpread.ts` (105) Smoothed lighting: light worked out at half or quarter resolution, spread to every pixel only from samples on
- `gpuReflect.ts` (134) Reflections: shiny surfaces (shine from surface and matter-state data, written beside each pixel's normal) mir
- `gpuAirFill.ts` (215) Fills the air cells on the graphics card: every sky layer into one stack of 3D cell levels, by the skyField ru
- `gpuCloudShade.ts` (129) Cloud shadows: sun light walked up through the air cells into two maps round the eye, which the light pass rea
- `gpuGodRays.ts` (126) Sun rays (god rays): light streaming past clouds, hills, trees and walls toward the eye, from the depth and cl

## src/render/materials/
- `textures.ts` (197) tileable procedural textures from surface layers

## src/render/raycaster/
- `camera.ts` (69) per-frame projection values
- `lodLooks.ts` (57) far colours of biomes
- `terrainLod.ts` (187) cached LOD pyramid for far land (C)
- `terrainLodPaint.ts` (184) paints changed chunks (tiles, matter states) over a LOD block's seed picture
- `tileBillboards.ts` (169) tree/rock billboards from tiles
- `terrainLodBuild.ts` (145) Builds one far-land block a row at a time (seed samples first, then colours), so a block never stalls a frame.

## src/render/ui/
- `bag.ts` (289) BagWindow: draggable inventory window (C)
- `bagParts.ts` (149) bag constants, icon urls, item description, layout store
- `paperdoll.ts` (266) C key: armour slots and the hand slot, drag to take off
- `paperdollStats.ts` (52) the paperdoll's side panel: health, protection, hands, skills
- `settingsMenu.ts` (258) Esc/O menu built from settings data + cheat tab
- `style.ts` (132) HUD CSS from content/hud.ts
- `ui.ts` (626) GameUI: HUD, dialogue, journal, map, runebook (C)
- `paperdollFigure.ts` (81) The paperdoll's figure: your own body sprite in what you wear and hold, turned with the mouse wheel
- `prompt.ts` (56) The line under the crosshair: what pressing E (or F, or jumping) would do with what you are looking at
- `storeWindow.ts` (101) The hold window: what a store keeps (a ship's hold) beside what is in your bag; click a stack to move it acros
- `bagArea.ts` (246) A bag's leather area: one picture per stack lying where you put it, click to name, double-click to use, drag t
- `movable.ts` (38) Windows you drag by their title bar: kept on screen, told where they ended up so they can remember it

## src/render/vfx/
- `particleKinds.ts` (90) particle kinds, physics, mote look tables
- `particles.ts` (280) Particles: visual effects from events and state (C)
- `fireEmitter.ts` (47) Where fire's motes go: the particle system draws them from the palette in the fire rules.
- `glow.ts` (86) Light painted straight over the frame: glows, lines, specks. Shared by the held item and its sparks.
- `spellEmitters.ts` (161) Spell motes: the bloom of a bolt bursting, cones, novas, wards, the casting hand and a bolt's trail, all from
- `thingEmitters.ts` (62) Motes things give off every frame: flames on what burns with firelight, smoke and trails, a held torch, burnin
- `glideTrails.ts` (44) Light trails behind open gliders: a line of glowing motes left hanging in the air from each wingtip (the glide
- `crumble.ts` (178) Death crumble: a dying body's picture falls apart into its own pixels, which tumble down, blow about, settle a

## src/settings/
- `settings.ts` (184) settings as data + localStorage store
- `videoSettings.ts` (153) Video settings as data: pixel size, view feel, and each part of the lighting with presets that set them all at

## src/sim/ai/
- `aiSystem.ts` (195) Every creature (animal, monster or villager) thinks the same way: now and then it senses what is
- `behaviours.ts` (175) The shared library of behaviours every creature brain picks from (content/living.ts).
- `handling.ts` (51) Brain behaviours for hands: grabbing loose items into the bag and throwing them at enemies (the player's own p
- `senses.ts` (151) What a creature notices when it stops to think, and the small moves every behaviour shares.
- `paths.ts` (210) Finds a walkable way between two points (A* over 1 m cells: ground, walls of the 3D layer, doors, deep water)
- `carrying.ts` (57) Brain behaviours for big things: lifting crates and pots, heaving them at enemies, and smashing loot boxes ope

## src/sim/cheats/
- `cheatSystem.ts` (225) debug cheats executed as sim actions

## src/sim/ecology/
- `ecologySystem.ts` (107) The living world: wildlife comes and goes around the party according to habitat and time of

## src/sim/effects/
- `effectsSystem.ts` (87) effect queue loop
- `entityEffects.ts` (278) effects on bodies: guard, armour, reactions, death
- `spotEffects.ts` (127) effects on tiles/cells: ignite, strike, soak, coat
- `temperature.ts` (107) temperature of tiles/cells: heat dries then burns, cold freezes wet, spots settle back
- `touch.ts` (53) What bodies get from what they stand in or on: one data-driven pass over ground tiles and 3D cells alike

## src/sim/
- `breakage.ts` (18) ctx.breakItem: an item's onBreak burst + what it breaks into
- `inputQueue.ts` (142) queueing/folding of guest inputs
- `simLoop.ts` (362) Simulation class: step order, commands, realm travel, wipe check, prediction (C)
- `simState.ts` (95) rng, createState, newPlayer
- `templates.ts` (67) Builds an entity from its definition. Only instance data lives on the entity.
- `foresight.ts` (44) A guest's foresight: one tick of its own traveller (and the crafts it may stand on) by the host's rules, touch
- `travel.ts` (84) Moving the party between realms: travel through a way down or up, and a party wipe carrying them to the surfac

## src/sim/interaction/
- `interactionSystem.ts` (280) The world's own rules: fire grows, spreads (faster downwind and through oil), throws sparks on

## src/sim/magic/
- `magicSystem.ts` (188) Casting. The prepared spell is composed from runes (content/spellcraft.ts): a delivery (bolt,

## src/sim/melee/
- `meleeSurface.ts` (91) striking walls/doors/trees; wearHeld (held item wears and breaks)
- `meleeSystem.ts` (233) How hard a shove of weight 1 pushes, in m/s (the weapon's own push and the swing's knock scale it).

## src/sim/persistence/
- `persistence.ts` (263) save/load with fflate

## src/sim/physics/
- `impacts.ts` (79) fast loose things hurt, onImpact bursts, thrown items take a blow and break
- `physicsSystem.ts` (267) Knockback left after each tick (it fades in about a third of a second).
- `spatialHash.ts` (41) Uniform grid of entities, rebuilt once per tick. Answers "what is near here?" cheaply.

## src/sim/player/
- `playerSystem.ts` (235) First-person control: walking, sprinting, swimming, jumping, gliding, carrying and throwing,
- `climbing.ts` (82) Holding on to a chain (an anchor's): touch one off the ground and you hold it; forward climbs the way you look
- `gliding.ts` (32) Gliding as data: how a glider's cloth turns your heading and look into flight, from a gentle drift down to a s

## src/sim/rpg/
- `gearHandling.ts` (81) put on / take off armour, hold anything in the hands
- `throwing.ts` (113) throw from the bag, G throw/drop from the hands, pick up from the view
- `rpgSystem.ts` (222) Progression: skills that grow by doing (blade, evocation, athletics, speech), picking things up,
- `carrying.ts` (29) Lifting and heaving big things (crates, pots, barrels) in both hands: one way for players and creatures (actor

## src/sim/social/
- `socialSystem.ts` (238) Conversation: greetings that depend on the hour and on what the party has done, rumours that
- `topics.ts` (75) Daggerfall-style topics: the "Where is..." and "Tell me about..." menus, and the answers townsfolk give from w
- `party.ts` (47) Hiring townsfolk into the party for a fee, seeing to their gear, and letting them go again.
- `barks.ts` (160) Barks: talkers blurt out a line when their brain changes plan or something happens to or near them (lines are

## src/sim/statuses/
- `statusSystem.ts` (32) Ticks ongoing conditions: counts them down and queues their repeating effects (burning hurts

## src/sim/structures/
- `builder.ts` (94) buildStructure entry: recipe -> cells

## src/sim/structures/builder/
- `arch.ts` (97) arches, walls, ruin decay
- `house.ts` (165) houses: floors, stairs, roofs, furnishing spots
- `placer.ts` (147) Placer: snap cells into the structure grid and world
- `furnish.ts` (56) Furniture spots inside a house: corners, walls, the back wall, the middle, each facing away from its wall
- `roofs.ts` (92) Roofs of the house form: gable and hip, with eaves and verges that overhang the walls by a metre

## src/sim/weather/
- `weatherSystem.ts` (54) One in-game day lasts this many real seconds.

## src/sim/world/
- `chunkgen.ts` (219) Builds a chunk from the seed alone. Same seed, same chunk — on every machine.
- `city.ts` (241) cityLayout: walls, gates, streets, wards
- `cityParts.ts` (96) city constants, houses
- `cityWall.ts` (153) one wall round the merged outline of rectangles: towers, runs, gates
- `cityWard.ts` (175) one ward: keep, landmarks, blocks
- `crossings.ts` (201) Where water meets people. Bridges come with the ways (sim/world/roads.ts routes each way straight across the water it
- `decks.ts` (174) Decks over water: bridges where a way crosses a river or lake, piers where a port meets the water. One shape of thing
- `matter.ts` (258) ctx.matter: stuff at (x,y,z) for tiles and cells
- `noise.ts` (59) Small, fast, seedable noise helpers. Pure functions of (seed, coords).
- `realms.ts` (94) Who goes along when the party changes realm: the travellers and what they carry.
- `roads.ts` (112) ways per region: waysTouching, wayHit
- `sites.ts` (298) World is divided into 256 m regions; each may hold one site (kinds and odds in content/sites.ts).
- `terrain.ts` (223) The shape of the land: continents, rolling hills, ridged mountains, a moisture field for biomes,
- `underworld.ts` (168) The underworld's chunks: tiles, water and ground from `underAt`, a sealed rock roof as 3D cells, hall spots, far sampler
- `underSpot.ts` (188) `underAt`: what the underworld is at a tile (river, deck, cave, ruin street, hall, corridor, way artery, rock), read from the land
- `underPlan.ts` (112) per-region plan of what the places above ask of the rock: caves, great halls, denser tunnels
- `volume.ts` (280) VolumeStore: sparse 3D brick store (C)
- `brickData.ts` (97) a brick as data: run-packing for saves/network, fresh cell-state arrays
- `water.ts` (224) Rivers and lakes: a pure function of the seed that reads no places (cities and roads read it, never the other way).
- `wayParts.ts` (137) way types, site neighbours, nets
- `wayRoute.ts` (213) route cost, bridging, way between two places
- `worldPopulate.ts` (184) raises buildings, furnishes halls, spawns people
- `worldSystem.ts` (145) keeps world around the party: places, chunk unloading
- `worldTiles.ts` (239) The tile world: lazily generated chunks held in SimState, with change tracking.
- `gateRule.ts` (13) Says which street ends of a walled place roads really use (set by roads.ts, which knows the land). A gate open
- `volumeFrames.ts` (100) Moving frames of the 3D layer (an airship): world questions asked again in each frame's own cells, turned and
- `volumeColumns.ts` (79) Standing, head room and solidity down one column of the 3D layer, whole cells and fine half-metre cells alike
- `volumeFine.ts` (76) Fine cells of the 3D layer: splitting a whole cell into eight half-metre cells and writing one of them
- `underBiome.ts` (79) Which underworld biome a hall node lies in, and which room its hall is: rolled from the seed, swayed by the la
- `underFurnish.ts` (119) Furnishes underworld halls, corridors and old roads near the party, once per chunk: realm, biome and room scat
- `underLevels.ts` (29) Upper levels of underworld halls as cells of the 3D layer: a gallery walkway along two walls and the stair up
- `underRooms.ts` (146) Underworld halls and corridors on the 16 m grid: which links are open, each hall's size and shape, and what is

## src/types/
- `cheats.ts` (71) Debug cheats: shapes only. The list of cheats is data (src/content/cheats.ts), the menu builds
- `commands.ts` (10) The only way the outside world (input, network) changes the simulation.
- `defs.ts` (90) Content type + re-exports of defs/*
- `effects.ts` (63) Kinds of harm. Materials scale each one (stone shrugs off cuts, wood hates fire).
- `entities.ts` (261) Entity and its components
- `events.ts` (72) Things that happened during a tick. Audio, render effects, UI and the network react to these.
- `gear.ts` (200) gear types: body parts, HAND_SLOT, forms, materials, qualities, enchantments, rolls, wear requests
- `index.ts` (21) re-exports all types
- `input.ts` (96) Letting go of an item from the bag over the view: where the cursor was decides the throw.
- `items.ts` (48) Inventory helpers shared by every system that touches items.
- `math.ts` (10) 
- `matter.ts` (104) MATTER — one way to talk about "the stuff at a place", whatever holds it.
- `net.ts` (53) co-op message types
- `palettes.ts` (22) Colour as data. Pictures are never painted in fixed colours: every part of a creature, tree,
- `sky.ts` (109) RGB, 0..255.
- `state.ts` (138) SimState and queues
- `structures.ts` (181) StructureDef, planned structures, house geometry
- `tiles.ts` (219) tile/chunk types, TileInfo, keys
- `vfx.ts` (86) World motes that are not spells: fire, smoke, sparks, splashes, blood, dust, frost glitter.
- `volume.ts` (200) 3D layer brick/volume types
- `world.ts` (72) A named place in the world. Registered by the world system as players come near.
- `worldgen.ts` (204) surface, biome, water and world-generation defs
- `art.ts` (203) One recipe type for every picture built from parts: creatures, people, trees, rocks, plants, props (one assemb
- `craft.ts` (120) Crafts (an airship): a box of 3D cells flown as one body, worked from stations by named control channels

## src/types/defs/
- `brains.ts` (129) BehaviourDef, BrainDef, loot, habitats, population
- `ids.ts` (23) id string types
- `items.ts` (116) ItemDef, ItemLook
- `magic.ts` (194) SpellDef, RuneDef, StatusDef and spell look
- `rules.ts` (236) RulesDef, SwingDef, DayRules, HudTheme
- `sites.ts` (160) SiteDef, layouts, city, districts
- `social.ts` (102) quests, trade, roles, factions
- `things.ts` (223) MaterialDef, ThingDef, RealmDef, light, weapon stats
- `handling.ts` (51) How a weapon handles: per-angle timing, damage, knockback and stamina, charging, impact and throwing (all mult
- `under.ts` (64) Underworld data shapes: biomes (regions that change how the rock is dug), their rooms and what lies in them
- `speech.ts` (52) How people sound and what they blurt out: a voice as ranges each person picks from, and bark lines keyed by mo

## src/sim/craft/
- `craftBuild.ts` (45) Makes a craft: its hull cells written into a quiet corner of the 3D layer and its fittings set aboard
- `craftMotion.ts` (124) Moves every craft by its own speed and turn, carrying whoever stands on it, and keeps its frame in the 3D laye
- `craftSystem.ts` (219) Crafts: stations taken and fed, horn calls answered, and flight worked out from the stations' channels, wind a
- `index.ts` (3) The craft system (airships): stations, calls, flight, and the motion shared with a guest's foresight
- `tether.ts` (109) Chains from a loose thing to a point aboard a craft (the anchor's): never longer than the chain; lying still o
