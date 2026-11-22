import type { BiomeDef, SurfaceDef, TileInfo, TileKind, WorldGenDef } from './tiles';
import type { BrainDef, HabitatDef, LootDef } from './defs/brains';
import type { BrainId, FactionId, ItemId, LootId, MaterialId, RealmId, RoleId, RuneId, SiteId, StatusId, ThingId } from './defs/ids';
import type { BurstDef, ViewmodelDef } from './vfx';
import type { FactionDef, RoleDef } from './defs/social';
import type { FormDef, FormId } from './forms';
import type { GearTables } from './gear';
import type { HudTheme, RulesDef } from './defs/rules';
import type { ItemDef } from './defs/items';
import type { LookDef, LookId } from './looks';
import type { MaterialDef, RealmDef, ThingDef } from './defs/things';
import type { PaletteDef, PaletteId } from './palettes';
import type { ShownState, StateLookDef } from './matter';
import type { RuneDef, StatusDef } from './defs/magic';
import type { SiteDef } from './defs/sites';
import type { SkyDef } from './sky';
import type { StructureDef } from './volume';

export type { MaterialId, ThingId, ItemId, SpellId, RuneId, StatusId, BrainId, LootId, SiteId, FactionId, RoleId, SpriteId, RealmId } from './defs/ids';
export type { SoundClass, MaterialDef, LightDef, HeldLightDef, WeaponStats, Burst, RealmDef, ThingDef } from './defs/things';
export type { BreakDef, ItemCategory, ItemForm, VesselBody, ItemLook, ItemDef } from './defs/items';
export type { Delivery, SpellSound, SpellDef, MoteLook, SpellLook, EssenceLook, LookTweak, EssencePart, ShapePart, PowerPart, RuneDef, StatusDef } from './defs/magic';
export type { BehaviourDef, BehaviourKind, BrainDef, LootEntry, LootDef, HabitatDef, Placement, PopulationEntry } from './defs/brains';
export type { SiteLayoutDef, CompassSide, DistrictDef, Landmark, CityLayout, WardDef, SiteDef, StreetStyle, VillageStyle } from './defs/sites';
export type { QuestTemplate, QuestWords, TradeDef, RoleDef, FactionDef } from './defs/social';
export type { ReactionDef, SwingDef, RulesDef, TouchDef, HudTheme, DayRules } from './defs/rules';


/** Every registry, collected by src/content/index.ts. Systems receive it as ctx.content. */
export interface Content {
  materials: Readonly<Record<MaterialId, MaterialDef>>;
  /** Tile kinds by code (what chunks store). */
  tiles: Readonly<Record<TileKind, TileInfo>>;
  /** Tile codes by string id ('peat' → 20). */
  tileIds: Readonly<Record<string, TileKind>>;
  /** Procedural surfaces (textures) by id. */
  surfaces: Readonly<Record<string, SurfaceDef>>;
  /** How soot, wet, oil, frost and fire look blended over the stuff they are on. */
  matterStates: Readonly<Record<ShownState, StateLookDef>>;
  /** Kinds of landscape, in the order they are tried. */
  biomes: Readonly<Record<string, BiomeDef>>;
  /** World-wide generation choices (land shape, moisture, roads, far colours). */
  world: WorldGenDef;
  things: Readonly<Record<ThingId, ThingDef>>;
  items: Readonly<Record<ItemId, ItemDef>>;
  runes: Readonly<Record<RuneId, RuneDef>>;
  /** Runes every traveller knows from the start. */
  startingRunes: readonly RuneId[];
  /** The order runes appear in the runebook. */
  runeOrder: readonly RuneId[];
  statuses: Readonly<Record<StatusId, StatusDef>>;
  brains: Readonly<Record<BrainId, BrainDef>>;
  factions: Readonly<Record<FactionId, FactionDef>>;
  loot: Readonly<Record<LootId, LootDef>>;
  habitats: readonly HabitatDef[];
  sites: Readonly<Record<SiteId, SiteDef>>;
  /** Recipes for buildings in the 3D layer, by id (content/structures.ts). */
  structures: Readonly<Record<string, StructureDef>>;
  roles: Readonly<Record<RoleId, RoleDef>>;
  /** How creatures look, by sprite id (content/looks.ts). Sprite ids not found here are props. */
  looks: Readonly<Record<LookId, LookDef>>;
  /** How world objects (trees, rocks, haystacks…) grow from pieces, by form id (content/forms.ts). */
  forms: Readonly<Record<FormId, FormDef>>;
  /** Colour palettes that colour regions are filled from ('@bark', '@fur.grey'), content/palettes.ts. */
  palettes: Readonly<Record<PaletteId, PaletteDef>>;
  /** Kinds of building that village-shaped sites put together (content/buildings.ts). */
  /** Names villagers are given. */
  villagerNames: readonly string[];
  rules: RulesDef;
  /** Armour: body parts, garments, materials and qualities (content/gear.ts). */
  gear: GearTables;
  /** The spaces the world is made of (content/realms.ts). */
  realms: Readonly<Record<RealmId, RealmDef>>;
  /** Cloud layers, sky colours, sun, moon, stars and aurora (content/sky.ts). */
  sky: SkyDef;
  /** Colours of bars, panels and menus (content/hud.ts). */
  hud: HudTheme;
  /** Bursts of motes for things that happen (sparks, blood, dust, splashes), content/effects.ts. */
  effects: Readonly<Record<string, BurstDef>>;
  /** How the weapon in your hand moves, is lit and reacts to blows in the first-person view (content/viewmodel.ts). */
  viewmodel: ViewmodelDef;
}
