// The conductor: listens to the mood, picks the style that fits, plays it bar by bar and answers events on the beat.
// Notes are scheduled a little ahead on the audio clock. Each bar re-reads the mood: layers join/leave with energy,
// tempo glides with the mood dials (modulators.ts), styles change at phrase ends (urgent ones at once), and game
// events play cues (cues.ts, reactions.ts) on the music's grid in the current key.
import type { SimEvent } from '../../types';
import { Synth, noiseBuffer } from './synth';
import { MusicMixer } from './mixer';
import type { Channel } from './mixer';
import type { GameView } from './signals';
import { MoodTracker } from './signals';
import { STYLES, bestStyle, styleScore } from './styles';
import type { LayerDef, MeterId, StyleId } from './styles';
import type { Section } from './composer';
import { compose, nextKind, worldTheme } from './composer';
import { MusicRng } from './theory';
import { Band } from './band';
import type { BarPlan, Beat } from './band';
import { CuePlayer } from './cuePlayer';
import type { GridClock } from './cuePlayer';
import { reactionFor } from './reactions';
import { dials } from './modulators';

const LOOKAHEAD = 0.3;
const SAMPLE_EVERY = 0.5;

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
  lastCue: string;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export class MusicEngine {
  readonly mood = new MoodTracker();
  private synth: Synth;
  private mixer: MusicMixer;
  private rng: MusicRng;
  private band: Band;
  private cues: CuePlayer;
  private theme: { deg: number; len: number }[];
  private section: Section | null = null;
  private sectionCount = 0;
  private bar = 0;
  private step = 0;
  private nextStepAt = 0;
  /** The tempo actually playing: glides towards section tempo × mood dial. */
  private bpm = 90;
  private tempoDial = 1;
  private glide = 0.06;
  private style: StyleId = 'wander';
  private styleBars = 0;
  private styleSince = 0;
  private pending: StyleId | null = null;
  private pendingVotes = 0;
  private forced: StyleId | null = null;
  private plan: BarPlan | null = null;
  private sampleTimer = 0;
  private level = 0.8;
  private started = false;
  private listener = { x: 0, y: 0 };
  private lastCue = '-';

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    seed = 1,
  ) {
    this.synth = new Synth(ctx, noiseBuffer(ctx, 2));
    this.mixer = new MusicMixer(ctx, destination);
    this.mixer.out.gain.value = 0;
    this.rng = new MusicRng((seed * 2654435761) >>> 0);
    this.theme = worldTheme(seed);
    this.band = new Band(this.synth, this.rng);
    const fx: Channel = { input: this.mixer.fx, target: 1, echo: this.mixer.fx };
    this.cues = new CuePlayer(this.band, fx, this.mood);
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
      tempo: Math.round(this.bpm),
      meter: s?.meterId ?? 'four',
      energy: Math.round((this.plan?.energy ?? 0) * 100) / 100,
      voices: this.synth.active,
      lastCue: this.lastCue,
    };
  }

  onEvent(ev: SimEvent, localId: number | null): void {
    this.mood.impulse(ev, localId, this.listener);
    const near = (x: number, y: number, r: number): boolean => Math.hypot(x - this.listener.x, y - this.listener.y) < r;
    const id = reactionFor(ev, localId, near);
    if (id) this.cue(id);
  }

  /** Play a cue on the beat (also a console helper). False when unknown, cooling down or silent. */
  cue(id: string, at?: number): boolean {
    const beat = this.beat();
    if (!beat || !this.section) return false;
    const clock: GridClock = { now: this.ctx.currentTime, next: this.nextStepAt, step: this.step, stepDur: 15 / this.bpm, meter: this.section.meter };
    const ok = this.cues.play(id, beat, clock, this.theme, at);
    if (ok) this.lastCue = id;
    return ok;
  }

  private beat(): Beat | null {
    const sec = this.section;
    const plan = this.plan;
    if (!sec || !plan) return null;
    return { sec, plan, bar: this.bar, step: this.step, channel: (i, l) => this.channelFor(i, l) };
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
      this.style = this.forced ?? bestStyle(this.mood.current, this.mood.extra, this.style);
      this.beginStyle(this.style, now + 0.2, null);
    }
    // Tab was hidden or the machine stalled: skip ahead rather than play a pile-up.
    if (this.nextStepAt < now - 0.25) this.nextStepAt = now + 0.05;
    let guard = 0;
    while (this.nextStepAt < now + LOOKAHEAD && guard++ < 64) this.tick();
  }

  private beginStyle(style: StyleId, t: number, from: StyleId | null): void {
    const def = STYLES[style];
    const prev = this.section;
    const kind = def.urgent || !from ? 'main' : 'intro';
    const sec = compose(this.rng, { style, def, kind, prev, theme: this.theme });
    if (from && from !== style) {
      this.mixer.setStyle(from, 0, STYLES[from].mix, t, def.urgent ? 0.8 : 5);
      // The new style's entrance cue wins; otherwise the old one says goodbye.
      const cue = def.enter ?? STYLES[from].leave;
      if (cue && prev && this.plan) this.cue(cue, t);
    }
    this.style = style;
    this.styleBars = 0;
    this.styleSince = t;
    this.sectionCount = 0;
    this.pending = null;
    this.pendingVotes = 0;
    this.band.voicings.clear();
    this.section = sec;
    this.bar = 0;
    this.step = 0;
    this.nextStepAt = t;
    // Urgent styles snap to their tempo; calm changes glide over a couple of bars.
    this.glide = def.urgent ? 0.5 : 0.05;
    if (!from) this.bpm = sec.tempo * this.tempoDial;
    this.mixer.setStyle(style, def.mix.level, def.mix, t, def.urgent ? 0.3 : 4);
    this.mixer.setTempo(this.bpm, t);
  }

  // --- Clock ---------------------------------------------------------------------------------

  private tick(): void {
    const sec = this.section;
    if (!sec) return;
    const t = this.nextStepAt;
    if (this.step === 0) this.barStart(t);
    const cur = this.section ?? sec;
    const target = cur.tempo * this.tempoDial;
    this.bpm += (target - this.bpm) * this.glide;
    const stepDur = 15 / this.bpm;
    // Swing pushes off-beat sixteenths late.
    const swung = this.step % 2 === 1 ? t + stepDur * cur.def.swing : t;
    const beat = this.beat();
    if (beat) this.band.step(beat, swung, stepDur);
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
    if (this.styleBars > 0) this.glide = 0.05;

    // Does another style fit better now?
    const want = this.forced ?? bestStyle(this.mood.current, this.mood.extra, this.style);
    if (want !== this.style) {
      const def = STYLES[want];
      const cur = STYLES[this.style];
      const sc = styleScore(want, this.mood.current, this.mood.extra);
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
    }

    const def = sec.def;
    const m = this.mood.current;
    const dial = dials(m);
    this.tempoDial = dial.tempo;
    this.mixer.setTempo(this.bpm, t);
    let energy = 0.4;
    try {
      energy = Math.max(0, Math.min(1, def.energy(m) + dial.energy));
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
    // The mood dials brighten or muffle the whole style (hurt, night, depth…).
    this.mixer.shade(this.style, Math.min(18000, def.mix.tone * dial.tone), t);

    const chord = sec.chordAt[this.bar] ?? { degree: 0, color: 'triad', bars: 1 };
    const phraseBar = this.bar % 4;
    const melodyRests = (phraseBar === 1 || phraseBar === 3) && this.rng.chance(def.melody.space * 0.5);
    this.plan = { t, chord, energy, active, melodyRests, last: this.bar === sec.bars - 1 };

    const barDur = (15 / this.bpm) * sec.meter.steps;
    const beat = this.beat();
    if (!beat) return;
    const startsChord = sec.chordStarts[this.bar] ?? this.bar === 0;
    def.layers.forEach((l, i) => {
      if (!active[i]) return;
      if (l.role === 'pad' && (startsChord || this.bar === 0)) this.band.pad(beat, i, l, chord, t, chord.bars * barDur, energy);
      if (l.role === 'drone' && this.bar % 4 === 0) this.band.drone(beat, i, l, t, Math.min(4, sec.bars - this.bar) * barDur, energy);
    });
  }

  private channelFor(i: number, l: LayerDef): Channel {
    return this.mixer.channel(this.style, i, l.pan ?? 0, (l.echo ?? 0) * STYLES[this.style].mix.echo);
  }
}
