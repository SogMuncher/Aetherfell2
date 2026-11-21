import type { Content, Effect, RuneId, SpellDef, StatusDef } from '../../types';
import type { AudioEngine } from '../engine';
import { clamp, hashString, jit, rint, rnd } from './vary';

/**
 * Spell and status sounds, built from what the magic actually does.
 *
 * A spell is a list of effects (damage of a kind, heat, soak, chill, push, heal, status…). Each
 * effect adds a sonic ingredient (an "element"): heat crackles and roars, soak bubbles, chill
 * tinkles, push whooshes, blunt force rumbles, healing chimes. The delivery shapes the sound
 * (a fast bolt is short and bright, a lobbed orb thumps, a wave sweeps, a nova blooms outward, a
 * ward swells inward), power makes it deeper and louder, and the spell colour tints it.
 * On top, each rune sings its own note (from its spoken word), so a spell has a little melody
 * players learn by ear, tuned to the key the music is in.
 *
 * A new rune or status needs no audio code: its effects already say how it sounds.
 */
export type Element = 'flame' | 'water' | 'frost' | 'wind' | 'earth' | 'life' | 'venom' | 'blade' | 'arcane' | 'oil' | 'summon' | 'warmth' | 'daze';

type Mix = Map<Element, number>;

/** Status tags that name a feeling the sound palette knows. Unknown tags fall back to 'arcane'. */
const TAG_ELEMENT: Readonly<Record<string, Element>> = {
  fire: 'flame',
  cold: 'frost',
  water: 'water',
  poison: 'venom',
  stun: 'daze',
  warm: 'warmth',
};

function add(m: Mix, el: Element, w: number): void {
  if (w > 0) m.set(el, (m.get(el) ?? 0) + w);
}

/** Which elements a list of effects is made of, and how strongly. */
export function elementsOf(c: Content, effects: readonly Effect[], into: Mix = new Map(), depth = 0): Mix {
  for (const e of effects) {
    switch (e.type) {
      case 'damage': {
        const w = clamp(e.amount / 8, 0.2, 1.5);
        if (e.kind === 'fire') add(into, 'flame', w);
        else if (e.kind === 'cold') add(into, 'frost', w);
        else if (e.kind === 'poison') add(into, 'venom', w);
        else if (e.kind === 'blunt' || e.kind === 'fall') add(into, 'earth', w * 1.2);
        else if (e.kind === 'cut' || e.kind === 'pierce') add(into, 'blade', w);
        else add(into, 'arcane', w);
        break;
      }
      case 'heat':
        add(into, 'flame', e.amount);
        break;
      case 'soak':
        add(into, 'water', e.amount * 1.2);
        break;
      case 'chill':
        add(into, 'frost', e.amount);
        break;
      case 'push':
        add(into, 'wind', clamp((e.force + (e.lift ?? 0)) / 10, 0.15, 1.4));
        break;
      case 'heal':
        add(into, 'life', clamp(e.amount / 12, 0.4, 1.5));
        break;
      case 'restore':
        add(into, 'life', 0.5);
        break;
      case 'cure':
        add(into, 'life', 0.35);
        break;
      case 'coat':
        add(into, 'oil', 1);
        break;
      case 'spawn':
        add(into, 'summon', 1);
        break;
      case 'status': {
        const s = c.statuses[e.id];
        if (s && depth < 2) statusElements(c, s, into, 0.35, depth + 1);
        else add(into, 'arcane', 0.4);
        break;
      }
    }
  }
  return into;
}

function statusElements(c: Content, s: StatusDef, into: Mix, w: number, depth: number): void {
  let known = false;
  for (const tag of s.tags) {
    const el = TAG_ELEMENT[tag];
    if (el) {
      add(into, el, w);
      known = true;
    }
  }
  if (s.disables) {
    add(into, 'daze', w * 0.6);
    known = true;
  }
  for (const ev of s.every) {
    const sub = elementsOf(c, ev.effects, new Map(), depth);
    for (const [el, v] of sub) add(into, el, v * w * 0.5);
    if (sub.size) known = true;
  }
  if (!known) add(into, 'arcane', w * 0.5);
}

/** The strongest elements first, with weights normalised so the loudest is 1. */
function ranked(m: Mix, max = 3): [Element, number][] {
  const list = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const top = list[0]?.[1] ?? 1;
  return list.map(([el, w]) => [el, clamp(w / top, 0.25, 1)]);
}

