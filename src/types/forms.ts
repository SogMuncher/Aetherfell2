import type { PartShape, Surface } from './looks';

/**
 * How a world object is put together, as data: trees, bushes, rocks, standing stones, haystacks,
 * wells, reeds, mushrooms. Like creature looks (types/looks.ts), an object is a handful of solid
 * pieces (balls, boxes, cones) in metres, but instead of fixed positions each piece is a small
 * growth rule: how many copies, where on its parent they sprout, how far they lean and turn, and
 * how big they are, all as ranges. Every individual grows its own way from a seed, so one recipe
 * gives a whole wood of different oaks.
 *
 * Coordinates are the object's own: [forward, up, side] in metres from the middle of its foot.
 * Every piece has a foot (where it is attached) and a top (foot + its height along its own up):
 * a cone's foot is its base and its top the tip; a ball's or box's foot is the bottom of the shape.
 */
export type FormId = string;

/** A fixed number, or a [low, high] range that each individual picks from. */
export type Span = number | readonly [number, number];

export interface PieceDef {
  shape: PartShape;
  /**
   * Radii [forward, up, side] in metres. For a cone, `up` is its full length. When the side radius
   * is left as 0 it copies the forward one, so round trunks stay round when they vary.
   */
  size: readonly [Span, Span, Span];
  /** The colour region it belongs to ('bark', 'leaf'), or a fixed '#rrggbb'. */
  color: string;
  surface?: Surface;
  /** How many copies grow (default 1). */
  count?: Span;
  /** Each copy grows with this chance (0..1, default 1). */
  chance?: number;
  /** Only grows on individuals that have this feature ('apples'); '!moss' = only on those without. */
  feature?: string;
  /**
   * Where copies sprout on the parent: its foot, its top, or somewhere `along` it. Top-level pieces
   * grow from the ground in the middle. Default: the top.
   */
  on?: 'foot' | 'top' | 'along';
  /** For `on: 'along'`: how far up the parent (0 = foot, 1 = top). */
  along?: Span;
  /** Metres out from the parent's axis (or the middle), across its sides: stones in a ring, leaf clumps around a crown. */
  spread?: Span;
  /** Degrees away from the parent's up direction (0 = straight on, 90 = straight out sideways). */
  lean?: Span;
  /** Extra degrees of turn about the parent's axis. Copies are already spaced evenly around it, with a little jitter. */
  turn?: Span;
  /** Metres along its own up direction before it starts (negative sinks it into the parent or the ground). */
  lift?: Span;
  /** Metres straight up from where it sprouts, before leaning: a well's roof over its posts, a log resting on the ground. */
  raise?: Span;
  /**
   * Copies are spaced evenly around the parent's axis (default). With `around: false` they all face
   * the same way (a random way per individual, plus `turn`) and are moved about by `offset` instead:
   * logs stacked side by side in a woodpile.
   */
  around?: boolean;
  /** Extra shift of each copy in the parent's [forward, up, side] metres. */
  offset?: readonly [Span, Span, Span];
  /**
   * Grows end to end this many times, each link smaller and bent a little more: a crooked trunk, a
   * stack of fir tiers. `step` is the share of a link's height before the next one starts (default 0.9;
   * fir tiers overlap at about 0.4).
   */
  chain?: { readonly links: Span; readonly shrink: Span; readonly bend: Span; readonly step?: number };
  /** Pieces that grow from this one (from the last link of a chain, or a random link for `along`). */
  children?: readonly PieceDef[];
  /** Each copy is lighter or darker by up to this share (0.1 = ±10%), so leaves and stones are not all one shade. */
  shade?: number;
  /**
   * Keeps its parent's facing exactly (no random turn, copies spaced exactly evenly): for made
   * things whose parts must line up, like a crate's corner posts or a chest's lid.
   */
  align?: boolean;
}

export interface FormDef {
  /** Pixels per metre. Higher is finer (trees ≈ 8, small things ≈ 16). */
  ppm?: number;
  /**
   * Colour regions and the colours each may take: '#rrggbb' or '@palette' (content/palettes.ts).
   * Every placed object picks its own, so two oaks grown the same way still wear different greens.
   */
  colors: Readonly<Record<string, readonly string[]>>;
  /** Optional features and the chance (0..1) an individual has one. */
  features?: Readonly<Record<string, number>>;
  pieces: readonly PieceDef[];
  /** How many different individuals are grown (default 6). Each placed object is one of them. */
  variants?: number;
  /**
   * Sides it is drawn from: 8 (default) shows a different face as you walk around it; 1 for things
   * that look the same from everywhere (a ball of a bush), which saves painting time.
   */
  views?: number;
  /** Each placed object is this much bigger or smaller at most (0.15 = ±15%). */
  vary?: number;
}
