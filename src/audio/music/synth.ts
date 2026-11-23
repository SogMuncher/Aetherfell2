/**
 * The orchestra. Every instrument is a small recipe of oscillators, filtered noise, FM and
 * envelopes — no samples. A voice budget keeps busy moments from overloading the browser.
 *
 * Adding an instrument = adding one entry to INSTRUMENTS. Styles name instruments by id.
 */

export interface Note {
  /** Start time on the audio clock. */
  t: number;
  freq: number;
  /** Held length in seconds (release comes after). */
  dur: number;
  /** 0..1 loudness. */
  vel: number;
  /** 0..1 brightness, for instruments that care. */
  bright?: number;
}

export class Synth {
  /** Notes currently sounding. */
  active = 0;
  budget = 120;

  constructor(
    readonly ctx: BaseAudioContext,
    readonly noise: AudioBuffer,
  ) {}

  /** May a new note start? Low-priority notes give way first when the orchestra is busy. */
  allow(priority: number): boolean {
    if (this.active < this.budget * 0.7) return true;
    if (this.active < this.budget) return priority >= 0.5;
    return priority >= 1;
  }

  private track(src: AudioScheduledSourceNode): void {
    this.active++;
    src.onended = () => {
      this.active = Math.max(0, this.active - 1);
    };
  }

  /** Attack/decay/sustain/release on a gain param. Returns the time the sound is silent. */
  adsr(p: AudioParam, t: number, dur: number, peak: number, a: number, d: number, s: number, r: number): number {
    const pk = Math.max(0.00001, Math.min(0.5, peak));
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(pk, t + a);
    if (s <= 0.001) {
      // Struck or plucked: no sustain, it simply rings away.
      p.setTargetAtTime(0, t + a, Math.max(0.005, d / 4));
      return t + a + d * 1.3 + 0.05;
    }
    p.setTargetAtTime(pk * s, t + a, Math.max(0.005, d / 3));
    const off = t + Math.max(dur, a + 0.01);
    p.setTargetAtTime(0, off, Math.max(0.005, r / 4));
    return off + r * 1.2;
  }

  gain(dst: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = 0;
    g.connect(dst);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q: number, dst: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = Math.min(freq, this.ctx.sampleRate * 0.45);
    f.Q.value = q;
    f.connect(dst);
    return f;
  }

  osc(type: OscillatorType, freq: number, t: number, end: number, dst: AudioNode, detune = 0, counted = true): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.min(freq, this.ctx.sampleRate * 0.45), t);
    if (detune) o.detune.value = detune;
    o.connect(dst);
    o.start(t);
    o.stop(end + 0.05);
    if (counted) this.track(o);
    return o;
  }

  /** Vibrato that fades in after `delay`. */
  vibrato(target: AudioParam, freq: number, depth: number, rate: number, t: number, delay: number, end: number): void {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(freq * depth, t + delay + 0.3);
    lfo.connect(g);
    g.connect(target);
    lfo.start(t);
    lfo.stop(end + 0.05);
  }

  noiseSrc(t: number, end: number, dst: AudioNode, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = rate;
    src.connect(dst);
    src.start(t, Math.random() * 2);
    src.stop(end + 0.05);
    this.track(src);
    return src;
  }

  /** FM pair: a modulator at freq·ratio shakes the carrier by index·freq, the index decaying. */
  fm(dst: AudioNode, freq: number, ratio: number, index: number, t: number, end: number, indexDecay: number): OscillatorNode {
    const car = this.osc('sine', freq, t, end, dst);
    const mg = this.ctx.createGain();
    mg.connect(car.frequency);
    this.osc('sine', freq * ratio, t, end, mg, 0, false);
    mg.gain.setValueAtTime(freq * index, t);
    mg.gain.setTargetAtTime(freq * index * 0.08, t, Math.max(0.01, indexDecay));
    return car;
  }
}

export type Patch = (s: Synth, out: AudioNode, n: Note) => void;

/** A loop of white noise for breath, hiss and drums (outside the sim, so Math.random is fine). */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export const nyq = (s: Synth): number => s.ctx.sampleRate * 0.45;
