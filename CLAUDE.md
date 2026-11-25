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
3. Read only: this file + the ONE area doc below. Find files with `grep -i <word> docs/CODE-MAP.md` (don't read it whole),
   then grep code and read only the lines you need.
   Never read whole big files or whole data tables.
4. Files stay under ~300 lines, one purpose each, first line a `//` comment saying its purpose (CODE-MAP copies it).
   Touching a file over 300 (`npm run codemap` lists them): split it first.
5. Keep this file and `docs/ARCHITECTURE.md` short. Changed an area -> update its doc in a few lines.
6. Check with `npm run check <area>` (tsc + that area's checks, failures only; also refreshes CODE-MAP). Full run is CI's.
7. Several threads share this folder: stay in your area. Two threads at most; one task per thread.
8. Open a PR; CI runs the full check and builds `play.html` on merge (`docs/PIPELINE.md`). Never rebuild or commit `play.html`.
9. Finish with a short plain-language report (what you can now do in the game), not jargon.
10. A new feature that exposes a design flaw: fix the shared system properly, don't patch around it.

## Cheap habits (cache reads are the biggest cost: every tool call re-reads the whole thread)
- Fewest turns: put independent calls in one message, chain shell steps with `&&`, plan all edits then make them together.
- Short output: `grep -n`, `sed -n 'a,bp'`, `| tail -20`. Never print whole files, logs or diffs. Don't re-read to verify.
- One ask per thread; an unrelated ask is a new thread (a long thread re-reads all its history every turn).
- After the PR: no `subscribe_pr_activity`, no polling checks. Auto-merge does the rest; post the report and end the thread.

## Hard code rules
Strict TS, no `any`. Flow `input -> sim (20 Hz fixed, Commands) -> render (read-only)`; audio/net react to events.
`sim/*` folders never import each other (only `simLoop.ts` wires them). One entry `src/main.ts`. Determinism: `ctx.rng`,
never `Math.random()`/clock in sim. `SimState` is plain data. All art/audio generated at runtime. New mechanic = a check in
`scripts/*Smoke.ts` on ground *and* on a 3D cell. Content variety touches only `src/content/`.

## Area docs (read the one you need) and its check
| Working on | Doc | `npm run check ...` |
| --- | --- | --- |
| shared systems, layers, tick order, anti-drift checklist | `docs/ARCHITECTURE.md` | `all` |
| definition tables, thing traits, recipes for adding content | `docs/CONTENT.md` | `content` |
| terrain, water, roads, places, cities | `docs/WORLD.md` | `world` |
| 3D layer, buildings, realms, underworld, airship | `docs/REALMS.md` | `realms` |
| effects, melee, magic, armour | `docs/COMBAT.md` | `combat` |
| player, skills, creatures, social, saves, cheats | `docs/RPG.md` | `rpg` |
| drawing (sky/clouds: `RENDER-SKY.md`, sprites/held item: `RENDER-SPRITES.md`, GPU passes: `GPU-RENDER.md`) | `docs/RENDER.md` | `render` |
| HUD, windows, input, settings | `docs/UI.md` | `ui` (tsc only) |
| sound and music | `docs/AUDIO.md` | `audio` |
| co-op networking | `docs/MULTIPLAYER.md` | `multiplayer` |
One script also works: `npm run check gearSmoke`. Packages install themselves on the first check.

## Ship it (same every thread, no exploring)
1. `npm run check <area>` green -> `git add -A && git commit -m "<what changed>" && git push -u origin <branch>`.
2. GitHub MCP: `create_pull_request` (base `main`; body = the two attribution lines + 2-4 plain lines), then
   `issue_write` update assignees `[SogMuncher]` (skip the review request: PRs count as Sock's, GitHub refuses it),
   `enable_pr_auto_merge` (SQUASH), then post the final report and end. Never watch CI; if creating the PR auto-subscribed you, call `unsubscribe_pr_activity` at once; the coordinator reports the merge.

Sock: plain experience-first language, no jargon. Sock has no Node.js and plays the single-file `play.html`.
