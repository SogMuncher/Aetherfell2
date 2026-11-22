# Aetherfell 2 — how the modules split and talk

`CLAUDE.md` holds the hard rules; this file is the plan for growing the game without special cases.
Details live in the other docs (see the table in `CLAUDE.md`).

## The one idea

**Things are data. Rules are systems. Everything that happens is an effect.**

- A wolf, a barrel, an oil flask, a fire rune, being on fire, a village or a realm is a **definition**:
  a plain entry in `src/content/`, in the table of its *type*. New kind of thing = new entry.
- A **system** (`src/sim/*`) owns one rule for anything with the right traits ("has a brain",
  "material is flammable"). It never checks "is this a wolf?".
- Damage, healing, igniting, soaking, shoving, spilling, freezing, spawning, statuses are all
  **effects** from one vocabulary, applied in one place. Spells, items, traps, hits and breaking props
  all speak it.

## The first law: few global systems, shared types

| Concern | The one system / type |
| --- | --- |
| Harming, healing, heating, soaking, chilling, shoving, spilling | **effects queue** (`sim/effects`). Targets: `tile`, `spot`, `entity`, `area`. |
| Stuff at a place (material, wet, fire, fuel, oil, soot, frost, wear) | **`ctx.matter`** (`types/matter.ts`, `sim/world/matter.ts`). Spot `(x,y,z)`; `z = GROUND_Z` is the ground tile, else a cell of the 3D layer. Material = a tile kind, so `content/tiles.ts` is the single table of what things are made of. |
| Fire spread, drying, rain, frost, oil | `sim/interaction`, `sim/effects` via `ctx.matter` (`forNeighbours` walks tiles and cells together). |
| Blows, bolts, thrown things hitting terrain | `ctx.matter` probes → `strikeSpot`. |
| Sight, light, roofs | `volume.openSky/floorBelow/ceilingAbove`, light grid. A roof is cells whether house or cavern. |
| Which space you are in | **realm** (`content/realms.ts`, `state.realm`; others in `state.stash`). Travel = `swapRealm`. |
| Clouds, rain, sun-through | `content/sky.ts` + `content/skyField.ts`, shared by sim, render, audio. |
| Day and night | `content/day.ts` (never write hours in code). |

Add a mechanic **once**, over `ctx.matter` and the effect queue, and it works on the ground, in a
house, in a cavern and on a creature. Realms are not modes: to add one, add a `REALMS` entry (plus a
ground generator only for a new kind of ground) and portals/habitats that name it.

### Anti-drift checklist (before finishing any change)

1. Did I add a rule that only works on one kind of thing (tiles *or* buildings *or* creatures)? Move it to `ctx.matter` / the effect queue.
2. Did I name an id (`'wolf'`, `'underworld'`, a tile) inside a system? Put the fact in content (a field on the definition, or `content/rules.ts` for world-wide choices; text via `fillText()`; references checked in `validateContent()`).
3. Did I bundle a *theme* into its own file/pack? Content goes in the table of its *type*.
4. Did I add a second way to ask the same question (a new `isInside`, `burnsAt`)? Use or extend the existing one.
5. Does it work in every realm, with the party split or whole, after save/load and for a guest?
6. New mechanic → check added to `scripts/*Smoke.ts`, on ground *and* on a cell.

## Layers and imports

```
types/      shapes only. Imports nothing.
content/    definitions (pure data) + registry/validation. Imports types/.
sim/        rules. Each sim/<system>/ imports types/ and content/ only; simLoop.ts wires them.
render/     reads state + content, draws. Never writes sim state.
audio/      reacts to events + state, reads content. Never writes sim state.
net/        moves commands, events, snapshots. Knows nothing about rules.
input/      raw devices → InputSnapshot.
main.ts     the only place that connects all of the above.
```

Inside `sim/`, systems meet through state, the effect queue, and `SimContext` services (`tiles`,
`matter`, `query`, `rng`, `emit`, `spawn`, `dropItems`, `build`, `content`). Two small queues besides
effects: `use` (E pressed at something) and `kills` (credit). Ids in content are stored in saves and
network messages: never rename a released id; add new, retire old.

## One 20 Hz tick

```
commands → weather → world (places) → ecology → player → ai → melee → magic
→ physics → interaction → statuses → effects (applies everything) → rpg → social
→ cleanup (remove dead, publish tile/cell changes)
```
Producers run before `effects`, so everything requested this tick lands this tick.

## Render, audio, net stay generic

Render, audio and net stay generic: render draws any thing from `def.sprite` and statuses from
`tint/light`; audio derives sounds from material sound classes, creature body/brain and spell effects;
music reads a site's `mood`; the network sends plain data with string def ids. A new creature, rune or
status needs no render, audio or net code. Render/audio may look up the *names* content gives them
(sprite ids, sound classes, mood signals): that is the contract between layers, not a special case.
