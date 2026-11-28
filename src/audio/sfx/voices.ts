import type { BrainDef, Content, ThingDef, ThingId } from '../../types';
import type { AudioEngine } from '../engine';
import { clamp, hashString, jit, rint, rnd, stable } from './vary';

/**
 * Creature voices, grown from the creature's own definition instead of picked from a list.
 *
 * - Body size (mass, height, width) sets the pitch: big animals are low, small ones high, squat
 *   bodies croak in pulses.
 * - Material sets the throat: soft-coated hides are breathy, bare flesh is clearer, stone grinds,
 *   metal rings, wood creaks.
 * - Behaviour sets the attitude, read from the brain's behaviour list: things that hunt snarl and
 *   call at night, things that avoid danger or graze tremble and call by day, things with a daily
 *   routine (villagers) murmur and never call out on their own.
 * - The optional `voice` word in the definition picks the gesture (a long howl, a bleat, a grunt);
 *   without it the behaviour chooses one.
 * - The definition id gives each species its own stable accent, the entity id makes each animal a
 *   little different, and every call is performed fresh with small random changes.
 *
 * A new creature therefore has a fitting voice with no audio code at all.
 */
export type Gesture = 'howl' | 'bleat' | 'grunt';

export type Utterance = 'call' | 'growl' | 'hurt' | 'death' | 'attack';

export interface VoiceProfile {
  gesture: Gesture;
  /** Fundamental in Hz for an ordinary call. */
  pitch: number;
  /** Centre of the mouth resonance in Hz. */
  mouth: number;
  /** 0..1 share of breath noise. */
  breath: number;
  /** 0..1 throat roughness. */
  rough: number;
  /** Pulses per second for croaking bodies (0 = smooth). */
  pulse: number;
  /** 0..1 nervous trembling. */
  tremble: number;
  wave: OscillatorType;
  /** Seconds for an ordinary call. */
  length: number;
  /** Overall loudness. */
  loud: number;
  /** Hunters call at night, timid things by day, villagers never call out on their own. */
  calls: 'night' | 'day' | 'never';
}

const speciesCache = new Map<ThingId, VoiceProfile | null>();

/** The species voice for a definition, or null for things that have no voice (barrels, bolts). */
export function speciesVoice(c: Content, id: ThingId, def: ThingDef): VoiceProfile | null {
  const hit = speciesCache.get(id);
  if (hit !== undefined) return hit;
  const v = buildVoice(c, id, def);
  speciesCache.set(id, v);
  return v;
}

function buildVoice(c: Content, id: ThingId, def: ThingDef): VoiceProfile | null {
  const brain = def.brain ? c.brains[def.brain] : undefined;
  if (!def.voice && !brain && !def.actor) return null;
  const temperament = attitude(brain);
  const gesture: Gesture = def.voice ?? (temperament === 'timid' ? 'bleat' : 'grunt');
  const seed = hashString(id);

  const { mass, height, radius } = def.body;
  const size = Math.cbrt(Math.max(0.5, mass) / 40);
  const squat = (radius * 2) / Math.max(0.1, height);
  const base = gesture === 'howl' ? 430 : gesture === 'bleat' ? 520 : 170;
  let pitch = (base / size) / (1 + Math.max(0, squat - 0.8) * 0.6);

  const mat = c.materials[def.material];
  const sound = mat?.sound ?? 'flesh';
  // A material that keeps the cold out is a coat of fur or feathers: breathier.
  const coated = (mat?.resist.cold ?? 1) < 1;
  let breath = coated ? 0.35 : 0.15;
  let rough = 0.1;
  let wave: OscillatorType = gesture === 'howl' ? 'sine' : gesture === 'bleat' ? 'triangle' : 'sawtooth';
  if (sound === 'stone') {
    breath = 0.5;
    rough = 0.7;
    pitch *= 0.6;
    wave = 'sawtooth';
  } else if (sound === 'metal') {
    breath = 0.05;
    rough = 0.5;
    wave = 'square';
  } else if (sound === 'wood') {
    breath = 0.2;
    rough = 0.35;
    wave = 'triangle';
  } else if (sound === 'glass') {
    breath = 0.1;
    pitch *= 1.8;
    wave = 'sine';
  }

  let tremble = 0;
  let loud = 1;
  let calls: VoiceProfile['calls'] = 'never';
  if (temperament === 'hunter') {
    rough += 0.3;
    loud = 1.2;
    calls = 'night';
  } else if (temperament === 'timid') {
    pitch *= 1.15;
    tremble = 0.5;
    loud = 0.85;
    calls = 'day';
  } else if (temperament === 'villager') {
    rough += 0.05;
    loud = 0.8;
  }

  // Each species gets its own accent: a stable nudge from its id.
  pitch *= 1 + stable(seed, 1) * 0.1;
  const mouthRatio = gesture === 'howl' ? 2.2 : gesture === 'bleat' ? 3 : 4;
  const mouth = pitch * mouthRatio * (1 + stable(seed, 2) * 0.15);
  const lengthBase = gesture === 'howl' ? 1.7 : gesture === 'bleat' ? 0.38 : 0.26;
  const length = lengthBase * Math.sqrt(size) * (1 + stable(seed, 3) * 0.2);
  const pulse = squat > 1 ? (12 + 8 / size) * (1 + stable(seed, 4) * 0.15) : 0;

  return {
    gesture,
    pitch,
    mouth,
    breath: clamp(breath, 0, 1),
    rough: clamp(rough, 0, 1),
    pulse,
    tremble,
    wave,
    length,
    loud,
    calls,
  };
}

