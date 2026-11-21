import type { Color, Content, Delivery, Effect, EssenceLook, EssencePart, LookTweak, MoteLook, RuneDef, RuneId, SpellDef, SpellId, SpellLook } from '../types';

/** Most runes a spell can hold. */
export const MAX_SPELL_RUNES = 3;

export type Composed = { ok: true; spell: SpellDef } | { ok: false; problem: string };

/** The id of the spell made from these runes, in the order they were set. */
export function spellKey(runes: readonly RuneId[]): SpellId {
  return runes.join('+');
}

const cache = new Map<string, Composed>();

/**
 * Combines up to three runes into a spell. Pure and deterministic: the same runes always make the
 * same spell, so a spell id (the rune list) is all that saves, bolts and the network carry.
 */
export function composeSpell(c: Content, runes: readonly RuneId[]): Composed {
  const key = spellKey(runes);
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 4096) cache.clear();
  const out = compose(c, runes);
  cache.set(key, out);
  return out;
}

/** The spell for a spell id, or null if the id does not make a valid spell. */
export function spellFor(c: Content, id: SpellId): SpellDef | null {
  if (!id) return null;
  const r = composeSpell(c, id.split('+'));
  return r.ok ? r.spell : null;
}

function compose(c: Content, runes: readonly RuneId[]): Composed {
  if (runes.length === 0) return { ok: false, problem: 'Choose at least one rune.' };
  if (runes.length > MAX_SPELL_RUNES) return { ok: false, problem: `A spell holds at most ${MAX_SPELL_RUNES} runes.` };
  const defs: RuneDef[] = [];
  for (const id of runes) {
    const d = c.runes[id];
    if (!d) return { ok: false, problem: `Unknown rune '${id}'.` };
    if (defs.includes(d)) return { ok: false, problem: `${d.name} can only be inscribed once.` };
    defs.push(d);
  }
  const essences = defs.filter((d) => d.essence);
  const shapes = defs.filter((d) => d.shape);
  const powers = defs.filter((d) => d.power);
  const first = essences[0]?.essence;
  if (!first) return { ok: false, problem: 'A spell needs an essence rune (Ember, Tide, Frost…).' };
  if (shapes.length > 1) return { ok: false, problem: 'Two shapes pull the spell apart. Use one.' };
  const shape = shapes[0]?.shape;

  let power = shape?.power ?? 1;
  let costMul = shape?.cost ?? 1;
  let radius = shape?.radius ?? 1;
  let speed = 1;
  for (const p of powers) {
    const w = p.power;
    if (!w) continue;
    power *= w.power;
    costMul *= w.cost;
    radius *= w.radius;
    speed *= w.speed;
  }

  const base = shape?.delivery ?? first.delivery;
  const delivery = scaleDelivery(base, speed, radius);
  const self = delivery.type === 'self';

  const hitList: Effect[] = [];
  const burstList: Effect[] = [];
  let burstRadius = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const d of essences) {
    const e = d.essence;
    if (!e) continue;
    hitList.push(...(self ? e.ward : e.hit));
    if (!self) burstList.push(...e.burst.effects);
    burstRadius = Math.max(burstRadius, e.burst.radius);
    r += e.color.r;
    g += e.color.g;
    b += e.color.b;
  }
  const n = essences.length;
  const baseCost = defs.reduce((s, d) => s + d.cost, 0);
  const noun = shape?.noun ?? naturalNoun(first.delivery);
  const name = [...powers.map((p) => p.power?.adjective ?? p.name), ...essences.map((e) => e.name), noun].join(' ');

  const spell: SpellDef = {
    id: spellKey(runes),
    name,
    words: defs.map((d) => d.word).join(' '),
    runes: [...runes],
    cost: Math.max(1, Math.round(baseCost * costMul)),
    power,
    delivery,
    hit: hitList,
    burst: { radius: self ? 0 : burstRadius * radius, effects: burstList },
    friendly: essences.some((e) => e.essence?.friendly),
    light: { ...first.light, radius: first.light.radius * Math.min(2, Math.sqrt(power)) },
    color: { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) },
    sound: first.sound,
    look: composeLook(essences.map((d) => d.essence).filter((e): e is EssencePart => !!e), [shape?.look, ...powers.map((p) => p.power?.look)], power, spellKey(runes)),
  };
  return { ok: true, spell };
}

