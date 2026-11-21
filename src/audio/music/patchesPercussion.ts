import { type Patch, nyq } from './synth';


// --- Percussion ------------------------------------------------------------------------------

/** Big taiko-like war drum. */
export const taiko: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.5, 0.002, 0.45, 0.0001, 0.2);
  const o = s.osc('sine', 95, n.t, end, g);
  o.frequency.exponentialRampToValueAtTime(48, n.t + 0.25);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, 0.01, n.vel * 0.22, 0.001, 0.12, 0.0001, 0.08);
  s.noiseSrc(n.t, n.t + 0.3, s.filter('lowpass', 900, 0.7, ng));
};

/** Tuned timpani: rings at the note's pitch. */
export const timpani: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.4, 0.003, 1.4, 0.0001, 0.4);
  const o = s.osc('sine', n.freq * 1.04, n.t, end, g);
  o.frequency.exponentialRampToValueAtTime(n.freq, n.t + 0.08);
  const h = s.gain(g);
  h.gain.value = 0.3;
  s.osc('sine', n.freq * 1.5, n.t, n.t + 0.6, h, 0, false);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, 0.01, n.vel * 0.12, 0.001, 0.08, 0.0001, 0.05);
  s.noiseSrc(n.t, n.t + 0.2, s.filter('lowpass', 1500, 0.6, ng));
};

/** Hand frame drum: "dum" when low, "tek" when bright. */
export const frameDrum: Patch = (s, out, n) => {
  const tek = (n.bright ?? 0.3) > 0.5;
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * (tek ? 0.14 : 0.32), 0.001, tek ? 0.06 : 0.22, 0.0001, 0.06);
  if (tek) {
    s.noiseSrc(n.t, end, s.filter('bandpass', 2800, 1.4, g));
  } else {
    const o = s.osc('sine', 170, n.t, end, g);
    o.frequency.exponentialRampToValueAtTime(110, n.t + 0.12);
    const ng = s.gain(out);
    s.adsr(ng.gain, n.t, 0.01, n.vel * 0.06, 0.001, 0.05, 0.0001, 0.04);
    s.noiseSrc(n.t, n.t + 0.12, s.filter('bandpass', 900, 1, ng));
  }
};

export const shaker: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.06, 0.012, 0.05, 0.0001, 0.04);
  s.noiseSrc(n.t, end, s.filter('highpass', 6500, 0.7, g));
};

/** Snare-ish rim for marching battle rhythms. */
export const snare: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.2, 0.001, 0.13, 0.0001, 0.06);
  s.noiseSrc(n.t, end, s.filter('bandpass', 2200, 0.9, g));
  const tg = s.gain(out);
  s.adsr(tg.gain, n.t, 0.01, n.vel * 0.12, 0.001, 0.05, 0.0001, 0.03);
  const o = s.osc('triangle', 300, n.t, n.t + 0.12, tg, 0, false);
  o.frequency.exponentialRampToValueAtTime(190, n.t + 0.05);
};

/** Rising cymbal swell that peaks at t + dur — leads into a big moment. */
export const swell: Patch = (s, out, n) => {
  const g = s.gain(out);
  g.gain.setValueAtTime(0, n.t);
  g.gain.linearRampToValueAtTime(n.vel * 0.12, n.t + n.dur);
  g.gain.setTargetAtTime(0, n.t + n.dur, 0.6);
  const hp = s.filter('highpass', 1500, 0.5, g);
  hp.frequency.setValueAtTime(1500, n.t);
  hp.frequency.exponentialRampToValueAtTime(6000, n.t + n.dur);
  s.noiseSrc(n.t, n.t + n.dur + 3, hp);
};

/** Crash at the top of a swell. */
export const crash: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.12, 0.002, 2.2, 0.0001, 0.6);
  s.noiseSrc(n.t, end, s.filter('highpass', 4000, 0.4, g));
};

/** Deep impact for transitions: a sub drop with a rumble tail. */
export const boom: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.5, 0.004, 2.5, 0.0001, 0.8);
  const o = s.osc('sine', 80, n.t, end, g);
  o.frequency.exponentialRampToValueAtTime(30, n.t + 1.5);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, 0.01, n.vel * 0.18, 0.01, 1.8, 0.0001, 0.5);
  s.noiseSrc(n.t, n.t + 2.5, s.filter('lowpass', 220, 0.7, ng), 0.5);
};

/** Heartbeat: lub-dub. */
export const heartbeat: Patch = (s, out, n) => {
  for (const [dt, v] of [[0, 1], [0.17, 0.7]] as const) {
    const g = s.gain(out);
    const end = s.adsr(g.gain, n.t + dt, 0.01, n.vel * 0.35 * v, 0.004, 0.16, 0.0001, 0.06);
    const o = s.osc('sine', 62, n.t + dt, end, g);
    o.frequency.exponentialRampToValueAtTime(38, n.t + dt + 0.12);
  }
};

/** Anvil clang for battle accents. */
export const anvil: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.07, 0.001, 0.9, 0.0001, 0.2);
  s.fm(g, n.freq, 2.41, 3, n.t, end, 0.15);
};

// --- Dark textures ---------------------------------------------------------------------------

/** Slow metallic scrape: resonant noise sweeping. */
export const scrape: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.05, n.dur * 0.4, 0.5, 0.7, 1);
  const bp = s.filter('bandpass', n.freq, 18, g);
  bp.frequency.setValueAtTime(n.freq, n.t);
  bp.frequency.exponentialRampToValueAtTime(n.freq * (Math.random() < 0.5 ? 0.6 : 1.7), n.t + n.dur);
  s.noiseSrc(n.t, end, bp);
};

/** Whispering voices: noise through drifting vocal formants. */
export const whisper: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.07, n.dur * 0.3, 0.4, 0.7, 0.8);
  for (const f of [500, 1500, 2500]) {
    const bp = s.filter('bandpass', f, 8, g);
    bp.frequency.setValueAtTime(f * (0.8 + Math.random() * 0.4), n.t);
    bp.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.4), n.t + n.dur);
    s.noiseSrc(n.t, end, bp);
  }
};

/** Water drip in a cavern. */
export const drip: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.08, 0.001, 0.08, 0.0001, 0.05);
  const o = s.osc('sine', n.freq, n.t, end, g);
  o.frequency.exponentialRampToValueAtTime(n.freq * 2.2, n.t + 0.06);
};

/** A cluster of close sines that beat against each other — unease. */
export const cluster: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.05, n.dur * 0.5, 0.5, 0.8, 1.5);
  for (const r of [1, 1.0595, 1.122]) s.osc('sine', n.freq * r, n.t, end, g, 0, r === 1);
};

/** Reversed-sounding swell on a pitch — a breath before something. */
export const rise: Patch = (s, out, n) => {
  const g = s.gain(out);
  g.gain.setValueAtTime(0, n.t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.vel * 0.08), n.t + n.dur);
  g.gain.setTargetAtTime(0, n.t + n.dur, 0.05);
  const lp = s.filter('lowpass', n.freq * 1.5, 1, g);
  lp.frequency.exponentialRampToValueAtTime(Math.min(nyq(s), n.freq * 8), n.t + n.dur);
  s.osc('sawtooth', n.freq, n.t, n.t + n.dur + 0.3, lp, -8);
  s.osc('sawtooth', n.freq, n.t, n.t + n.dur + 0.3, lp, 8, false);
};
