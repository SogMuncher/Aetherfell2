import type { FormDef, PieceDef, Span, Vec3 } from '../../types';
import { pack } from '../color';
import { regionColours } from '../palette';
import { VIEW_DIRS, bounds } from './bodyArt';
import { paintSolids } from './bodyPaint';
import type { Solid } from './bodyArt';
import type { Sprite } from './sprites';

/**
 * Grows world objects (trees, rocks, haystacks, wells…) from their forms in content/forms.ts and
 * paints them with the same little ray-caster as creatures (bodyArt.ts paintSolids). A form is a
 * set of growth rules; each individual follows them with its own seed, so every oak in a wood is a
 * little different. Nothing here knows any object by name.
 *
 * The pictures keep their colour regions (bark, leaf, hoop…): the shape is painted once per
 * individual, and each placed copy lays its own colours over it (formColours), so a wood of oaks
 * grown from eight shapes still shows a different green on every tree.
 */

const DEG = Math.PI / 180;
/** Safety limit: a runaway recipe stops growing here. */
const MAX_SOLIDS = 220;

type M3 = number[];
const IDENT: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mul(a: M3, b: M3): M3 {
  const o: M3 = new Array<number>(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = (a[r * 3] ?? 0) * (b[c] ?? 0) + (a[r * 3 + 1] ?? 0) * (b[3 + c] ?? 0) + (a[r * 3 + 2] ?? 0) * (b[6 + c] ?? 0);
  return o;
}
/** Column k of a rotation: the piece's own forward (0), up (1) or side (2) axis in object space. */
function col(a: M3, k: number): [number, number, number] {
  return [a[k] ?? 0, a[3 + k] ?? 0, a[6 + k] ?? 0];
}
/** Tips the top forward (about the side axis). Same convention as creature parts. */
function tiltM(deg: number): M3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}
/** Turns about the up axis. */
function yawM(deg: number): M3 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