/** How a spell colour tints its sound: brighter, bluer colours sound higher and clearer. */
function brightness(color: { r: number; g: number; b: number }): number {
  const lum = (0.3 * color.r + 0.59 * color.g + 0.11 * color.b) / 255;
  const cool = (color.b - color.r) / 255;
  return 0.8 + lum * 0.35 + cool * 0.2;
}

interface Shape {
  dur: number;
  attack: number;
  /** Multiplies every pitch. */
  p: number;
  level: number;
  /** Filter sweep direction: 1 rising (outward), -1 falling. */
  sweep: number;
}

function shapeOf(s: SpellDef): Shape {
  const d = s.delivery;
  const p = brightness(s.color) / Math.sqrt(Math.max(0.3, s.power));
  const level = clamp(0.75 + s.cost / 60, 0.7, 1.4);
  switch (d.type) {
    case 'bolt':
      return { dur: clamp(8 / d.speed, 0.25, 0.8), attack: 0.01, p: p * clamp(Math.sqrt(d.speed / 15), 0.8, 1.3), level, sweep: 1 };
    case 'cone':
      return { dur: clamp(d.range / 11, 0.4, 1.1), attack: 0.06, p, level, sweep: -1 };
    case 'nova':
      return { dur: clamp(0.35 + d.radius * 0.08, 0.5, 1.4), attack: 0.03, p: p * 0.9, level: level * 1.15, sweep: 1 };
    case 'self':
      return { dur: 0.7, attack: 0.35, p: p * 1.05, level: level * 0.85, sweep: 1 };
  }
}

