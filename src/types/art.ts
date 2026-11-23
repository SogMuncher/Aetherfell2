// One recipe type for every picture built from parts: creatures, people, trees, rocks, plants, props (one assembler draws them all)
/**
 * Every procedural sprite in the game is an ArtDef: a handful of solid parts (balls, boxes, cones,
 * drums) in metres, filled from colour regions at draw time. The one assembler
 * (render/entities/assembler.ts) builds, poses and paints them from 8 directions, so a new
 * creature, tree or barrel is one table entry (content/looks.ts, forms.ts, smallForms.ts, props.ts all
 * feed `Content.art`), never new drawing code.
 *
 * Coordinates are the thing's own: [forward, up, side] in metres from the middle of its foot on the
 * ground. Side is positive on its left. A part is placed one of two ways:
 * - fixed: `at` gives its spot (centre of a ball, box or drum; base of a cone). Fixed parts are the
 *   joints of things that move (`id`, `parent`, `pivot`, `stride`…): legs swing, heads lunge.
 * - grown: no `at`; growth rules (count, where on its parent, lean, turn, ranges) place copies, so
 *   one recipe gives a whole wood of different oaks. A grown part's foot is where it attaches and its
 *   top its far end (a cone's tip, the top of a ball or box). Grown parts move with the joint they
 *   grow from.
 */
export type ArtId = string;

export type Vec3 = readonly [number, number, number];

/** A fixed number, or a [low, high] range that each individual picks from. */
export type Span = number | readonly [number, number];

/** 'drum' is an upright cylinder (a barrel, a post, a torch shaft), centred like a ball or box. */
export type PartShape = 'ball' | 'box' | 'cone' | 'drum';

/**
 * Surface texture and shine. 'glow' ignores shading (eyes, embers). 'leaves' has ragged, see-through
 * edges (foliage, needles, reeds); 'bark' runs in streaks along the piece; 'stone' is mottled;
 * 'thatch' runs in bands; 'wood' shows rings and grain.
 */
export type Surface = 'smooth' | 'skin' | 'fur' | 'cloth' | 'scales' | 'shell' | 'metal' | 'glow' | 'leaves' | 'bark' | 'stone' | 'thatch' | 'wood';

export interface ArtPart {
  shape: PartShape;
  /**
   * Radii [forward, up, side] in metres. For a cone, `up` is its full length. When a grown part's
   * side radius is 0 it copies the forward one, so round trunks stay round when they vary.
   */
  size: readonly [Span, Span, Span];
  /** The colour region it belongs to ('coat', 'bark'), filled from the def's `colors`, or a fixed '#rrggbb'. */
  color: string;
  surface?: Surface;
  /** Only on individuals with this feature ('beard'); '!hat' = only on those without. */
  feature?: string;
  /** Each copy is lighter or darker by up to this share (0.1 = ±10%). */
  shade?: number;
  /** Parts that grow from this one (from the last link of a chain, or a random link for `along`). */
  children?: readonly ArtPart[];

  // --- Fixed placement ---
  /** Fixed spot (see above). A part with `at` ignores the growth rules below. */
  at?: Vec3;
  /** Degrees about the side axis; positive tips the top forward. */
  tilt?: number;
  /** Degrees about the up axis; positive turns the front to the left. */
  yaw?: number;
  /** Degrees about the forward axis; positive leans the top to the left. */
  roll?: number;
  /** Also add a copy on the other side (side, yaw and roll mirrored; half a stride out of step). */
  mirror?: boolean;

  // --- Joints (fixed parts of things that move) ---
  /** Name so other parts can hang from it. */
  id?: string;
  /** Moves with this part (eyes and ears with the head, a hand with the arm). */
  parent?: string;
  /** The joint it swings about (hip, shoulder, neck). Defaults to `at`. */
  pivot?: Vec3;
  /** Swings while walking: degrees each way, and where in the stride (0..1) it is furthest forward. */
  stride?: { swing: number; phase: number };
  /** Extra swing (degrees) at the moment of an attack: a lunging head, a raised arm. */
  strike?: number;
  /** Swing (degrees) while resting: a wagging tail, a breathing chest. */
  idle?: number;

  // --- Growth (parts without `at`) ---
  /** How many copies grow (default 1). */
  count?: Span;
  /** Each copy grows with this chance (0..1, default 1). */
  chance?: number;
  /** Where copies sprout on the parent: its foot, its top (default), or somewhere `along` it. Top-level parts grow from the ground in the middle. */
  on?: 'foot' | 'top' | 'along';
  /** For `on: 'along'`: how far up the parent (0 = foot, 1 = top). */
  along?: Span;
  /** Metres out from the parent's axis (or the middle): stones in a ring, leaf clumps round a crown. */
  spread?: Span;
  /** Degrees away from the parent's up direction (0 = straight on, 90 = straight out sideways). */
  lean?: Span;
  /** Extra degrees of turn about the parent's axis. Copies are already spaced evenly around it, with a little jitter. */
  turn?: Span;
  /** Metres along its own up direction before it starts (negative sinks it into the parent or the ground). */
  lift?: Span;
  /** Metres straight up from where it sprouts, before leaning: a well's roof over its posts. */
  raise?: Span;
  /** false: copies all face one way (random per individual, plus `turn`) and are moved by `offset`: logs in a woodpile. */
  around?: boolean;
  /** Extra shift of each copy in the parent's [forward, up, side] metres. */
  offset?: readonly [Span, Span, Span];
  /**
   * Grows end to end this many times, each link smaller and bent a little more: a crooked trunk, a
   * stack of fir tiers. `step` is the share of a link's height before the next starts (default 0.9).
   */
  chain?: { readonly links: Span; readonly shrink: Span; readonly bend: Span; readonly step?: number };
  /** Keeps its parent's facing exactly (no random turn, copies spaced exactly evenly): a lid on its chest. */
  align?: boolean;
}

export interface GaitDef {
  /** Metres covered by one full stride (both legs). Longer strides animate slower at the same speed. */
  stride: number;
  /** How far the body rises during a stride (metres). */
  bounce: number;
  /** Bounds along in one arc per stride (toads, rabbits) instead of a rise per footfall. */
  hop?: boolean;
}

export interface ArtDef {
  /** Pixels per metre (default 10). Higher is finer (trees ≈ 8, creatures ≈ 18, small things ≈ 16). */
  ppm?: number;
  /**
   * Colour regions and the colours each may take: '#rrggbb' or '@palette' (content/palettes.ts).
   * Every individual or placed copy picks its own, laid over the shared picture when drawn.
   */
  colors: Readonly<Record<string, readonly string[]>>;
  /** Optional features and the chance (0..1) an individual has one. */
  features?: Readonly<Record<string, number>>;
  parts: readonly ArtPart[];
  /** How many different shapes are built (default 6). Each placed thing is one of them, in its own colours. */
  variants?: number;
  /** Sides it is drawn from: 8 (default), or 1 for things that look the same from everywhere. */
  views?: number;
  /** Each placed one is this much bigger or smaller at most (0.15 = ±15%). */
  vary?: number;
  /** It walks: animated walk/rest/attack poses, and it faces where it goes. */
  gait?: GaitDef;
  /** The whole body leans forward (degrees) and lunges (metres) as it strikes. */
  attack?: { lean: number; lunge: number };
}

/** Clothing and features a role or faction puts on an individual (a smith's apron, an elder's beard). */
export interface DressDef {
  /** Replaces the def's choices for these colour slots. */
  colors?: Readonly<Record<string, readonly string[]>>;
  /** Always has these features. */
  features?: readonly string[];
  /** Never has these features. */
  without?: readonly string[];
}
