// The ambient bed: wind, rain, fire, water and cave air that follow your surroundings, plus one-shots from ambientSounds.ts.
import type { Entity, ReadonlyTiles, SimState } from '../types';
import { unpackKey, unpackSpot } from '../types';
import { TILES } from '../content/tiles';
import { CONTENT, isNight, rainAt } from '../content';
import type { AudioEngine } from './engine';
import { AMBIENT_SOUNDS } from './ambientSounds';
import type { AmbientNeed, AmbientPart, AmbientSound } from './ambientSounds';
import { rnd, speak } from './sfx';
import type { VoiceProfile } from './sfx';

interface Layer {
  filter: BiquadFilterNode;
  gain: GainNode;
}

/** A nearby creature that might call out (howl at night, bleat by day). */
interface Caller {
  x: number;
  y: number;
  voice: VoiceProfile;
}

type LayerId = 'wind' | 'gust' | 'rain' | 'fire' | 'water' | 'leaves' | 'draft';

/**
 * Surface sounds (wind, rain, leaves, birds) play only in a realm with open sky; the deep has its own
 * (cave air, drips, rumbles), so nothing from up top leaks underground and the other way round.
 */
export class Ambience {
  private layers: Record<LayerId, Layer>;
  private next = new Map<string, number>();
  private nextCrackle = 0;
  private nextCall = 12;
  private sampleTimer = 0;
  private around: Record<AmbientNeed, number> = { trees: 0, water: 0, fire: 0, wind: 0, dry: 1, bare: 1 };
  private callers: Caller[] = [];

  constructor(
    private e: AudioEngine,
    private at: (x: number, y: number, maxD: number) => AudioNode | null,
    private voiceOf: (ent: Entity) => VoiceProfile | null,
  ) {
    this.layers = {
      wind: e.layer('lowpass', 420, 0.6, e.amb),
      gust: e.layer('bandpass', 800, 1.1, e.amb),
      rain: e.layer('highpass', 1600, 0.4, e.amb),
      fire: e.layer('bandpass', 1100, 0.7, e.amb),
      water: e.layer('lowpass', 520, 0.5, e.amb),
      leaves: e.layer('bandpass', 3200, 0.8, e.amb),
      draft: e.layer('bandpass', 180, 1.4, e.amb),
    };
  }

  update(state: SimState, tiles: ReadonlyTiles, me: Entity, dt: number): void {
    const e = this.e;
    const L = this.layers;
    const w = state.weather;
    const now = e.now;
    const sky = CONTENT.realms[state.realm]?.sky !== false;
    this.sampleTimer -= dt;
    if (this.sampleTimer <= 0) {
      this.sampleTimer = 0.5;
      this.survey(state, tiles, me);
    }
    const s = this.around;
    const wind = sky ? Math.hypot(w.wind.x, w.wind.y) : 0;
    const altitude = sky ? Math.max(0, Math.min(1, me.z / 160)) : 0;
    const set = (l: Layer, v: number, f?: number): void => {
      l.gain.gain.setTargetAtTime(Math.min(0.3, Math.max(0, v)), now, 0.5);
      if (f) l.filter.frequency.setTargetAtTime(f, now, 0.6);
    };
    set(L.wind, sky ? 0.025 + wind * 0.008 + altitude * 0.06 : 0, 260 + wind * 50 + altitude * 300);
    const gusting = 0.5 + 0.5 * Math.sin(now * 0.7) * Math.sin(now * 0.23 + 1);
    set(L.gust, (wind > 3 ? (wind - 3) * 0.006 : 0) * gusting + altitude * 0.03 * gusting, 500 + gusting * 900);
    // Rain falls only under storm cells, and only up top; under a roof the storm is muffled to a patter.
    const rain = sky ? rainAt(CONTENT.sky, w, me.pos.x, me.pos.y) * (state.volume.openSky(me.pos.x, me.pos.y, me.z + 1) ? 1 : 0.35) : 0;
    set(L.rain, rain * 0.16, 1400 + rain * 1200);
    set(L.fire, s.fire * 0.16, 900 + s.fire * 600);
    set(L.water, s.water * 0.1);
    set(L.leaves, sky ? s.trees * (0.01 + wind * 0.004) : 0);
    // The deep breathes: a slow, hollow draft through the halls.
    const breath = 0.5 + 0.5 * Math.sin(now * 0.13) * Math.sin(now * 0.051 + 2);
    set(L.draft, sky ? 0 : 0.02 + breath * 0.03, 140 + breath * 120);

    if (s.fire > 0.05 && now > this.nextCrackle) {
      this.nextCrackle = now + rnd(0.06, 0.2) / Math.max(0.2, s.fire);
      e.burst(e.amb, now, 0.02, 0.08 * Math.min(s.fire, CONTENT.rules.fire.audio.crackle), 'highpass', rnd(2000, 5000), { q: 1 });
    }
    s.wind = Math.min(1, wind / 8);
    s.dry = 1 - Math.min(1, rain * 2 + (sky ? w.rain * 0.5 : 0));
    const day = !isNight(CONTENT.rules.day, w.time);
    for (const [id, snd] of Object.entries(AMBIENT_SOUNDS)) this.maybe(id, snd, sky, day, now);
    // Creatures out there call now and then in their own voices: hunters by night, shy things by day.
    if (now > this.nextCall) {
      const awake = this.callers.filter((c) => (c.voice.calls === 'night' ? !day : c.voice.calls === 'day' ? day : false));
      const c = awake[Math.floor(Math.random() * awake.length)];
      this.nextCall = now + (c ? rnd(14, 40) / Math.sqrt(awake.length) : rnd(5, 10));
      const out = c ? this.at(c.x, c.y, 110) : null;
      if (c && out) speak(e, out, now, c.voice, 'call', c.voice.gesture === 'howl' ? 2.2 : 1.4);
    }
  }

