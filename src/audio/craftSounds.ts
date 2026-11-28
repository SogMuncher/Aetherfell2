// The airship's sounds: hum, drive rumble, rigging wind and propeller chop that follow its speed, creaks, gusts and rope thrums aboard, bumps, the anchor chain, levers, stations, horns
import type { Entity, SimEvent, SimState } from '../types';
import { CONTENT, thingDef } from '../content';
import type { AudioEngine } from './engine';
import type { GameAudio } from './gameAudio';
import { jit, rnd, strike } from './sfx';

/** All numbers live here. Speeds are m/s; `full` is the speed where a loop is at its loudest. */
const SHIP = {
  hear: 140,
  full: 22,
  hum: { wave: 'triangle' as OscillatorType, freq: 44, perSpeed: 1.6, level: 0.045, rest: 0.35 },
  rumble: { freq: 120, perSpeed: 9, level: 0.07, rest: 0.25 },
  rigging: { freq: 480, perSpeed: 28, level: 0.1, rest: 0.08 },
  creak: { every: [2.5, 7] as const, level: 0.05 },
  lever: { notch: 0.125, level: 0.05 },
  horn: { freq: 174, dur: 1.8, level: 0.09 },
  chop: { rest: 1.2, perSpeed: 0.35, level: 0.06 },
  gust: { every: [6, 14] as const, level: 0.05 },
  thrum: { every: [4, 10] as const, level: 0.025 },
  bump: { drop: 2.5, level: 0.6 },
  chain: { level: 0.05, hear: 60 },
  answer: { freq: 87, dur: 1.4, gap: 1.7, level: 0.12, hear: 4000 },
};

interface Loops {
  hum: { osc: OscillatorNode; gain: GainNode };
  rumble: { filter: BiquadFilterNode; gain: GainNode };
  rigging: { filter: BiquadFilterNode; gain: GainNode };
}

export class CraftSounds {
  private loops: Loops | null = null;
  private sample = 0;
  private creakIn = 3;
  private notch = new Map<number, number>();
  private state: SimState | null = null;
  private near = 0;
  private speed = 0;
  private chopIn = 0;
  private gustIn = 8;
  private thrumIn = 5;
  private was = new Map<number, number>();
  private reeling = new Set<number>();