/** Small seeded random stream (mulberry32): the same seed grows the same individual everywhere. */
function stream(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexColor(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** One placed link of a piece: where its foot is, which way it points, how tall it is. */
interface Link {
  foot: [number, number, number];
  a: M3;
  h: number;
}

/** One grown individual of a form, ready to paint. */
export interface Grown {
  solids: Solid[];
  /** The colours it was grown with (entry 0 unused); a placed copy normally brings its own. */
  colours: Uint32Array;
  ppm: number;
  radius: number;
  top: number;
}

/**
 * Grows individual `seed` of a form: picks its colours and features, then follows every piece's
 * rules (count, where it sprouts, lean, turn, size ranges, chains and children).
 */
export function growForm(form: FormDef, seed: number): Grown {
  const rnd = stream(seed + 17);
  const pick = (s: Span | undefined, dflt = 0): number => {
    if (s === undefined) return dflt;
    if (typeof s === 'number') return s;
    return s[0] + (s[1] - s[0]) * rnd();
  };
  const slots = Object.keys(form.colors);
  const colours = formColours(form, seed);
  const regionOf = new Map(slots.map((s, i) => [s, i + 1]));
  // Colours used to be drawn from this stream; keep its place so every shape grows as before.
  for (let i = 0; i < slots.length; i++) rnd();
  const has = new Set<string>();
  for (const [f, chance] of Object.entries(form.features ?? {})) if (rnd() < chance) has.add(f);
  const wanted = (p: PieceDef): boolean => {
    if (!p.feature) return true;
    return p.feature.startsWith('!') ? !has.has(p.feature.slice(1)) : has.has(p.feature);
  };
  /** A piece's colour: a fixed one, or its region's with its own lighter or darker tone. */
  const colorOf = (c: string, shade: number): { color: number; region: number; tone: number } => {
    const region = c.startsWith('#') ? 0 : (regionOf.get(c) ?? 0);
    const base = c.startsWith('#') ? hexColor(c) : (colours[region] ?? hexColor('#ff00ff'));
    const tone = shade ? 1 + (rnd() * 2 - 1) * shade : 1;
    if (region > 0 || tone === 1) return { color: base, region, tone };
    return { color: pack((base & 255) * tone, ((base >>> 8) & 255) * tone, ((base >>> 16) & 255) * tone), region, tone: 1 };
  };

  const solids: Solid[] = [];
  const grow = (p: PieceDef, parent: Link[] | null, depth: number): void => {
    if (!wanted(p) || depth > 6) return;
    const n = Math.max(0, Math.round(pick(p.count, 1)));
    const around = p.around ?? true;
    const turn0 = p.align ? 0 : rnd() * 360;
    for (let i = 0; i < n; i++) {
      if (solids.length >= MAX_SOLIDS) return;
      if (rnd() >= (p.chance ?? 1)) continue;
      // Where it sprouts: the ground in the middle, or its parent's foot, top or somewhere along it.
      let foot: [number, number, number] = [0, 0, 0];
      let frame: M3 = IDENT;
      if (parent && parent.length) {
        const on = p.on ?? 'top';
        const link = on === 'along' ? parent[Math.floor(rnd() * parent.length)] : on === 'foot' ? parent[0] : parent[parent.length - 1];
        if (link) {
          const t = on === 'along' ? pick(p.along, 0.6) : on === 'foot' ? 0 : 1;
          const up = col(link.a, 1);
          foot = [link.foot[0] + up[0] * link.h * t, link.foot[1] + up[1] * link.h * t, link.foot[2] + up[2] * link.h * t];
          frame = link.a;
        }
      }
      const jitter = p.align ? 0 : (rnd() - 0.5) * (180 / Math.max(1, n));
      const turn = around ? turn0 + (i * 360) / Math.max(1, n) + jitter + pick(p.turn) : turn0 + pick(p.turn);
      let a = mul(frame, yawM(turn));
      const spread = pick(p.spread);
      if (spread) {
        const f = col(a, 0);
        foot = [foot[0] + f[0] * spread, foot[1] + f[1] * spread, foot[2] + f[2] * spread];
      }
      if (p.offset) {
        const [of, ou, os] = [pick(p.offset[0]), pick(p.offset[1]), pick(p.offset[2])];
        const f = col(frame, 0);
        const u = col(frame, 1);
        const s = col(frame, 2);
        foot = [foot[0] + f[0] * of + u[0] * ou + s[0] * os, foot[1] + f[1] * of + u[1] * ou + s[1] * os, foot[2] + f[2] * of + u[2] * ou + s[2] * os];
      }
      foot[1] += pick(p.raise);
      a = mul(a, tiltM(pick(p.lean)));
      const lift = pick(p.lift);
      if (lift) {
        const u = col(a, 1);
        foot = [foot[0] + u[0] * lift, foot[1] + u[1] * lift, foot[2] + u[2] * lift];
      }
      const sf = pick(p.size[0]);
      const su = pick(p.size[1]);
      const s2 = p.size[2];
      const ss = s2 === 0 ? sf : pick(s2);
      let size: [number, number, number] = [sf, su, ss];
      const links = p.chain ? Math.max(1, Math.round(pick(p.chain.links))) : 1;
      const step = p.chain?.step ?? 0.9;
      const color = colorOf(p.color, p.shade ?? 0);
      const placed: Link[] = [];
      for (let k = 0; k < links; k++) {
        if (solids.length >= MAX_SOLIDS) break;
        const h = p.shape === 'cone' ? size[1] : size[1] * 2;
        const up = col(a, 1);
        const c: [number, number, number] = p.shape === 'cone' ? [foot[0], foot[1], foot[2]] : [foot[0] + up[0] * size[1], foot[1] + up[1] * size[1], foot[2] + up[2] * size[1]];
        const lc = k === 0 || !p.shade ? color : colorOf(p.color, p.shade);
        solids.push({ shape: p.shape, c, a, size: [size[0], size[1], size[2]] as Vec3, color: lc.color, region: lc.region, tone: lc.tone, surface: p.surface ?? 'smooth' });
        placed.push({ foot: [foot[0], foot[1], foot[2]], a, h });
        if (p.chain && k < links - 1) {
          foot = [foot[0] + up[0] * h * step, foot[1] + up[1] * h * step, foot[2] + up[2] * h * step];
          const dir = rnd() * 360;
          a = mul(a, mul(yawM(dir), mul(tiltM(pick(p.chain.bend)), yawM(-dir))));
          const sh = pick(p.chain.shrink, 1);
          size = [size[0] * sh, size[1] * sh, size[2] * sh];
        }
      }
      for (const child of p.children ?? []) grow(child, placed, depth + 1);
    }
  };
  for (const p of form.pieces) grow(p, null, 0);
  const room = bounds([solids]);
  return { solids, colours, ppm: form.ppm ?? 10, radius: room.radius, top: room.top };
}

/** Colours for one placed copy of a form, one per colour region (entry 0 unused); stable per seed. */
export function formColours(form: FormDef, seed: number): Uint32Array {
  return regionColours(Object.keys(form.colors), (slot) => form.colors[slot], seed);
}

/** How many individuals a form grows. */
export function formVariants(form: FormDef): number {
  return Math.max(1, Math.round(form.variants ?? 6));
}

/** The sides a form is drawn from: 1, or 8 (every view direction creatures use). */
export function formViews(form: FormDef): number {
  return (form.views ?? VIEW_DIRS) <= 1 ? 1 : VIEW_DIRS;
}

/** Time (ms, from performance.now) until which painting new pictures is allowed this frame. */
let budgetEnd = Infinity;
/** Sets how long this frame may spend painting pictures of world objects it has not drawn before. */
export function formPaintBudget(ms: number): void {
  budgetEnd = performance.now() + ms;
}

/**
 * Every picture of one individual of a form, painted the first time a side of it is seen. When
 * the frame's painting budget is spent, an already painted side stands in for a moment.
 */
export class FormBank {
  private views: (Sprite | undefined)[];
  private grown: Grown;
  readonly nviews: number;
  constructor(
    form: FormDef,
    seed: number,
    private hand: number,
  ) {
    this.grown = growForm(form, seed);
    this.nviews = formViews(form);
    this.views = new Array<Sprite | undefined>(this.nviews);
  }

  /** The colours this individual was grown with, for a copy that brings none of its own. */
  get colours(): Uint32Array {
    return this.grown.colours;
  }

  /** Height of this individual (metres). */
  get top(): number {
    return this.grown.top;
  }

  sprite(dir: number): Sprite {
    const n = this.nviews;
    const d = n === 1 ? 0 : ((dir % n) + n) % n;
    const hit = this.views[d];
    if (hit) return hit;
    if (performance.now() > budgetEnd) {
      for (let k = 1; k <= n; k++) {
        const near = this.views[(d + (k >> 1) * (k & 1 ? 1 : -1) + n) % n];
        if (near) return near;
      }
    }
    const g = this.grown;
    const s = paintSolids(g.solids, g.ppm, (d / VIEW_DIRS) * Math.PI * 2, this.hand, g.radius, g.top);
    this.views[d] = s;
    return s;
  }
}
