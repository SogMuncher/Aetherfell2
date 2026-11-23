# Core audit (2026-11-21)

Read-only review. Nothing was fixed. Evidence is from `check:sim` (502 PASS, 0 FAIL) and headless runs of the real sim
(throwaway scripts, 1-4 players, 20 Hz, up to 30 sim-minutes). Size: S under an hour, M a thread, L several threads.

## HIGH
1. **Frame stalls in dense places (perf, M).** Seed 42 (a city): 1,600 entities, 9.5 ms average tick (a budget of 50 ms),
   **61 ticks over 50 ms per 5 minutes, worst 0.9 s**. A normal seed averages 0.5 ms. Because the host sim runs on the
   main thread, every stall freezes the host's screen and delays every guest. Profile: terrain noise (`fbm`, `valueNoise`)
   about 25%, `riverSpot`/`lakeOf`/`siteInRegion` recomputed per query (about 15%), `physicsSystem`/`separateBodies` on all
   entities. Fix: cache the per-region site/river answers, sleep entities far from every player, spread chunk generation
   over several ticks.
2. **One save slot, no safety net (saves, M).** `saveToBrowser` writes a single `localStorage` key (about 5 MB limit,
   base64 + JSON of every changed chunk). A failed write returns false and **autosave ignores it silently**
   (`main.ts:241`). No backup copy, no file export, no way to move a world. Version 3 is "refuse older" (no migration),
   so the next format change wipes every world. Measured: 125 KB after 5 min with 4 players, so fine now, not for a
   long-lived base. Fix: write new then swap, keep the previous slot, show failures, export/import file, add a migrate hook.
3. **The host is the world (co-op, L).** Host closes the tab or loses connection: guests lose everything newer than
   their last join snapshot, and nobody else holds a save. Guests cannot save. Fix without migration: let guests keep the
   last snapshot and offer "continue as host" (M); real host migration is L.
4. **No way out of a bad spot (soft-lock, S/M).** No unstuck or rescue path exists (grep finds none). Spawn is safe
   (40 seeds, 0 below ground) but respawn (`playerSystem.ts:191`), arrival after realm travel and building over a respawn
   point can trap a player. Fix: one `unstuck` command (the shared "open floor near" helper already exists) in the menu.
5. **Realm travel is untested for guests (tests, S).** `coopSmoke` has 0 realm checks; `realmSmoke` covers a solo
   wipe and a save but never a guest following `realmChanged`/`followRealm`, a guest joining while the party is below, or
   a guest dropping while the party descends (the `absent` path). This is the riskiest co-op moment. Add one check.

## MEDIUM
6. **Armour is a second item system (duplication, L).** `content/gear.ts`, `types/gear.ts`, `paperdoll.ts` (690 lines):
   items as `gear:<form>:<material>:<quality>` strings plus `itemDef()`. Break the "anything can affect anything" rule
   and every item feature must be written twice. Fold into item traits.
7. **DONE (one assembler for creatures, forms, props and items: `assembler.ts`; held-item `mesh`/`viewModel` left to its own thread).** **Four picture painters (duplication, L).** `bodyArt`+`bodyPaint` (573), `formArt` (257), `itemArt` (828),
   `mesh`/`viewModel` (polygon, already being replaced). One parts-to-sprite painter fed by data.
8. **Entities are never slept (perf, M).** 130 entities for a normal seed is fine, but ecology/site fill scales with how
   many places are near any player; 4 players in different directions multiply the cost. Same fix as 1.
9. **DONE (`scripts/check.mjs`).** **No chain runner (tests, S).** `check:sim` is a 2 KB `&&` chain of 19 scripts; one failure hides the rest and the
   line is easy to break. A runner that globs `scripts/*Smoke.ts` and reports all failures is smaller and safer.
10. **Autosave and save are main-thread work (perf, S).** 82-92 ms stringify+zlib for a small world, grows with it.
    Autosave every 5 min is a visible hitch for everyone. Split by region or save in a worker.
11. **Music engine (size, S to freeze).** 2,830 lines for 15 moods; nothing else depends on it. Freeze, do not extend.

## LOW
12. Hard-coded names: `'village'`/`'city'` layouts in `terrain.ts`/`chunkgen.ts`, factions `party`/`village`, fixed skill
    list, dialogue topics in code (S each; see `split-refactor/OVER-SPECIFIC.md` 8-11).
13. Big classes over 300 lines (`GameUI`, `GameAudio`, `Simulation`, `Particles`, `BagWindow`): split when next touched.
14. Obsolete `src/content/spells.ts` and empty `src/sim/combat/` still listed for deletion by hand.
15. Site location records print `NaN,NaN` for x/y when read raw from `state.locations` (seed 42): check the fields the
    map and journal read, may be a different field name (S, unverified).

## Checked and fine
- Determinism: same seed and inputs gave an identical state hash across two runs; no `Math.random`/clock in `sim/`.
- Save round trip: reloaded sim matched and **stayed identical after 400 more ticks**.
- Long run: one player for 30 sim-minutes holds about 150 entities, about 85 chunks, 225 MB, 0.6 ms/tick. No leak seen.
- Party wipe below sends survivors up (realmSmoke); spawn never underground.