  update(a: GameAudio, state: SimState, me: Entity, dt: number): void {
    const e = a.e;
    if (!e) return;
    this.state = state;
    const loops = (this.loops ??= makeLoops(e));
    const now = e.ctx.currentTime;
    if (me.aboard != null) {
      this.creakIn -= dt;
      if (this.creakIn <= 0) {
        this.creakIn = rnd(SHIP.creak.every[0], SHIP.creak.every[1]);
        creak(e, e.sfx, e.now);
      }
      // Wind gusting through the rigging, and a stay rope thrumming under the envelope's pull.
      this.gustIn -= dt;
      if (this.gustIn <= 0) {
        this.gustIn = rnd(SHIP.gust.every[0], SHIP.gust.every[1]);
        e.burst(e.sfx, e.now, rnd(1.2, 2.4), SHIP.gust.level * (0.5 + Math.min(1, this.speed / SHIP.full)), 'bandpass', rnd(500, 800), { attack: 0.6, to: rnd(1200, 1800), q: 1.5 });
      }
      this.thrumIn -= dt;
      if (this.thrumIn <= 0) {
        this.thrumIn = rnd(SHIP.thrum.every[0], SHIP.thrum.every[1]);
        e.tone(e.sfx, 'triangle', rnd(55, 90), e.now, rnd(0.8, 1.6), SHIP.thrum.level, { tremolo: 0.5, tremoloRate: rnd(6, 11), attack: 0.05 });
      }
    }
    // The propeller's blades beat the air faster as it speeds up.
    this.chopIn -= dt;
    if (this.chopIn <= 0 && this.near > 0.02) {
      const rate = SHIP.chop.rest + this.speed * SHIP.chop.perSpeed;
      this.chopIn = 1 / rate;
      e.burst(e.sfx, e.now, 0.09, SHIP.chop.level * this.near * (0.3 + 0.7 * Math.min(1, this.speed / SHIP.full)), 'lowpass', jit(240, 0.1), { q: 2 });
    }
    this.sample -= dt;
    if (this.sample > 0) return;
    this.sample = 0.2;
    // The nearest craft sets the loops: loud aboard, fading with distance.
    let near = 0;
    let speed = 0;
    for (const c of state.entities.values()) {
      if (!c.craft || c.dead) continue;
      const d = Math.hypot(c.pos.x - me.pos.x, c.pos.y - me.pos.y, (c.z ?? 0) - me.z);
      const n = me.aboard === c.id ? 1 : Math.max(0, 1 - d / SHIP.hear);
      const v = Math.hypot(c.craft.vel.x, c.craft.vel.y, c.craft.vz);
      if (n > near) {
        near = n;
        speed = v;
      }
      // Stopped short (against a building, the ground, an anchor's chain): the hull booms and groans.
      const was = this.was.get(c.id) ?? v;
      this.was.set(c.id, v);
      const out = was - v > SHIP.bump.drop ? a.at(c.pos.x, c.pos.y, SHIP.hear) : null;
      if (out) {
        strike(e, out, now, 'wood', { strength: SHIP.bump.level * Math.min(1, (was - v) / 6), mass: 4000 });
        creak(e, out, now + 0.15);
      }
    }
    this.near = near;
    this.speed = speed;
    // An anchor being wound in: the chain rattles over the winch; stowed, it lands on deck with a clank.
    for (const o of state.entities.values()) {
      const reel = !!o.tether?.reel;
      if (!reel && !this.reeling.has(o.id)) continue;
      const out = a.at(o.tether?.top?.x ?? o.pos.x, o.tether?.top?.y ?? o.pos.y, SHIP.chain.hear);
      if (reel) {
        this.reeling.add(o.id);
        if (out) chain(e, out, now);
      } else {
        this.reeling.delete(o.id);
        if (out) strike(e, out, now, 'metal', { strength: 0.7, mass: 150 });
      }
    }
    const go = Math.min(1, speed / SHIP.full);
    const set = (g: GainNode, level: number, rest: number): void => void g.gain.setTargetAtTime(near * level * (rest + (1 - rest) * go), now, 0.4);
    set(loops.hum.gain, SHIP.hum.level, SHIP.hum.rest);
    set(loops.rumble.gain, SHIP.rumble.level, SHIP.rumble.rest);
    set(loops.rigging.gain, SHIP.rigging.level, SHIP.rigging.rest);
    loops.hum.osc.frequency.setTargetAtTime(SHIP.hum.freq + speed * SHIP.hum.perSpeed, now, 0.6);
    loops.rumble.filter.frequency.setTargetAtTime(SHIP.rumble.freq + speed * SHIP.rumble.perSpeed, now, 0.6);
    loops.rigging.filter.frequency.setTargetAtTime(SHIP.rigging.freq + speed * SHIP.rigging.perSpeed, now, 0.6);
    // Levers click past each notch as they are worked (fuel tanks drain smoothly and stay quiet).
    for (const s of state.entities.values()) {
      if (!s.control) continue;
      const st = thingDef(CONTENT, s.def).station;
      if (!st || st.feed) continue;
      const n = Math.round(s.control.v / SHIP.lever.notch);
      const was = this.notch.get(s.id);
      this.notch.set(s.id, n);
      if (was === undefined || was === n) continue;
      const out = a.at(s.pos.x, s.pos.y, 30);
      if (!out) continue;
      for (let i = Math.min(3, Math.abs(n - was)) - 1; i >= 0; i--) {
        e.burst(out, e.now + i * 0.05, 0.025, SHIP.lever.level, 'bandpass', jit(2600, 0.1), { q: 3 });
        e.tone(out, 'square', jit(320, 0.08), e.now + i * 0.05, 0.03, SHIP.lever.level * 0.4);
      }
    }
  }

