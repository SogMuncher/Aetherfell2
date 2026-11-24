// Ambient one-shots as data: birds, owls, frogs, drips, rumbles… each says where it belongs (under open sky or deep below).

/** One voice of a sound: a tone (wave) or a noise burst (noise filter), repeated `count` times. */
export interface AmbientPart {
  wave?: OscillatorType;
  noise?: BiquadFilterType;
  /** Hz range, picked once per playing. */
  freq: readonly [number, number];
  dur: number;
  level: number;
  /** Repeats and the seconds between them (plus a little jitter). */
  count?: readonly [number, number];
  gap?: number;
  /** Each repeat's pitch is the last one's times this. */
  drift?: number;
  /** Seconds after the sound starts. */
  at?: number;
  /** Tone: glide in from freq·from over `glide` s; slide to freq·to over the note. Noise: sweep to freq·to. */
  from?: number;
  glide?: number;
  to?: number;
  vibrato?: number;
  vibratoRate?: number;
  tremolo?: number;
  tremoloRate?: number;
  /** Tone: a resonant body (Hz, Q). Noise: Q of the filter. */
  band?: number;
  q?: number;
  attack?: number;
  hold?: number;
}

/** What around you a sound needs, 0..1 each (at least this much). */
export type AmbientNeed = 'trees' | 'water' | 'fire' | 'wind' | 'dry' | 'bare';

export interface AmbientSound {
  /** 'sky' plays only in a realm with open sky (the surface); 'deep' only in a realm without one (below). */
  where: 'sky' | 'deep';
  time?: 'day' | 'night';
  needs?: Partial<Record<AmbientNeed, number>>;
  /** Seconds between playings when its needs are just met (more of what it needs = more often). */
  every: readonly [number, number];
  /** Distance range in metres (sets loudness and stereo). */
  far: readonly [number, number];
  parts: readonly AmbientPart[];
}