  /** Plays a one-shot when it belongs here and now, and its time has come. */
  private maybe(id: string, snd: AmbientSound, sky: boolean, day: boolean, now: number): void {
    if ((snd.where === 'sky') !== sky || (snd.time === 'day' && !day) || (snd.time === 'night' && day)) return;
    let strength = 1.5;
    for (const [k, need] of Object.entries(snd.needs ?? {}) as [AmbientNeed, number][]) {
      const have = this.around[k];
      if (have < need) return;
      strength = Math.min(strength, have / Math.max(0.05, need));
    }
    const due = this.next.get(id);
    if (due === undefined) {
      this.next.set(id, now + rnd(snd.every[0], snd.every[1]) * Math.random());
      return;
    }
    if (now < due) return;
    this.next.set(id, now + rnd(snd.every[0], snd.every[1]) / Math.max(0.5, Math.min(1.5, strength)));
    const out = this.e.spatial(rnd(-1, 1), rnd(snd.far[0], snd.far[1]));
    if (out) for (const p of snd.parts) this.part(out, p, now + (p.at ?? 0));
  }

  private part(out: AudioNode, p: AmbientPart, t0: number): void {
    const e = this.e;
    const n = p.count ? Math.round(rnd(p.count[0], p.count[1])) : 1;
    let f = rnd(p.freq[0], p.freq[1]);
    let t = t0;
    for (let i = 0; i < n; i++) {
      if (p.wave) {
        e.tone(out, p.wave, f, t, p.dur, p.level, {
          from: p.from ? f * p.from : undefined,
          glide: p.glide,
          to: p.to ? f * p.to : undefined,
          vibrato: p.vibrato,
          vibratoRate: p.vibratoRate,
          tremolo: p.tremolo,
          tremoloRate: p.tremoloRate,
          band: p.band ? { freq: p.band, q: p.q ?? 2 } : undefined,
          attack: p.attack,
          hold: p.hold,
        });
      } else if (p.noise) {
        e.burst(out, t, p.dur, p.level, p.noise, f, { q: p.q, to: p.to ? f * p.to : undefined, attack: p.attack, hold: p.hold });
      }
      f *= p.drift ?? 1;
      t += (p.gap ?? 0) * rnd(0.85, 1.15);
    }
  }

  private survey(state: SimState, tiles: ReadonlyTiles, me: Entity): void {
    let fire = 0;
    for (const k of state.burning) {
      const { x, y } = unpackKey(k);
      const d = Math.hypot(x - me.pos.x, y - me.pos.y);
      if (d < 25) fire += 1 / (1 + d * 0.4);
    }
    for (const k of state.volume.burningCells) {
      const c = unpackSpot(k);
      const d = Math.hypot(c.x - me.pos.x, c.y - me.pos.y);
      if (d < 25) fire += 1 / (1 + d * 0.4);
    }
    let water = 0;
    let trees = 0;
    for (let a = 0; a < 12; a++) {
      for (const r of [4, 10, 18]) {
        const x = me.pos.x + Math.cos(a * 0.52) * r;
        const y = me.pos.y + Math.sin(a * 0.52) * r;
        if (tiles.ground(x, y) < tiles.waterLevel(x, y)) water += 1 / r;
        trees += TILES[tiles.kind(x, y)].leafy ?? 0;
      }
    }
    const callers: Caller[] = [];
    for (const o of state.entities.values()) {
      if (o.dead || !o.ai || o.id === me.id) continue;
      const d = Math.hypot(o.pos.x - me.pos.x, o.pos.y - me.pos.y);
      // Calls come from creatures at a distance; ones in your face growl and cry instead.
      if (d < 12 || d > 100 || o.ai.mode === 'chase' || o.ai.mode === 'flee') continue;
      const v = this.voiceOf(o);
      if (v && v.calls !== 'never') callers.push({ x: o.pos.x, y: o.pos.y, voice: v });
    }
    this.callers = callers;
    const t = Math.min(1, trees / 12);
    this.around = { ...this.around, fire: Math.min(1, fire * 0.3), water: Math.min(1, water), trees: t, bare: 1 - t };
  }
}
