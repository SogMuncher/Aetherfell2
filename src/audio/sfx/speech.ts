// Speaking voices: one synth that reads a VoiceDef (pitch, pace, lilt, breath, rasp, throat) and sings words or cries
import type { VoiceDef, VoiceSpan } from '../../types';
import type { AudioEngine } from '../engine';
import { clamp, jit, pick, rnd, stable } from './vary';

/**
 * People talk through ONE synth. A voice in the data is a set of ranges; each person takes fixed values from them by
 * their entity id, so the same villager always sounds the same and no two sound alike. A line of text is sung as its
 * own syllables: each vowel group is a vowel (two mouth resonances over a buzzing throat), each consonant before it a
 * click, hiss, hum or glide by its letter. The pitch falls over a sentence, lifts on stressed words by the voice's
 * lilt, rises at a question and jumps at a shout. Cries (a blow's effort, hurt, death, a battle cry) use the same
 * throat and mouth, so a person's scream is recognisably theirs.
 */
export interface PersonVoice {
  pitch: number;
  pace: number;
  lilt: number;
  breath: number;
  rasp: number;
  throat: number;
  nasal: number;
}

export type Cry = 'effort' | 'hurt' | 'death' | 'growl' | 'call';

const at = (s: VoiceSpan | undefined, id: number, slot: number): number => (s ? s[0] + (s[1] - s[0]) * (stable(id * 7919 + 13, slot) * 0.5 + 0.5) : 0);

/** This person's own voice: one fixed value from each range, by their id. */
export function personVoice(v: VoiceDef, id: number): PersonVoice {
  return { pitch: at(v.pitch, id, 1), pace: at(v.pace, id, 2), lilt: at(v.lilt, id, 3), breath: at(v.breath, id, 4), rasp: at(v.rasp, id, 5), throat: at(v.throat, id, 6), nasal: at(v.nasal, id, 7) };
}

/** Mouth resonances (F1, F2) of each vowel letter for an average throat. */
const VOWELS: Readonly<Record<string, readonly [number, number]>> = { a: [730, 1150], e: [530, 1840], i: [310, 2250], o: [560, 880], u: [340, 920], y: [420, 1950] };
const PLOSIVE = 'ptkcqbdg';
const VOICED = 'bdgzvjmnlrw';

interface Syllable {
  onset: string;
  vowel: string;
  stress: boolean;
  /** A pause after it (between words, longer at a comma). */
  gap: number;
}

/** A line of text as syllables: each run of vowels is one, the consonants before it its onset. */
function syllables(text: string, max: number): Syllable[] {
  const out: Syllable[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const word = raw.replace(/[^a-z]/g, '');
    if (!word) continue;
    let onset = '';
    let first = true;
    for (let i = 0; i < word.length && out.length < max; i++) {
      const ch = word[i] ?? '';
      if (!(ch in VOWELS)) {
        onset += ch;
        continue;
      }
      let vowel = ch;
      while (i + 1 < word.length && (word[i + 1] ?? '') in VOWELS) vowel += word[++i] ?? '';
      out.push({ onset: onset.slice(-2), vowel, stress: first, gap: 0 });
      onset = '';
      first = false;
    }
    const last = out[out.length - 1];
    if (last) last.gap = /[,;:]$/.test(raw) ? 0.14 : 0.03;
    if (out.length >= max) break;
  }
  return out;
}

/** One consonant at time t (seconds it takes come back), shaped by the mouth of the vowel after it. */
function consonant(e: AudioEngine, out: AudioNode, t: number, c: string, f: number, f2: number, level: number, pv: PersonVoice): number {
  if (PLOSIVE.includes(c)) {
    const fq = c === 'p' || c === 'b' ? 900 : c === 't' || c === 'd' ? 4200 : 2100;
    e.burst(out, t, 0.025, level * (VOICED.includes(c) ? 0.35 : 0.6), 'bandpass', fq / pv.throat, { q: 1.2 });
    return 0.035;
  }
  if (c === 's' || c === 'z' || c === 'x' || c === 'j') {
    e.burst(out, t, 0.06, level * 0.32, 'highpass', 5200 / pv.throat, { q: 0.8 });
    return 0.06;
  }
  if (c === 'f' || c === 'v') {
    e.burst(out, t, 0.05, level * 0.2, 'bandpass', 3200, { q: 0.6 });
    return 0.05;
  }
  if (c === 'h') {
    e.burst(out, t, 0.05, level * 0.3, 'bandpass', f2, { q: 1.5 });
    return 0.045;
  }
  if (c === 'm' || c === 'n') {
    e.tone(out, 'triangle', f, t, 0.06, level * 0.6, { band: { freq: 280 / pv.throat, q: 3 }, attack: 0.01 });
    return 0.05;
  }
  return 0;
}