/** What kind of creature a brain makes, judged by the behaviours it lists. */
function attitude(brain: BrainDef | undefined): 'hunter' | 'timid' | 'villager' | undefined {
  if (!brain) return undefined;
  const has = (k: string): boolean => brain.behaviours.some((b) => b.do === k);
  if (has('hunt')) return 'hunter';
  if (has('routine')) return 'villager';
  if (has('avoid') || has('graze')) return 'timid';
  return undefined;
}

/** This particular animal: the species voice nudged by its entity id, the same every time. */
export function individual(v: VoiceProfile, entityId: number): VoiceProfile {
  return {
    ...v,
    pitch: v.pitch * (1 + stable(entityId, 11) * 0.07),
    mouth: v.mouth * (1 + stable(entityId, 12) * 0.1),
    length: v.length * (1 + stable(entityId, 13) * 0.12),
  };
}

/**
 * Performs one utterance. `heat` (0..1) is how worked up the moment is (a fight nearby): it makes
 * the throat rougher and the call louder.
 */
export function speak(e: AudioEngine, out: AudioNode, t: number, v: VoiceProfile, what: Utterance, level: number, heat = 0): void {
  const p = jit(v.pitch, 0.05);
  const lv = level * v.loud;
  const rough = clamp(v.rough + heat * 0.25, 0, 1);
  const breathAt = (dur: number, l: number, from: number, to: number): void => {
    if (v.breath > 0.02) e.burst(out, t, dur, l * v.breath * 1.6, 'bandpass', from, { q: 1.4, to, attack: Math.min(0.08, dur * 0.2) });
  };

  if (what === 'attack') {
    // A snap or snarl as it strikes: short, sharp, up from deep in the chest.
    const dur = jit(0.16, 0.3) * Math.sqrt(v.length / 0.3 + 0.4);
    e.tone(out, v.wave === 'sine' ? 'sawtooth' : v.wave, p * rnd(0.55, 0.75), t, dur, lv * 0.09, { from: p * rnd(0.9, 1.1), glide: dur * 0.3, tremolo: 0.4 + rough * 0.5, tremoloRate: rnd(20, 35), band: { freq: v.mouth * 0.8, q: 2 }, attack: 0.01 });
    breathAt(dur, lv * 0.07, v.mouth * 1.3, v.mouth * 0.7);
    return;
  }
  if (what === 'growl') {
    // Low and rolling, deep in the chest: every voice can growl.
    const dur = jit(0.55, 0.25) * Math.sqrt(v.length / 0.4 + 0.5);
    const f = p * rnd(0.22, 0.3);
    e.tone(out, 'sawtooth', f, t, dur, lv * 0.09, {
      from: f * rnd(1.15, 1.35),
      glide: dur * 0.4,
      tremolo: 0.5 + rough * 0.5,
      tremoloRate: rnd(18, 32),
      band: { freq: v.mouth * 0.45, q: 2 },
      attack: 0.04,
    });
    breathAt(dur, lv * 0.06, v.mouth * 0.6, v.mouth * 0.4);
    return;
  }

  switch (v.gesture) {
    case 'howl': {
      if (what === 'call') {
        const dur = jit(v.length, 0.2) * rnd(1.4, 2);
        const start = p * rnd(0.62, 0.75);
        const peak = p * rnd(0.95, 1.08);
        const end = p * rnd(0.72, 0.88);
        e.tone(out, v.wave, peak, t, dur, lv * 0.06, { from: start, glide: dur * rnd(0.2, 0.3), to: end, vibrato: rnd(0.008, 0.02), vibratoRate: rnd(4, 6), hold: 0.7, attack: 0.3 });
        e.tone(out, 'sine', peak * 2, t, dur, lv * 0.014, { from: start * 2, glide: dur * 0.25, to: end * 2, hold: 0.7, attack: 0.3 });
        breathAt(dur, lv * 0.02, v.mouth, v.mouth * 0.8);
        // Sometimes a second, shorter voice answers at a different pitch.
        if (Math.random() < 0.35) {
          const d2 = dur * rnd(0.5, 0.8);
          e.tone(out, v.wave, peak * rnd(1.1, 1.25), t + dur * rnd(0.3, 0.6), d2, lv * 0.035, { from: start * 1.15, glide: d2 * 0.3, to: end * 1.1, hold: 0.6, attack: 0.25 });
        }
      } else if (what === 'hurt') {
        const yelps = rint(1, 2);
        for (let i = 0; i < yelps; i++) {
          const tt = t + i * rnd(0.12, 0.18);
          const f = p * rnd(1.3, 1.6);
          e.tone(out, v.wave, f, tt, rnd(0.12, 0.2), lv * 0.08, { from: f * 1.25, glide: 0.02, to: f * 0.65, band: { freq: v.mouth * 1.2, q: 1.5 } });
        }
        breathAt(0.15, lv * 0.05, v.mouth * 1.5, v.mouth);
      } else {
        const dur = jit(0.75, 0.2);
        e.tone(out, 'sawtooth', p * 0.8, t, dur, lv * 0.07, { from: p * 1.2, glide: 0.05, to: p * 0.3, vibrato: 0.04, vibratoRate: rnd(7, 10), band: { freq: v.mouth, q: 1.2, to: v.mouth * 0.5 } });
        breathAt(dur, lv * 0.05, v.mouth, v.mouth * 0.4);
      }
      return;
    }
    case 'bleat': {
      const dur = what === 'call' ? jit(v.length, 0.2) : what === 'hurt' ? jit(v.length * 0.6, 0.2) : jit(v.length * 1.3, 0.2);
      const f = what === 'hurt' ? p * rnd(1.15, 1.35) : what === 'death' ? p * 0.95 : p;
      const to = what === 'death' ? f * 0.5 : f * rnd(0.82, 0.95);
      e.tone(out, v.wave, f, t, dur, lv * 0.07, {
        to,
        vibrato: 0.04 + v.tremble * 0.05,
        vibratoRate: rnd(6.5, 9),
        tremolo: 0.3 + v.tremble * 0.4,
        tremoloRate: rnd(6.5, 9),
        band: { freq: v.mouth, q: 1.6 },
      });
      e.tone(out, 'sine', f * 2.01, t, dur * 0.8, lv * 0.015, { to: to * 2 });
      breathAt(dur, lv * 0.04, v.mouth * 1.3, v.mouth);
      if (what === 'call' && Math.random() < 0.4) speak(e, out, t + dur + rnd(0.08, 0.2), v, 'hurt', level * 0.5);
      return;
    }
    case 'grunt': {
      const count = what === 'call' && v.pulse > 0 ? rint(1, 3) : 1;
      const dur = what === 'death' ? jit(v.length * 2.6, 0.2) : what === 'hurt' ? jit(v.length * 0.7, 0.2) : jit(v.length, 0.2);
      for (let i = 0; i < count; i++) {
        const tt = t + i * (dur + rnd(0.06, 0.16));
        const f = (what === 'hurt' ? p * rnd(1.2, 1.45) : p) * (i === count - 1 && count > 1 ? 0.9 : 1);
        const to = what === 'death' ? f * 0.45 : f * rnd(0.75, 0.9);
        e.tone(out, v.wave, f, tt, dur, lv * 0.06, {
          from: f * rnd(1.05, 1.2),
          glide: dur * 0.3,
          to,
          tremolo: v.pulse > 0 ? 0.85 : rough * 0.4,
          tremoloRate: v.pulse > 0 ? v.pulse * rnd(0.9, 1.1) : rnd(25, 40),
          band: { freq: v.mouth, q: 2.5, to: v.mouth * 0.75 },
          attack: 0.015,
        });
        breathAt(dur, lv * 0.04, v.mouth * 1.2, v.mouth * 0.7);
      }
      return;
    }
  }
}