function scaleDelivery(d: Delivery, speed: number, radius: number): Delivery {
  switch (d.type) {
    case 'bolt':
      return { type: 'bolt', speed: d.speed * speed, gravity: d.gravity, life: Math.round(d.life / Math.sqrt(speed)) };
    case 'cone':
      return { type: 'cone', range: d.range * Math.sqrt(radius), width: Math.max(0.35, d.width - (radius - 1) * 0.15) };
    case 'nova':
      return { type: 'nova', radius: d.radius * radius };
    case 'self':
      return d;
  }
}

function naturalNoun(d: Delivery): string {
  switch (d.type) {
    case 'bolt':
      return d.gravity > 5 ? 'Orb' : 'Bolt';
    case 'cone':
      return 'Wave';
    case 'nova':
      return 'Nova';
    case 'self':
      return 'Ward';
  }
}

/** Plain-language lines describing what a spell does, for the runebook. */
export function describeSpell(c: Content, s: SpellDef): string[] {
  const d = s.delivery;
  const lines: string[] = [];
  if (d.type === 'bolt') lines.push(d.gravity > 5 ? 'Lobbed in an arc.' : d.speed > 20 ? 'Flies fast and straight.' : 'Flies as a bolt.');
  else if (d.type === 'cone') lines.push(`Sweeps a cone ${d.range.toFixed(0)} m ahead.`);
  else if (d.type === 'nova') lines.push(`Bursts out ${d.radius.toFixed(0)} m around you.`);
  else lines.push('Works on you.');
  const what = d.type === 'self' ? 'On you' : d.type === 'bolt' ? 'On a hit' : 'On each body';
  const hit = effectWords(c, s.hit, s.power);
  if (hit) lines.push(`${what}: ${hit}.`);
  const burst = effectWords(c, s.burst.effects, s.power);
  if (burst && (s.burst.radius > 0 || d.type !== 'bolt')) lines.push(`${d.type === 'bolt' ? `Where it lands (${s.burst.radius.toFixed(1)} m)` : 'On the ground'}: ${burst}.`);
  if (s.friendly && d.type !== 'self') lines.push('Spares your friends.');
  return lines;
}

export function effectWords(c: Content, list: readonly Effect[], power: number): string {
  const parts: string[] = [];
  for (const e of list) {
    switch (e.type) {
      case 'damage':
        parts.push(`${Math.round(e.amount * power)} ${e.kind} damage`);
        break;
      case 'heal':
        parts.push(`heals ${Math.round(e.amount * power)}`);
        break;
      case 'restore':
        parts.push(`restores ${e.stat}`);
        break;
      case 'status':
        parts.push(`${(c.statuses[e.id]?.name ?? e.id).toLowerCase()} for ${Math.round((e.ticks * power) / 20)}s`);
        break;
      case 'cure':
        parts.push(({ fire: 'puts out flames', cold: 'drives off the chill', water: 'dries you', poison: 'cures poison' } as Record<string, string>)[e.tag] ?? `removes ${e.tag}`);
        break;
      case 'push':
        parts.push(e.force > 0 ? 'shoves' : 'lifts you up');
        break;
      case 'heat':
        parts.push('sets alight');
        break;
      case 'soak':
        parts.push('soaks');
        break;
      case 'chill':
        parts.push('chills, freezes water');
        break;
      case 'coat':
        parts.push(`spills ${e.liquid}`);
        break;
      case 'spawn':
        parts.push(`calls ${c.things[e.thing]?.name ?? e.thing}`);
        break;
    }
  }
  return [...new Set(parts)].join(', ');
}

// ── Looks ────────────────────────────────────────────────────────────────

/**
 * Blends the essences' looks into one, then lets the shape and power runes bend it. The first
 * essence leads (it sets most of the feel), the others pull it their way. A small fixed seed from
 * the rune list nudges colour and strands so even close combinations look a little different.
 * Pure and deterministic, like the rest of spellcraft.
 */
