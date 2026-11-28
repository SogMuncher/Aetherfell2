/** RGB, 0..255. */
export type Rgb = readonly [number, number, number];

/**
 * One layer of cloud: a sheet of drifting shapes at a height, made from a tileable pattern. How much
 * of the sky it covers follows the weather. Lower layers pass in front of higher ones.
 */
export interface CloudLayerDef {
  name: string;
  /** Height of the layer above sea level (metres). */
  height: number;
  /** Size of one cloud shape (metres). `stretch` > 1 draws them out along the wind (wisps, streaks). */
  scale: number;
  stretch?: number;
  /** Share of sky covered: `base` + `perCloud` × cloud cover + `perRain` × storminess (each 0..1). */
  cover: { base: number; perCloud: number; perRain: number };
  /** How soft the edges are (0.05 crisp puffs … 0.4 hazy sheets). */
  softness: number;
  /** Lumpiness of the pattern: 1 smooth sheet … 5 billowing heaps. */
  detail: number;
  /** Colour in full sun, and how much darker the thick middle gets (storm bellies). */
  tint: Rgb;
  belly: number;
  /** Most it hides the sky behind it (0..1). */
  opacity: number;
  /** How much sun it keeps off the ground below (0 = no shadow). */
  shadow: number;
  /**
   * How tall the cloud is (metres above `height`). 0 = a flat sheet. A thick layer is a real slab of
   * cloud: you see its flat dark base from below, its bright billowing top from above (a glider,
   * a mountain top), and you can fly into it.
   */
  thickness?: number;
  /** 0..1: how much taller the thick middle of a cloud stands than its thin edge (heaps and towers). 0 = a slab of even height. */
  tower?: number;
  /** 0..1: how lumpy the sides and top are. */
  billow?: number;
  /** 0..1: how much the land's moisture matters to this layer: more cloud over wet land, less over dry (0 = none). */
  wet?: number;
  /** 0..1: how much open water close by (rivers, lakes: `SkyDef.damp`) thickens this layer (ground mist over a river). */
  water?: number;
  /** Rain falls only under this layer (storm cells). */
  rain?: boolean;
  /** Pattern seed, so layers never line up with each other. */
  seed: number;
}

/** The sky as data: cloud layers, sky colours by time of day, sun, moon, stars and aurora. */
export interface SkyDef {
  layers: readonly CloudLayerDef[];
  colours: {
    zenith: { night: Rgb; day: Rgb; dusk: Rgb };
    horizon: { night: Rgb; day: Rgb; dusk: Rgb };
    /** Overcast grey at full day (it darkens toward night). */
    overcast: Rgb;
  };
  sun: { size: number; glow: Rgb; disc: Rgb };
  moon: { size: number; colour: Rgb; halo: Rgb };
  /** Share of sky points that hold a star (0.0035 ≈ a clear country night). */
  stars: { density: number };
  aurora: { colour: Rgb; edge: Rgb };
  /** Beyond this distance clouds fade out (metres). */
  cloudRange: number;
  /** How much clearer the air is up at cloud height than the ground haze: clouds fade into the horizon over `haze` × the fog distance. */
  haze: number;
  /**
   * The air is one stack of grids of cubic cells around the eye that every layer writes its cloud into, built on the
   * graphics card (render/airLevels.ts plans, gpu/gpuAirFill.ts fills), so all clouds and mist draw in one pass, nearest
   * first. `cell`: width of the finest cells (metres); `count`: cells along each side of a level; `tall`: cells from
   * bottom to top of a level; `lod`: cells along a view before they blend smoothly into cells twice as wide (the next
   * level, over the second half of each doubling of distance); `ext`: how much a metre of full-density air hides;
   * `self`: how much a cell's worth of cloud between it and the sun darkens a cloud (self-shadow); `perFrame`: levels
   * rebuilt per frame; `refresh`: seconds before level 0 is rebuilt for the weather (level k waits (k + 1) times as long).
   */
  air: { cell: number; count: number; tall: number; lod: number; ext: number; self: number; perFrame: number; refresh: number };
  /**
   * Damp air over open water: `count` × `count` cells `cell` wide round the eye hold how close a river or lake is (1 on
   * the water, 0 beyond `reach` metres); a layer's `water` × `shift` moves its edge there, so mist gathers over water.
   */
  damp: { cell: number; count: number; reach: number; shift: number };
  /**
   * Cloud shadows on the land: sun light walked up through the air cells into two maps round the eye (`size` texels of
   * `near` and of `far` metres). Each layer casts by its `shadow`; `ext` per metre of shadowing cloud, never darker than `floor`.
   */
  shade: { size: number; near: number; far: number; ext: number; floor: number };
  /** Sun rays (god rays): light streaming past clouds, hills and trees toward the eye. `strength`, `samples` along each ray, `decay` per sample, `reach` (share of the screen a ray spans). */
  rays: { strength: number; samples: number; decay: number; reach: number };
  /**
   * Smoke: a live level of air cells (`cell` wide, `count` × `count` × `tall`, round the eye) that burning stuff puts
   * smoke into (matter state look `smoke`). Every `step` seconds smoke rises (`rise` m/s), spreads to its sides
   * (`spread`, share per step) and thins (`fade`, share per second); the wind carries it like all the air. `ext`: how
   * much a metre of full smoke hides; `colour`: its colour in full light.
   */
  smoke: { cell: number; count: number; tall: number; step: number; rise: number; spread: number; fade: number; ext: number; colour: readonly [number, number, number] };
}

/** Floating motes in the air (dust, pollen, ash): a cheap way to make depth felt. Ambient per biome and realm. */
export interface AirDef {
  /** How many motes hang in the air around you. */
  count: number;
  colour: Rgb;
  /** 0..1 strength. */
  alpha: number;
  /** Drift in metres per second (x, y, z; z negative = falling). */
  drift: readonly [number, number, number];
  /** Size of the cloud of motes around you (metres), and how big each dot is (pixels). */
  box: number;
  size: number;
}
