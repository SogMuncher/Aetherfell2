/**
 * Sound building blocks. Every sound in the game is made from three things: an oscillator,
 * a burst of filtered noise, and an envelope — routed through a soft hall reverb and a limiter
 * so nothing can clip or run away.
 */
export interface ToneOpts {
  attack?: number;
  /** Start frequency to glide from. */
  from?: number;
  glide?: number;
  /** End frequency to slide to over the note. */
  to?: number;
  detune?: number;
  /** Vibrato depth as a fraction of the frequency. */
  vibrato?: number;
  vibratoRate?: number;
  /** Fraction of the note held at full level before releasing (pads, flutes). */
  hold?: number;
  /** Loudness wobble depth 0..1: rough throats, croaks, purrs. */
  tremolo?: number;
  tremoloRate?: number;
  /** Shapes the tone through a resonant band (a mouth or a body): centre Hz and Q. */
  band?: { freq: number; q: number; to?: number };
}

export interface NoiseOpts {
  q?: number;
  to?: number;
  attack?: number;
  hold?: number;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly sfx: GainNode;
  readonly amb: GainNode;
  readonly music: GainNode;
  readonly reverb: ConvolverNode;
  readonly noise: AudioBuffer;

  constructor() {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 32;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -16;
    lim.knee.value = 8;
    lim.ratio.value = 10;
    lim.attack.value = 0.004;
    lim.release.value = 0.25;
    this.master.connect(hp);
    hp.connect(lim);
    lim.connect(ctx.destination);

    this.noise = this.makePinkNoise(3);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeHall(2.6);
    const revOut = ctx.createGain();
    revOut.gain.value = 0.8;
    this.reverb.connect(revOut);
    revOut.connect(this.master);

    this.sfx = this.bus(1, 0.22);
    this.amb = this.bus(0.9, 0.35);
    this.music = this.bus(0.35, 0.6);
  }

  private bus(level: number, send: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = level;
    g.connect(this.master);
    const s = this.ctx.createGain();
    s.gain.value = send;
    g.connect(s);
    s.connect(this.reverb);
    return g;
  }

  private makePinkNoise(seconds: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099;
      b1 = 0.963 * b1 + w * 0.2965;
      b2 = 0.57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // Crossfade the loop seam.
    const f = 2048;
    for (let i = 0; i < f; i++) {
      const a = i / f;
      const end = n - f + i;
      d[end] = (d[end] ?? 0) * (1 - a) + (d[i] ?? 0) * a;
    }
    return buf;
  }

  /** Decaying noise impulse response, darker towards the tail: a soft stone hall. */
  private makeHall(seconds: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, n, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        lp += (Math.random() * 2 - 1 - lp) * (0.6 - 0.45 * t);
        d[i] = lp * Math.pow(1 - t, 2.4) * (i < 400 ? i / 400 : 1) * 0.6;
      }
    }
    return buf;
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  private envelope(g: GainNode, t: number, attack: number, level: number, dur: number, hold?: number): void {
    const p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(level, t + attack);
    if (hold !== undefined) {
      p.setValueAtTime(level, t + Math.max(attack, dur * hold));
      p.linearRampToValueAtTime(0, t + dur);
    } else {
      p.exponentialRampToValueAtTime(0.0004, t + Math.max(dur, attack + 0.01));
    }
  }

  tone(dst: AudioNode, type: OscillatorType, freq: number, t: number, dur: number, level: number, o: ToneOpts = {}): void {
    if (!(level > 0) || !(freq > 10)) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(o.from ?? freq, t);
    if (o.from) osc.frequency.exponentialRampToValueAtTime(freq, t + (o.glide ?? 0.05));
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = o.vibratoRate ?? 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * o.vibrato, t + 0.25);
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    this.envelope(g, t, o.attack ?? 0.005, Math.min(0.25, level), dur, o.hold);
    let head: AudioNode = osc;
    if (o.band) {
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.setValueAtTime(o.band.freq, t);
      if (o.band.to) bf.frequency.exponentialRampToValueAtTime(o.band.to, t + dur);
      bf.Q.value = o.band.q;
      // A band filter eats level; give some back so shaped voices stay audible.
      const makeup = ctx.createGain();
      makeup.gain.value = 1 + Math.min(4, o.band.q * 0.5);
      osc.connect(bf);
      bf.connect(makeup);
      head = makeup;
    }
    if (o.tremolo) {
      const am = ctx.createGain();
      am.gain.value = 1 - o.tremolo * 0.5;
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = o.tremoloRate ?? 20;
      depth.gain.value = o.tremolo * 0.5;
      lfo.connect(depth);
      depth.connect(am.gain);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
      head.connect(am);
      head = am;
    }
    head.connect(g);
    g.connect(dst);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  }

  burst(dst: AudioNode, t: number, dur: number, level: number, type: BiquadFilterType, freq: number, o: NoiseOpts = {}): void {
    if (!(level > 0)) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = o.q ?? 0.7;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = ctx.createGain();
    this.envelope(g, t, o.attack ?? 0.004, Math.min(0.35, level), dur, o.hold);
    src.connect(f);
    f.connect(g);
    g.connect(dst);
    src.start(t, Math.random() * 2, dur + 0.1);
  }

  /** A looping filtered-noise bed whose level and colour can be steered smoothly. */
  layer(type: BiquadFilterType, freq: number, q: number, dst: AudioNode): { filter: BiquadFilterNode; gain: GainNode } {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dst);
    src.start(0, Math.random() * 2);
    return { filter, gain };
  }

  /** A short-lived positioned output: stereo pan and distance roll-off (far sounds lose their highs). */
  spatial(pan: number, distance: number): AudioNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 1 / (1 + distance / 7);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(600, 16000 / (1 + distance / 10));
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(lp);
    lp.connect(p);
    p.connect(this.sfx);
    setTimeout(() => {
      g.disconnect();
      lp.disconnect();
      p.disconnect();
    }, 6000);
    return g;
  }
}
