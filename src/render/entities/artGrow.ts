// Builds one individual of any art recipe into placed solids: fixed parts at their spots (joints), grown parts by their rules
import type { ArtDef, ArtPart, DressDef, PartShape, Span, Surface, Vec3 } from '../../types';
import { pack } from '../color';
import { regionColours } from '../palette';
import { IDENT, type M3, mul, rollM, tiltM, yawM } from './bodyMath';

/**
 * The one builder behind every procedural sprite (creatures, trees, rocks, props). Nothing here
 * knows any thing by name: it reads the parts of an ArtDef (types/art.ts). Each individual follows
 * the rules with its own seed, so one recipe gives a wood of different oaks or a pack of wolves.
 */

/** A part ready to draw: placed, turned, coloured. */
export interface Solid {
  shape: PartShape;
  /** Centre (ball, box, drum) or base centre (cone), in [forward, up, side] metres. */
  c: [number, number, number];
  /** Columns are the part's own axes in the thing's space. */
  a: M3;
  size: Vec3;
  /** Packed colour (the region's colour for the first individual, so the picture reads on its own). */
  color: number;
  /** Colour region (1..), or 0 for a fixed colour. */
  region: number;
  /** Lighter or darker than its region's colour (1 = as is). */
  tone: number;
  surface: Surface;
  /** The joint it moves with (index into Built.joints), or -1. */
  joint: number;
  /** An item drawn here as its flat picture (ArtPart.card), not ray-cast. */
  card?: string;
}

/** A fixed part that can swing: a leg, a head, a tail. */
export interface Joint {
  part: ArtPart;
  /** The joint it hangs from, or -1. */
  parent: number;
  pivot: Vec3;
  /** Where in the stride it is furthest forward (0..1). */
  phase: number;
}

export interface Built {
  solids: Solid[];
  joints: Joint[];
  /** The features this individual has, sorted. */
  features: string[];
}

/** Safety limit: a runaway recipe stops growing here. */
const MAX_SOLIDS = 220;
/** Reflects the side axis (a mirrored copy of a part). */
const MIRROR: M3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

/** Column k of a rotation: the part's own forward (0), up (1) or side (2) axis. */
function col(a: M3, k: number): [number, number, number] {
  return [a[k] ?? 0, a[3 + k] ?? 0, a[6 + k] ?? 0];
}

/** Small seeded random stream (mulberry32): the same seed builds the same individual everywhere. */
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

/** Colours for one individual or placed copy, one per colour region (entry 0 unused); stable per seed. */
export function artColours(def: ArtDef, seed: number, dress?: DressDef): Uint32Array {
  return regionColours(Object.keys(def.colors), (slot) => dress?.colors?.[slot] ?? def.colors[slot], seed);
}

/** Features of individual `seed` (its own chances, then what its dress adds or takes away), sorted. */
function featuresOf(def: ArtDef, rnd: () => number, dress?: DressDef): Set<string> {
  // The stream once picked colours first; keep its place so every shape grows as before.
  for (let i = 0; i < Object.keys(def.colors).length; i++) rnd();
  const has = new Set<string>();
  for (const [f, chance] of Object.entries(def.features ?? {})) if (rnd() < chance) has.add(f);
  for (const f of dress?.features ?? []) has.add(f);
  for (const f of dress?.without ?? []) has.delete(f);
  return has;
}

/** The features individual `seed` has, without building it (to share pictures). */
export function artFeatures(def: ArtDef, seed: number, dress?: DressDef): string[] {
  return [...featuresOf(def, stream(seed + 17), dress)].sort();
}

/** One placed link of a part: where its foot is, which way it points, how tall, which joint it moves with. */
interface Link {
  foot: [number, number, number];
  a: M3;
  h: number;
  joint: number;
}