export const AMBIENT_SOUNDS: Readonly<Record<string, AmbientSound>> = {
  // --- Under open sky --------------------------------------------------------------------------
  trill: { where: 'sky', time: 'day', needs: { trees: 0.05, dry: 0.7 }, every: [3, 12], far: [6, 30], parts: [{ wave: 'sine', freq: [2200, 3600], dur: 0.08, level: 0.03, count: [3, 5], gap: 0.12, from: 1.3, glide: 0.06 }] },
  whistle: { where: 'sky', time: 'day', needs: { trees: 0.05, dry: 0.7 }, every: [5, 16], far: [8, 30], parts: [{ wave: 'sine', freq: [1800, 2900], dur: 0.35, level: 0.025, from: 1.4, glide: 0.3, vibrato: 0.06, vibratoRate: 30 }] },
  chatter: { where: 'sky', time: 'day', needs: { trees: 0.1, dry: 0.7 }, every: [6, 18], far: [6, 25], parts: [{ wave: 'triangle', freq: [2400, 3400], dur: 0.05, level: 0.02, count: [4, 7], gap: 0.07, drift: 1.04 }] },
  crow: { where: 'sky', time: 'day', needs: { dry: 0.5 }, every: [25, 70], far: [20, 60], parts: [{ wave: 'sawtooth', freq: [520, 680], dur: 0.22, level: 0.03, count: [2, 4], gap: 0.4, to: 0.8, band: 1300, q: 3, tremolo: 0.4, tremoloRate: 40 }] },
  woodpecker: { where: 'sky', time: 'day', needs: { trees: 0.3 }, every: [30, 80], far: [15, 45], parts: [{ noise: 'bandpass', freq: [1200, 1800], dur: 0.02, level: 0.05, count: [8, 14], gap: 0.055, q: 4 }] },
  gull: { where: 'sky', time: 'day', needs: { water: 0.2 }, every: [10, 30], far: [20, 60], parts: [{ wave: 'sine', freq: [1500, 2000], dur: 0.4, level: 0.025, count: [1, 3], gap: 0.5, to: 0.65, vibrato: 0.03, vibratoRate: 18 }] },
  buzz: { where: 'sky', time: 'day', needs: { trees: 0.15, dry: 0.9 }, every: [15, 40], far: [2, 6], parts: [{ wave: 'sawtooth', freq: [180, 260], dur: 1.4, level: 0.008, band: 900, q: 2, tremolo: 0.7, tremoloRate: 35, vibrato: 0.04, vibratoRate: 3, hold: 0.6 }] },
  crickets: { where: 'sky', time: 'night', needs: { dry: 0.8 }, every: [0.3, 1.2], far: [4, 18], parts: [{ wave: 'sine', freq: [4200, 5200], dur: 0.035, level: 0.02, count: [3, 3], gap: 0.05, attack: 0.004 }] },
  owl: { where: 'sky', time: 'night', needs: { trees: 0.1 }, every: [20, 60], far: [15, 45], parts: [{ wave: 'sine', freq: [330, 420], dur: 0.35, level: 0.05, count: [2, 4], gap: 0.55, from: 1.06, glide: 0.08, drift: 0.97, attack: 0.05, hold: 0.5 }] },
  frogs: { where: 'sky', time: 'night', needs: { water: 0.1 }, every: [2, 7], far: [6, 25], parts: [{ wave: 'sawtooth', freq: [110, 180], dur: 0.18, level: 0.03, count: [2, 5], gap: 0.22, band: 600, q: 4, tremolo: 0.8, tremoloRate: 28 }] },
  nightjar: { where: 'sky', time: 'night', needs: { bare: 0.4, dry: 0.8 }, every: [25, 70], far: [20, 50], parts: [{ wave: 'square', freq: [700, 900], dur: 1.8, level: 0.006, band: 1600, q: 5, tremolo: 0.9, tremoloRate: 26, hold: 0.7 }] },
  creak: { where: 'sky', needs: { trees: 0.2, wind: 0.35 }, every: [8, 25], far: [4, 20], parts: [{ wave: 'sawtooth', freq: [70, 110], dur: 0.9, level: 0.03, band: 700, q: 8, to: 1.3, tremolo: 0.9, tremoloRate: 22 }] },
  rustle: { where: 'sky', needs: { trees: 0.15, wind: 0.2 }, every: [4, 14], far: [3, 15], parts: [{ noise: 'highpass', freq: [2500, 4000], dur: 0.6, level: 0.03, attack: 0.2, hold: 0.3, q: 0.7 }] },
  lap: { where: 'sky', needs: { water: 0.25 }, every: [3, 9], far: [3, 12], parts: [{ noise: 'lowpass', freq: [500, 800], dur: 0.35, level: 0.04, count: [1, 3], gap: 0.5, to: 0.6, attack: 0.08 }] },
  // --- Deep below --------------------------------------------------------------------------------
  drip: { where: 'deep', every: [1.5, 6], far: [3, 25], parts: [{ wave: 'sine', freq: [900, 1500], dur: 0.06, level: 0.04, to: 2.2, attack: 0.001 }] },
  plink: { where: 'deep', every: [6, 18], far: [8, 35], parts: [{ wave: 'sine', freq: [1400, 2200], dur: 0.04, level: 0.03, count: [2, 4], gap: 0.9, drift: 0.94, to: 1.8, attack: 0.001 }] },
  rumble: { where: 'deep', every: [40, 110], far: [40, 90], parts: [{ noise: 'lowpass', freq: [80, 140], dur: 3, level: 0.12, attack: 0.8, hold: 0.4, to: 0.7 }] },
  rockfall: { where: 'deep', every: [60, 150], far: [25, 70], parts: [{ noise: 'lowpass', freq: [400, 900], dur: 0.12, level: 0.07, count: [4, 9], gap: 0.13, drift: 0.9 }, { noise: 'lowpass', freq: [120, 200], dur: 1.2, level: 0.06, attack: 0.05 }] },
  groan: { where: 'deep', every: [30, 90], far: [15, 50], parts: [{ wave: 'sawtooth', freq: [45, 65], dur: 1.6, level: 0.04, band: 260, q: 6, to: 0.85, tremolo: 0.6, tremoloRate: 9, attack: 0.4 }] },
  moan: { where: 'deep', every: [20, 60], far: [20, 60], parts: [{ noise: 'bandpass', freq: [300, 480], dur: 4, level: 0.05, q: 9, to: 0.7, attack: 1.4, hold: 0.4 }] },
  skitter: { where: 'deep', every: [15, 45], far: [4, 18], parts: [{ noise: 'highpass', freq: [3000, 5000], dur: 0.015, level: 0.03, count: [5, 11], gap: 0.045, q: 1 }] },
  bats: { where: 'deep', every: [30, 90], far: [6, 25], parts: [{ wave: 'sine', freq: [6000, 8200], dur: 0.03, level: 0.012, count: [3, 7], gap: 0.09, from: 1.2, glide: 0.02 }] },
  chain: { where: 'deep', every: [50, 140], far: [15, 45], parts: [{ wave: 'square', freq: [2400, 3800], dur: 0.08, level: 0.008, count: [3, 6], gap: 0.12, drift: 1.07, band: 3200, q: 6 }] },
  knock: { where: 'deep', every: [60, 160], far: [25, 70], parts: [{ noise: 'lowpass', freq: [500, 750], dur: 0.06, level: 0.08, count: [2, 4], gap: 0.7, q: 2 }] },
  sigh: { where: 'deep', every: [70, 180], far: [10, 35], parts: [{ noise: 'bandpass', freq: [600, 900], dur: 1.8, level: 0.025, q: 7, to: 0.65, attack: 0.6 }] },
  trickle: { where: 'deep', needs: { water: 0.1 }, every: [2, 6], far: [4, 18], parts: [{ wave: 'sine', freq: [700, 1300], dur: 0.04, level: 0.02, count: [3, 6], gap: 0.08, drift: 1.1, to: 1.6 }] },
};
