// Plays cues on the music's grid, in key and band: one reaction at a time, varied, rising with tension, in its roles' place.
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
import { chordPitchClasses, voiceLead } from './theory';
import type { MusicRng } from './theory';
import { CHAOS, TENSION, VARIETY } from './chaos';

/** How this one playing of a cue differs from the written one. */
interface Variant {
  shift: number;
  oct: number;
  stretch: number;
  swap: InstrumentId | null;
  vel: number;
  /** The style lead `@lead` plays this time. */
  lead: InstrumentId | null;
}
const PLAIN: Variant = { shift: 0, oct: 0, stretch: 1, swap: null, vel: 1, lead: null };
const BELLS = REACTION_KIT.filter((v) => !v.startsWith('@')) as InstrumentId[];

/** One note of a reaction, gathered first so the whole answer can be lifted above the last one before it sounds. */
interface Hit {
  inst: InstrumentId;
  t: number;
  midi: number;
  dur: number;
  vel: number;
  bright: number | undefined;
  /** Pitched notes move with the tension; drums and swooshes stay put. */
  pitched: boolean;
}

/** `midi` moved `k` steps up the section's scale (off-scale notes land on the scale on the way). */
function scaleUp(key: number, mode: readonly number[], midi: number, k: number): number {
  const pcs = mode.map((s) => (key + s) % 12);
  let m = midi;
  for (let n = 0; n < k; ) if (pcs.includes(((++m % 12) + 12) % 12)) n++;
  return m;
}
const meanOf = (hs: readonly Hit[], f: (h: Hit) => number): number => hs.reduce((a, h) => a + f(h), 0) / hs.length;

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
  /** Tension from recent reactions (any of them), and when it was last set; it fades smoothly from there. */
  private tension = { v: 0, at: 0 };
  /** The tension the last reaction rose from, and its average pitch: a rising answer must sound above it. */
  private lastLevel = 0;
  private lastPitch = -Infinity;
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
    if (at === undefined && !this.rng.chance(CHAOS.reaction)) return false;
    // Any reactions close together raise the tension, and the answer climbs with it; stingers stand apart.
    const tense = cue.stinger ? 0 : this.tensionAt(now);
    const climb = Math.round(tense);
    const v = this.vary(cue, b, climb > 0);
    const hits: Hit[] = [];
    if (!cue.stinger) this.tension = { v: Math.min(TENSION.max, tense + TENSION.add), at: now };
    const notes = cue.forms?.length && !cue.stinger ? this.rng.pick([cue.notes, ...cue.forms]) : cue.notes;
    const sd = clock.stepDur;
    const t0 = at ?? gridTime(cue.grid, { ...clock, now: Math.max(now, this.busyUntil - 0.03) });
    if (t0 - now > sd * clock.meter.steps * CHAOS.reactionWait + 0.05) return false;
    let tt = t0;
    if (cue.theme) {
      const th = cue.theme;
      for (const m of theme.slice(0, th.count)) {
        this.note(hits, b, { voice: th.voice, or: th.or, deg: m.deg, key: true, oct: th.oct, len: m.len * 0.9, vel: th.vel }, tt, sd, PLAIN);
        tt += m.len * sd;
      }
    }
    let end = tt;
    for (const m of notes) {
      const t = tt + (m.at ?? 0) * v.stretch * sd;
      const stop = t + (m.len ?? 2) * sd;
      end = Math.max(end, Math.min(stop, t + 4 * sd));
      if (!cue.stinger && m.voice.startsWith('@')) this.claim(m.voice === '@lead' ? 'melody' : (m.voice.slice(1) as LayerRole), t, stop);
      this.note(hits, b, m, t, sd, v);
    }
    if (!cue.stinger) this.lift(hits, b, climb, tense);
    for (const h of hits) this.band.play(h.inst, this.out, h.t, h.midi, h.dur, h.vel, 1, h.bright);
    this.busyUntil = Math.max(this.busyUntil, end);
    if (cue.feed) this.mood.feed(cue.feed.signal, cue.feed.value, cue.feed.secs);
    return true;
  }

  /** Tension right now: from wherever it was last set, it falls in a straight line to nothing over `fade` seconds. */
  tensionAt(now: number): number {
    return this.tension.v * Math.max(0, 1 - Math.max(0, now - this.tension.at) / TENSION.fade);
  }

  /**
   * Climbs the whole answer `climb` scale steps. While the tension is rising, the answer is lifted further until it
   * sits above the last one on average, so no form, chord or voice can make a rising reaction sound lower.
   */
  private lift(hits: Hit[], b: Beat, climb: number, level: number): void {
    const tones = hits.filter((h) => h.pitched);
    if (tones.length === 0) return;
    const { key, mode } = b.sec;
    const at = (k: number): number => meanOf(tones, (h) => scaleUp(key, mode, h.midi, k));
    let k = climb;
    const rising = level > 0.5 && level > this.lastLevel + TENSION.rise;
    this.lastLevel = level;
    if (rising) while (at(k) <= this.lastPitch && at(k + 1) <= TENSION.top) k++;
    for (const h of tones) h.midi = scaleUp(key, mode, h.midi, k);
    this.lastPitch = at(0);
  }

  private vary(cue: CueDef, b: Beat, rising: boolean): Variant {
    if (cue.stinger) return PLAIN;
    const r = this.rng;
    const leads = b.sec.def.leads;
    return {
      // While tension is up it owns the pitch, so the climb is heard; calm answers wander freely.
      shift: rising ? 0 : r.pick(VARIETY.shifts),
      lead: leads?.length ? r.pick(leads) : null,
      oct: !rising && r.chance(VARIETY.octave) ? r.pick([-12, 12]) : 0,
      stretch: r.chance(VARIETY.rhythm) ? r.pick(VARIETY.stretch) : 1,
      swap: r.chance(VARIETY.swap) ? r.pick(BELLS) : null,
      vel: 1 + r.range(-VARIETY.vel, VARIETY.vel),
    };
  }

  private claim(role: LayerRole, from: number, to: number): void {
    const c = this.claims.get(role);
    this.claims.set(role, c && c.to > from ? { from: Math.min(c.from, from), to: Math.max(c.to, to) } : { from, to });
  }

  private voice(b: Beat, v: Voice, or: InstrumentId | undefined, va: Variant): InstrumentId | null {
    if (!v.startsWith('@')) return v as InstrumentId;
    if (v === '@lead' && va.lead) return va.lead;
    const role = v === '@lead' ? 'melody' : v.slice(1);
    const layers = b.sec.def.layers;
    const i = layers.findIndex((l, k) => l.role === role && b.plan.active[k] === true);
    const pick = layers[i]?.instrument ?? layers.find((l) => l.role === role)?.instrument;
    return pick ?? or ?? null;
  }

  private note(hits: Hit[], b: Beat, n: CueNote, t: number, sd: number, va: Variant): void {
    const fixed = !n.voice.startsWith('@');
    const inst = fixed && va.swap ? va.swap : this.voice(b, n.voice, n.or, va);
    if (!inst) return;
    const { sec, plan } = b;
    const kind = INSTRUMENTS[inst].kind;
    const dur = (n.len ?? 2) * sd;
    const vel = (n.vel ?? 0.7) * va.vel;
    const oct = Math.max(36, Math.min(90, (n.oct ?? 60) + va.oct));
    const root = n.key || n.semi !== undefined ? 0 : plan.chord.degree;
    const deg = root + (n.deg ?? 0) + va.shift;
    const hit = (midi: number): void => void hits.push({ inst, t, midi, dur, vel, bright: n.bright, pitched: kind === 'tone' });
    if (kind === 'tuned') {
      hit(midiOf(sec, deg, 38, 50));
      return;
    }
    if (kind !== 'tone') {
      hit(oct);
      return;
    }
    if (n.chord) {
      const chord = n.key ? { ...plan.chord, degree: 0 } : plan.chord;
      const v = voiceLead(chordPitchClasses(sec.key, sec.mode, chord), null, oct - 5, oct + 9, 3);
      for (const m of v) hit(m);
      return;
    }
    if (n.semi !== undefined) {
      const tonic = sec.key + Math.round((oct - 5 - sec.key) / 12) * 12;
      hit(tonic + n.semi);
      return;
    }
    hit(midiOf(sec, deg, oct - 6, oct + 6));
  }
}