/** One element's voice. `big` (0.3..1.6) scales size for bursts. */
function playElement(e: AudioEngine, out: AudioNode, t: number, el: Element, w: number, sh: Shape, mode: 'cast' | 'burst', big = 1): void {
  const P = sh.p * jit(1, 0.06);
  const L = sh.level * w;
  const dur = jit(mode === 'cast' ? sh.dur : 0.4 + big * 0.4, 0.15);
  const a = mode === 'cast' ? sh.attack : 0.004;
  switch (el) {
    case 'flame':
      if (mode === 'cast') {
        e.burst(out, t, dur, L * 0.2, 'bandpass', 400 * P, { q: 1, to: (sh.sweep > 0 ? 2200 : 700) * P, attack: a });
        e.tone(out, 'sawtooth', 660 * P, t, dur * 0.7, L * 0.04, { from: 220 * P, glide: dur * 0.5 });
      } else {
        e.burst(out, t, dur * 1.3, L * 0.3 * Math.sqrt(big), 'lowpass', 900 * P, { to: 120 });
        e.tone(out, 'sine', 60 * P, t, 0.5, L * 0.18 * Math.sqrt(big), { from: 140 * P, glide: 0.1 });
      }
      for (let i = rint(3, 6); i > 0; i--) e.burst(out, t + rnd(0, dur), 0.02, L * 0.1, 'highpass', rnd(2000, 5000), { q: 1 });
      break;
    case 'wind':
      e.burst(out, t, dur * 1.2, L * 0.26, 'bandpass', (sh.sweep > 0 ? 500 : 1900) * P, { q: rnd(0.7, 1.1), to: (sh.sweep > 0 ? 1800 : 350) * P, attack: Math.max(a, 0.04) });
      if (Math.random() < 0.6) e.burst(out, t + rnd(0.05, 0.15), dur * 0.8, L * 0.1, 'bandpass', rnd(900, 1500) * P, { q: 2, to: 500 * P });
      break;
    case 'water':
      e.burst(out, t, dur, L * (mode === 'burst' ? 0.25 * Math.sqrt(big) : 0.15), 'bandpass', 900 * P, { q: 0.8, to: 300 * P, attack: a });
      for (let i = rint(4, 8); i > 0; i--) {
        const f = rnd(450, 1100) * P;
        e.tone(out, 'sine', f, t + rnd(0.02, dur), 0.06, L * 0.035, { to: f * rnd(1.4, 2) });
      }
      break;
    case 'frost':
      if (mode === 'cast') {
        for (let i = rint(4, 7); i > 0; i--) e.tone(out, 'triangle', rnd(1800, 2600) * P, t + rnd(0, dur * 0.4), 0.2, L * 0.03, { to: rnd(2800, 3400) * P });
        e.burst(out, t, dur * 0.8, L * 0.12, 'highpass', 4000, { to: 2000, attack: a });
      } else {
        // Crackle of water locking into ice.
        for (let i = rint(7, 12); i > 0; i--) e.burst(out, t + rnd(0, 0.5 * big), 0.03, L * 0.12, 'highpass', rnd(2500, 5000), { q: 2 });
        e.tone(out, 'sine', 140 * P, t, 0.6, L * 0.08, { to: 70 * P });
      }
      break;
    case 'earth': {
      // A deep shove through the ground, with grit rattling loose.
      const s = mode === 'burst' ? Math.sqrt(big) : 1;
      e.tone(out, 'sine', rnd(48, 60) * P, t, dur * 1.2, L * 0.12 * s, { from: rnd(100, 130) * P, glide: 0.12, attack: a });
      e.burst(out, t, dur * 1.3, L * 0.16 * s, 'lowpass', 320 * P, { to: 90, attack: Math.max(0.01, a) });
      for (let i = rint(4, 8); i > 0; i--) e.burst(out, t + rnd(0.03, dur), rnd(0.03, 0.07), L * 0.1, 'bandpass', rnd(200, 600), { q: 3 });
      break;
    }
    case 'life': {
      const root = 660 * P;
      const ratios = [1, 1.25, 1.5, 2, 2.5];
      const n = rint(3, 5);
      for (let i = 0; i < n; i++) e.tone(out, 'sine', root * (ratios[i] ?? 2), t + i * jit(0.06, 0.3) + (mode === 'cast' ? a * 0.5 : 0), 0.5, L * 0.04, { attack: 0.01 });
      break;
    }
    case 'venom':
      e.tone(out, 'sawtooth', 140 * P, t, dur, L * 0.04, { to: 90 * P, vibrato: 0.15, vibratoRate: rnd(7, 11), band: { freq: 700 * P, q: 2 } });
      e.burst(out, t, dur * 0.9, L * 0.12, 'bandpass', 600 * P, { q: 4, attack: a });
      for (let i = rint(2, 5); i > 0; i--) {
        const f = rnd(180, 320) * P;
        e.tone(out, 'sine', f, t + rnd(0.05, dur), 0.08, L * 0.04, { to: f * 1.6 });
      }
      break;
    case 'blade': {
      const f = rnd(800, 1000) * P;
      for (const m of [1, 2.76, 5.4]) e.tone(out, 'sine', f * m * jit(1, 0.02), t, 0.5 / m + 0.1, (L * 0.05) / m, { attack: 0.002 });
      e.burst(out, t, 0.12, L * 0.12, 'highpass', 3000, { to: 6000 });
      break;
    }
    case 'oil':
      for (let i = rint(2, 3); i > 0; i--) {
        const tt = t + rnd(0, dur * 0.6);
        e.tone(out, 'sine', rnd(150, 210) * P, tt, 0.12, L * 0.08, { to: rnd(90, 120) * P });
      }
      e.burst(out, t, dur, L * 0.12, 'lowpass', 500, { to: 200 });
      break;
    case 'summon':
      e.tone(out, 'sine', 1200 * P, t, dur * 1.3, L * 0.05, { from: 300 * P, glide: dur, attack: 0.05 });
      e.burst(out, t, dur * 1.3, L * 0.08, 'bandpass', 600 * P, { q: 1, to: 3000 * P, attack: 0.1 });
      break;
    case 'warmth':
      e.tone(out, 'triangle', 440 * P, t, dur * 1.4, L * 0.04, { from: 330 * P, glide: dur * 0.6, hold: 0.5, attack: 0.08 });
      e.burst(out, t, dur * 1.4, L * 0.07, 'lowpass', 600, { attack: 0.1 });
      break;
    case 'daze':
      e.tone(out, 'triangle', 600 * P, t, dur * 1.2, L * 0.04, { to: 380 * P, vibrato: 0.12, vibratoRate: rnd(4, 6) });
      e.tone(out, 'triangle', 640 * P, t + 0.04, dur * 1.2, L * 0.025, { to: 360 * P, vibrato: 0.1, vibratoRate: rnd(3, 5) });
      break;
    case 'arcane':
    default:
      for (let i = rint(4, 7); i > 0; i--) e.tone(out, 'sine', rnd(500, 1200) * P, t + rnd(0, dur * 0.5), 0.12, L * 0.05, { to: rnd(1400, 2200) * P });
  }
}

const PENTATONIC = [0, 2, 4, 7, 9];

/** A rune's own note: a stable degree of the pentatonic scale chosen from its spoken word. */
function runeSemitone(c: Content, id: RuneId): number {
  const r = c.runes[id];
  const h = hashString(r?.word ?? id);
  const degree = PENTATONIC[h % PENTATONIC.length] ?? 0;
  // Essences sit in the middle, shapes above them, powers below.
  const octave = r?.shape ? 12 : r?.power ? -12 : 0;
  return degree + octave;
}

