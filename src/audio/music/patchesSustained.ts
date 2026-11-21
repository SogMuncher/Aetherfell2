import { type Patch, nyq } from './synth';


/** Wooden flute: soft tone, breath, delayed vibrato. */
export const flute: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.13, 0.07, 0.2, 0.8, 0.18);
  const o = s.osc('sine', n.freq, n.t, end, g);
  s.vibrato(o.frequency, n.freq, 0.007, 5.2, n.t, Math.min(0.35, n.dur * 0.5), end);
  const g2 = s.gain(g);
  g2.gain.value = 0.18;
  s.osc('triangle', n.freq * 2, n.t, end, g2, 0, false);
  const bg = s.gain(out);
  s.adsr(bg.gain, n.t, n.dur * 0.6, n.vel * 0.035, 0.03, 0.15, 0.4, 0.1);
  s.noiseSrc(n.t, end, s.filter('bandpass', n.freq * 2, 2.5, bg));
};

/** Low wooden whistle with a breathy, hollow tone — for nights and lonely places. */
export const ocarina: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.14, 0.12, 0.3, 0.75, 0.35);
  const lp = s.filter('lowpass', n.freq * 2.5, 0.7, g);
  const o = s.osc('triangle', n.freq, n.t, end, lp);
  s.vibrato(o.frequency, n.freq, 0.01, 4.4, n.t, 0.4, end);
  const bg = s.gain(out);
  s.adsr(bg.gain, n.t, n.dur, n.vel * 0.02, 0.1, 0.2, 0.6, 0.2);
  s.noiseSrc(n.t, end, s.filter('bandpass', n.freq * 3, 3, bg));
};

/** Fiddle: bowed saw with vibrato through a bright body — for village dances. */
export const fiddle: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.075, 0.04, 0.15, 0.85, 0.12);
  const body2 = s.filter('peaking', 2600, 1.5, g);
  body2.gain.value = 4;
  const body = s.filter('peaking', 520, 1.4, body2);
  body.gain.value = 6;
  const lp = s.filter('lowpass', Math.min(nyq(s), 5200), 0.6, body);
  const o = s.osc('sawtooth', n.freq, n.t, end, lp);
  s.vibrato(o.frequency, n.freq, 0.009, 6, n.t, Math.min(0.2, n.dur * 0.4), end);
};

/** Horn: brassy filter swell, a pair of detuned saws. Heroic melodies and stabs. */
export const horn: Patch = (s, out, n) => {
  const g = s.gain(out);
  const a = Math.min(0.12, n.dur * 0.3);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.075, a, 0.3, 0.8, 0.25);
  const bright = n.bright ?? 0.5;
  const lp = s.filter('lowpass', 300, 1.2, g);
  lp.frequency.setValueAtTime(n.freq * 1.2, n.t);
  lp.frequency.linearRampToValueAtTime(Math.min(nyq(s), n.freq * (3 + bright * 5)), n.t + a + 0.05);
  lp.frequency.setTargetAtTime(n.freq * (2.2 + bright * 2), n.t + a + 0.05, 0.4);
  const o1 = s.osc('sawtooth', n.freq, n.t, end, lp, -4);
  s.osc('sawtooth', n.freq, n.t, end, lp, 5, false);
  s.vibrato(o1.frequency, n.freq, 0.004, 5, n.t, 0.3, end);
};

/** String section pad: three detuned saws per note, slow bloom. */
export const strings: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.045, Math.min(1.2, 0.25 + n.dur * 0.25), 0.6, 0.85, 1.1);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * (2.5 + (n.bright ?? 0.5) * 4)), 0.4, g);
  s.osc('sawtooth', n.freq, n.t, end, lp, -9);
  s.osc('sawtooth', n.freq, n.t, end, lp, 8, false);
  s.osc('sawtooth', n.freq * 0.5, n.t, end, lp, 2, false);
};

/** Short bowed strings for ostinatos. */
export const spiccato: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, Math.min(n.dur, 0.12), n.vel * 0.09, 0.008, 0.08, 0.4, 0.08);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * (3 + (n.bright ?? 0.5) * 5)), 0.8, g);
  s.osc('sawtooth', n.freq, n.t, end, lp, -6);
  s.osc('sawtooth', n.freq, n.t, end, lp, 6, false);
};

/** Choir "aah" (or a darker "ooh" when bright is low): a buzzing source through vocal formants. */
export const choir: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.11, Math.min(1, 0.3 + n.dur * 0.2), 0.5, 0.85, 1.2);
  const b = n.bright ?? 0.5;
  const formants: [number, number, number][] =
    b > 0.4
      ? [[800, 9, 1], [1150, 10, 0.5], [2900, 12, 0.25]]
      : [[400, 9, 1], [800, 10, 0.35], [2600, 12, 0.12]];
  const mix = s.ctx.createGain();
  mix.gain.value = 1;
  for (const [f, q, lvl] of formants) {
    const fg = s.gain(g);
    fg.gain.value = lvl;
    const bp = s.filter('bandpass', f, q, fg);
    mix.connect(bp);
  }
  for (const d of [-7, 0, 7]) {
    const o = s.osc('sawtooth', n.freq, n.t, end, mix, d, d === 0);
    s.vibrato(o.frequency, n.freq, 0.006, 4.5 + d * 0.05, n.t, 0.3, end);
  }
};

/** Bowed low strings: cello and double bass together. */
export const cello: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.11, Math.min(0.25, n.dur * 0.2), 0.3, 0.85, 0.4);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * 4), 0.7, g);
  const o = s.osc('sawtooth', n.freq, n.t, end, lp, -3);
  s.osc('sawtooth', n.freq, n.t, end, lp, 4, false);
  s.vibrato(o.frequency, n.freq, 0.004, 5, n.t, 0.4, end);
  const sub = s.gain(g);
  sub.gain.value = 0.5;
  s.osc('sine', n.freq * 0.5, n.t, end, sub, 0, false);
};

/** A dark drone: detuned saws through a slowly breathing lowpass, plus a sub. */
export const drone: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.07, Math.min(2.5, n.dur * 0.3), 1, 0.9, 2);
  const lp = s.filter('lowpass', n.freq * 3, 2, g);
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 0.07 + Math.random() * 0.08;
  const lg = s.ctx.createGain();
  lg.gain.value = n.freq * (1 + (n.bright ?? 0.3) * 3);
  lfo.connect(lg);
  lg.connect(lp.frequency);
  lfo.start(n.t);
  lfo.stop(end + 0.05);
  s.osc('sawtooth', n.freq, n.t, end, lp, -12);
  s.osc('sawtooth', n.freq * 1.5, n.t, end, lp, 10, false);
  const sub = s.gain(g);
  sub.gain.value = 0.8;
  s.osc('sine', n.freq * 0.5, n.t, end, sub, 0, false);
};

/** Warm pad for calm moments: soft triangles and a gentle filter. */
export const warmPad: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = s.adsr(g.gain, n.t, n.dur, n.vel * 0.07, Math.min(1.5, 0.4 + n.dur * 0.3), 0.8, 0.8, 1.6);
  const lp = s.filter('lowpass', Math.min(nyq(s), n.freq * (2 + (n.bright ?? 0.4) * 3)), 0.5, g);
  s.osc('triangle', n.freq, n.t, end, lp, -6);
  s.osc('triangle', n.freq, n.t, end, lp, 6, false);
  s.osc('sawtooth', n.freq * 2, n.t, end, s.filter('lowpass', n.freq * 2.5, 0.5, lp), 0, false);
};
