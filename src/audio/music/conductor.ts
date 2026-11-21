/**
 * The conductor: listens to the mood, picks the style that fits, and plays it bar by bar.
 *
 * Every frame it schedules notes a little ahead on the audio clock (so timing stays tight even if
 * a frame is late). At each bar it re-reads the mood: layers join and leave as the energy moves,
 * and when another style fits better it changes over at the end of a phrase — or on the next beat
 * when a fight breaks out.
 */
import type { SimEvent } from '../../types';
import { INSTRUMENTS } from './instruments';
import { Synth } from './synth';
import type { InstrumentId } from './instruments';
import { MusicMixer } from './mixer';
import type { Channel } from './mixer';
import type { GameView, MoodSignals } from './signals';
import { MoodTracker } from './signals';
import { STYLES, STYLE_IDS } from './styles';
import type { LayerDef, MeterId, StyleId } from './styles';
import type { Section } from './composer';
import { chordDegreeSet, compose, nextKind, worldTheme } from './composer';
import type { Chord } from './theory';
import { MusicRng, chordPitchClasses, degreeToSemis, mtof, voiceLead } from './theory';

const LOOKAHEAD = 0.3;
const SAMPLE_EVERY = 0.5;

/** How important each role is when the orchestra is crowded (1 = never dropped). */
const PRIORITY: Record<LayerDef['role'], number> = {
  melody: 1, bass: 1, pad: 1, drone: 1, perc: 0.8, stab: 0.7, ostinato: 0.7, counter: 0.6, arp: 0.55, texture: 0.3,
};

interface BarPlan {
  t: number;
  chord: Chord;
  energy: number;
  active: boolean[];
  melodyRests: boolean;
  last: boolean;
}

export interface MusicStatus {
  style: StyleId;
  styleName: string;
  section: string;
  key: string;
  mode: string;
  tempo: number;
  meter: MeterId;
  energy: number;
  voices: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export class MusicEngine {
  readonly mood = new MoodTracker();
  private synth: Synth;
  private mixer: MusicMixer;
  private rng: MusicRng;
  private theme: { deg: number; len: number }[];
  private section: Section | null = null;
  private sectionCount = 0;
  private bar = 0;
  private step = 0;
  private nextStepAt = 0;
  private style: StyleId = 'wander';
  private styleBars = 0;
  private styleSince = 0;
  private pending: StyleId | null = null;
  private pendingVotes = 0;
  private forced: StyleId | null = null;
  private plan: BarPlan | null = null;
  private voicings = new Map<number, number[]>();
  private arpIndex = new Map<number, number>();
  private sampleTimer = 0;
  private level = 0.8;
  private started = false;
  private listener = { x: 0, y: 0 };

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    seed = 1,
  ) {
    const noise = this.makeNoise(2);
    this.synth = new Synth(ctx, noise);
    this.mixer = new MusicMixer(ctx, destination);
    this.mixer.out.gain.value = 0;
    this.rng = new MusicRng((seed * 2654435761) >>> 0);
    this.theme = worldTheme(seed);
  }

