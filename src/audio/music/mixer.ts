/**
 * The music mixing desk: one bus per style (with its own tone filter and reverb sends), one
 * channel per layer, a shared hall, a long dark cavern reverb and a tempo-synced echo.
 */
import type { StyleId } from './styles';

export interface Channel {
  input: GainNode;
  /** The level we last asked for (gain params can't be read back mid-ramp). */
  target: number;
  echo: GainNode;
}

interface StyleBus {
  input: GainNode;
  tone: BiquadFilterNode;
  hall: GainNode;
  cave: GainNode;
  echo: GainNode;
  channels: Map<number, Channel>;
  target: number;
}

function impulse(ctx: BaseAudioContext, seconds: number, darkness: number, predelay: number): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, n, ctx.sampleRate);
  const pre = Math.floor(ctx.sampleRate * predelay);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / (n - pre);
      const k = Math.max(0.02, (1 - darkness) * (1 - t * 0.9));
      lp += (Math.random() * 2 - 1 - lp) * k;
      const fadeIn = i - pre < 600 ? (i - pre) / 600 : 1;
      d[i] = lp * Math.pow(1 - t, 2.2) * fadeIn * 0.5;
    }
  }
  return buf;
}

export class MusicMixer {
  readonly out: GainNode;
  /** Stingers and transitions: not tied to any style bus. */
  readonly fx: GainNode;
  private hall: ConvolverNode;
  private cave: ConvolverNode;
  private delay: DelayNode;
  private delayIn: GainNode;
  private buses = new Map<StyleId, StyleBus>();

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    // Gentle glue so stacked layers never spike.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.02;
    comp.release.value = 0.3;
    this.out.connect(comp);
    comp.connect(destination);

    this.hall = ctx.createConvolver();
    this.hall.buffer = impulse(ctx, 3.2, 0.35, 0.02);
    const hallOut = ctx.createGain();
    hallOut.gain.value = 0.55;
    this.hall.connect(hallOut);
    hallOut.connect(this.out);

    this.cave = ctx.createConvolver();
    this.cave.buffer = impulse(ctx, 6.5, 0.7, 0.06);
    const caveOut = ctx.createGain();
    caveOut.gain.value = 0.6;
    this.cave.connect(caveOut);
    caveOut.connect(this.out);

    this.delayIn = ctx.createGain();
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.45;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3200;
    const pan = ctx.createStereoPanner();
    pan.pan.value = 0.3;
    this.delayIn.connect(this.delay);
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    dlp.connect(pan);
    const dOut = ctx.createGain();
    dOut.gain.value = 0.45;
    pan.connect(dOut);
    dOut.connect(this.out);
    dOut.connect(this.hall);

    this.fx = ctx.createGain();
    this.fx.gain.value = 0.9;
    this.fx.connect(this.out);
    const fxHall = ctx.createGain();
    fxHall.gain.value = 0.5;
    this.fx.connect(fxHall);
    fxHall.connect(this.hall);
  }

  /** Echo time follows the tempo (a dotted eighth). */
  setTempo(bpm: number, t: number): void {
    this.delay.delayTime.setTargetAtTime(Math.min(1.5, (60 / bpm) * 0.75), t, 0.2);
  }

  private bus(style: StyleId): StyleBus {
    let b = this.buses.get(style);
    if (b) return b;
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 9000;
    tone.Q.value = 0.5;
    input.connect(tone);
    tone.connect(this.out);
    const hall = ctx.createGain();
    const cave = ctx.createGain();
    const echo = ctx.createGain();
    tone.connect(hall);
    hall.connect(this.hall);
    tone.connect(cave);
    cave.connect(this.cave);
    echo.connect(this.delayIn);
    b = { input, tone, hall, cave, echo, channels: new Map(), target: 0 };
    this.buses.set(style, b);
    return b;
  }

  /** Steer a style's bus: level, tone and reverb character. */
  setStyle(style: StyleId, level: number, mix: { hall: number; cave: number; echo: number; tone: number }, t: number, fade: number): void {
    const b = this.bus(style);
    b.target = level;
    b.input.gain.setTargetAtTime(level, t, Math.max(0.02, fade / 3));
    b.tone.frequency.setTargetAtTime(mix.tone, t, 0.8);
    b.hall.gain.setTargetAtTime(mix.hall, t, 0.8);
    b.cave.gain.setTargetAtTime(mix.cave, t, 0.8);
    b.echo.gain.setTargetAtTime(mix.echo, t, 0.8);
  }

  /** Tone filter on one bus moved by the moment (e.g. muffled when hurt). */
  shade(style: StyleId, hz: number, t: number): void {
    this.bus(style).tone.frequency.setTargetAtTime(hz, t, 0.6);
  }

  styleLevel(style: StyleId): number {
    return this.buses.get(style)?.target ?? 0;
  }

  /** A layer's channel on a style bus, created on first use. */
  channel(style: StyleId, layer: number, pan: number, echo: number): Channel {
    const b = this.bus(style);
    let c = b.channels.get(layer);
    if (c) return c;
    const ctx = this.ctx;
    const input = ctx.createGain();
    input.gain.value = 0;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    input.connect(p);
    p.connect(b.input);
    const e = ctx.createGain();
    e.gain.value = echo;
    p.connect(e);
    e.connect(b.echo);
    c = { input, target: 0, echo: e };
    b.channels.set(layer, c);
    return c;
  }

  setChannel(c: Channel, level: number, t: number, fade = 1.2): void {
    if (Math.abs(c.target - level) < 0.001) return;
    c.target = level;
    c.input.gain.setTargetAtTime(level, t, fade / 3);
  }
}
