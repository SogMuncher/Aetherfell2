// Plays cues on the music's grid: next step/eighth/beat/bar, in the current key, chord and band.
import type { Meter } from './styles';
import type { Channel } from './mixer';
import type { MoodTracker } from './signals';
import { INSTRUMENTS } from './instruments';
import type { InstrumentId } from './instruments';
import type { Band, Beat } from './band';
import { midiOf } from './band';
import { CUE_TABLE } from './cues';
import type { CueNote, GridUnit, Voice } from './cues';
import { chordPitchClasses, degreeToSemis, voiceLead } from './theory';

/** The music's clock: step `step` starts at `next` seconds, each step lasts `stepDur`. */
export interface GridClock {
  now: number;
  next: number;
  step: number;
  stepDur: number;
  meter: Meter;
}

/** Earliest time from now that falls on the given grid unit. */
export function gridTime(unit: GridUnit, c: GridClock): number {
  const soonest = c.now + 0.03;
  if (unit === 'now') return soonest;
  const n = c.meter.steps;
  const first = Math.ceil((soonest - c.next) / c.stepDur);
  for (let k = first; k < first + n * 2; k++) {
    const s = (((c.step + k) % n) + n) % n;
    const on =
      unit === 'step' ||
      (unit === 'eighth' && s % 2 === 0) ||
      (unit === 'beat' && c.meter.beats.includes(s)) ||
      (unit === 'bar' && s === 0);
    if (on) return c.next + k * c.stepDur;
  }
  return soonest;
}

export class CuePlayer {
  private last = new Map<string, number>();
  private streak = new Map<string, { n: number; at: number }>();

  constructor(
    private band: Band,
    private out: Channel,
    private mood: MoodTracker,
  ) {}

  /** Plays cue `id`; `at` forces a start time (style changes land exactly on the bar). */
  play(id: string, b: Beat, clock: GridClock, theme: readonly { deg: number; len: number }[], at?: number): boolean {
    let cue = CUE_TABLE[id];
    if (!cue) return false;
    if (cue.alt && this.mood.current[cue.alt.when] >= cue.alt.min && CUE_TABLE[cue.alt.cue]) {
      id = cue.alt.cue;
      cue = CUE_TABLE[id];
      if (!cue) return false;
    }
    const now = clock.now;
    if (now - (this.last.get(id) ?? -Infinity) < (cue.cooldown ?? 0)) return false;
    this.last.set(id, now);
    let climb = 0;
    if (cue.climb) {
      const st = this.streak.get(id);
      const n = st && now - st.at < (cue.streak ?? 2) ? Math.min(st.n + 1, 7) : 0;
      this.streak.set(id, { n, at: now });
      climb = n * cue.climb;
    }
    const t0 = at ?? gridTime(cue.grid, clock);
    const sd = clock.stepDur;
    let tt = t0;
    if (cue.theme) {
      const th = cue.theme;
      for (const n of theme.slice(0, th.count)) {
        this.note(b, { voice: th.voice, or: th.or, deg: n.deg, key: true, oct: th.oct, len: n.len * 0.9, vel: th.vel }, tt, sd, 0);
        tt += n.len * sd;
      }
    }
    for (const n of cue.notes) this.note(b, n, tt + (n.at ?? 0) * sd, sd, climb);
    if (cue.feed) this.mood.feed(cue.feed.signal, cue.feed.value, cue.feed.secs);
    return true;
  }

  private voice(b: Beat, v: Voice, or: InstrumentId | undefined): InstrumentId | null {
    if (!v.startsWith('@')) return v as InstrumentId;
    const role = v.slice(1);
    const layers = b.sec.def.layers;
    const i = layers.findIndex((l, k) => l.role === role && b.plan.active[k] === true);
    const pick = layers[i]?.instrument ?? layers.find((l) => l.role === role)?.instrument;
    return pick ?? or ?? null;
  }

  private note(b: Beat, n: CueNote, t: number, sd: number, climb: number): void {
    const inst = this.voice(b, n.voice, n.or);
    if (!inst) return;
    const { sec, plan } = b;
    const kind = INSTRUMENTS[inst].kind;
    const dur = (n.len ?? 2) * sd;
    const vel = n.vel ?? 0.7;
    const oct = n.oct ?? 60;
    const root = n.key || n.semi !== undefined ? 0 : plan.chord.degree;
    const deg = root + (n.deg ?? 0);
    if (kind === 'tuned') {
      this.band.play(inst, this.out, t, midiOf(sec, deg, 38, 50), dur, vel, 1, n.bright);
      return;
    }
    if (kind !== 'tone') {
      this.band.play(inst, this.out, t, oct, dur, vel, 1, n.bright);
      return;
    }
    if (n.chord) {
      const chord = n.key ? { ...plan.chord, degree: 0 } : plan.chord;
      const v = voiceLead(chordPitchClasses(sec.key, sec.mode, chord), null, oct - 5, oct + 9, 3);
      for (const m of v) this.band.play(inst, this.out, t, m, dur, vel, 1, n.bright);
      return;
    }
    if (n.semi !== undefined) {
      const tonic = sec.key + Math.round((oct - 5 - sec.key) / 12) * 12;
      this.band.play(inst, this.out, t, tonic + n.semi, dur, vel, 1, n.bright);
      return;
    }
    // A combo climbs the scale from where the note sits, so it keeps rising instead of wrapping.
    const up = degreeToSemis(sec.mode, deg + climb) - degreeToSemis(sec.mode, deg);
    this.band.play(inst, this.out, t, midiOf(sec, deg, oct - 6, oct + 6) + up, dur, vel, 1, n.bright);
  }
}
