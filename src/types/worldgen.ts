import type { RGB } from './tiles';
import type { AirDef } from './sky';


/**
 * One layer of a procedural surface. Layers run in order on each texel, starting from the base
 * colour; amounts can be one number (all channels) or [r, g, b].
 */
export type SurfaceLayer = SurfaceLayerKind & {
  /** Quarter turns the layer is painted at, so one component can be reused crosswise (planks, ruts, waves). */
  readonly turn?: 0 | 1 | 2 | 3;
};
/** What one layer paints. */
export type SurfaceLayerKind =
  /** Soft multi-scale noise (the usual "grain" of ground). */
  | { kind: 'grain'; salt: number; amount: number | RGB }
  /** One scale of noise: `cells` blobs across the texture. */
  | { kind: 'noise'; salt: number; cells: number; amount: number | RGB }
  /** Random single texels (blades, pebbles, embers). */
  | { kind: 'speckle'; salt: number; chance: number; add: number | RGB }
  /** Wavy bands (water), or thin wavy lines when `line` is set (cracks in ice). */
  | { kind: 'waves'; freq: number; tilt?: number; warp?: { salt: number; cells: number; amount: number }; amount: number | RGB; line?: number }
  /** Straight lines every `period` texels along an axis; `add` tints, `set` paints over and stops. */
  | { kind: 'lines'; axis: 'x' | 'y'; period: number; at?: readonly number[]; add?: number | RGB; set?: RGB }
  /** Bricks or slabs: mortar lines stop the texel, each brick gets its own shade. */
  | { kind: 'bricks'; w: number; h: number; mortar: RGB; salt: number; vary: number }
  /** Boards (planks, doors): seams stop the texel; horizontal boards may have staggered end joints. */
  | { kind: 'boards'; dir: 'vertical' | 'horizontal'; size: number; seam: RGB; joint?: { every: number; stagger: number } }
  /** Wood grain rings running along vertical boards of width `board`. */
  | { kind: 'rings'; board: number; salt: number; freq: number; warp: { salt: number; cells: number; amount: number }; amount: number | RGB }
  /** Patches where noise is above `above` get another colour (moss, pools); `keep` carries over that much of the shading so far.
   *  `cells` (here and in noise) is 4, 8 or 16 per tile: bigger blobs repeat every tile and read as stripes. */
  | { kind: 'patches'; salt: number; cells: number; above: number; colour: RGB; keep?: number | RGB };

/**
 * A procedural surface: a base colour and layers (the components any surface can reuse). Painted once into a small
 * tiling texture; each placed cell then drifts every component's colour on its own by up to `drift` (hue in degrees,
 * sat and light as fractions; content/surfaces.ts SURFACE_DRIFT when unset), so like cells vary but stay one kind.
 */
export interface SurfaceDef {
  readonly base: RGB;
  readonly layers: readonly SurfaceLayer[];
  readonly drift?: { readonly hue?: number; readonly sat?: number; readonly light?: number };
  /** Each placed cell turns and mirrors the whole picture at random (for looks with no direction: grass, rock, sand). */
  readonly spin?: boolean;
}

/** When a biome applies: first matching biome (in registry order) wins. Bounds are exclusive. */
export interface BiomeWhen {
  /** Ground height above this (m). */
  readonly above?: number;
  /** Ground height below this (m). */
  readonly below?: number;
  /** Moisture (0..1) above this. */
  readonly wetter?: number;
  /** Moisture (0..1) below this. */
  readonly drier?: number;
}

/** A kind of landscape: when it appears, what ground it is made of, what grows there, how it looks from afar. */
export interface BiomeDef {
  readonly name: string;
  /** Motes floating in the air of this landscape (pollen, dust, ash). */
  readonly air?: AirDef;
  readonly when: BiomeWhen;
  /** Tile id of its plain ground. */
  readonly ground: string;
  /** Roads may cross it (default true). */
  readonly roads?: boolean;
  /**
   * Tree tile id and base share of tiles that are trees (scaled up and down by woodland patches).
   * `mix` swaps in other trees for a share of them (birches among the oaks).
   */
  readonly trees?: { readonly tile: string; readonly density: number; readonly mix?: readonly { readonly tile: string; readonly share: number }[] };
  /** Large blobs of another tile, from a noise field (peat in a marsh). Checked before scatter. */
  readonly patches?: readonly { readonly tile: string; readonly salt: number; readonly scale: number; readonly above: number }[];
  /** Single scattered tiles (bushes, boulders): share of tiles for each, checked in order. */
  readonly scatter?: readonly { readonly tile: string; readonly chance: number }[];
  /** Colour of its plain ground from far away (default: the ground tile's far colour). */
  readonly far?: RGB;
  /** Colour on the map (default: far colour). */
  readonly map?: RGB;
  /** Treetop height (decimetres) of fully wooded land seen from afar (default 60). */
  readonly canopy?: number;
  /** Steep slopes show bare rock from afar (default true). */
  readonly bareSlopes?: boolean;
}

