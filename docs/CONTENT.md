# Content (src/content): definitions as data, one table per TYPE

**Purpose:** every kind of creature, item, tile, place, rune... is a plain entry read by generic systems.
**Never:** a theme pack file; an id inside a system (`if (thing === 'wolf')`); numbers in systems that belong in
`rules.ts`. Tables are data: grep an id, don't read a whole table. Tables may exceed 300 lines.

`index.ts` collects all tables into `CONTENT`; `validate.ts` checks every reference (run at start-up and in `check:sim`);
`helpers.ts` has `thingDef`, `weaponStats`, `rollLoot`, `fillText`... Shapes of definitions: `src/types/defs/*.ts`.

| Table (file) | One entry says |
| --- | --- |
| `materials` | how matter reacts: flammable, fuel, resistances, floats, sound class |
| `tiles` (+`tileCodes` ledger, `surfaces`, `palettes`) | ground/wall kinds, also the material of 3D cells; textures; colours |
| `biomes`, `world` | landscape kinds (first fit wins); land shape, roads, water numbers |
| `things`, `living` | entity archetypes by traits (body, health, actor, brain, light, portal...); brains, factions, habitats |
| `items`, `gear`, `loot` | goods, armour pieces (`gear:<form>:<material>:<quality>`), drop tables |
| `runes`, `spellcraft`, `statuses`, `effects` | spell syllables, ongoing conditions, mote bursts |
| `sites`, `roles`, `structures`, `shapes` | places, villager jobs, building recipes, 3D shapes (append-only ledger) |
| `looks`, `forms`, `props` | creature parts, trees/rocks/plants, made objects, drawn from pieces + colour regions |
| `realms`, `sky`, `day` | spaces; cloud layers; the day clock |
| `rules`, `hud`, `cheats`, `viewmodel` | world-wide numbers/choices; screen colours; debug entries; held-item poses |

Thing traits (systems act on these): `body` `health` `material` `actor` `brain` `carry` `container` `light`
`onImpact` `onDestroy` `contact` `projectile` `talk` `portal` `use` `mount` `sprite` `sounds`.

## Recipes (content only unless noted)
- Creature: `things` + `habitats` entry. New behaviour *kind* needs code (see RPG.md).
- Potion/food: `items.use: Effect[]`. Throwable: `thrown`. Weapon: `items.weapon`. Light: `items.light`.
- Armour: one entry in `gear.ts` (form, material, quality or body part). Resolve with `itemDef()`, never `items[id]`.
- Rune: `runes` entry (+ stone item `rune:<id>`, loot). Condition: `statuses`. Material behaviour: `materials`.
- Tile/building material: `tiles` entry (+ `surfaces`); code uses `tileCode('id')`. Landscape: `biomes` (order matters).
- Tree/rock/plant: `forms` + a `tiles` entry whose sprite names it. Prop: `props` form named by the thing's `sprite`.
- Place: `sites` entry (a new layout *shape* needs code, see WORLD.md). Building: `structures` recipe in a site's list.
- Realm: `realms` entry + portals/habitats naming it. Tuning: `rules.ts`.
- New reference field: add a line to `validate.ts`. Text that varies: `fillText()` templates.

## Pictures
Nothing is hand-drawn. Parts carry a colour **region**; individuals fill regions from palettes (`'@name'`) at draw time.
