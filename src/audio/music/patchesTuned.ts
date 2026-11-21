import { type Patch, nyq } from './synth';


// ---------------------------------------------------------------------------------------------

/** Plucked harp: bright partials that soften as they ring. */
export const harp: Patch = (s, out, n) => {
  const ring = Math.min(4, 1.2 + 260 / n.freq);
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.22, 0.004, ring, 0.0001, 0.3);
  const lp = s.filter('lowpass', n.freq * 6, 0.5, g);
  lp.frequency.setTargetAtTime(n.freq * 2, n.t, ring / 3);
  s.osc('triangle', n.freq, n.t, end, lp);
  const g2 = s.gain(lp);
  g2.gain.value = 0.35;
  s.osc('sine', n.freq * 2, n.t, n.t + ring * 0.5, g2, 3, false);
};

/** Lute / guitar-like pluck: a filtered saw with a wooden body. */
export const lute: Patch = (s, out, n) => {
  const g = s.gain(out);
  const ring = Math.min(1.6, 0.5 + 120 / n.freq);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.16, 0.003, ring, 0.0001, 0.15);
  const body = s.filter('peaking', 380, 1.2, g);
  body.gain.value = 5;
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 9), 0.9, body);
  lp.frequency.setTargetAtTime(n.freq * 1.6, n.t, 0.12);
  s.osc('sawtooth', n.freq, n.t, end, lp);
};

/** Kalimba: a sine with a tiny pitch blip and a metallic overtone. */
export const kalimba: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.2, 0.002, 1.1, 0.0001, 0.2);
  const o = s.osc('sine', n.freq, n.t, end, g);
  o.frequency.setValueAtTime(n.freq * 1.02, n.t);
  o.frequency.exponentialRampToValueAtTime(n.freq, n.t + 0.03);
  const g2 = s.gain(g);
  s.adsr(g2.gain, n.t, 0.01, 0.3, 0.001, 0.12, 0.0001, 0.05);
  s.osc('sine', n.freq * 5.4, n.t, n.t + 0.3, g2, 0, false);
};

/** Celesta / music box: high FM tines. */
export const celesta: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.13, 0.002, 1.8, 0.0001, 0.3);
  s.fm(g, n.freq, 4, 1.4, n.t, end, 0.15);
};

/** Bell: inharmonic FM with a long ring — tolls in ruins, chimes in snow. */
export const bell: Patch = (s, out, n) => {
  const g = s.gain(out);
  const ring = 2.5 + 400 / n.freq;
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.14, 0.003, ring, 0.0001, 0.5);
  s.fm(g, n.freq, 3.51, 2.2, n.t, end, ring / 4);
  const g2 = s.gain(g);
  g2.gain.value = 0.25;
  s.osc('sine', n.freq * 2.76, n.t, n.t + ring * 0.4, g2, 0, false);
};

/** Glass harmonica: two slightly beating sines that bloom slowly. */
export const glass: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.09, Math.min(0.8, n.dur * 0.4), 0.5, 0.8, 1.5);
  s.osc('sine', n.freq, n.t, end, g);
  s.osc('sine', n.freq * 1.0035, n.t, end, g, 0, false);
  const g3 = s.gain(g);
  g3.gain.value = 0.15;
  s.osc('sine', n.freq * 3, n.t, end, g3, 0, false);
};

/** Plucked bass. */
export const pluckBass: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, 0.01, n.vel * 0.3, 0.004, Math.min(1.8, 0.6 + n.dur), 0.0001, 0.2);
  const lp = s.filter('lowpass', n.freq * 5, 1, g);
  lp.frequency.setTargetAtTime(n.freq * 1.5, n.t, 0.15);
  s.osc('triangle', n.freq, n.t, end, lp);
  s.osc('sine', n.freq * 0.5, n.t, end, g, 0, false);
};