  onEvent(a: GameAudio, ev: SimEvent): void {
    const e = a.e;
    if (!e) return;
    const t = e.now;
    switch (ev.type) {
      case 'call': {
        const out = a.at(ev.x, ev.y, 200);
        if (out) horn(e, out, t, SHIP.horn.freq, SHIP.horn.dur, SHIP.horn.level, 900);
        break;
      }
      case 'answer': {
        const w = a.where(ev.x, ev.y);
        const out = w.d < SHIP.answer.hear ? e.spatial(w.pan, w.d * 0.05) : null;
        const A = SHIP.answer;
        if (out) for (let i = 0; i < 2; i++) horn(e, out, t + 0.6 + i * A.gap, A.freq, A.dur, A.level, 500);
        break;
      }
      case 'station': {
        const st = this.state?.entities.get(ev.station);
        const out = st ? a.at(st.pos.x, st.pos.y, 40) : null;
        if (!out) break;
        if (ev.act === 'feed') {
          // Aether melting in: a rising glug and a bright shimmer.
          e.tone(out, 'sine', 180, t, 0.5, 0.07, { from: 140, to: 560, tremolo: 0.5, tremoloRate: 14 });
          e.burst(out, t + 0.1, 0.8, 0.04, 'highpass', 3200, { attack: 0.2, to: 6000 });
        } else {
          strike(e, out, t, 'wood', { strength: ev.act === 'take' ? 0.35 : 0.2, mass: 2 });
          if (ev.act === 'take') creak(e, out, t + 0.08);
        }
        break;
      }
      default:
        break;
    }
  }
}

function makeLoops(e: AudioEngine): Loops {
  const osc = e.ctx.createOscillator();
  osc.type = SHIP.hum.wave;
  osc.frequency.value = SHIP.hum.freq;
  const gain = e.ctx.createGain();
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(e.sfx);
  osc.start();
  return { hum: { osc, gain }, rumble: e.layer('lowpass', SHIP.rumble.freq, 0.8, e.sfx), rigging: e.layer('bandpass', SHIP.rigging.freq, 1.6, e.sfx) };
}

/** Timber and rope under load: a slow rasping groan. */
function creak(e: AudioEngine, out: AudioNode, t: number): void {
  const f = rnd(70, 120);
  e.tone(out, 'sawtooth', f, t, rnd(0.3, 0.8), SHIP.creak.level, { to: f * rnd(0.8, 1.2), tremolo: 0.7, tremoloRate: rnd(18, 32), band: { freq: rnd(350, 600), q: 4, to: rnd(220, 400) }, attack: 0.05 });
}

/** A chain running over a winch: quick iron clinks and the pawl's ratchet, one sample's worth (0.2 s). */
function chain(e: AudioEngine, out: AudioNode, t: number): void {
  for (let i = 0; i < 4; i++) {
    const at = t + i * 0.05 + rnd(0, 0.015);
    e.burst(out, at, 0.03, SHIP.chain.level, 'bandpass', jit(3200, 0.15), { q: 6 });
    e.tone(out, 'square', jit(900, 0.1), at, 0.025, SHIP.chain.level * 0.3);
  }
  e.burst(out, t, 0.2, SHIP.chain.level * 0.5, 'lowpass', 400, { q: 3 });
}

/** A horn blast: a reedy tone with its fifth, swelling in and breathing out. */
function horn(e: AudioEngine, out: AudioNode, t: number, f: number, dur: number, level: number, body: number): void {
  e.tone(out, 'sawtooth', f, t, dur, level, { from: f * 0.86, glide: 0.15, attack: 0.12, hold: 0.7, vibrato: 0.01, vibratoRate: 5, band: { freq: body, q: 1.2 } });
  e.tone(out, 'square', f * 1.5, t + 0.05, dur * 0.9, level * 0.3, { attack: 0.2, hold: 0.6, band: { freq: body * 1.4, q: 1.5 } });
}
