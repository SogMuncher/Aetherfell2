// More instruments: wooden mallets, hammered strings, reeds, low brass, organ, gong and small hand percussion.
import { type Patch, nyq } from './synth';

/** Marimba: a woody sine with a quick knock and a hollow fourth partial. */
export const marimba: Patch = (s, out, n) => {
  const g = s.gain(out);
  const ring = Math.min(1.2, 0.35 + 90 / n.freq);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.24, 0.002, ring, 0.0001, 0.1);
  s.osc('sine', n.freq, n.t, end, g);
  const k = s.gain(g);
  s.adsr(k.gain, n.t, 0.01, 0.5, 0.001, 0.04, 0.0001, 0.02);
  s.osc('sine', n.freq * 4, n.t, n.t + 0.1, k, 0, false);
};

/** Hammered dulcimer: two slightly detuned bright strings that shimmer as they ring. */
export const dulcimer: Patch = (s, out, n) => {
  const g = s.gain(out);
  const ring = Math.min(3, 0.9 + 200 / n.freq);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.1, 0.002, ring, 0.0001, 0.3);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 10), 0.6, g);
  lp.frequency.setTargetAtTime(n.freq * 3, n.t, ring / 4);
  s.osc('sawtooth', n.freq, n.t, end, lp, -6);
  s.osc('sawtooth', n.freq, n.t, end, lp, 7, false);
};

/** Plucked strings section: short, round and tight. */
export const pizzicato: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.18, 0.003, 0.28, 0.0001, 0.08);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 5), 0.7, g);
  lp.frequency.setTargetAtTime(n.freq * 1.5, n.t, 0.06);
  s.osc('triangle', n.freq, n.t, end, lp);
  s.osc('sawtooth', n.freq, n.t, end, lp, 8, false);
};

/** Small church organ: stacked square stops, no attack, steady. */
export const organ: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.05, 0.04, 0.1, 0.9, 0.15);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * (3 + (n.bright ?? 0.5) * 4)), 0.5, g);
  s.osc('square', n.freq, n.t, end, lp);
  s.osc('sine', n.freq * 2, n.t, end, lp, 2, false);
  s.osc('sine', n.freq / 2, n.t, end, lp, -2, false);
};

/** Pan pipes: breathy sine with a chiff of noise on the attack. */
export const panpipe: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.12, 0.05, 0.2, 0.7, 0.2);
  const o = s.osc('sine', n.freq, n.t, end, g);
  s.vibrato(o.frequency, n.freq, 0.006, 4.5, n.t, 0.25, end);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, n.dur, n.vel * 0.035, 0.02, 0.1, 0.4, 0.1);
  s.noiseSrc(n.t, end, s.filter('bandpass', n.freq * 2, 3, ng));
};

/** Reed pipe (shawm, chanter): nasal, buzzy, a little wild. */
export const reed: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.06, 0.03, 0.2, 0.85, 0.12);
  const bp = s.filter('bandpass', Math.min(nyq(s), n.freq * 3), 1.4, g);
  const o = s.osc('sawtooth', n.freq, n.t, end, bp);
  s.osc('square', n.freq, n.t, end, bp, 9, false);
  s.vibrato(o.frequency, n.freq, 0.008, 6, n.t, 0.15, end);
};

/** Low brass (tuba, sackbut): warm, slow to open. */
export const tuba: Patch = (s, out, n) => {
  const g = s.gain(out);
  const a = Math.min(0.15, n.dur * 0.3);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.1, a, 0.3, 0.8, 0.2);
  const lp = s.filter('lowpass', n.freq * 1.5, 1, g);
  lp.frequency.linearRampToValueAtTime(Math.min(nyq(s), n.freq * 4), n.t + a + 0.08);
  s.osc('sawtooth', n.freq, n.t, end, lp);
  s.osc('triangle', n.freq / 2, n.t, end, lp, 0, false);
};

/** Gong: inharmonic FM shimmer that blooms and takes ages to die. */
export const gong: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.12, 0.06, 6, 0.0001, 1);
  s.fm(g, 70, 1.41, 3, n.t, end, 1.5);
  s.fm(g, 113, 2.13, 2, n.t, end, 2);
  const ng = s.gain(out);
  s.adsr(ng.gain, n.t, 0.01, n.vel * 0.03, 0.4, 3, 0.0001, 1);
  s.noiseSrc(n.t, n.t + 4, s.filter('bandpass', 900, 0.8, ng));
};

/** Tambourine: jingles over a soft skin tap. */
export const tambourine: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.08, 0.002, 0.18, 0.0001, 0.08);
  s.noiseSrc(n.t, end, s.filter('bandpass', 7800, 2, g));
  const k = s.gain(out);
  s.adsr(k.gain, n.t, 0.01, n.vel * 0.05, 0.001, 0.05, 0.0001, 0.02);
  s.osc('sine', 260, n.t, n.t + 0.08, k, 0, false);
};

/** Hand clap: three quick noise bursts. */
export const clap: Patch = (s, out, n) => {
  for (let k = 0; k < 3; k++) {
    const g = s.gain(out);
    const t = n.t + k * 0.011;
    const end = s.adsr(g.gain, t, 0.01, n.vel * (k === 2 ? 0.16 : 0.09), 0.001, k === 2 ? 0.12 : 0.02, 0.0001, 0.03);
    s.noiseSrc(t, end, s.filter('bandpass', 1400, 1.2, g));
  }
};

/** Wood block: a hollow pitched knock. */
export const woodblock: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.2, 0.001, 0.06, 0.0001, 0.02);
  s.osc('sine', Math.max(400, n.freq * 2), n.t, end, s.filter('bandpass', Math.max(400, n.freq * 2), 6, g));
};

/** Singing bowl: a rubbed metal ring with slow beating. */
export const bowl: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, Math.max(1, n.dur), n.vel * 0.07, 0.6, 1, 0.7, 2.5);
  s.osc('sine', n.freq, n.t, end, g);
  s.osc('sine', n.freq * 1.004, n.t, end, g, 0, false);
  const g2 = s.gain(g);
  g2.gain.value = 0.3;
  s.osc('sine', n.freq * 2.71, n.t, end, g2, 0, false);
};