/** One vowel: a buzzing throat through two mouth resonances, gliding from `fromMouth` if a liquid (l, r, w) led in. */
function vowel(e: AudioEngine, out: AudioNode, t: number, dur: number, f: number, fTo: number, v: string, level: number, pv: PersonVoice, lead = '', heat = 0): void {
  const a = VOWELS[v[0] ?? 'a'] ?? [600, 1400];
  const b = VOWELS[v[v.length - 1] ?? 'a'] ?? a;
  const k = 1 / pv.throat;
  const glide = lead === 'r' ? 1300 : lead === 'l' ? 1000 : lead === 'w' ? 700 : 0;
  const rasp = clamp(pv.rasp + heat * 0.3, 0, 1);
  const opt = { to: fTo, vibrato: 0.006, vibratoRate: rnd(4.5, 6.5), tremolo: rasp * 0.7, tremoloRate: rnd(28, 55), attack: 0.018 };
  e.tone(out, 'sawtooth', f, t, dur, level, { ...opt, band: { freq: a[0] * k * (1 - pv.nasal * 0.25), q: 4 + pv.nasal * 6, to: b[0] * k } });
  e.tone(out, 'sawtooth', f, t, dur, level * (0.55 - pv.nasal * 0.2), { ...opt, band: { freq: (glide || a[1]) * k, q: 7, to: b[1] * k } });
  if (pv.breath > 0.08) e.burst(out, t, dur, level * pv.breath * 0.7, 'bandpass', a[1] * k, { q: 1.6, attack: 0.02 });
}

/** Speaks a line of text in this voice. */
export function talk(e: AudioEngine, out: AudioNode, t: number, pv: PersonVoice, text: string, level: number): void {
  const syl = syllables(text, 12);
  if (syl.length === 0) return;
  const end = text.trimEnd();
  const ask = end.endsWith('?');
  const shout = end.endsWith('!');
  const lv = level * 0.05 * (shout ? 1.35 : 1);
  const base = pv.pitch * (shout ? 1.18 : 1);
  const step = 1 / pv.pace;
  let tt = t;
  syl.forEach((s, i) => {
    const prog = i / Math.max(1, syl.length - 1);
    const last = i === syl.length - 1;
    // The sentence falls as it goes; stressed syllables lift by the voice's lilt; the end rises at a question.
    let f = base * (1.08 - prog * 0.16) * (s.stress ? 1 + pv.lilt * rnd(0.06, 0.16) : 1 - pv.lilt * rnd(0, 0.06));
    let fTo = f * rnd(0.97, 1.02);
    if (last) fTo = f * (ask ? 1.3 : shout ? 0.92 : 0.8);
    f = jit(f, 0.02);
    const a = VOWELS[s.vowel[0] ?? 'a'] ?? [600, 1400];
    for (const c of s.onset) tt += consonant(e, out, tt, c, f, a[1] / pv.throat, lv, pv);
    const dur = step * (s.stress ? 0.72 : 0.55) * (last ? 1.5 : 1) * rnd(0.9, 1.1);
    vowel(e, out, tt, dur, f, fTo, s.vowel, lv, pv, s.onset.slice(-1));
    tt += dur + s.gap + step * 0.1;
  });
}

/** A cry in this voice: the grunt of a blow, a cry of pain, a death scream, a battle cry, a shout to get attention. */
export function cry(e: AudioEngine, out: AudioNode, t: number, pv: PersonVoice, what: Cry, level: number, heat = 0): void {
  const p = jit(pv.pitch, 0.05);
  const lv = level * 0.055;
  switch (what) {
    case 'effort':
      e.burst(out, t, 0.05, lv * 0.5, 'bandpass', 1200 / pv.throat, { q: 1 });
      vowel(e, out, t + 0.03, rnd(0.1, 0.18), p * rnd(1.15, 1.35), p * 0.9, pick(['a', 'u', 'e']) ?? 'a', lv * 0.9, pv, '', heat);
      return;
    case 'hurt':
      vowel(e, out, t, rnd(0.18, 0.32), p * rnd(1.5, 1.9), p * rnd(0.95, 1.1), pick(['a', 'o', 'u', 'ai']) ?? 'a', lv * 1.2, pv, '', 0.6 + heat);
      e.burst(out, t, 0.12, lv * 0.4, 'bandpass', 1400 / pv.throat, { q: 1.2 });
      return;
    case 'death': {
      const dur = rnd(0.8, 1.3);
      vowel(e, out, t, dur, p * rnd(1.4, 1.7), p * 0.5, pick(['ao', 'aa', 'ou']) ?? 'aa', lv * 1.3, pv, '', 0.8);
      e.burst(out, t + dur * 0.6, dur * 0.6, lv * 0.5, 'bandpass', 900 / pv.throat, { q: 1, to: 400 });
      return;
    }
    case 'growl':
      vowel(e, out, t, rnd(0.45, 0.7), p * rnd(1.1, 1.3), p * rnd(1, 1.15), pick(['aa', 'ae', 'o']) ?? 'aa', lv * 1.4, pv, 'r', 1 + heat);
      return;
    case 'call':
      consonant(e, out, t, 'h', p, 1800 / pv.throat, lv, pv);
      vowel(e, out, t + 0.04, rnd(0.25, 0.4), p * 1.3, p * 1.1, 'ei', lv * 1.2, pv);
      return;
  }
}
