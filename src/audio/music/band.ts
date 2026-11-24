// The band: turns one step of the current section into notes for every active layer (read by the conductor).
import { INSTRUMENTS } from './instruments';
import type { InstrumentId } from './instruments';
import type { Synth } from './synth';
import type { Channel } from './mixer';
import type { LayerDef } from './styles';
import type { Section } from './composer';
import { chordDegreeSet } from './composer';
import type { Chord } from './theory';
import { MusicRng, chordPitchClasses, degreeToSemis, mtof, voiceLead } from './theory';

/** How important each role is when the orchestra is crowded (1 = never dropped). */
export const PRIORITY: Record<LayerDef['role'], number> = {
  melody: 1, bass: 1, pad: 1, drone: 1, perc: 0.8, stab: 0.7, ostinato: 0.7, counter: 0.6, arp: 0.55, texture: 0.3,
};

export interface BarPlan {
  t: number;
  chord: Chord;
  energy: number;
  active: boolean[];
  melodyRests: boolean;
  last: boolean;
}

/** Where the music is right now: what the band needs to play one step. */
export interface Beat {
  sec: Section;
  plan: BarPlan;
  bar: number;
  step: number;
  channel(i: number, l: LayerDef): Channel;
  /** True while a reaction is playing this role's part (the band leaves it the space). */
  quiet?(role: LayerDef['role'], t: number): boolean;
}

/** MIDI note of a scale degree, placed inside a register. */
export function midiOf(sec: Section, deg: number, lo: number, hi: number): number {
  const centre = (lo + hi) / 2;
  const base = sec.key + Math.round((centre - 5 - sec.key) / 12) * 12;
  let n = base + degreeToSemis(sec.mode, deg);
  while (n < lo) n += 12;
  while (n > hi) n -= 12;
  return n;
}

export class Band {
  readonly voicings = new Map<number, number[]>();
  private arpIndex = new Map<number, number>();

  constructor(
    private synth: Synth,
    private rng: MusicRng,
  ) {}

  play(inst: InstrumentId, ch: Channel, t: number, midi: number, dur: number, vel: number, priority: number, bright?: number): void {
    // Nothing in the music sounds for sure (theory's chance is capped), so any note may go missing.
    if (!this.synth.allow(priority) || !this.rng.chance(1)) return;
    const freq = mtof(midi);
    if (!(freq > 15) || freq > this.synth.ctx.sampleRate * 0.4) return;
    try {
      INSTRUMENTS[inst].patch(this.synth, ch.input, { t, freq, dur, vel: Math.max(0, Math.min(1, vel)), bright });
    } catch {
      // A broken patch must not stop the rest of the band.
    }
  }

