/**
 * Shapes of the content definitions in src/content/. Ids are plain strings so new entries need no
 * type changes; validateContent() checks every reference at start-up.
 * Ids are stored in saves and network messages: never rename one after release.
 */
export type MaterialId = string;
export type ThingId = string;
export type ItemId = string;
/** A prepared spell: its rune ids joined with '+', e.g. 'ember+nova+grand'. */
export type SpellId = string;
export type RuneId = string;
export type StatusId = string;
export type BrainId = string;
export type LootId = string;
export type SiteId = string;
export type FactionId = string;
/** A villager's job: what they say, sell and ask of you (content/roles.ts). */
export type RoleId = string;
/** Procedural sprite name the renderer knows how to paint (unknown names get a placeholder). */
export type SpriteId = string;

/** A realm: one of the separate spaces the world is made of (the surface, the underworld). A key of content/realms.ts. */
export type RealmId = string;