/** Casting: the elements in the spell's shape, then each rune singing its note. */
export function castSpell(e: AudioEngine, out: AudioNode, t: number, c: Content, s: SpellDef, keyRoot: number): void {
  const sh = shapeOf(s);
  const mix = elementsOf(c, s.hit);
  if (s.delivery.type !== 'self') elementsOf(c, s.burst.effects, mix);
  const els = ranked(mix);
  if (els.length === 0) els.push(['arcane', 1]);
  for (const [el, w] of els) playElement(e, out, t + rnd(0, 0.02), el, w, sh, 'cast');
  // A lobbed orb leaves the hand with a soft thump.
  if (s.delivery.type === 'bolt' && s.delivery.gravity > 5) e.tone(out, 'sine', 90 * sh.p, t, 0.2, 0.08, { from: 160 * sh.p, glide: 0.08 });
  // Waves and novas strike at once, so they bloom where they land as part of the cast.
  if (s.delivery.type === 'nova' || s.delivery.type === 'cone') {
    const big = clamp((s.delivery.type === 'nova' ? s.delivery.radius : s.delivery.range) / 5, 0.5, 1.6);
    const top = els[0];
    if (top) playElement(e, out, t + sh.dur * 0.4, top[0], top[1] * 0.6, sh, 'burst', big);
  }
  runeMotif(e, out, t, c, s.runes, keyRoot, 0.04);
}

/** A bolt bursting where it lands: the burst effects (or the hit ones) at the size of the burst. */
export function burstSpell(e: AudioEngine, out: AudioNode, t: number, c: Content, s: SpellDef): void {
  const sh = shapeOf(s);
  const mix = elementsOf(c, s.burst.effects);
  if (mix.size === 0) elementsOf(c, s.hit, mix);
  const big = clamp(s.burst.radius / 2.5, 0.3, 1.6);
  const els = ranked(mix, 2);
  if (els.length === 0) els.push(['arcane', 1]);
  for (const [el, w] of els) playElement(e, out, t, el, w, sh, 'burst', big);
}

/** The runes of a spell sung as a quick rising figure in the current key. */
export function runeMotif(e: AudioEngine, out: AudioNode, t: number, c: Content, runes: readonly RuneId[], keyRoot: number, level: number): void {
  // keyRoot is a pitch class (0 = C); the figure sits around the octave above middle C.
  const base = 523.25 * Math.pow(2, keyRoot / 12);
  runes.forEach((id, i) => {
    const f = base * Math.pow(2, runeSemitone(c, id) / 12);
    const tt = t + i * jit(0.075, 0.25);
    e.tone(out, 'sine', f, tt, jit(1.1, 0.15), level * jit(1, 0.15), { attack: 0.01, detune: rnd(-6, 6) });
    e.tone(out, 'triangle', f * 2, tt, 0.4, level * 0.2, { attack: 0.005 });
  });
}

/**
 * A condition taking hold: its elements (from its tags and repeating effects) plus a short line
 * that falls for harmful conditions and rises for good ones, pitched from its tint.
 */
export function statusOn(e: AudioEngine, out: AudioNode, t: number, c: Content, s: StatusDef, level: number): void {
  const mix: Mix = new Map();
  statusElements(c, s, mix, 1, 1);
  const harmful = s.move < 1 || s.disables || s.panic || s.every.some((ev) => ev.effects.some((x) => x.type === 'damage'));
  const tint = s.tint ?? { r: 200, g: 200, b: 220 };
  const p = brightness(tint);
  const sh: Shape = { dur: 0.35, attack: 0.02, p, level: level * 0.6, sweep: harmful ? -1 : 1 };
  for (const [el, w] of ranked(mix, 2)) playElement(e, out, t, el, w * 0.7, sh, 'cast');
  const f = 500 * p * jit(1, 0.05);
  e.tone(out, 'sine', f, t, 0.45, level * 0.03, { to: harmful ? f * 0.7 : f * 1.35, attack: 0.02 });
}

/** Any list of effects going off around a point (a trap, a thrown flask): its elements, sized by radius. */
export function effectBurst(e: AudioEngine, out: AudioNode, t: number, c: Content, effects: readonly Effect[], radius: number): void {
  const big = clamp(radius / 2.5, 0.3, 1.6);
  const sh: Shape = { dur: 0.6, attack: 0.02, p: 1, level: 1.1, sweep: 1 };
  const els = ranked(elementsOf(c, effects), 2);
  if (els.length === 0) els.push(['earth', 0.6]);
  for (const [el, w] of els) playElement(e, out, t, el, w, sh, 'burst', big);
}
