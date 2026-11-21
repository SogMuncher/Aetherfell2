# Effects and combat (sim/effects, melee, magic, statuses)

**Purpose:** everything that happens to things is an *effect* on one queue, resolved in one place.
**Never:** change hp or a tile directly; add a second damage path; name a faction or creature in combat code.

- Vocabulary (`types/effects.ts`): `damage {amount, kind}` `heal` `restore` `status` `cure` `push` `heat` `soak`
  `chill` `coat` `spawn`. Targets: entity, tile/spot, or an area of tiles, cells and bodies. Requests carry the causer.
- Files: `effectsSystem.ts` (queue loop), `spotEffects.ts` (tiles/cells: ignite, melt, strike), `entityEffects.ts`
  (bodies: guard, armour, reaction, status, death). Statuses tick in `sim/statuses`.
- Order for every source: guard/parry -> material reaction (resistances, burning/soaked via `rules.reactions`) ->
  status rules (cancels/blocks) -> death (`onDestroy`, loot, credit).
- Melee (`sim/melee`): swings, charge, hitstop, knockback, all numbers in `content/rules.ts` `combat`. Ground tiles and
  3D cells are hit by the same `strikeSpot`. Wear lives in `SimState.tileWear`.
- Armour: `Entity.worn` (part -> item id); `pickRegion` chooses the part hit; pieces wear and break. Data: `content/gear.ts`.
- Magic (`sim/magic`, `content/spellcraft.ts`, `runes.ts`): up to 3 runes (>=1 essence, <=1 shape) compose a spell;
  casters in creatures use a brain `cast` behaviour and the same code as the player.
- Factions decide who may hurt whom (`friendlyFire`).

## Add / change
- New swing: row in `combat.swings` (+ `SWING_DIRS`). Breakable: tile `durability`/`breaksInto`. Hard material:
  `hardness` + `debris`. Caster: `actor.caster` + brain with `cast`. New effect kind: extend the vocabulary once, handle in
  `spotEffects`/`entityEffects` for tiles *and* bodies.
- The first-person weapon picture is render-side (see RENDER.md); combat never reads it.

## Checks
`scripts/mechanicsSmoke.ts`, `runebookSmoke.ts`, `fireSmoke.ts`, `gearSmoke.ts`, `torchSmoke.ts`.