/** Vowel mouths (two resonances each) used for murmured speech. */
const VOWELS: readonly [number, number][] = [
  [300, 2300],
  [700, 1200],
  [500, 900],
  [450, 1900],
  [350, 800],
];

/**
 * A murmur of syllables in this voice instead of speech: each speaker keeps their own pitch and
 * accent, the syllables change vowel, and the sentence rises at a question and falls at the end.
 */
export function murmur(e: AudioEngine, out: AudioNode, t: number, v: VoiceProfile, text: string, level: number): void {
  const syll = clamp(Math.ceil(text.length / 6), 1, 10);
  const question = text.trimEnd().endsWith('?');
  const scale = clamp(v.mouth / 700, 0.7, 1.4);
  let tt = t;
  for (let i = 0; i < syll; i++) {
    const last = i === syll - 1;
    const contour = last ? (question ? 1.18 : 0.86) : 1 + Math.sin((i / syll) * Math.PI) * 0.08;
    const f = v.pitch * contour * rnd(0.96, 1.06);
    const dur = rnd(0.06, 0.11) * (last ? 1.5 : 1);
    const vowel = VOWELS[Math.floor(Math.random() * VOWELS.length)] ?? [500, 1500];
    e.tone(out, 'sawtooth', f, tt, dur, level * 0.03, { band: { freq: vowel[0] * scale, q: 4 }, attack: 0.012, to: last ? f * (question ? 1.1 : 0.9) : undefined });
    e.tone(out, 'sawtooth', f, tt, dur, level * 0.015, { band: { freq: vowel[1] * scale, q: 6 }, attack: 0.012 });
    if (Math.random() < 0.3) e.burst(out, tt, 0.03, level * 0.02, 'highpass', rnd(3000, 5000), { q: 1 });
    tt += dur + rnd(0.02, 0.05) + (Math.random() < 0.12 ? 0.08 : 0);
  }
}