/** Builds individual `seed` of an art recipe. */
export function buildArt(def: ArtDef, seed: number, dress?: DressDef): Built {
  const rnd = stream(seed + 17);
  const pick = (s: Span | undefined, dflt = 0): number => (s === undefined ? dflt : typeof s === 'number' ? s : s[0] + (s[1] - s[0]) * rnd());
  const colours = artColours(def, seed);
  const regionOf = new Map(Object.keys(def.colors).map((s, i) => [s, i + 1]));
  const has = featuresOf(def, rnd, dress);
  const wanted = (p: ArtPart): boolean => !p.feature || (p.feature.startsWith('!') ? !has.has(p.feature.slice(1)) : has.has(p.feature));
  /** A part's colour: a fixed one, or its region's with its own lighter or darker tone. */
  const colorOf = (c: string, shade: number): { color: number; region: number; tone: number } => {
    const region = c.startsWith('#') ? 0 : (regionOf.get(c) ?? 0);
    const base = c.startsWith('#') ? hexColor(c) : (colours[region] ?? hexColor('#ff00ff'));
    const tone = shade ? 1 + (rnd() * 2 - 1) * shade : 1;
    if (region > 0 || tone === 1) return { color: base, region, tone };
    return { color: pack((base & 255) * tone, ((base >>> 8) & 255) * tone, ((base >>> 16) & 255) * tone), region, tone: 1 };
  };
  const sizeOf = (p: ArtPart): [number, number, number] => {
    const sf = pick(p.size[0]);
    const su = pick(p.size[1]);
    return [sf, su, p.size[2] === 0 ? sf : pick(p.size[2])];
  };
  const linkOf = (shape: PartShape, c: [number, number, number], a: M3, size: [number, number, number], joint: number): Link => {
    if (shape === 'cone') return { foot: [c[0], c[1], c[2]], a, h: size[1], joint };
    const up = col(a, 1);
    return { foot: [c[0] - up[0] * size[1], c[1] - up[1] * size[1], c[2] - up[2] * size[1]], a, h: size[1] * 2, joint };
  };

  const solids: Solid[] = [];
  const joints: (Joint & { name?: string; parentName?: string })[] = [];
  const mirrored = new Set<string>();
  const scan = (p: ArtPart): void => {
    if (p.mirror && p.id) mirrored.add(p.id);
    for (const c of p.children ?? []) scan(c);
  };
  def.parts.forEach(scan);

  /** A fixed part (and its mirrored twin): one joint each. */
  const fixed = (p: ArtPart, at: Vec3, depth: number): void => {
    const rest = mul(yawM(p.yaw ?? 0), mul(tiltM(p.tilt ?? 0), rollM(p.roll ?? 0)));
    const pivot0 = p.pivot ?? at;
    for (const side of p.mirror ? [1, -1] : [1]) {
      if (solids.length >= MAX_SOLIDS) return;
      const m = side < 0;
      const joint = joints.length;
      joints.push({
        part: p,
        parent: -1,
        pivot: [pivot0[0], pivot0[1], pivot0[2] * side],
        phase: (p.stride?.phase ?? 0) + (m && !def.gait?.hop ? 0.5 : 0),
        name: p.id ? (m ? `${p.id}~` : p.id) : undefined,
        parentName: p.parent ? (m && mirrored.has(p.parent) ? `${p.parent}~` : p.parent) : undefined,
      });
      const a = m ? mul(MIRROR, mul(rest, MIRROR)) : rest;
      const c: [number, number, number] = [at[0], at[1], at[2] * side];
      const size = sizeOf(p);
      const lc = colorOf(p.color, p.shade ?? 0);
      solids.push({ shape: p.shape, c, a, size, color: lc.color, region: lc.region, tone: lc.tone, surface: dress?.surfaces?.[p.color] ?? p.surface ?? 'smooth', joint, ...(p.card ? { card: p.card } : {}) });
      const link = linkOf(p.shape, c, a, size, joint);
      for (const child of p.children ?? []) grow(child, [link], depth + 1);
    }
  };

  const grow = (p: ArtPart, parent: Link[] | null, depth: number): void => {
    if (!wanted(p) || depth > 6) return;
    if (p.at) return fixed(p, p.at, depth);
    const n = Math.max(0, Math.round(pick(p.count, 1)));
    const around = p.around ?? true;
    const turn0 = p.align ? 0 : rnd() * 360;
    for (let i = 0; i < n; i++) {
      if (solids.length >= MAX_SOLIDS) return;
      if (rnd() >= (p.chance ?? 1)) continue;
      // Where it sprouts: the ground in the middle, or its parent's foot, top or somewhere along it.
      let foot: [number, number, number] = [0, 0, 0];
      let frame: M3 = IDENT;
      let joint = -1;
      if (parent && parent.length) {
        const on = p.on ?? 'top';
        const link = on === 'along' ? parent[Math.floor(rnd() * parent.length)] : on === 'foot' ? parent[0] : parent[parent.length - 1];
        if (link) {
          const t = on === 'along' ? pick(p.along, 0.6) : on === 'foot' ? 0 : 1;
          const up = col(link.a, 1);
          foot = [link.foot[0] + up[0] * link.h * t, link.foot[1] + up[1] * link.h * t, link.foot[2] + up[2] * link.h * t];
          frame = link.a;
          joint = link.joint;
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
      let size = sizeOf(p);
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
        solids.push({ shape: p.shape, c, a, size: [size[0], size[1], size[2]], color: lc.color, region: lc.region, tone: lc.tone, surface: dress?.surfaces?.[p.color] ?? p.surface ?? 'smooth', joint });
        placed.push({ foot: [foot[0], foot[1], foot[2]], a, h, joint });
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
  for (const p of def.parts) grow(p, null, 0);
  const byName = new Map<string, number>();
  joints.forEach((j, i) => j.name && byName.set(j.name, i));
  for (const j of joints) j.parent = j.parentName ? (byName.get(j.parentName) ?? -1) : -1;
  const st = dress?.stretch;
  if (st) {
    // Each solid keeps its place relative to the others; its own axes stretch by how they line up with the stretch.
    for (const s of solids) {
      s.c = [s.c[0] * st[0], s.c[1] * st[1], s.c[2] * st[2]];
      const k = (ax: number): number => Math.hypot((s.a[ax] ?? 0) * st[0], (s.a[3 + ax] ?? 0) * st[1], (s.a[6 + ax] ?? 0) * st[2]);
      s.size = [s.size[0] * k(0), s.size[1] * k(1), s.size[2] * k(2)];
    }
    for (const j of joints) j.pivot = [j.pivot[0] * st[0], j.pivot[1] * st[1], j.pivot[2] * st[2]];
  }
  return { solids, joints, features: [...has].sort() };
}
