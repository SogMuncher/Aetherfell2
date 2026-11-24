import type { DamageKind, Entity, ReadonlyTiles, SimEvent, SimState, WeaponStats } from '../types';
import { TILES } from '../content/tiles';
import { CONTENT, itemDef, thingDef, spellFor, weaponStats } from '../content';
import { AudioEngine } from './engine';
import { Ambience } from './ambience';
import { MusicEngine, STYLE_IDS } from './music';
import type { MusicStatus, StyleId } from './music';
import { Recent, burstSpell, castSpell, effectBurst, fatigue, individual, jit, murmur, rnd, runeMotif, speak, speciesVoice, statusOn, step, strike, swing } from './sfx';
import type { Utterance, VoiceProfile } from './sfx';

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
  private e: AudioEngine | null = null;
  private ambience: Ambience | null = null;
  private listener = { x: 0, y: 0, angle: 0, z: 0 };
  private music: MusicEngine | null = null;
  private musicSeed = -1;
  private tiles: ReadonlyTiles | null = null;
  private keyRoot = 0;
  private recent = new Recent();
  private foot = new Map<number, 0 | 1>();
  private sampleTimer = 0;
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

  private where(x: number, y: number): { pan: number; d: number } {
    const dx = x - this.listener.x;
    const dy = y - this.listener.y;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) - this.listener.angle;
    return { pan: Math.sin(a) * Math.min(1, d / 2), d };
  }

  private fireSec = 0;
  private fireCount = 0;
  /** Fire one-shots (catching, dousing) share a few voices per second, whatever the size of the blaze. */
  private fireShot(t: number): boolean {
    const sec = Math.floor(t);
    if (sec !== this.fireSec) {
      this.fireSec = sec;
      this.fireCount = 0;
    }
    return ++this.fireCount <= CONTENT.rules.fire.audio.oneShots;
  }

  private at(x: number, y: number, maxD = 70): AudioNode | null {
    const e = this.e;
    if (!e) return null;
    const w = this.where(x, y);
    if (w.d > maxD) return null;
    return e.spatial(w.pan, w.d);
  }

  /** This entity's own voice, or null if it has none. */
  private voiceOf(ent: Entity | undefined): VoiceProfile | null {
    if (!ent) return null;
    const v = speciesVoice(CONTENT, ent.def, thingDef(CONTENT, ent.def));
    return v ? individual(v, ent.id) : null;
  }

  private say(ent: Entity | undefined, what: Utterance, level: number, maxD = 60): void {
    const e = this.e;
    const v = this.voiceOf(ent);
    if (!e || !ent || !v) return;
    const out = this.at(ent.pos.x, ent.pos.y, maxD);
    if (!out) return;
    const n = this.recent.hit(`${what}:${ent.def}`, e.now, 0.8);
    const heat = this.music?.mood.current.combat ?? 0;
    speak(e, out, e.now + rnd(0, 0.04), v, what, level * fatigue(n), heat);
  }

  /** The weapon an entity strikes with: what it wields, or its natural one. */
  private weaponOf(ent: Entity | undefined): WeaponStats | null {
    if (!ent) return null;
    return weaponStats(CONTENT, thingDef(CONTENT, ent.def), ent.actor?.weapon ?? null);
  }

  private soundOf(ent: Entity | undefined): string {
    if (!ent) return 'soft';
    return CONTENT.materials[thingDef(CONTENT, ent.def).material]?.sound ?? 'soft';
  }

  onEvent(ev: SimEvent, state: SimState, localId: number | null): void {
    const e = this.e;
    if (!e) return;
    const t = e.now;
    try {
      this.music?.onEvent(ev, localId);
    } catch {
      // Music must never break sound effects.
    }
    switch (ev.type) {
      case 'footstep': {
        const out = this.at(ev.x, ev.y, 30);
        if (!out) break;
        const ent = state.entities.get(ev.entity);
        const mass = ent ? thingDef(CONTENT, ent.def).body.mass : 70;
        const foot: 0 | 1 = this.foot.get(ev.entity) === 1 ? 0 : 1;
        this.foot.set(ev.entity, foot);
        if (this.foot.size > 512) this.foot.clear();
        const wet = this.tiles ? Math.max(this.tiles.wet(ev.x, ev.y), state.weather.rain * 0.6) : state.weather.rain * 0.6;
        step(e, out, t, ev.surface, { level: ev.entity === localId ? 0.09 : 0.06, mass, wet, foot });
        break;
      }
      case 'swing': {
        const out = this.at(ev.x, ev.y, 30);
        if (!out) break;
        const ent = state.entities.get(ev.entity);
        const w = this.weaponOf(ent);
        const mine = ent?.player !== undefined;
        // A wound-up blow is a deeper, louder whoosh.
        swing(e, out, t, { reach: (w?.reach ?? 1.4) * (1 + ev.power * 0.5), speed: (w?.speed ?? 1) * (1 - ev.power * 0.35), level: (mine ? 0.14 : 0.08) * (1 + ev.power * 0.8) });
        break;
      }
      case 'charge': {
        const out = this.at(ev.x, ev.y, 25);
        if (!out) break;
        const ent = state.entities.get(ev.entity);
        const spell = ent?.ai?.cast ? spellFor(CONTENT, ent.ai.cast.spell) : null;
        if (spell && ent?.ai?.cast) {
          // A caster gathering a spell hums the spell's own notes, quietly.
          if (ev.stage === 'start') runeMotif(e, out, t, CONTENT, ent.ai.cast.spell.split('+'), this.keyRoot, 0.025);
        } else if (ev.stage === 'full') {
          // Fully wound: a bright creak of strain.
          e.tone(out, 'triangle', jit(520, 0.1), t, 0.1, 0.03, { from: 300, glide: 0.08, attack: 0.01 });
        } else if (ev.entity === localId) {
          e.burst(out, t, 0.12, 0.03, 'bandpass', jit(240, 0.15), { q: 2, to: 420, attack: 0.05 });
        }
        break;
      }
      case 'strike': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const m = CONTENT.materials[ev.material];
        const n = this.recent.hit(`strike:${Math.floor(ev.x)},${Math.floor(ev.y)}`, t, 0.3);
        const strength = Math.min(1, 0.35 + ev.power * 0.55) * fatigue(n);
        // The sound of the thing struck, by what it is made of; hard things add a ring on edges.
        strike(e, out, t, m?.sound ?? 'stone', { strength, mass: 120 + (m?.hardness ?? 0.3) * 400, weapon: ev.weapon });
        if ((m?.hardness ?? 0) >= CONTENT.rules.combat.surface.spark && ev.weapon !== 'blunt') strike(e, out, t + 0.01, 'metal', { strength: strength * 0.5, mass: 8, weapon: 'cut' });
        break;
      }
      case 'tileBroken': {
        const out = this.at(ev.x + 0.5, ev.y + 0.5);
        if (!out) break;
        const mat = CONTENT.materials[TILES[ev.tile]?.material ?? 'wood'];
        strike(e, out, t, mat?.sound ?? 'wood', { strength: 1, mass: 200, breaks: true });
        break;
      }
      case 'hit': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const target = state.entities.get(ev.target);
        const source = state.entities.get(ev.source);
        const tdef = target ? thingDef(CONTENT, target.def) : null;
        // Only melee blows carry a weapon sound; spells and falls already have their own.
        const near = source && target ? Math.hypot(source.pos.x - target.pos.x, source.pos.y - target.pos.y) < 4 : false;
        const kind: DamageKind | undefined = near ? this.weaponOf(source)?.kind : undefined;
        const n = this.recent.hit('hit', t, 0.4);
        const strength = Math.min(1, ev.damage / 20 + 0.2 + (ev.power ?? 0) * 0.25) * fatigue(n);
        if (ev.parried) {
          // Steel on steel: a bright ring, never quite the same twice.
          strike(e, out, t, 'metal', { strength: 0.9, mass: 20, weapon: 'cut' });
        } else if (ev.blocked) {
          strike(e, out, t, 'wood', { strength: 0.5, mass: 30, weapon: kind });
        } else {
          strike(e, out, t, this.soundOf(target), { strength, mass: tdef?.body.mass ?? 40, weapon: kind });
          // Living things cry out when hurt (not every time, or a fight turns into a choir).
          if (target && (target.actor || tdef?.brain) && Math.random() < (ev.target === localId ? 0.5 : 0.75)) {
            this.say(target, 'hurt', ev.target === localId ? 0.6 : 1);
          }
        }
        break;
      }
      case 'death': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const v = speciesVoice(CONTENT, ev.def, thingDef(CONTENT, ev.def));
        if (v) speak(e, out, t, individual(v, ev.entity), 'death', 1);
        if (v) e.burst(out, t + jit(0.05, 0.4), jit(0.3, 0.2), 0.12, 'lowpass', jit(220, 0.15));
        break;
      }
      case 'growl':
        this.say(state.entities.get(ev.entity), 'growl', 1, 40);
        break;
      case 'spellCast': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const spell = spellFor(CONTENT, ev.spell);
        if (spell) castSpell(e, out, t, CONTENT, spell, this.keyRoot);
        break;
      }
      case 'spellBurst': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const spell = spellFor(CONTENT, ev.spell);
        if (spell) burstSpell(e, out, t, CONTENT, spell);
        break;
      }
      case 'trapSprung': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        // The click of the plate, then whatever the trap does (its effects, like a spell's burst).
        const trap = state.entities.get(ev.entity);
        const def = trap ? thingDef(CONTENT, trap.def) : null;
        strike(e, out, t, this.soundOf(trap), { strength: 0.4, mass: 5, weapon: 'pierce' });
        if (def?.contact) effectBurst(e, out, t + jit(0.06, 0.3), CONTENT, def.contact.effects, def.contact.radius);
        else e.burst(out, t + 0.06, jit(1.1, 0.15), 0.4, 'lowpass', jit(600, 0.15), { to: 140, attack: 0.04 });
        break;
      }
      case 'froze': {
        const out = Math.random() < 0.15 ? this.at(ev.x + 0.5, ev.y + 0.5, 40) : null;
        if (out) e.burst(out, t + rnd(0, 0.3), 0.04, 0.08, 'highpass', rnd(3000, 5000), { q: 2 });
        break;
      }
      case 'thawed': {
        const out = Math.random() < 0.2 ? this.at(ev.x + 0.5, ev.y + 0.5, 30) : null;
        if (out) e.tone(out, 'sine', rnd(900, 1500), t, 0.08, 0.03, { to: rnd(500, 700) });
        break;
      }
      case 'shatter': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const ent = state.entities.get(ev.entity);
        strike(e, out, t, ent ? this.soundOf(ent) : 'glass', { strength: 1, mass: ent ? thingDef(CONTENT, ent.def).body.mass : 10, breaks: true });
        break;
      }
      case 'itemBroke': {
        const out = this.at(ev.x, ev.y);
        const it = itemDef(CONTENT, ev.item);
        if (out) strike(e, out, t, CONTENT.materials[it?.material ?? '']?.sound ?? 'glass', { strength: 1, mass: (it?.weight ?? 1) * 10, breaks: true });
        break;
      }
      case 'glide':
        if (ev.entity === localId && ev.open) {
          e.burst(e.sfx, t, jit(0.25, 0.15), 0.12, 'bandpass', jit(700, 0.12), { q: 1.5, to: jit(300, 0.15) });
          e.burst(e.sfx, t + jit(0.08, 0.3), jit(0.2, 0.15), 0.08, 'bandpass', jit(500, 0.12), { q: 1.5 });
        }
        break;
      case 'locked': {
        const out = this.at(ev.x, ev.y, 20);
        if (out) for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) e.burst(out, t + i * jit(0.07, 0.3), 0.04, jit(0.12, 0.2), 'bandpass', rnd(1800, 2400), { q: 4 });
        break;
      }
      case 'unlocked': {
        const out = this.at(ev.x, ev.y, 20);
        if (!out) break;
        e.burst(out, t, 0.05, 0.16, 'bandpass', jit(1500, 0.1), { q: 3 });
        const f = jit(440, 0.05);
        e.tone(out, 'triangle', f, t + jit(0.12, 0.2), 0.3, 0.05, { to: f * 1.5 });
        break;
      }
      case 'equip':
        if (ev.entity === localId) e.burst(e.sfx, t, jit(0.35, 0.15), 0.08, 'bandpass', jit(3000, 0.1), { q: 2, to: jit(5000, 0.1) });
        break;
      case 'armour': {
        // Buckles and plate: a hard piece clinks, cloth and hide rustle; a piece that breaks clatters.
        const ent = state.entities.get(ev.entity);
        const out = ent ? this.at(ent.pos.x, ent.pos.y, 20) : null;
        if (!out) break;
        const hard = ((ev.item ? itemDef(CONTENT, ev.item)?.look?.plate : undefined) ?? (ev.broke ? 1 : 0)) > 0.5;
        if (ev.broke) strike(e, out, t, 'metal', { strength: 0.5, mass: 2 });
        else strike(e, out, t, hard ? 'metal' : 'soft', { strength: ev.entity === localId ? 0.3 : 0.15, mass: hard ? 1 : 0.3 });
        break;
      }
      case 'statusOn': {
        const def = CONTENT.statuses[ev.status];
        if (!def) break;
        if (ev.entity === localId) statusOn(e, e.sfx, t, CONTENT, def, 1);
        else {
          const ent = state.entities.get(ev.entity);
          const out = ent ? this.at(ent.pos.x, ent.pos.y, 20) : null;
          if (out) statusOn(e, out, t, CONTENT, def, 0.5);
        }
        break;
      }
      case 'fizzle':
        if (ev.entity === localId) {
          const f = jit(180, 0.08);
          e.tone(e.sfx, 'square', f, t, jit(0.18, 0.15), 0.04, { to: f * 0.5 });
          e.burst(e.sfx, t, 0.12, 0.03, 'bandpass', jit(900, 0.2), { q: 2, to: 300 });
        }
        break;
      case 'spellPrepared':
        // The runes settle into place, each singing its own note: every spell has its own little tune.
        if (ev.entity === localId) runeMotif(e, e.sfx, t, CONTENT, spellFor(CONTENT, ev.spell)?.runes ?? [], this.keyRoot, 0.035);
        break;
      case 'runeLearned':
        // The music engine plays an in-key shimmer for this.
        break;
      case 'doorToggled': {
        const out = this.at(ev.x + 0.5, ev.y + 0.5);
        if (!out) break;
        // A creak of the hinge (pitch and length differ every time), then the door meeting its frame.
        const cls = this.tiles ? CONTENT.materials[this.tiles.info(ev.x, ev.y).material]?.sound ?? 'wood' : 'wood';
        const f = jit(ev.open ? 210 : 260, 0.12);
        const dur = jit(0.5, 0.2);
        e.tone(out, 'sawtooth', f, t, dur, 0.04, { to: f * (ev.open ? rnd(1.25, 1.5) : rnd(0.6, 0.75)), vibrato: rnd(0.03, 0.07), vibratoRate: rnd(10, 18), band: { freq: jit(900, 0.2), q: 2 } });
        strike(e, out, t + dur * 0.85, cls, { strength: ev.open ? 0.3 : 0.6, mass: 40 });
        break;
      }
      case 'doorJammed': {
        const out = this.at(ev.x + 0.5, ev.y + 0.5);
        if (out) strike(e, out, t, this.tiles ? CONTENT.materials[this.tiles.info(ev.x, ev.y).material]?.sound ?? 'wood' : 'wood', { strength: 0.8, mass: 60, weapon: 'blunt' });
        break;
      }
      case 'thrown': {
        const out = this.at(ev.x, ev.y, 30);
        const ent = state.entities.get(ev.entity);
        const mass = ent ? thingDef(CONTENT, ent.def).body.mass : 5;
        // Heavier things leave the hands with a deeper, slower whoosh.
        if (out) swing(e, out, t, { reach: 2, speed: Math.min(1.5, Math.max(0.5, Math.pow(10 / Math.max(0.5, mass), 0.25))), level: 0.1 });
        break;
      }
      case 'impact': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const ent = state.entities.get(ev.entity);
        const n = this.recent.hit(`impact:${ev.entity}`, t, 0.5);
        strike(e, out, t, this.soundOf(ent), { strength: ev.strength * fatigue(n), mass: ent ? thingDef(CONTENT, ent.def).body.mass : 30 });
        break;
      }
      case 'propBroken': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const def = thingDef(CONTENT, ev.def);
        strike(e, out, t, CONTENT.materials[def.material]?.sound ?? 'wood', { strength: 1, mass: def.body.mass, breaks: true });
        break;
      }
      case 'ignited': {
        const out = this.fireShot(t) ? this.at(ev.x + 0.5, ev.y + 0.5, 40) : null;
        if (out && Math.random() < 0.3) e.burst(out, t, jit(0.6, 0.25), jit(0.12, 0.2), 'lowpass', jit(300, 0.2), { to: jit(1200, 0.2), attack: 0.05 });
        break;
      }
      case 'doused': {
        const out = this.fireShot(t) ? this.at(ev.x + 0.5, ev.y + 0.5, 30) : null;
        if (out && Math.random() < 0.4) e.burst(out, t, jit(0.8, 0.25), jit(0.1, 0.2), 'highpass', jit(3000, 0.15), { to: jit(1800, 0.15), attack: 0.02 });
        break;
      }
      case 'splash': {
        const out = this.at(ev.x, ev.y, 40);
        if (!out) break;
        e.burst(out, t, jit(0.3 + ev.size * 0.4, 0.15), 0.14 + ev.size * 0.15, 'bandpass', jit(900, 0.12) / (0.8 + ev.size * 0.4), { q: 0.8, to: jit(250, 0.15) });
        for (let i = 2 + Math.floor(Math.random() * (3 + ev.size * 4)); i > 0; i--) e.tone(out, 'sine', rnd(600, 1400), t + rnd(0.05, 0.3 + ev.size * 0.2), 0.06, 0.03, { to: rnd(1600, 2400) });
        break;
      }
      case 'jump':
        if (ev.entity === localId) e.burst(e.sfx, t, jit(0.08, 0.2), 0.04, 'lowpass', jit(400, 0.15));
        break;
      case 'land': {
        if (ev.entity !== localId) break;
        // Landing sounds like the ground you land on, harder the faster you fall.
        const me = state.entities.get(ev.entity);
        const cls = me && this.tiles ? CONTENT.materials[this.tiles.info(me.pos.x, me.pos.y).material]?.sound ?? 'soft' : 'soft';
        e.burst(e.sfx, t, jit(0.15, 0.15), Math.min(0.25, ev.speed * 0.015), 'lowpass', jit(260, 0.12));
        step(e, e.sfx, t, cls, { level: Math.min(0.18, ev.speed * 0.012), mass: 70, wet: 0, foot: 0 });
        break;
      }
      case 'pickup':
        if (ev.player === localId) {
          const item = itemDef(CONTENT, ev.item);
          if (item?.category === 'currency') {
            // Coins: a little clink per coin, up to a handful.
            for (let i = Math.min(6, Math.max(2, ev.count)); i > 0; i--) strike(e, e.sfx, t + rnd(0, 0.12), 'metal', { strength: rnd(0.15, 0.3), mass: 0.3 });
          } else {
            // Light things chime higher than heavy ones; the interval wanders a little.
            const f = jit(988, 0.04) * Math.min(1.3, Math.max(0.7, Math.pow(1 / Math.max(0.05, item?.weight ?? 1), 0.1)));
            e.tone(e.sfx, 'triangle', f, t, 0.25, 0.06);
            e.tone(e.sfx, 'triangle', f * (Math.random() < 0.7 ? 1.335 : 1.5), t + jit(0.07, 0.2), 0.35, 0.05);
          }
        }
        break;
      case 'containerOpened': {
        const out = this.at(ev.x, ev.y);
        if (!out) break;
        const box = state.entities.get(ev.entity);
        const f = jit(160, 0.12);
        e.tone(out, 'sawtooth', f, t, jit(0.5, 0.2), 0.03, { to: f * rnd(1.35, 1.65), vibrato: rnd(0.03, 0.05), vibratoRate: rnd(9, 13), band: { freq: jit(800, 0.2), q: 2 } });
        strike(e, out, t + 0.02, this.soundOf(box), { strength: 0.3, mass: 60 });
        // A small rising chord in the key the music is in.
        const root = 392 * Math.pow(2, this.keyRoot / 12);
        [1, 1.26, 1.5, 2].slice(0, 3 + Math.floor(Math.random() * 2)).forEach((m, i) => e.tone(out, 'sine', root * m * 2, t + 0.3 + i * jit(0.09, 0.2), 0.8, 0.05));
        break;
      }
      case 'discovered':
      case 'skillUp':
        // Fanfares come from the music engine, in the key of whatever is playing.
        break;
      case 'say': {
        const sp = state.entities.get(ev.speaker);
        if (!sp) break;
        const out = this.at(sp.pos.x, sp.pos.y, 25);
        const v = this.voiceOf(sp);
        if (out && v) murmur(e, out, t, v, ev.text, 1);
        break;
      }
      case 'thunder': {
        // Thunder belongs to the sky: nobody hears it deep below.
        if (CONTENT.realms[state.realm]?.sky === false) break;
        const w = this.where(ev.x, ev.y);
        const delay = Math.min(3, w.d / 340);
        // A crack, then a roll that rumbles on for a while; far strikes lose their crack.
        const near = Math.max(0, 1 - w.d / 600);
        e.burst(e.amb, t + delay, jit(3.5, 0.3), 0.32, 'lowpass', jit(160, 0.2), { attack: 0.05, to: 60 });
        if (near > 0) e.burst(e.amb, t + delay, jit(0.4, 0.3), 0.2 * near, 'lowpass', jit(900, 0.2), { to: 200 });
        for (let i = Math.floor(rnd(1, 4)); i > 0; i--) e.burst(e.amb, t + delay + rnd(0.4, 2.5), jit(1.2, 0.3), rnd(0.08, 0.18), 'lowpass', rnd(90, 180), { attack: 0.2, to: 50 });
        break;
      }
      case 'weatherShift':
      default:
        break;
    }
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
  }
}
