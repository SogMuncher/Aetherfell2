// Plays cues on the music's grid, in key and band: one reaction at a time, varied each time, taking its roles' place.
import type { Meter } from './styles';
import type { Channel } from './mixer';
import type { MoodTracker } from './signals';
import { INSTRUMENTS } from './instruments';
import type { InstrumentId } from './instruments';
import type { Band, Beat } from './band';
import { midiOf } from './band';
import { CUE_TABLE, REACTION_KIT } from './cues';
import type { CueDef, CueNote, GridUnit, Voice } from './cues';
import type { LayerRole } from './styleTypes';
import { chordPitchClasses, degreeToSemis, voiceLead } from './theory';
import type { MusicRng } from './theory';
import { CHAOS, VARIETY } from './chaos';

/** How this one playing of a cue differs from the written one. */
interface Variant {
  shift: number;
  oct: number;
  stretch: number;
  swap: InstrumentId | null;
  vel: number;
}
const PLAIN: Variant = { shift: 0, oct: 0, stretch: 1, swap: null, vel: 1 };
const BELLS = REACTION_KIT.filter((v) => !v.startsWith('@')) as InstrumentId[];

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
  private streak = new Map<string, { n: number; at: number; v: Variant }>();
  /** Until when the last reaction is still sounding (the next one waits its turn on the grid). */
  private busyUntil = 0;
  /** Band roles a reaction is playing in, and until when (the band's own part steps aside). */
  private claims = new Map<LayerRole, { from: number; to: number }>();

  constructor(
    private band: Band,
    private out: Channel,
    private mood: MoodTracker,
    private rng: MusicRng,
  ) {}

  /** True while a reaction is playing this role's part at time `t`. */
  quiet(role: LayerRole, t: number): boolean {
    const c = this.claims.get(role);
    return c !== undefined && t >= c.from - 1e-3 && t < c.to;
  }

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
    // Spaced-out repeats each get a fresh variant; a combo keeps its variant and climbs from it.
    const st = this.streak.get(id);
    const going = cue.climb !== undefined && st !== undefined && now - st.at < (cue.streak ?? 2);
    const n = going ? Math.min(st.n + 1, 7) : 0;
    const v = going ? st.v : this.vary(cue);
    if (cue.climb) this.streak.set(id, { n, at: now, v });
    const climb = n * (cue.climb ?? 0);
    if (at === undefined && !this.rng.chance(CHAOS.reaction)) return false;
    const sd = clock.stepDur;
    const t0 = at ?? gridTime(cue.grid, { ...clock, now: Math.max(now, this.busyUntil - 0.03) });
    if (t0 - now > sd * clock.meter.steps * CHAOS.reactionWait + 0.05) return false;
    let tt = t0;
    if (cue.theme) {
      const th = cue.theme;
      for (const m of theme.slice(0, th.count)) {
        this.note(b, { voice: th.voice, or: th.or, deg: m.deg, key: true, oct: th.oct, len: m.len * 0.9, vel: th.vel }, tt, sd, 0, PLAIN);
        tt += m.len * sd;
      }
    }
    let end = tt;
    for (const m of cue.notes) {
      const t = tt + (m.at ?? 0) * v.stretch * sd;
      const stop = t + (m.len ?? 2) * sd;
      end = Math.max(end, Math.min(stop, t + 4 * sd));
      if (!cue.stinger && m.voice.startsWith('@')) this.claim(m.voice.slice(1) as LayerRole, t, stop);
      this.note(b, m, t, sd, climb, v);
    }
    this.busyUntil = Math.max(this.busyUntil, end);
    if (cue.feed) this.mood.feed(cue.feed.signal, cue.feed.value, cue.feed.secs);
    return true;
  }

  private vary(cue: CueDef): Variant {
    if (cue.stinger) return PLAIN;
    const r = this.rng;
    return {
      shift: r.pick(VARIETY.shifts),
      oct: r.chance(VARIETY.octave) ? r.pick([-12, 12]) : 0,
      stretch: r.chance(VARIETY.rhythm) ? r.pick(VARIETY.stretch) : 1,
      swap: r.chance(VARIETY.swap) ? r.pick(BELLS) : null,
      vel: 1 + r.range(-VARIETY.vel, VARIETY.vel),
    };
  }

  private claim(role: LayerRole, from: number, to: number): void {
    const c = this.claims.get(role);
    this.claims.set(role, c && c.to > from ? { from: Math.min(c.from, from), to: Math.max(c.to, to) } : { from, to });
  }

  private voice(b: Beat, v: Voice, or: InstrumentId | undefined): InstrumentId | null {
    if (!v.startsWith('@')) return v as InstrumentId;
    const role = v.slice(1);
    const layers = b.sec.def.layers;
    const i = layers.findIndex((l, k) => l.role === role && b.plan.active[k] === true);
    const pick = layers[i]?.instrument ?? layers.find((l) => l.role === role)?.instrument;
    return pick ?? or ?? null;
  }

  private note(b: Beat, n: CueNote, t: number, sd: number, climb: number, va: Variant): void {
    const fixed = !n.voice.startsWith('@');
    const inst = fixed && va.swap ? va.swap : this.voice(b, n.voice, n.or);
    if (!inst) return;
    const { sec, plan } = b;
    const kind = INSTRUMENTS[inst].kind;
    const dur = (n.len ?? 2) * sd;
    const vel = (n.vel ?? 0.7) * va.vel;
    const oct = Math.max(36, Math.min(90, (n.oct ?? 60) + va.oct));
    const root = n.key || n.semi !== undefined ? 0 : plan.chord.degree;
    const deg = root + (n.deg ?? 0) + va.shift;
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