  /** Nearest chord tone (as a degree) to a melody degree. */
  private snap(deg: number, chord: Chord): number {
    const set = chordDegreeSet(chord);
    let best = deg;
    let bestD = Infinity;
    for (let d = deg - 3; d <= deg + 3; d++) {
      if (!set.includes(((d % 7) + 7) % 7)) continue;
      const dist = Math.abs(d - deg);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  chordNotes(sec: Section, chord: Chord, lo: number, hi: number): number[] {
    const pcs = chordPitchClasses(sec.key, sec.mode, chord);
    const out: number[] = [];
    for (let n = lo; n <= hi; n++) if (pcs.includes(((n % 12) + 12) % 12)) out.push(n);
    return out;
  }

  pad(b: Beat, i: number, l: LayerDef, chord: Chord, t: number, dur: number, energy: number): void {
    const pcs = chordPitchClasses(b.sec.key, b.sec.mode, chord);
    const voicing = voiceLead(pcs, this.voicings.get(i) ?? null, l.lo, l.hi, l.voices ?? 3);
    this.voicings.set(i, voicing);
    const vel = (l.vel ?? 0.8) * (0.7 + energy * 0.4);
    for (const n of voicing) this.play(l.instrument, b.channel(i, l), t, n, dur, vel, PRIORITY.pad, (l.bright ?? 0.5) * (0.7 + energy * 0.5));
  }

  /** A low held tone on the chord's root (or the chord itself, voice-led, when it has `voices`), so it moves with the chords. */
  drone(b: Beat, i: number, l: LayerDef, chord: Chord, t: number, dur: number, energy: number): void {
    const many = (l.voices ?? 1) > 1;
    const notes = many
      ? voiceLead(chordPitchClasses(b.sec.key, b.sec.mode, chord), this.voicings.get(i) ?? null, l.lo, l.hi, l.voices ?? 2)
      : [midiOf(b.sec, chord.degree, l.lo, l.hi)];
    if (many) this.voicings.set(i, notes);
    for (const n of notes) this.play(l.instrument, b.channel(i, l), t, n, dur, (l.vel ?? 0.8) * (0.7 + energy * 0.3), PRIORITY.drone, l.bright);
  }

  step(b: Beat, t: number, stepDur: number): void {
    const { sec, plan, step } = b;
    const def = sec.def;
    const steps = sec.meter.steps;
    const isBeat = sec.meter.beats.includes(step);
    const isAccent = sec.meter.accents.includes(step);
    const { chord, energy } = plan;
    const human = (): number => 0.88 + this.rng.next() * 0.2;
    const lift = 0.75 + energy * 0.35;

    def.layers.forEach((l, i) => {
      if (!plan.active[i] || b.quiet?.(l.role, t) === true) return;
      const ch = b.channel(i, l);
      const pri = PRIORITY[l.role];
      const inst = INSTRUMENTS[l.instrument];
      switch (l.role) {
        case 'perc': {
          let hit = sec.drums.get(i)?.[step] ?? false;
          // Fills: rolls into the next section.
          const fillZone = plan.last && step >= steps - 4;
          if (fillZone && inst.roll === true && energy > 0.4) hit = hit || this.rng.chance(0.75);
          if (!hit) return;
          if (l.chance !== undefined && !this.rng.chance(l.chance)) return;
          const accent = isAccent ? 1 : isBeat ? 0.8 : 0.6;
          const fillUp = fillZone ? 1 + (step - (steps - 4)) * 0.1 : 1;
          let midi = 60;
          if (l.pitch) midi = 69 + 12 * Math.log2(l.pitch / 440);
          else if (inst.kind === 'tuned') midi = midiOf(sec, isAccent && step !== 0 ? 4 : chord.degree, 38, 50);
          this.play(l.instrument, ch, t, midi, 0.2, (l.vel ?? 0.8) * accent * fillUp * human() * lift, pri, l.bright);
          break;
        }
        case 'bass': {
          const root = midiOf(sec, chord.degree, l.lo, l.hi);
          const fifth = midiOf(sec, chord.degree + 4, l.lo, l.hi);
          if (step === 0) this.play(l.instrument, ch, t, root, energy > 0.55 ? stepDur * 4 : stepDur * steps * 0.9, 0.85 * lift, pri);
          else if (energy > 0.45 && isAccent) this.play(l.instrument, ch, t, this.rng.chance(0.6) ? fifth : root, stepDur * 4, 0.7 * lift, pri);
          else if (energy > 0.7 && isBeat) this.play(l.instrument, ch, t, this.rng.chance(0.5) ? (root + 12 <= l.hi ? root + 12 : root) : fifth, stepDur * 2, 0.6 * lift, pri);
          break;
        }
        case 'arp':
        case 'ostinato': {
          const rate = l.rate ?? 2;
          if (step % rate !== 0) return;
          if (l.chance !== undefined && !this.rng.chance(l.chance)) return;
          const notes = l.role === 'ostinato' ? this.ostinatoNotes(sec, chord, l) : this.chordNotes(sec, chord, l.lo, Math.min(l.hi, l.lo + 19));
          if (notes.length === 0) return;
          const k = this.arpIndex.get(i) ?? 0;
          this.arpIndex.set(i, k + 1);
          const n = notes.length;
          let idx = k % n;
          if (l.shape === 'down') idx = n - 1 - (k % n);
          else if (l.shape === 'updown') {
            const period = Math.max(1, n * 2 - 2);
            const p = k % period;
            idx = p < n ? p : period - p;
          } else if (l.shape === 'random') idx = this.rng.int(n);
          const accent = isAccent ? 1.1 : isBeat ? 0.95 : 0.8;
          const len = stepDur * rate * (l.role === 'ostinato' ? 0.8 : 2.5);
          this.play(l.instrument, ch, t, notes[idx] ?? notes[0] ?? 60, len, (l.vel ?? 0.75) * accent * human() * lift, pri, (l.bright ?? 0.5) * (0.7 + energy * 0.5));
          break;
        }
        case 'stab': {
          const on = isAccent || (energy > 0.75 && isBeat && this.rng.chance(0.4));
          if (!on) return;
          const voicing = voiceLead(chordPitchClasses(sec.key, sec.mode, chord), this.voicings.get(i) ?? null, l.lo, l.hi, 3);
          this.voicings.set(i, voicing);
          for (const v of voicing) this.play(l.instrument, ch, t, v, stepDur * 1.5, 0.75 * lift * human(), pri, l.bright);
          break;
        }
        case 'melody':
          this.melody(b, l, ch, t, stepDur, lift);
          break;
        case 'counter':
          this.counter(b, i, l, ch, t, stepDur, lift);
          break;
        case 'texture': {
          const p = (l.chance ?? 0.05) * (0.6 + energy * 0.8);
          if (!this.rng.chance(p)) return;
          const midi = l.lo + this.rng.int(Math.max(1, l.hi - l.lo));
          const tones = this.chordNotes(sec, chord, l.lo, l.hi);
          const note = inst.kind === 'tone' && tones.length > 0 ? (tones[this.rng.int(tones.length)] ?? midi) : midi;
          this.play(l.instrument, ch, t, note, this.rng.range(2, 6), (l.vel ?? 0.8) * human(), pri, l.bright);
          break;
        }
        default:
          break;
      }
    });
  }

  /** A stray instrument breaks in for a few chord tones somewhere in this bar. */
  rogue(b: Beat, inst: InstrumentId, ch: Channel, t: number, stepDur: number): void {
    const tones = this.chordNotes(b.sec, b.plan.chord, 64, 81);
    const count = 1 + this.rng.int(3);
    let s = this.rng.int(b.sec.meter.steps - 2);
    for (let k = 0; k < count && tones.length > 0; k++) {
      this.play(inst, ch, t + s * stepDur, this.rng.pick(tones), stepDur * this.rng.pick([1, 2, 3]), 0.4 + this.rng.next() * 0.2, 0.5);
      s += this.rng.pick([1, 2, 3]);
    }
  }

  private ostinatoNotes(sec: Section, chord: Chord, l: LayerDef): number[] {
    const root = midiOf(sec, chord.degree, l.lo, l.hi);
    const fifth = midiOf(sec, chord.degree + 4, l.lo, l.hi);
    const third = midiOf(sec, chord.degree + 2, l.lo, l.hi);
    const up = root + 12 <= l.hi ? root + 12 : root;
    switch (sec.key % 3) {
      case 0:
        return [root, root, up, root, fifth, root, up, fifth];
      case 1:
        return [root, root, fifth, root, root, third, fifth, up];
      default:
        return [root, fifth, root, up, root, fifth, third, fifth];
    }
  }

  private melody(b: Beat, l: LayerDef, ch: Channel, t: number, stepDur: number, lift: number): void {
    const { sec, plan, step, bar } = b;
    const steps = sec.meter.steps;
    const phraseBar = bar % 4;
    const pos = (phraseBar % 2) * steps + step;
    const cadence = phraseBar === 3;
    if (plan.melodyRests && !cadence) return;
    // Bars 3–4 answer bars 1–2: shifted up a step and ending on a long chord tone.
    const shift = phraseBar >= 2 ? (sec.key % 2 === 0 ? 1 : -1) * (bar % 8 >= 4 ? 2 : 1) : 0;
    if (cadence && step >= steps / 2) {
      if (step === Math.floor(steps / 2)) {
        const deg = this.snap(plan.last ? 0 : this.rng.pick([0, 2, 4]), plan.chord);
        this.sing(b, l, ch, t, deg, stepDur * (steps / 2) * 0.95, 0.85 * lift);
      }
      return;
    }
    for (const n of sec.motif) {
      if (n.step !== pos) continue;
      let deg = n.deg + shift;
      if (sec.meter.beats.includes(step)) deg = this.snap(deg, plan.chord);
      const vel = (sec.meter.accents.includes(step) ? 0.95 : 0.8) * lift;
      this.sing(b, l, ch, t, deg, stepDur * n.len * 0.92, vel);
    }
  }

  /** One melody note, and now and then a softer second voice a third or sixth below it, in the scale. */
  private sing(b: Beat, l: LayerDef, ch: Channel, t: number, deg: number, dur: number, vel: number): void {
    const midi = midiOf(b.sec, deg, l.lo, l.hi);
    this.play(l.instrument, ch, t, midi, dur, vel, PRIORITY.melody, l.bright);
    if (!l.harmony || !this.rng.chance(l.harmony)) return;
    const under = this.rng.chance(0.7) ? 2 : 5;
    const drop = degreeToSemis(b.sec.mode, deg) - degreeToSemis(b.sec.mode, deg - under);
    this.play(l.instrument, ch, t, midi - drop, dur, vel * 0.6, PRIORITY.counter, l.bright);
  }

  private counter(b: Beat, i: number, l: LayerDef, ch: Channel, t: number, stepDur: number, lift: number): void {
    const { sec, plan, step, bar } = b;
    const steps = sec.meter.steps;
    const melodyOn = plan.active.some((a, k) => a && sec.def.layers[k]?.role === 'melody');
    if (plan.melodyRests || !melodyOn) {
      // Take the tune while the melody breathes, an octave apart.
      const pos = ((bar % 4) % 2) * steps + step;
      for (const n of sec.motif) {
        if (n.step !== pos) continue;
        this.play(l.instrument, ch, t, midiOf(sec, n.deg, l.lo, l.hi), stepDur * n.len * 0.9, 0.7 * lift, PRIORITY.counter, l.bright);
      }
      return;
    }
    // Otherwise a slow descant on chord tones.
    if (step === 0 || step === Math.floor(steps / 2)) {
      if (!this.rng.chance(0.7)) return;
      const deg = chordDegreeSet(plan.chord)[step === 0 ? 1 : 2] ?? 0;
      const prev = this.voicings.get(i)?.[0];
      let midi = midiOf(sec, deg, l.lo, l.hi);
      if (prev !== undefined && Math.abs(midi - prev) > 7) midi += midi > prev ? -12 : 12;
      if (midi < l.lo) midi += 12;
      if (midi > l.hi) midi -= 12;
      this.voicings.set(i, [midi]);
      this.play(l.instrument, ch, t, midi, stepDur * (steps / 2) * 0.9, 0.6 * lift, PRIORITY.counter, l.bright);
    }
  }
}