export function composeLook(essences: readonly EssencePart[], tweaks: readonly (LookTweak | undefined)[], power: number, id: string): SpellLook {
  const looks = essences.map(essenceLook);
  const lead = looks.length > 1 ? 0.6 : 1;
  const weights = looks.map((_, i) => (i === 0 ? lead : (1 - lead) / (looks.length - 1)));
  const seed = hash01(id);
  let motes = blendMotes(looks.map((l) => l.motes), weights);
  const wakes = looks.map((l, i) => ({ m: l.wake, w: weights[i] ?? 0 })).filter((x): x is { m: MoteLook; w: number } => !!x.m);
  let wake = wakes.length ? blendMotes(wakes.map((x) => x.m), wakes.map((x) => x.w)) : undefined;
  let strands = Math.max(0, ...looks.map((l) => l.strands));
  // Mixed essences twist together: one extra strand per extra essence.
  strands += looks.length - 1;
  for (const t of tweaks) {
    if (!t) continue;
    motes = tweakMotes(motes, t);
    if (wake) wake = tweakMotes(wake, t);
    strands += t.strands ?? 0;
  }
  // Stronger spells are fuller and a little bigger.
  const p = Math.max(0.3, power);
  motes = { ...motes, density: motes.density * Math.sqrt(p), size: motes.size * Math.pow(p, 0.25) };
  // The seed shifts the core colour slightly towards the edge colour or away from it.
  const shift = (seed - 0.5) * 0.3;
  motes = { ...motes, core: mixColor(motes.core, motes.edge, Math.max(0, shift)) };
  strands = Math.max(0, Math.min(5, Math.round(strands + (seed > 0.8 ? 1 : 0))));
  return wake ? { motes, wake, strands, seed } : { motes, strands, seed };
}

/** An essence's look, or plain glowing motes in its colour when it has none. */
export function essenceLook(e: EssencePart): EssenceLook {
  if (e.look) return e.look;
  const c = e.color;
  return {
    motes: { core: mixColor(c, { r: 255, g: 255, b: 255 }, 0.4), edge: c, glow: 0.8, soft: 0.3, size: 0.12, grow: -0.4, life: 0.7, lift: 0, drag: 1, swirl: 0, jitter: 0.1, density: 24, spread: 3.5, upward: 0 },
    strands: 1,
  };
}

function blendMotes(list: readonly MoteLook[], w: readonly number[]): MoteLook {
  const sum = (f: (m: MoteLook) => number): number => list.reduce((s, m, i) => s + f(m) * (w[i] ?? 0), 0);
  const col = (f: (m: MoteLook) => Color): Color => ({ r: Math.round(sum((m) => f(m).r)), g: Math.round(sum((m) => f(m).g)), b: Math.round(sum((m) => f(m).b)) });
  return {
    core: col((m) => m.core),
    edge: col((m) => m.edge),
    glow: sum((m) => m.glow),
    soft: sum((m) => m.soft),
    size: sum((m) => m.size),
    grow: sum((m) => m.grow),
    life: sum((m) => m.life),
    lift: sum((m) => m.lift),
    drag: sum((m) => m.drag),
    swirl: sum((m) => m.swirl),
    jitter: sum((m) => m.jitter),
    density: sum((m) => m.density),
    spread: sum((m) => m.spread),
    upward: sum((m) => m.upward),
  };
}

function tweakMotes(m: MoteLook, t: LookTweak): MoteLook {
  return {
    ...m,
    size: m.size * (t.size ?? 1),
    density: m.density * (t.density ?? 1),
    spread: m.spread * (t.spread ?? 1),
    life: m.life * (t.life ?? 1),
    swirl: m.swirl * (t.swirl ?? 1) + (t.swirl && t.swirl > 1 && m.swirl === 0 ? (t.swirl - 1) * 0.5 : 0),
    jitter: m.jitter * (t.jitter ?? 1),
  };
}

function mixColor(a: Color, b: Color, t: number): Color {
  return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
}

/** A stable 0..1 number from a string (FNV-1a). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
