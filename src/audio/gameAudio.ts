import type { Entity, ReadonlyTiles, SimEvent, SimState, WeaponStats } from '../types';
import { CONTENT, thingDef, weaponStats } from '../content';
import { AudioEngine } from './engine';
import { Ambience } from './ambience';
import { MusicEngine, STYLE_IDS } from './music';
import type { MusicStatus, StyleId } from './music';
import { Recent, cry, fatigue, individual, personVoice, rnd, speak, speciesVoice } from './sfx';
import type { PersonVoice } from './sfx';
import type { Utterance, VoiceProfile } from './sfx';
import { bodySounds } from './bodySounds';
import { worldSounds } from './worldSounds';
import { CraftSounds } from './craftSounds';

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/**
 * Sound for the whole game. Reacts to sim events (steps, swings, spells, doors, fire) with sounds
 * placed in stereo by where they happened, keeps an ambient bed that follows the surroundings
 * (wind, rain, fire, water, leaves, birds by day, crickets by night), and hands the score to the
 * procedural music engine in ./music, which reads the mood of the moment and composes as you play.
 *
 * Sound effects are built from the data of whatever makes them (./sfx): creature voices from the
 * creature's body, material and behaviour; spells from their runes' effects; strikes, breaks and
 * footsteps from materials. Every play is performed fresh, so nothing sounds the same twice.
 */
export class GameAudio {
  e: AudioEngine | null = null;
  private ambience: Ambience | null = null;
  listener = { x: 0, y: 0, angle: 0, z: 0 };
  music: MusicEngine | null = null;
  private musicSeed = -1;
  tiles: ReadonlyTiles | null = null;
  keyRoot = 0;
  recent = new Recent();
  foot = new Map<number, 0 | 1>();
  private sampleTimer = 0;
  private crafts = new CraftSounds();
  volume = 0.7;
  musicVolume = 0.8;
  /** 0..1 levels from the settings menu (applied on start and whenever they change). */
  private mix = { effects: 1, ambience: 1 };
  private mood: StyleId | null = null;
  /** 1 normally, 0 while faded out in the background. */
  private presence = 1;

  /** Must be called from a user gesture (browser autoplay rules). */
  start(): void {
    if (this.e) {
      void this.e.ctx.resume();
      return;
    }
    try {
      this.e = new AudioEngine();
    } catch {
      return;
    }
    const e = this.e;
    e.master.gain.value = this.volume * 0.8 * this.presence;
    e.sfx.gain.value = this.mix.effects;
    e.amb.gain.value = 0.9 * this.mix.ambience;
    this.ambience = new Ambience(e, (x, y, d) => this.at(x, y, d), (o) => this.voiceOf(o));
    try {
      const musicOut = e.ctx.createGain();
      musicOut.gain.value = 0.75;
      musicOut.connect(e.master);
      this.music = new MusicEngine(e.ctx, musicOut);
      this.music.setVolume(this.musicVolume);
      this.music.force(this.mood);
      this.exposeConsole();
    } catch (err) {
      console.warn('[music] could not start; sound effects carry on without it.', err);
      this.music = null;
    }
  }

  /** Settings menu: every level 0..1. Safe to call before start(). */
  setMix(m: { master: number; music: number; effects: number; ambience: number }): void {
    const c = (v: number): number => Math.max(0, Math.min(1, v));
    this.volume = c(m.master);
    this.musicVolume = c(m.music);
    this.mix = { effects: c(m.effects), ambience: c(m.ambience) };
    this.music?.setVolume(this.musicVolume);
    this.applyLevels();
  }

  /** Settings menu: hold the music on one mood, or null to follow the game. */
  setMusicMood(style: string | null): void {
    this.mood = STYLE_IDS.find((s) => s === style) ?? null;
    this.music?.force(this.mood);
  }

  /** Fades everything out (false) or back in (true), e.g. when the window loses focus. */
  setPresent(present: boolean): void {
    this.presence = present ? 1 : 0;
    this.applyLevels();
  }

  private applyLevels(): void {
    const e = this.e;
    if (!e) return;
    const t = e.now;
    e.master.gain.setTargetAtTime(this.volume * 0.8 * this.presence, t, 0.15);
    e.sfx.gain.setTargetAtTime(this.mix.effects, t, 0.05);
    e.amb.gain.setTargetAtTime(0.9 * this.mix.ambience, t, 0.05);
  }

  /** Console helpers: `aetherfellMusic.status()`, `.play('battle')`, `.follow()`, `.feed('depth', 1, 30)`, `.cue('parry')`, `.volume(0.5)`. */
  private exposeConsole(): void {
    const m = this.music;
    if (!m || typeof window === 'undefined') return;
    const api = {
      status: (): MusicStatus => m.status(),
      styles: (): readonly StyleId[] => STYLE_IDS,
      play: (style: string): string => {
        const id = STYLE_IDS.find((s) => s === style);
        m.force(id ?? null);
        return id ? `playing ${id}` : `unknown style; try one of: ${STYLE_IDS.join(', ')}`;
      },
      follow: (): string => {
        m.force(null);
        return 'following the game';
      },
      feed: (name: string, value: number, seconds = 10): void => m.mood.feed(name, value, seconds),
      cue: (id: string): boolean => m.cue(id),
      mood: (): Record<string, number> => ({ ...m.mood.current }),
      volume: (v: number): void => {
        this.musicVolume = v;
        m.setVolume(v);
      },
    };
    (window as unknown as { aetherfellMusic: typeof api }).aetherfellMusic = api;
  }

