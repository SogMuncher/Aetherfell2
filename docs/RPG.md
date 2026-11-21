# Player, progress, creatures, social (sim/player, rpg, ai, ecology, social, interaction, persistence)

**Purpose:** what a character can do and become, how creatures think, how people talk, and how it is saved.
**Never:** name a creature/item/skill in a system (use traits and `content/rules.ts`); use `Math.random()`.

- `player/playerSystem.ts`: first-person movement, swim, glide, carry/throw, runebook preparing, "poke" -> use request.
- `rpg/rpgSystem.ts`: skills grow by doing, pick up/use/drop/wear items, shared party quest log. Bag layout is UI-only.
- `ai/` : one thinking loop for every creature. `behaviours.ts` is the library (`BehaviourDef` in `types/defs/brains.ts`);
  a creature's brain is an ordered data list in `content/living.ts`. Villagers are creatures with a brain + role.
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
`scripts/mechanicsSmoke.ts`, `simSmoke.ts`, `cheatsSmoke.ts`, `dataSmoke.ts`, `gearSmoke.ts`.
