# Player, progress, creatures, social (sim/player, rpg, ai, ecology, social, interaction, persistence)

**Purpose:** what a character can do and become, how creatures think, how people talk, and how it is saved.
**Never:** name a creature/item/skill in a system (use traits and `content/rules.ts`); use `Math.random()`.

- `player/playerSystem.ts`: first-person movement, swim, glide, carry/throw, runebook preparing, "poke" -> use request.
- `rpg/rpgSystem.ts`: skills grow by doing, pick up/use/drop/wear items, shared party quest log. Bag layout is UI-only.
  The bag is `actor.inventory` (players and creatures alike, `bagOf(e)`); a thing's `carries` loot fills it at spawn and
  all of it drops on death (plus `onDestroy.loot`). Creatures ask for the player's pick-up/throw via `actor.wantPick/wantThrow`.
- `ai/` : one thinking loop for every creature. `senses.ts` gathers what it notices; `handling.ts` = `grab`/`throw` behaviours. `behaviours.ts` is the library (`BehaviourDef` in `types/defs/brains.ts`);
  a creature's brain is an ordered data list in `content/living.ts`. Villagers are creatures with a brain + role.
  Sensing counts height and needs a clear line eye to eye (`matter.clearLine`: ground, walls, doors, 3D cells); an attacker
  is noticed anyway. Night eyesight and wildlife both ask `isDark` (content/day.ts): the underworld is always dark.
- `ecology/`: wildlife comes and goes by habitat and time of day; factions remember what the party did.
- `social/`: dialogue, trade, quests from `content/roles.ts` templates. Topics are code for now (known gap).
- `interaction/`: the world's own rules (fire spread, drying, rain, traps, doors, containers) over `ctx.matter`.
- `persistence/`: fflate save; also how the world is sent to joining friends. Version bump refuses old saves (fine in dev).
- `cheats/`: debug menu entries from `content/cheats.ts`, each names an action the sim knows.

## Add / change
- Creature: `things` + `habitats` entries; new behaviour kind = type + one function in `BEHAVIOURS`.
- Skill growth, currency, start kit, hours, factions: `content/rules.ts`.
- Villager job: `roles` entry listed in a site's `villagers`.

## Checks
`scripts/mechanicsSmoke.ts`, `simSmoke.ts`, `cheatsSmoke.ts`, `dataSmoke.ts`, `gearSmoke.ts`, `senseSmoke.ts`, `handsSmoke.ts`.
