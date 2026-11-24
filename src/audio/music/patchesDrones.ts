// Drones that fill the air between sparse notes: tuned wind, a hollow cave moan and a low choir, each fading slowly in and out.
import { type Patch, type Synth, nyq } from './synth';

/** Slow swell in, long fade out, so one chord's drone melts into the next. */
const swell = (s: Synth, p: AudioParam, t: number, dur: number, peak: number): number =>
  s.adsr(p, t, dur, peak, Math.min(3.5, 0.8 + dur * 0.35), 1.2, 0.9, 3);

/** Noise through a narrow band at `f`, boosted so it is about as loud as a plain tone whatever its pitch. */
function band(s: Synth, f: number, q: number, level: number, t: number, end: number, dst: AudioNode): void {
  const mk = s.ctx.createGain();
  const width = f / q;
  mk.gain.value = (level * 0.7) / Math.sqrt((width * 1.6) / (s.ctx.sampleRate / 2));
  mk.connect(dst);
  s.noiseSrc(t, end, s.filter('bandpass', Math.min(nyq(s), f), q, mk));
}

/** Gusts: the loudness slowly rises and falls while the note holds. */
function gusts(s: Synth, p: AudioParam, depth: number, t: number, end: number): void {
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 0.08 + Math.random() * 0.15;
  const g = s.ctx.createGain();
  g.gain.value = depth;
  lfo.connect(g);
  g.connect(p);
  lfo.start(t);
  lfo.stop(end + 0.05);
}

/** Wind drone: wind whistling through ruins, tuned to the note and its octave, coming and going in gusts. */
export const windDrone: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = swell(s, g.gain, n.t, n.dur, n.vel * 0.06);
  const body = s.ctx.createGain();
  body.gain.value = 1;
  body.connect(g);
  gusts(s, body.gain, 0.45, n.t, end);
  band(s, n.freq, 14, 1, n.t, end, body);
  band(s, n.freq * 2, 18, 0.45, n.t, end, body);
  band(s, n.freq * 3, 22, 0.15 + (n.bright ?? 0.2) * 0.3, n.t, end, body);
};

/** Hollow wind: breath over a cave mouth, an open fifth moaning under a faint airy hiss. */
export const hollowWind: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = swell(s, g.gain, n.t, n.dur, n.vel * 0.07);
  const lp = s.filter('lowpass', n.freq * (2 + (n.bright ?? 0.2) * 3), 0.7, g);
  const o = s.osc('sine', n.freq, n.t, end, lp);
  s.vibrato(o.frequency, n.freq, 0.003, 0.3, n.t, 1, end);
  s.osc('triangle', n.freq * 1.5, n.t, end, s.filter('lowpass', n.freq * 2, 0.5, lp), 4, false);
  const air = s.gain(out);
  swell(s, air.gain, n.t, n.dur, n.vel * 0.035);
  gusts(s, air.gain, n.vel * 0.02, n.t, end);
  band(s, n.freq * 4, 3, 1, n.t, end, air);
};

/** Low choir: a hushed crowd of deep voices, the vowel opening slowly from "ooh" to "oh" as the note holds. */
export const lowChoir: Patch = (s, out, n) => {
  const g = s.gain(out);
  const end = swell(s, g.gain, n.t, n.dur, n.vel * 0.09);
  const mix = s.ctx.createGain();
  const vowel: [number, number, number, number][] = [[290, 430, 7, 1], [750, 820, 9, 0.3], [2300, 2400, 12, 0.05]];
  for (const [from, to, q, lvl] of vowel) {
    const fg = s.gain(g);
    fg.gain.value = lvl;
    const f = s.filter('bandpass', from, q, fg);
    f.frequency.linearRampToValueAtTime(to, Math.max(n.t + 0.5, end - 1));
    mix.connect(f);
  }
  for (const d of [-11, -3, 4, 12]) {
    const o = s.osc('sawtooth', n.freq, n.t, end, mix, d, d === -3);
    s.vibrato(o.frequency, n.freq, 0.003, 3.2 + d * 0.04, n.t, 1, end);
  }
  const breath = s.gain(out);
  swell(s, breath.gain, n.t, n.dur, n.vel * 0.012);
  band(s, 600, 2, 1, n.t, end, breath);
};
