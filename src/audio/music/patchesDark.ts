// Dark-fantasy voices: hurdy-gurdy, duduk, bone flute, wraith, monks, music box, lyre, war horn, bowed bass, dark pad.
import { type Patch, nyq } from './synth';

/** Hurdy-gurdy: a buzzing wheel-bowed string over its own fifth drone. */
export const hurdyGurdy: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.05, 0.06, 0.2, 0.85, 0.25);
  const bp = s.filter('bandpass', Math.min(nyq(s), n.freq * 3), 1.2, g);
  const o = s.osc('sawtooth', n.freq, n.t, end, bp);
  s.vibrato(o.frequency, n.freq, 0.004, 5.5, n.t, 0.2, end);
  s.osc('sawtooth', n.freq * 0.75, n.t, end, bp, 3, false);
  // The trompette: a rough rattle of noise that buzzes with the bow.
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, n.dur, n.vel * 0.02, 0.05, 0.2, 0.6, 0.2);
  s.noiseSrc(n.t, end, s.filter('bandpass', n.freq * 4, 6, ng));
};

/** Duduk: a soft, mournful double reed with slow, wide vibrato and a scoop into each note. */
export const duduk: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.09, 0.12, 0.3, 0.8, 0.35);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * (2 + (n.bright ?? 0.4) * 2)), 1.5, g);
  const o = s.osc('triangle', n.freq * 0.97, n.t, end, lp);
  o.frequency.setTargetAtTime(n.freq, n.t, 0.06);
  s.vibrato(o.frequency, n.freq, 0.012, 4.2, n.t, 0.35, end);
  s.osc('square', n.freq, n.t, end, s.filter('lowpass', n.freq * 1.5, 0.5, lp), 0, false);
};

/** Bone flute: thin, hollow and airy, more breath than tone. */
export const boneFlute: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.07, 0.08, 0.2, 0.7, 0.3);
  const o = s.osc('sine', n.freq, n.t, end, g);
  s.vibrato(o.frequency, n.freq, 0.009, 3.6, n.t, 0.4, end);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, n.dur, n.vel * 0.05, 0.05, 0.2, 0.6, 0.3);
  s.noiseSrc(n.t, end, s.filter('bandpass', n.freq, 12, ng));
};

/** Wraith: a ghostly sliding sine, like a bowed saw or a voice far down a corridor. */
export const wraith: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.07, Math.min(0.8, n.dur * 0.4), 0.3, 0.8, 0.9);
  const o = s.osc('sine', n.freq * 0.94, n.t, end, g);
  o.frequency.setTargetAtTime(n.freq, n.t, 0.15);
  s.vibrato(o.frequency, n.freq, 0.018, 5.2, n.t, 0.5, end);
  s.osc('sine', n.freq * 2.01, n.t, end, s.filter('lowpass', n.freq * 2.5, 0.5, g), 0, false);
};

/** Monks: low male voices on one dark vowel. */
export const monks: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.1, Math.min(1.2, 0.4 + n.dur * 0.2), 0.5, 0.85, 1.4);
  const mix = s.ctx.createGain();
  for (const [f, q, lvl] of [[320, 8, 1], [700, 9, 0.4], [2400, 12, 0.08]] as const) {
    const fg = s.gain(g);
    fg.gain.value = lvl;
    mix.connect(s.filter('bandpass', f, q, fg));
  }
  for (const d of [-9, 0, 6, 13]) {
    const o = s.osc('sawtooth', n.freq, n.t, end, mix, d, d === 0);
    s.vibrato(o.frequency, n.freq, 0.004, 3.8 + d * 0.03, n.t, 0.6, end);
  }
};

/** Music box: a thin, slightly out-of-tune tine that rings and wavers. */
export const musicBox: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.1, 0.001, 1.6, 0.0001, 0.3);
  const o = s.osc('sine', n.freq, n.t, end, g, (Math.random() - 0.5) * 24);
  s.vibrato(o.frequency, n.freq, 0.003, 6.5, n.t, 0.1, end);
  s.osc('sine', n.freq * 5.4, n.t, n.t + 0.25, s.filter('highpass', 2000, 0.5, g), 0, false);
};

/** Lyre: a dark gut string, plucked close to the bridge. */
export const lyre: Patch = (s, out, n) => {
  const g = s.gain(out);
  const ring = Math.min(2.4, 0.7 + 160 / n.freq);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.14, 0.003, ring, 0.0001, 0.2);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 6), 0.8, g);
  lp.frequency.setTargetAtTime(n.freq * 1.2, n.t, ring / 5);
  s.osc('triangle', n.freq, n.t, end, lp);
  s.osc('sawtooth', n.freq * 1.002, n.t, end, lp, 0, false);
};

/** War horn: a raw, blaring low horn that swells and cuts through the drums. */
export const warHorn: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.08, 0.09, 0.3, 0.8, 0.3);
  const lp = s.filter('lowpass', n.freq * 1.5, 1.8, g);
  lp.frequency.setValueAtTime(n.freq * 1.5, n.t);
  lp.frequency.linearRampToValueAtTime(Math.min(nyq(s), n.freq * (4 + (n.bright ?? 0.6) * 4)), n.t + 0.25);
  const o = s.osc('sawtooth', n.freq * 0.985, n.t, end, lp);
  o.frequency.setTargetAtTime(n.freq, n.t, 0.05);
  s.osc('sawtooth', n.freq, n.t, end, lp, 9, false);
  s.osc('square', n.freq / 2, n.t, end, lp, 0, false);
};

/** Bowed double bass: low, gritty, with rosin noise on each stroke. */
export const bowedBass: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.12, 0.05, 0.25, 0.75, 0.25);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 5), 1, g);
  s.osc('sawtooth', n.freq, n.t, end, lp);
  s.osc('sawtooth', n.freq, n.t, end, lp, -8, false);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, 0.05, n.vel * 0.04, 0.01, 0.1, 0.0001, 0.05);
  s.noiseSrc(n.t, n.t + 0.2, s.filter('bandpass', n.freq * 6, 4, ng));
};

/** Dark pad: detuned saws under a low, slowly breathing filter. */
export const darkPad: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.05, Math.min(1.5, 0.5 + n.dur * 0.25), 0.6, 0.85, 1.6);
  const lp = s.filter('lowpass', n.freq * (1.2 + (n.bright ?? 0.3)), 2, g);
  lp.frequency.setValueAtTime(n.freq * (1.2 + (n.bright ?? 0.3)), n.t);
  lp.frequency.linearRampToValueAtTime(n.freq * (2.5 + (n.bright ?? 0.3) * 2), n.t + Math.max(0.5, n.dur * 0.6));
  lp.frequency.linearRampToValueAtTime(n.freq * 1.3, end);
  for (const d of [-14, -4, 5, 15]) s.osc('sawtooth', n.freq, n.t, end, lp, d, d === -4);
};
