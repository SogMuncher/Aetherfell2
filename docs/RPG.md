# Player, progress, creatures, social (sim/player, rpg, ai, ecology, social, interaction, persistence)

**Purpose:** what a character can do and become, how creatures think, how people talk, and how it is saved.
**Never:** name a creature/item/skill in a system (use traits and `content/rules.ts`); use `Math.random()`.

- `player/playerSystem.ts`: first-person movement, swim, glide, carry/throw, runebook preparing, "poke" -> use request.
  Gliders are items with `glide: GlideDef` (`player/gliding.ts`): `soar` 0 drifts (burlap), 1 flies where you look and trades
  dive speed for height (wyvern hide). They are worn on the 'back' body region (paperdoll slot, `armour` with no protection);
  only a worn one opens (`wornGlider`). `glide.trail` = motes left behind each wingtip. Check: `glideSmoke`.
- `rpg/rpgSystem.ts`: skills grow by doing, pick up/use/drop/wear items, shared party quest log. Bag layout is UI-only.
  The bag is `actor.inventory` (players and creatures alike, `bagOf(e)`); a thing's `carries` loot fills it at spawn and
  all of it drops on death (plus `onDestroy.loot`). Creatures ask for the player's pick-up/throw via `actor.wantPick/wantThrow`.
  Big things (crates, pots, barrels) are lifted and heaved by everyone through `actor.holding` + `wantLift/wantHeave` (`rpg/carrying.ts`); the player's F key asks the same way.
- `ai/` : one thinking loop for every creature. `senses.ts` gathers what it notices; `handling.ts` = `grab`/`throw` behaviours; `carrying.ts` = `lift`/`heave`/`smash` (senses gather `props` for them). `behaviours.ts` is the library (`BehaviourDef` in `types/defs/brains.ts`);
  a creature's brain is an ordered data list in `content/living.ts`. Villagers are creatures with a brain + role.
  `paths.ts`: A* over 1 m cells (tiles, 3D walls, floors within a step, doors count as open), straightened; `goVia` walks it
  (`ai.path`/`ai.aim`), opening shut doors ahead. Long ways come back partial and are searched again from nearer.
  Townsfolk routines: `RoleDef.routine` (else `rules.routine`) lists place words per day part + `rain`; `hauntNow`
  (content/routine.ts) picks one per person per day; `npc.haunts` holds each person's spot per word (set in worldPopulate).
  Sensing counts height and needs a clear line eye to eye (`matter.clearLine`: ground, walls, doors, 3D cells); an attacker
  is noticed anyway. Night eyesight and wildlife both ask `isDark` (content/day.ts): the underworld is always dark.
- `ecology/`: wildlife comes and goes by habitat and time of day; factions remember what the party did.
- `social/`: dialogue, trade, quests from `content/roles.ts` templates. `topics.ts`: Daggerfall-style menus "Where is..."
  (places = `Location.landmarks`, people = where `hauntNow` says they are) and "Tell me about..." (rumours, `RoleDef.about`);
  all words in `content/talk.ts`. Folk who dislike the party (`talk.refuseBelow`) refuse directions.
  `party.ts`: hire townsfolk for `rules.hireFee` (they take the party's faction, `isFollower`), "Let me see your gear" opens
  their bag in the hold window and their paperdoll (wear/remove `on` their id), dismiss returns them to `factions.folk`.
  The `follow` behaviour (villager brain) keeps them with the nearest traveller and fights what threatens the party.
  Not yet: they stay behind when the party changes realm.
- `interaction/`: the world's own rules (fire spread, drying, rain, traps, doors, containers) over `ctx.matter`.
- `persistence/`: fflate save; also how the world is sent to joining friends. Version bump refuses old saves (fine in dev).
- `cheats/`: debug menu entries from `content/cheats.ts`, each names an action the sim knows. "Held item" rows (generated from
  lists there) set one handling number of what you hold (`tuneHeld` in `content/handling.ts`), live until reload.

## Add / change
- Creature: `things` + `habitats` entries; new behaviour kind = type + one function in `BEHAVIOURS`.
- Skill growth, currency, start kit, hours, factions: `content/rules.ts`.
- Villager job: `roles` entry listed in a site's `villagers`; its day = `routine` place words (building recipe ids work).

## Checks
`scripts/mechanicsSmoke.ts`, `simSmoke.ts`, `cheatsSmoke.ts`, `dataSmoke.ts`, `gearSmoke.ts`, `senseSmoke.ts`, `handsSmoke.ts`, `townSmoke.ts` (paths, routines, topics), `partySmoke.ts` (hire, follow, fight, dress).