/** One layer of the land's shape: noise scaled to metres, added to the height. */
export interface LandLayer {
  readonly noise: 'fbm' | 'ridge';
  readonly salt: number;
  /** Size of features in metres. */
  readonly scale: number;
  /** Most octaves used (fewer for far, coarse samples). */
  readonly octaves: number;
  /** Subtracted from the 0..1 noise before scaling (0.5 centres it). */
  readonly centre: number;
  readonly amount: number;
  /** Only in close-up samples (needs at least this many octaves of detail). */
  readonly nearOnly?: number;
  /** Fades the layer in where a second noise field is between `from` and `to`. */
  readonly mask?: { readonly salt: number; readonly scale: number; readonly octaves: number; readonly from: number; readonly to: number };
}

/** A kind of way across the land: how wide, what it is laid with, how much it wanders, and how it ranks against others. */
export interface WayGradeDef {
  /** Higher ranks win where ways overlap; a link takes the lower rank of its two ends. */
  readonly rank: number;
  readonly tile: string;
  /** Width in metres. */
  readonly width: number;
  /** Sideways wander as a share of the link's length (0 = straight). */
  readonly wander: number;
  /** What the way is carried over water on (sim/world/crossings.ts); without it the way cannot cross. */
  readonly bridge?: DeckLook;
}

/** What a deck over water (a bridge or a pier) is made of: tile ids for the planking, the rail along its sides and the posts under it. */
export interface DeckLook {
  readonly deck: string;
  readonly rail: string;
  readonly post: string;
}

/** A rule for the tile at the water's edge: within `within` metres of the waterline, `chance` of the time, the ground is `tile`. */
export interface ShoreRule {
  readonly within: number;
  readonly tile: string;
  readonly chance: number;
}

/**
 * Rivers and lakes (sim/world/water.ts). A river runs along a contour of a smooth noise field, so it is one long unbroken
 * line; its surface is the smoothed land at its middle, so it flows across slopes without a step. A lake sits in a basin
 * (its surface just under the lowest rim). Water carves its bed and lifts a small bank, and shores are tiles by rule.
 */
export interface WaterGenDef {
  readonly rivers: {
    readonly salt: number;
    readonly scale: number;
    readonly octaves: number;
    /** How far the field may be from its contour (noise units) before a point is far from any river. */
    readonly reject: number;
    /** Narrowest and widest river (metres, in damp land); dry land narrows them to nothing. */
    readonly width: readonly [number, number];
    readonly widthScale: number;
    readonly depth: number;
    readonly bank: number;
    /** The surface lies this far under the smoothed land at the middle. */
    readonly below: number;
    /** Water below this height is just the sea; above `highest` the land is too high for a river (it thins to a spring first). */
    readonly lowest: number;
    readonly highest: number;
    /** Moisture band in which rivers appear (none below `from`, full from `to`). */
    readonly wet: { readonly from: number; readonly to: number };
  };
  readonly lakes: {
    readonly salt: number;
    readonly cell: number;
    readonly chance: number;
    readonly radius: readonly [number, number];
    readonly depth: readonly [number, number];
    readonly bank: number;
    readonly lowest: number;
    readonly highest: number;
    /** Largest drop between the lowest and highest rim for the basin to hold a lake. */
    readonly rimDrop: number;
    readonly wetter: number;
  };
  /** First rule that fits a tile beside water wins. */
  readonly shore: readonly ShoreRule[];
  /** Where a bank sits above the waterline (metres) and the longest bridge. */
  readonly lip: number;
  readonly span: number;
  /** Ports: places of these kinds with water within `reach` metres of their edge get a quay and piers. */
  readonly harbour: {
    readonly sites: readonly string[];
    readonly reach: number;
    readonly pier: DeckLook & { readonly length: readonly [number, number]; readonly width: number };
    readonly quay: string;
    readonly piers: readonly [number, number];
  };
}

/** World-wide generation choices: the land's shape, moisture, woodland patches, roads, far-away colours. */
export interface WorldGenDef {
  readonly land: readonly LandLayer[];
  readonly moisture: { readonly salt: number; readonly scale: number; readonly octaves: number };
  readonly woods: { readonly salt: number; readonly scale: number; readonly from: number; readonly to: number; readonly min: number; readonly gain: number };
  /**
   * Roads, paths and trails join the places of the world (see sim/world/roads.ts). Each place says which grade it keeps
   * (`SiteDef.way`); a link between two places is as good as the lesser of their grades.
   * `above` is how strong the road signal must be to show from afar; `reach` the longest link (metres);
   * `lowest`/`highest` the ground a way may climb to; `wet` the share of a way that may lie under water before it is dropped.
   */
  readonly roads: { readonly above: number; readonly reach: number; readonly lowest: number; readonly highest: number; readonly wet: number; readonly grades: Readonly<Record<string, WayGradeDef>> };
  /** Distant land: steep slopes turn to rock, high ground to snow, roads show as a track. */
  readonly far: { readonly rock: RGB; readonly steep: number; readonly snow: RGB; readonly snowLine: number; readonly snowJitter: number; readonly road: RGB };
  /** Rivers, lakes, shores, bridges and harbours. */
  readonly water: WaterGenDef;
}