  private makeNoise(seconds: number): AudioBuffer {
    const n = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** A new world gets its own theme. */
  setWorldSeed(seed: number): void {
    this.theme = worldTheme(seed);
  }

  /** 0..1 music volume. */
  setVolume(v: number): void {
    this.level = Math.max(0, Math.min(1, v));
    if (this.started) this.mixer.out.gain.setTargetAtTime(this.level, this.ctx.currentTime, 0.3);
  }

  /** Lock music to one style (previews, debugging), or null to follow the game again. */
  force(style: StyleId | null): void {
    this.forced = style;
  }

  status(): MusicStatus {
    const s = this.section;
    return {
      style: this.style,
      styleName: STYLES[this.style].name,
      section: s?.kind ?? '-',
      key: s ? NOTE_NAMES[s.key] ?? '?' : '-',
      mode: s?.modeId ?? '-',
      tempo: Math.round(s?.tempo ?? 0),
      meter: s?.meterId ?? 'four',
      energy: Math.round((this.plan?.energy ?? 0) * 100) / 100,
      voices: this.synth.active,
    };
  }

  // -------------------------------------------------------------------------------------------

  onEvent(ev: SimEvent, localId: number | null): void {
    this.mood.impulse(ev, localId, this.listener);
    if (!this.started || !this.section) return;
    const t = this.ctx.currentTime + 0.05;
    switch (ev.type) {
      case 'discovered':
        this.stinger('discover', t);
        break;
      case 'runeLearned':
        if (ev.player === localId) this.stinger('rune', t);
        break;
      case 'skillUp':
        if (ev.player === localId) this.stinger('skill', t);
        break;
      default:
        break;
    }
  }

  /** Call every frame. `view` is null when there is no local player yet. */
  update(now: number, dt: number, view: GameView | null): void {
    if (view) {
      this.listener = { x: view.me.pos.x, y: view.me.pos.y };
      this.sampleTimer -= dt;
      if (this.sampleTimer <= 0) {
        this.sampleTimer = SAMPLE_EVERY;
        this.mood.sample(view);
      }
    }
    this.mood.update(dt);
    if (!this.started) {
      this.started = true;
      this.nextStepAt = now + 0.2;
      this.mixer.out.gain.setValueAtTime(0, now);
      this.mixer.out.gain.linearRampToValueAtTime(this.level, now + 3);
      this.style = this.forced ?? this.pickStyle();
      this.beginStyle(this.style, now + 0.2, null);
    }
    // Tab was hidden or the machine stalled: skip ahead rather than play a pile-up.
    if (this.nextStepAt < now - 0.25) this.nextStepAt = now + 0.05;
    let guard = 0;
    while (this.nextStepAt < now + LOOKAHEAD && guard++ < 64) this.tick();
  }

  // --- Style choice --------------------------------------------------------------------------

  private scores(s: MoodSignals): Map<StyleId, number> {
    const out = new Map<StyleId, number>();
    for (const id of STYLE_IDS) {
      let v = 0;
      try {
        v = STYLES[id].affinity(s, this.mood.extra);
      } catch {
        v = 0;
      }
      out.set(id, Number.isFinite(v) ? v : 0);
    }
    return out;
  }

  private pickStyle(): StyleId {
    const sc = this.scores(this.mood.current);
    let best: StyleId = 'wander';
    let bestV = -Infinity;
    for (const [id, v] of sc) {
      const bonus = id === this.style ? 0.08 : 0;
      if (v + bonus > bestV) {
        bestV = v + bonus;
        best = id;
      }
    }
    return best;
  }

  private beginStyle(style: StyleId, t: number, from: StyleId | null): void {
    const def = STYLES[style];
    const prev = this.section;
    if (from && from !== style) {
      this.mixer.setStyle(from, 0, STYLES[from].mix, t, def.urgent ? 0.8 : 5);
      this.transition(from, style, t);
    }
    this.style = style;
    this.styleBars = 0;
    this.styleSince = t;
    this.sectionCount = 0;
    this.pending = null;
    this.pendingVotes = 0;
    this.voicings.clear();
    const kind = def.urgent || !from ? 'main' : 'intro';
    this.section = compose(this.rng, { style, def, kind, prev, theme: this.theme });
    this.bar = 0;
    this.step = 0;
    this.nextStepAt = t;
    this.mixer.setStyle(style, def.mix.level, def.mix, t, def.urgent ? 0.3 : 4);
    this.mixer.setTempo(this.section.tempo, t);
  }

  // --- Clock ---------------------------------------------------------------------------------

  private tick(): void {
    const sec = this.section;
    if (!sec) return;
    const t = this.nextStepAt;
    if (this.step === 0) this.barStart(t);
    const cur = this.section ?? sec;
    const stepDur = 15 / cur.tempo;
    // Swing pushes off-beat sixteenths late.
    const swung = this.step % 2 === 1 ? t + stepDur * cur.def.swing : t;
    this.playStep(swung, stepDur);
    this.step++;
    this.nextStepAt += stepDur;
    if (this.step >= cur.meter.steps) {
      this.step = 0;
      this.bar++;
      this.styleBars++;
    }
  }

  private barStart(t: number): void {
    let sec = this.section;
    if (!sec) return;

    // Does another style fit better now?
    const want = this.forced ?? this.pickStyle();
    if (want !== this.style) {
      const def = STYLES[want];
      const cur = STYLES[this.style];
      const sc = this.scores(this.mood.current).get(want) ?? 0;
      const canLeave = this.styleBars >= cur.minBars || t - this.styleSince > 14 || def.urgent === true || this.forced !== null;
      if (def.urgent && (sc > 0.45 || this.forced !== null)) {
        this.beginStyle(want, t, this.style);
      } else if (canLeave) {
        if (this.pending === want) this.pendingVotes++;
        else {
          this.pending = want;
          this.pendingVotes = 1;
        }
        const phraseEnd = this.bar % 2 === 0 || sec.kind === 'rest';
        if ((this.pendingVotes >= 2 && phraseEnd) || this.forced !== null) this.beginStyle(want, t, this.style);
      }
    } else {
      this.pending = null;
      this.pendingVotes = 0;
    }

    sec = this.section;
    if (!sec) return;
    if (this.bar >= sec.bars) {
      this.sectionCount++;
      const kind = nextKind(this.rng, sec.def, sec.kind, this.sectionCount);
      this.section = compose(this.rng, { style: this.style, def: sec.def, kind, prev: sec, theme: this.theme });
      this.bar = 0;
      sec = this.section;
      this.mixer.setTempo(sec.tempo, t);
    }

    const def = sec.def;
    const m = this.mood.current;
    let energy = 0.4;
    try {
      energy = def.energy(m);
    } catch {
      energy = 0.4;
    }
    if (sec.kind === 'lift') energy = Math.min(1, energy + 0.18);
    if (sec.kind === 'intro') energy = Math.min(energy, 0.2 + this.bar * 0.12);
    const restSilent = sec.kind === 'rest' && this.bar === 0 ? this.rng.chance(0.4) : false;
    const active = def.layers.map((l) => {
      if (sec.kind === 'rest') return !restSilent && l.enter <= 0 && (l.role === 'pad' || l.role === 'drone' || l.role === 'texture');
      if (sec.kind === 'break' && (l.role === 'perc' || l.role === 'bass' || l.role === 'stab')) return false;
      return energy >= l.enter && (l.leave === undefined || energy < l.leave);
    });
    def.layers.forEach((l, i) => {
      const ch = this.channelFor(i, l);
      this.mixer.setChannel(ch, active[i] ? l.level * (sec.kind === 'rest' ? 0.6 : 1) : 0, t);
    });
    // Hurt and dark moments muffle the music a little.
    this.mixer.shade(this.style, def.mix.tone * (1 - m.hurt * 0.55) * (1 - m.downed * 0.3), t);

    const chord = sec.chordAt[this.bar] ?? { degree: 0, color: 'triad', bars: 1 };
    const phraseBar = this.bar % 4;
    const melodyRests = (phraseBar === 1 || phraseBar === 3) && this.rng.chance(def.melody.space * 0.5);
    this.plan = { t, chord, energy, active, melodyRests, last: this.bar === sec.bars - 1 };

    const barDur = (15 / sec.tempo) * sec.meter.steps;
    const startsChord = sec.chordStarts[this.bar] ?? this.bar === 0;
    def.layers.forEach((l, i) => {
      if (!active[i]) return;
      if (l.role === 'pad' && (startsChord || this.bar === 0)) this.playPad(i, l, chord, t, chord.bars * barDur, energy);
      if (l.role === 'drone' && this.bar % 4 === 0) this.playDrone(i, l, t, Math.min(4, sec.bars - this.bar) * barDur, energy);
    });
  }

  private channelFor(i: number, l: LayerDef): Channel {
    return this.mixer.channel(this.style, i, l.pan ?? 0, (l.echo ?? 0) * STYLES[this.style].mix.echo);
  }

  // --- Notes ---------------------------------------------------------------------------------

  private play(inst: InstrumentId, ch: Channel, t: number, midi: number, dur: number, vel: number, priority: number, bright?: number): void {
    if (!this.synth.allow(priority)) return;
    const freq = mtof(midi);
    if (!(freq > 15) || freq > this.ctx.sampleRate * 0.4) return;
    try {
      INSTRUMENTS[inst](this.synth, ch.input, { t, freq, dur, vel: Math.max(0, Math.min(1, vel)), bright });
    } catch {
      // A broken patch must not stop the rest of the band.
    }
  }

  /** MIDI note of a scale degree, placed inside a register. */
  private midiOf(sec: Section, deg: number, lo: number, hi: number): number {
    const centre = (lo + hi) / 2;
    const base = sec.key + Math.round((centre - 5 - sec.key) / 12) * 12;
    let n = base + degreeToSemis(sec.mode, deg);
    while (n < lo) n += 12;
    while (n > hi) n -= 12;
    return n;
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

  private chordNotes(sec: Section, chord: Chord, lo: number, hi: number): number[] {
    const pcs = chordPitchClasses(sec.key, sec.mode, chord);
    const out: number[] = [];
    for (let n = lo; n <= hi; n++) if (pcs.includes(((n % 12) + 12) % 12)) out.push(n);
    return out;
  }

  private playPad(i: number, l: LayerDef, chord: Chord, t: number, dur: number, energy: number): void {
    const sec = this.section;
    if (!sec) return;
    const pcs = chordPitchClasses(sec.key, sec.mode, chord);
    const voicing = voiceLead(pcs, this.voicings.get(i) ?? null, l.lo, l.hi, l.voices ?? 3);
    this.voicings.set(i, voicing);
    const ch = this.channelFor(i, l);
    const vel = (l.vel ?? 0.8) * (0.7 + energy * 0.4);
    for (const n of voicing) this.play(l.instrument, ch, t, n, dur, vel, PRIORITY.pad, (l.bright ?? 0.5) * (0.7 + energy * 0.5));
  }

  private playDrone(i: number, l: LayerDef, t: number, dur: number, energy: number): void {
    const sec = this.section;
    if (!sec) return;
    const ch = this.channelFor(i, l);
    const root = this.midiOf(sec, 0, l.lo, l.hi);
    this.play(l.instrument, ch, t, root, dur, (l.vel ?? 0.8) * (0.7 + energy * 0.3), PRIORITY.drone, l.bright);
  }

  private playStep(t: number, stepDur: number): void {
    const sec = this.section;
    const plan = this.plan;
    if (!sec || !plan) return;
    const def = sec.def;
    const step = this.step;
    const steps = sec.meter.steps;
    const isBeat = sec.meter.beats.includes(step);
    const isAccent = sec.meter.accents.includes(step);
    const { chord, energy } = plan;
    const human = (): number => 0.88 + this.rng.next() * 0.2;
    const lift = 0.75 + energy * 0.35;

    def.layers.forEach((l, i) => {
      if (!plan.active[i]) return;
      const ch = this.channelFor(i, l);
      const pri = PRIORITY[l.role];
      switch (l.role) {
        case 'perc': {
          const map = sec.drums.get(i);
          let hit = map?.[step] ?? false;
          // Fills: rolls into the next section.
          const fillZone = plan.last && step >= steps - 4;
          if (fillZone && (l.instrument === 'taiko' || l.instrument === 'snare' || l.instrument === 'timpani') && energy > 0.4) hit = hit || this.rng.chance(0.75);
          if (!hit) return;
          if (l.chance !== undefined && !this.rng.chance(l.chance)) return;
          const accent = isAccent ? 1 : isBeat ? 0.8 : 0.6;
          const fillUp = fillZone ? 1 + (step - (steps - 4)) * 0.1 : 1;
          let midi = 60;
          if (l.pitch) midi = 69 + 12 * Math.log2(l.pitch / 440);
          else if (l.instrument === 'timpani') midi = this.midiOf(sec, isAccent && step !== 0 ? 4 : chord.degree, 38, 50);
          this.play(l.instrument, ch, t, midi, 0.2, (l.vel ?? 0.8) * accent * fillUp * human() * lift, pri, l.bright);
          break;
        }
        case 'bass': {
          const root = this.midiOf(sec, chord.degree, l.lo, l.hi);
          const fifth = this.midiOf(sec, chord.degree + 4, l.lo, l.hi);
          const barSteps = steps;
          if (step === 0) this.play(l.instrument, ch, t, root, energy > 0.55 ? stepDur * 4 : stepDur * barSteps * 0.9, 0.85 * lift, pri);
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
          let idx = 0;
          const n = notes.length;
          switch (l.shape ?? 'up') {
            case 'down':
              idx = n - 1 - (k % n);
              break;
            case 'updown': {
              const period = Math.max(1, n * 2 - 2);
              const p = k % period;
              idx = p < n ? p : period - p;
              break;
            }
            case 'random':
              idx = this.rng.int(n);
              break;
            case 'pedal':
              idx = k % n;
              break;
            default:
              idx = k % n;
          }
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
          this.playMelody(i, l, ch, t, stepDur, lift);
          break;
        case 'counter':
          this.playCounter(i, l, ch, t, stepDur, lift);
          break;
        case 'texture': {
          const p = (l.chance ?? 0.05) * (0.6 + energy * 0.8);
          if (!this.rng.chance(p)) return;
          const midi = l.lo + this.rng.int(Math.max(1, l.hi - l.lo));
          const tones = this.chordNotes(sec, chord, l.lo, l.hi);
          const pitched = l.instrument === 'bell' || l.instrument === 'celesta' || l.instrument === 'cluster' || l.instrument === 'glass';
          const note = pitched && tones.length > 0 ? (tones[this.rng.int(tones.length)] ?? midi) : midi;
          this.play(l.instrument, ch, t, note, this.rng.range(2, 6), (l.vel ?? 0.8) * human(), pri, l.bright);
          break;
        }
        default:
          break;
      }
    });
  }

  private ostinatoNotes(sec: Section, chord: Chord, l: LayerDef): number[] {
    const root = this.midiOf(sec, chord.degree, l.lo, l.hi);
    const fifth = this.midiOf(sec, chord.degree + 4, l.lo, l.hi);
    const third = this.midiOf(sec, chord.degree + 2, l.lo, l.hi);
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

  private playMelody(i: number, l: LayerDef, ch: Channel, t: number, stepDur: number, lift: number): void {
    const sec = this.section;
    const plan = this.plan;
    if (!sec || !plan) return;
    const steps = sec.meter.steps;
    const phraseBar = this.bar % 4;
    const pos = (phraseBar % 2) * steps + this.step;
    const cadence = phraseBar === 3;
    if (plan.melodyRests && !cadence) return;
    // Bars 3–4 answer bars 1–2: shifted up a step and ending on a long chord tone.
    const shift = phraseBar >= 2 ? (sec.key % 2 === 0 ? 1 : -1) * (this.bar % 8 >= 4 ? 2 : 1) : 0;
    if (cadence && this.step >= steps / 2) {
      if (this.step === Math.floor(steps / 2)) {
        const deg = this.snap(phraseBar === 3 && plan.last ? 0 : this.rng.pick([0, 2, 4]), plan.chord);
        this.play(l.instrument, ch, t, this.midiOf(sec, deg, l.lo, l.hi), stepDur * (steps / 2) * 0.95, 0.85 * lift, PRIORITY.melody, l.bright);
      }
      return;
    }
    for (const n of sec.motif) {
      if (n.step !== pos) continue;
      let deg = n.deg + shift;
      if (sec.meter.beats.includes(this.step)) deg = this.snap(deg, plan.chord);
      const vel = (sec.meter.accents.includes(this.step) ? 0.95 : 0.8) * lift;
      this.play(l.instrument, ch, t, this.midiOf(sec, deg, l.lo, l.hi), stepDur * n.len * 0.92, vel, PRIORITY.melody, l.bright);
    }
    void i;
  }

  private playCounter(i: number, l: LayerDef, ch: Channel, t: number, stepDur: number, lift: number): void {
    const sec = this.section;
    const plan = this.plan;
    if (!sec || !plan) return;
    const steps = sec.meter.steps;
    const melodyOn = plan.active.some((a, k) => a && sec.def.layers[k]?.role === 'melody');
    if (plan.melodyRests || !melodyOn) {
      // Take the tune while the melody breathes, an octave apart.
      const pos = ((this.bar % 4) % 2) * steps + this.step;
      for (const n of sec.motif) {
        if (n.step !== pos) continue;
        this.play(l.instrument, ch, t, this.midiOf(sec, n.deg, l.lo, l.hi), stepDur * n.len * 0.9, 0.7 * lift, PRIORITY.counter, l.bright);
      }
      return;
    }
    // Otherwise a slow descant on chord tones.
    if (this.step === 0 || this.step === Math.floor(steps / 2)) {
      if (!this.rng.chance(0.7)) return;
      const deg = chordDegreeSet(plan.chord)[this.step === 0 ? 1 : 2] ?? 0;
      const prev = this.voicings.get(i)?.[0];
      let midi = this.midiOf(sec, deg, l.lo, l.hi);
      if (prev !== undefined && Math.abs(midi - prev) > 7) midi += midi > prev ? -12 : 12;
      if (midi < l.lo) midi += 12;
      if (midi > l.hi) midi -= 12;
      this.voicings.set(i, [midi]);
      this.play(l.instrument, ch, t, midi, stepDur * (steps / 2) * 0.9, 0.6 * lift, PRIORITY.counter, l.bright);
    }
  }

  // --- Transitions and stingers --------------------------------------------------------------

  private fx(inst: InstrumentId, t: number, midi: number, dur: number, vel: number, bright?: number): void {
    this.play(inst, { input: this.mixer.fx, target: 1, echo: this.mixer.fx }, t, midi, dur, vel, 1, bright);
  }

  private transition(from: StyleId, to: StyleId, t: number): void {
    const sec = this.section;
    const key = sec?.key ?? 2;
    const m = this.mood.current;
    if (to === 'battle') {
      this.fx('boom', t, 36, 1, 0.9);
      this.fx('crash', t, 60, 1, 0.7);
      this.fx('taiko', t, 36, 0.2, 1);
    } else if (from === 'battle' && to !== 'tension' && to !== 'lament') {
      // The fight is over: a bright chord that resolves the tension.
      const root = 48 + key;
      const won = m.triumph > 0.15;
      const third = won ? 4 : 3;
      for (const n of [root, root + 7, root + 12, root + 12 + third, root + 19]) this.fx(won ? 'horn' : 'strings', t, n, 2.6, 0.7, 0.6);
      this.fx('timpani', t, 36 + key, 0.4, 0.8);
      this.fx('crash', t, 60, 1, 0.4);
    } else if (to === 'dungeon') {
      this.fx('boom', t, 36, 1, 0.5);
      this.fx('bell', t + 0.2, 36 + key, 4, 0.8);
    } else if (to === 'grandeur') {
      this.fx('swell', t - 1.5 > this.ctx.currentTime ? t - 1.5 : t, 60, 1.5, 0.6);
      const mode = sec?.mode ?? [0, 2, 4, 5, 7, 9, 11];
      for (let k = 0; k < 10; k++) this.fx('harp', t + k * 0.05, 55 + key + degreeToSemis(mode, k), 0.5, 0.55);
    } else if (to === 'lament') {
      this.fx('cello', t, 36 + key, 3, 0.7);
    } else if (to === 'tension') {
      this.fx('rise', t, 48 + key, 1.2, 0.6);
    }
  }

  private stinger(kind: 'discover' | 'rune' | 'skill', t: number): void {
    const sec = this.section;
    if (!sec) return;
    const mode = sec.mode;
    const at = (deg: number, base: number): number => base + sec.key + degreeToSemis(mode, deg);
    if (kind === 'discover') {
      // A heraldic call: the theme's opening on horns, a harp sweep, drums and a choir chord.
      const opening = this.theme.slice(0, 4);
      let tt = t;
      for (const n of opening) {
        this.fx('horn', tt, at(n.deg, 60), n.len * 0.08, 0.8, 0.7);
        tt += n.len * 0.075;
      }
      for (const d of [0, 2, 4, 7]) this.fx('choir', tt, at(d, 55), 2.8, 0.6, 0.7);
      this.fx('horn', tt, at(0, 60), 2.4, 0.8, 0.7);
      for (let k = 0; k < 12; k++) this.fx('harp', t + k * 0.04, at(k, 60), 0.5, 0.5);
      this.fx('timpani', t, at(0, 36), 0.3, 0.7);
      this.fx('timpani', tt, at(0, 36), 0.3, 0.9);
      this.fx('crash', tt, 60, 1, 0.5);
      this.mood.feed('wonder', 1, 20);
    } else if (kind === 'rune') {
      for (let k = 0; k < 7; k++) this.fx('celesta', t + k * 0.09, at(k * 2, 72), 1.2, 0.7);
      this.fx('glass', t, at(0, 60), 3, 0.7);
      this.fx('glass', t, at(4, 60), 3, 0.6);
      this.fx('bell', t + 0.65, at(0, 72), 3, 0.6);
    } else {
      for (const [k, d] of [0, 2, 4].entries()) this.fx('harp', t + k * 0.1, at(d, 67), 0.8, 0.7);
      this.fx('celesta', t + 0.3, at(7, 72), 1.5, 0.6);
    }
  }
}