  where(x: number, y: number): { pan: number; d: number } {
    const dx = x - this.listener.x;
    const dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - this.listener.angle;
    return { pan: Math.sin(a) * Math.min(1, d / 2), d };
  }

  private fireSec = 0;
  private fireCount = 0;
  /** Fire one-shots (catching, dousing) share a few voices per second, whatever the size of the blaze. */
  fireShot(t: number): boolean {
    const sec = Math.floor(t);
    if (sec !== this.fireSec) {
      this.fireSec = sec;
      this.fireCount = 0;
    }
    return ++this.fireCount <= CONTENT.rules.fire.audio.oneShots;
  }

  at(x: number, y: number, maxD = 70): AudioNode | null {
    const e = this.e;
    if (!e) return null;
    const w = this.where(x, y);
    if (w.d > maxD) return null;
    return e.spatial(w.pan, w.d);
  }

  /** This entity's own voice, or null if it has none. */
  voiceOf(ent: Entity | undefined): VoiceProfile | null {
    if (!ent) return null;
    const v = speciesVoice(CONTENT, ent.def, thingDef(CONTENT, ent.def));
    return v ? individual(v, ent.id) : null;
  }

  /** A person's speaking voice (things with `speech`), or null. */
  personOf(ent: Entity | undefined): PersonVoice | null {
    const sp = ent ? thingDef(CONTENT, ent.def).speech : undefined;
    return ent && sp ? personVoice(sp.voice, ent.id) : null;
  }

  /** A cry or call in the entity's own voice: a person's speaking voice, else its creature voice. */
  say(ent: Entity | undefined, what: Utterance, level: number, maxD = 60): void {
    const e = this.e;
    const pv = this.personOf(ent);
    const v = pv ? null : this.voiceOf(ent);
    if (!e || !ent || (!pv && !v)) return;
    const out = this.at(ent.pos.x, ent.pos.y, maxD);
    if (!out) return;
    const n = this.recent.hit(`${what}:${ent.def}`, e.now, 0.8);
    const heat = this.music?.mood.current.combat ?? 0;
    const t = e.now + rnd(0, 0.04);
    if (pv) cry(e, out, t, pv, what === 'attack' ? 'effort' : what, level * fatigue(n), heat);
    else if (v) speak(e, out, t, v, what, level * fatigue(n), heat);
  }

  /** The weapon an entity strikes with: what it wields, or its natural one. */
  weaponOf(ent: Entity | undefined): WeaponStats | null {
    if (!ent) return null;
    return weaponStats(CONTENT, thingDef(CONTENT, ent.def), ent.actor?.weapon ?? null);
  }

  soundOf(ent: Entity | undefined): string {
    if (!ent) return 'soft';
    return CONTENT.materials[thingDef(CONTENT, ent.def).material]?.sound ?? 'soft';
  }

  onEvent(ev: SimEvent, state: SimState, localId: number | null): void {
    const e = this.e;
    if (!e) return;
    try {
      this.music?.onEvent(ev, localId);
    } catch {
      // Music must never break sound effects.
    }
    if (!bodySounds(this, ev, state, localId)) worldSounds(this, ev, state, localId);
    this.crafts.onEvent(this, ev);
  }

  /** Called every frame: steer the ambient bed and schedule birds, crickets, howls and music. */
  update(state: SimState, tiles: ReadonlyTiles, me: Entity | null, dt: number): void {
    const e = this.e;
    const amb = this.ambience;
    if (!e || !amb) return;
    this.tiles = tiles;
    if (this.music) {
      try {
        if (state.seed !== this.musicSeed) {
          this.musicSeed = state.seed;
          this.music.setWorldSeed(state.seed);
        }
        this.music.update(e.now, dt, me ? { state, tiles, me } : null);
      } catch (err) {
        console.warn('[music] stopped after an error; sound effects carry on.', err);
        this.music = null;
      }
    }
    if (!me) return;
    this.listener = { x: me.pos.x, y: me.pos.y, angle: me.angle, z: me.z };
    this.sampleTimer -= dt;
    if (this.sampleTimer <= 0) {
      this.sampleTimer = 0.5;
      // Chimes and rune figures follow the key the score is in.
      const key = this.music ? NOTE_NAMES.indexOf(this.music.status().key) : -1;
      if (key >= 0) this.keyRoot = key;
    }
    amb.update(state, tiles, me, dt);
    this.crafts.update(this, state, me, dt);
  }
}
