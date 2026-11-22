import { BIOMES } from './biomes';
import { BRAINS, FACTIONS, HABITATS } from './living';
import type { Content } from '../types';
import { EFFECTS } from './effects';
import { FORMS } from './forms';
import { GEAR } from './gear';
import { HUD } from './hud';
import { ITEMS } from './items';
import { LOOKS } from './looks';
import { LOOT } from './loot';
import { MATERIALS } from './materials';
import { PALETTES } from './palettes';
import { PROPS } from './props';
import { REALMS } from './realms';
import { ROLES, VILLAGER_NAMES } from './roles';
import { RULES } from './rules';
import { RUNES, RUNE_ORDER, STARTING_RUNES } from './runes';
import { SITES } from './sites';
import { SKY } from './sky';
import { STATUSES } from './statuses';
import { STRUCTURES } from './structures';
import { SURFACES } from './surfaces';
import { MATTER_STATES } from './matterStates';
import { THINGS } from './things';
import { TILES, TILE_IDS } from './tiles';
import { VIEWMODEL } from './viewmodel';
import { WORLD } from './world';
import { validateContent } from './validate';

export { fillText, pluralName, siteBaseName, thingDef, isCreature, looksDangerous, moveFactor, isDisabled, isPanicking, rollLoot, skillXp, stackWeight } from './helpers';
export { validateContent } from './validate';

export { cloudDensity3, cloudPattern, layerCover, layerDensity, airColumn, airAt, rainAt, airMoisture, setAirMoisture, moistCell, MOIST_CELL, sunThrough } from './skyField';
export { dayPart, isDark, isNight, nightFalls, sunAngle, sunHeight } from './day';
export type { DayPart } from './day';

export { MAX_SPELL_RUNES, composeSpell, describeSpell, effectWords, spellFor, spellKey } from './spellcraft';
export type { Composed } from './spellcraft';
export { GEAR } from './gear';
export { gearEffect, gearId, gearItem, parseGear, pickRegion, rollGear, rollOutfit } from './gearItems';
export { breakOf, gearCondition, heldLight, itemDef, itemWeapon, mended, takeBlows, weaponStats, withWear, wornWeight } from './itemDefs';
export { gearProblems } from './gearCheck';

/** Every definition in the game, in one object. */
export const CONTENT: Content = {
  materials: MATERIALS,
  tiles: TILES,
  tileIds: TILE_IDS,
  surfaces: SURFACES,
  matterStates: MATTER_STATES,
  biomes: BIOMES,
  world: WORLD,
  things: THINGS,
  items: ITEMS,
  runes: RUNES,
  startingRunes: STARTING_RUNES,
  runeOrder: RUNE_ORDER,
  statuses: STATUSES,
  brains: BRAINS,
  factions: FACTIONS,
  loot: LOOT,
  habitats: HABITATS,
  sites: SITES,
  structures: STRUCTURES,
  roles: ROLES,
  villagerNames: VILLAGER_NAMES,
  rules: RULES,
  gear: GEAR,
  looks: LOOKS,
  // Trees, rocks and plants (forms.ts) and made things like barrels and chests (props.ts) grow the same way.
  forms: { ...FORMS, ...PROPS },
  palettes: PALETTES,
  realms: REALMS,
  sky: SKY,
  hud: HUD,
  effects: EFFECTS,
  viewmodel: VIEWMODEL,
};

const problems = validateContent(CONTENT);
if (problems.length) console.error(`Content problems:\n  ${problems.join('\n  ')}`);
