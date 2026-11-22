import type { TileInfo, TileKind } from './tiles';

/**
 * MATTER — one way to talk about "the stuff at a place", whatever holds it.
 *
 * The world keeps stuff in two stores: the flat tile map (ground, trees, old walls) and the 3D layer
 * (buildings, floors, roofs, dungeon halls). To everything that happens to stuff — fire, rain, frost,
 * oil, soot, blows, bolts — they are the same thing: a SPOT with a material (a tile kind: flammable?
 * how hard? what does it burn into?) and a little state (wet, fire, fuel, oil, soot, wear).
 *
 * A spot is (x, y, z) whole metres. `z = GROUND_Z` means "the tile on the ground at this column";
 * any other z is a cell of the 3D layer. Systems use `ctx.matter` and never ask which store it is.
 * New kinds of stuff (a ship's deck, a cave wall) join by being a material, not by new rules.
 */
export const GROUND_Z = -2048;

/** Which state a spot carries. */
/** `temp` is degrees above (+) or below (-) the surroundings, for ground and cells alike (rules.temperature). */
export type MatterField = 'wet' | 'fire' | 'oil' | 'soot' | 'frost' | 'fuel' | 'wear' | 'temp';

/**
 * The states that show ON stuff as a blend over its own unchanged material, in blending order. Each has a look row in
 * content/matterStates.ts; when the value falls back to 0 the stuff looks exactly as it did. A new state = a field here,
 * its storage (chunk + brick), and a row of data.
 */
export const SHOWN_STATES = ['soot', 'wet', 'oil', 'frost', 'fire'] as const;
export type ShownState = (typeof SHOWN_STATES)[number];

/** How a state looks at full strength (255); weaker, it blends in part-way. */
export interface StateLookDef {
  /** The colour beneath is multiplied by this (soot darkens, wet darkens and cools). */
  shade?: readonly [number, number, number];
  /** This share of the colour beneath is covered by a flat colour ('#rrggbb') or by a surface's own texture (content/surfaces.ts). */
  cover?: { amount: number; colour: string } | { amount: number; surface: string };
  /** Bright specks: this share of the texels lightened by `amount` (oil sheen, glittering frost). */
  glint?: { share: number; amount: number };
  /** Light it gives off (flames), flickering. */
  glow?: readonly [number, number, number];
  /** Rain adds this much strength to stuff open to the sky. */
  rain?: number;
  /** Things resting on it keep this much of their speed each second when it is full strength (frost is slick). */
  slide?: number;
}

/** A number that names a spot, safe as a Map key. Ground spots and cells never collide. */
export function spotKey(x: number, y: number, z: number): number {
  return ((x + 524288) * 1048576 + (y + 524288)) * 4096 + (z + 2048);
}

export function unpackSpot(key: number): { x: number; y: number; z: number } {
  const z = (key % 4096) - 2048;
  const rest = Math.floor(key / 4096);
  const y = (rest % 1048576) - 524288;
  const x = Math.floor(rest / 1048576) - 524288;
  return { x, y, z };
}

/** Everything that acts on matter goes through this (handed to systems as `ctx.matter`). */
export interface MatterAccess {
  /** The material at the spot, or null for an empty cell. */
  info(x: number, y: number, z: number): TileInfo | null;
  kind(x: number, y: number, z: number): TileKind | -1;
  /** True where a cell of the 3D layer (not ground) holds something. */
  solid(x: number, y: number, z: number): boolean;
  get(field: MatterField, x: number, y: number, z: number): number;
  set(field: MatterField, x: number, y: number, z: number, v: number): void;
  /** Swaps the material (burnt away, broken, water to ice). A cell whose new material is not a solid block disappears, leaving that stuff on the ground below if it stood there. */
  setKind(x: number, y: number, z: number, kind: TileKind): void;
  /** Open to the sky above it, so rain and sun reach it. */
  exposed(x: number, y: number, z: number): boolean;
  /** How wet it is: its own wetness and frost plus the weather's where it is exposed. */
  wetness(x: number, y: number, z: number): number;
  /** Spots that touch this one: fire, heat and damp creep along them. `weight` is how strongly (fire climbs). */
  forNeighbours(x: number, y: number, z: number, fn: (x: number, y: number, z: number, weight: number) => void): void;
  /** The cell of the 3D layer at a point in space, if it holds something there (shapes count where they really fill). */
  cellAt(x: number, y: number, z: number): { x: number; y: number; z: number } | null;
  /** Every spot with fire in it. */
  burning(): number[];
  /** Every spot with local dampness that is drying. */
  damp(): number[];
  /** Every spot warmer or colder than its surroundings (it settles back over time). */
  warm(): number[];
  /** Every spot carrying wear from blows (it mends over time). */
  worn(): number[];
  /** Registers a spot as burning / damp / not (state changes do this by themselves; used when fire is set directly). */
  count(): { burning: number; damp: number };
}
