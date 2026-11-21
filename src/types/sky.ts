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
  /** How fast it drifts, as a share of the wind (high layers run faster). */
  speed: number;
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
  /** Beyond this distance clouds fade into the haze (metres). */
  cloudRange: number;
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
