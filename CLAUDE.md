# Aetherfell 2: read this first (keep it short; every thread loads it)

**Game:** first-person co-op sandbox RPG to play with friends. Ultima Underworld + Daggerfall feel: a vast procedural
living world, dark ruins and an underworld, improvised plans, emergent chaos. Retro look: **sprites and procedural
textures. Never polygon models** (a held item gets perspective by transforming its sprite). Technically ambitious
and robust beats flashy; no one-off solutions.

**The first law:** few global systems over shared types, so anything can affect anything.
Tiles, 3D cells and creatures are all "matter" (`ctx.matter`); every harm/heat/wet/shove is an **effect** on one
queue; spaces are **realms** (data); content is **data in a table per type**, read by generic systems that check
traits, never ids. No theme packs, no per-feature special cases. Free to change old things to fit; old saves/seeds may break.

## Strict rules (for me)
1. Do exactly what was asked, at the detail asked. Light way over heavy way. No bonus features, no new subsystems.
   Unsure -> one short question first.
2. Before adding code, find the existing system/type. Extend data, not code. Needs a new system -> say so, get approval.
3. Read only: this file + the ONE area doc below + `docs/CODE-MAP.md`. Then grep, then read only the lines you need.
   Never read whole big files or whole data tables.
4. Files stay under ~300 lines, one purpose each. New file -> add a line to CODE-MAP. Touching a file over 300: split it first.
5. Keep this file and `docs/ARCHITECTURE.md` short. Changed an area -> update its doc in a few lines.
6. Run only the checks for the area you changed; `npx tsc --noEmit` before finishing; the full `check:sim` is CI's job (PR).
7. Several threads share this folder: stay in your area. Two threads at most; one task per thread.
8. Open a PR; CI runs the full check and builds `play.html` on merge (`docs/PIPELINE.md`). Never rebuild or commit `play.html`.
9. Finish with a short plain-language report (what you can now do in the game), not jargon.
10. A new feature that exposes a design flaw: fix the shared system properly, don't patch around it.

## Hard code rules
Strict TS, no `any`. Flow `input -> sim (20 Hz fixed, Commands) -> render (read-only)`; audio/net react to events.
`sim/*` folders never import each other (only `simLoop.ts` wires them). One entry `src/main.ts`. Determinism: `ctx.rng`,
never `Math.random()`/clock in sim. `SimState` is plain data. All art/audio generated at runtime. New mechanic = a check in
`scripts/*Smoke.ts` on ground *and* on a 3D cell. Content variety touches only `src/content/`.

## Area docs (read the one you need)
| Working on | Doc |
| --- | --- |
| shared systems, layers, tick order, anti-drift checklist | `docs/ARCHITECTURE.md` |
| where every file is, with one-line purposes | `docs/CODE-MAP.md` |
| definition tables, thing traits, recipes for adding content | `docs/CONTENT.md` |
| terrain, water, roads, places, cities | `docs/WORLD.md` |
| 3D layer, buildings, realms, underworld | `docs/REALMS.md` |
| effects, melee, magic, armour | `docs/COMBAT.md` |
| player, skills, creatures, social, saves, cheats | `docs/RPG.md` |
| drawing: terrain, sprites, particles | `docs/RENDER.md` |
| HUD, windows, input, settings | `docs/UI.md` |
| sound and music | `docs/AUDIO.md` |
| co-op networking | `docs/MULTIPLAYER.md` |

Sock: plain experience-first language, no jargon. Sock has no Node.js and plays the single-file `play.html`.
