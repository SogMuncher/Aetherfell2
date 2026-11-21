import type { DressDef, LookDef, PartDef, PartShape, Surface, Vec3 } from '../../types';
import { IDENT, type M3, type Xform, about, apply, compose, mul, rollM, tiltM, yawM } from './bodyMath';
import type { Sprite } from './sprites';
import { pack, rhash } from '../color';
import { paintSolids } from './bodyPaint';
import { regionColours } from '../palette';


/**
 * Builds creature sprites from their look (content/looks.ts): poses the parts for a moment of an
 * animation, then ray-casts the little solids from one of 8 directions into a pixel sprite with
 * simple shading, surface texture and a dark outline. Nothing here knows any creature by name.
 *
 * Colours are regions, not paint: each part belongs to a colour region of its look, and the
 * picture remembers which pixel belongs to which region. One picture is shared by every
 * individual with the same features; each one's own colours (types/palettes.ts) are laid over it
 * when it is drawn.
 *
 * `paintSolids` is the generic part: any code that wants a shaded 3D-ish picture from balls,
 * boxes, cones and drums (world objects, props) can use it.
 */

export type Pose = 'idle' | 'walk' | 'attack' | 'down';
export const POSES: readonly Pose[] = ['idle', 'walk', 'attack', 'down'];
export const POSE_FRAMES: Readonly<Record<Pose, number>> = { idle: 4, walk: 8, attack: 4, down: 1 };
/** Directions a creature is drawn from (0 = its right side faces the viewer's right, i.e. seen side-on). */
export const VIEW_DIRS = 8;
const DEFAULT_PPM = 18;

/** A part ready to draw: placed, turned, coloured. */
export interface Solid {
  shape: PartShape;
  /** Centre (ball, box) or base centre (cone), in [forward, up, side] metres. */
  c: [number, number, number];
  /** Columns are the part's own axes in creature space. */
  a: M3;
  size: Vec3;
  /** Packed colour (the region's colour for the first individual, so the picture reads on its own). */
  color: number;
  /** Colour region (1..), or 0 for a fixed colour. */
  region: number;
  /** Lighter or darker than its region's colour (1 = as is). */
  tone: number;
  surface: Surface;
}

/** One individual's parts after mirroring, features and colour choices. */
interface BodyPart {
  def: PartDef;
  id: string | undefined;
  parent: string | undefined;
  at: Vec3;
  pivot: Vec3;
  yaw: number;
  roll: number;
  phase: number;
  rest: M3;
  color: number;
  region: number;
}

export interface Individual {
  /** Same for every individual sharing one picture (same look and features; colours are laid over it). */
  key: string;
  /** This individual's colour for each region (entry 0 unused). */
  colours: Uint32Array;
  look: LookDef;
  parts: BodyPart[];
  ppm: number;
}

function hexColor(h: string): number {
  const n = parseInt(h.slice(1), 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/**
 * Picks colours and features for one individual (stable per `seed`), applies dress from its job,
 * mirrors paired parts and drops parts for features it lacks.
 */
export function individual(lookId: string, look: LookDef, seed: number, dress?: DressDef): Individual {
  const slots = Object.keys(look.colors);
  const colours = regionColours(slots, (slot) => dress?.colors?.[slot] ?? look.colors[slot], seed);
  const regionOf = new Map(slots.map((s, i) => [s, i + 1]));
  const has = new Set<string>();
  Object.entries(look.features ?? {}).forEach(([f, chance], i) => {
    if (rhash(seed, i, 91) < chance) has.add(f);
  });
  for (const f of dress?.features ?? []) has.add(f);
  for (const f of dress?.without ?? []) has.delete(f);
  const wanted = (p: PartDef): boolean => {
    if (!p.feature) return true;
    return p.feature.startsWith('!') ? !has.has(p.feature.slice(1)) : has.has(p.feature);
  };
  const mirrored = new Set(look.parts.filter((p) => p.mirror && p.id).map((p) => p.id));
  const out: BodyPart[] = [];
  const colorOf = (c: string): number => (c.startsWith('#') ? hexColor(c) : (colours[regionOf.get(c) ?? 0] ?? hexColor('#ff00ff')));
  const regionFor = (c: string): number => (c.startsWith('#') ? 0 : (regionOf.get(c) ?? 0));
  for (const p of look.parts) {
    if (!wanted(p)) continue;
    const base: BodyPart = {
      def: p,
      id: p.id,
      parent: p.parent,
      at: p.at,
      pivot: p.pivot ?? p.at,
      yaw: p.yaw ?? 0,
      roll: p.roll ?? 0,
      phase: p.stride?.phase ?? 0,
      rest: IDENT,
      color: colorOf(p.color),
      region: regionFor(p.color),
    };
    out.push(base);
    if (p.mirror) {
      out.push({
        ...base,
        id: p.id ? `${p.id}~` : undefined,
        parent: p.parent && mirrored.has(p.parent) ? `${p.parent}~` : p.parent,
        at: [p.at[0], p.at[1], -p.at[2]],
        pivot: [base.pivot[0], base.pivot[1], -base.pivot[2]],
        yaw: -base.yaw,
        roll: -base.roll,
        phase: look.gait.hop ? base.phase : base.phase + 0.5,
      });
    }
  }
  for (const b of out) b.rest = mul(yawM(b.yaw), mul(tiltM(b.def.tilt ?? 0), rollM(b.roll)));
  const key = `${lookId}|${[...has].sort().join(',')}`;
  return { key, colours, look, parts: out, ppm: look.ppm ?? DEFAULT_PPM };
}

/** How strongly the strike swing and the lunge apply on each attack frame (wind up, peak, follow through). */
const STRIKE_K = [0.6, 1, 0.45, 0.15];
const LUNGE_K = [-0.3, 0, 1, 0.4];

/** Places every part for frame `frame` of `pose`. */
export function poseSolids(ind: Individual, pose: Pose, frame: number): Solid[] {
  const g = ind.look.gait;
  const t = frame / POSE_FRAMES[pose];
  const byId = new Map<string, BodyPart>();
  for (const p of ind.parts) if (p.id) byId.set(p.id, p);
  const placed = new Map<BodyPart, Xform>();
  const strikeK = pose === 'attack' ? (STRIKE_K[frame] ?? 0) : 0;
  const swingOf = (p: BodyPart): number => {
    let a = 0;
    if (pose === 'walk' && p.def.stride) a += p.def.stride.swing * Math.sin((t + p.phase) * Math.PI * 2);
    if (pose === 'idle' && p.def.idle) a += p.def.idle * Math.sin((t + p.phase) * Math.PI * 2);
    if (p.def.strike) a += p.def.strike * strikeK;
    return a;
  };
  const place = (p: BodyPart, depth: number): Xform => {
    const hit = placed.get(p);
    if (hit) return hit;
    const own = about(tiltM(swingOf(p)), p.pivot);
    const parent = p.parent ? byId.get(p.parent) : undefined;
    const x = parent && depth < 16 ? compose(place(parent, depth + 1), own) : own;
    placed.set(p, x);
    return x;
  };
  // The whole body: bounce while walking, lean and lunge into a strike, lie on its side when down.
  let body: Xform = { a: IDENT, b: [0, 0, 0] };
  if (pose === 'walk') {
    const rise = g.hop ? g.bounce * Math.max(0, Math.sin(t * Math.PI * 2)) : g.bounce * (0.5 - 0.5 * Math.cos(t * Math.PI * 4));
    body = { a: IDENT, b: [0, rise, 0] };
  } else if (pose === 'attack' && ind.look.attack) {
    const k = LUNGE_K[frame] ?? 0;
    body = compose({ a: IDENT, b: [ind.look.attack.lunge * k, 0, 0] }, about(tiltM(ind.look.attack.lean * k), [0, 0, 0]));
  } else if (pose === 'down') {
    body = about(rollM(88), [0, 0, 0]);
  }
  const out: Solid[] = [];
  for (const p of ind.parts) {
    const x = compose(body, place(p, 0));
    const c = apply(x.a, p.at[0], p.at[1], p.at[2]);
    out.push({ shape: p.def.shape, c: [c[0] + x.b[0], c[1] + x.b[1], c[2] + x.b[2]], a: mul(x.a, p.rest), size: p.def.size, color: p.color, region: p.region, tone: 1, surface: p.def.surface ?? 'smooth' });
  }
  if (pose === 'down') {
    // Rest on the ground.
    let low = Infinity;
    for (const s of out) low = Math.min(low, s.c[1] + extentMin(s, 1));
    if (Number.isFinite(low)) for (const s of out) s.c[1] -= low;
  }
  return out;
}

/** How far a solid reaches along creature axis k (0 forward, 1 up, 2 side): [centre offset, half extent]. */
function extent(s: Solid, k: number): [number, number] {
  const r0 = s.a[k * 3] ?? 0;
  const r1 = s.a[k * 3 + 1] ?? 0;
  const r2 = s.a[k * 3 + 2] ?? 0;
  if (s.shape === 'ball') return [0, Math.hypot(r0 * s.size[0], r1 * s.size[1], r2 * s.size[2])];
  if (s.shape === 'box') return [0, Math.abs(r0 * s.size[0]) + Math.abs(r1 * s.size[1]) + Math.abs(r2 * s.size[2])];
  if (s.shape === 'drum') return [0, Math.abs(r1 * s.size[1]) + Math.hypot(r0 * s.size[0], r2 * s.size[2])];
  // Cone: a box from its base to its tip.
  return [r1 * s.size[1] * 0.5, Math.abs(r0 * s.size[0]) + Math.abs(r1 * s.size[1] * 0.5) + Math.abs(r2 * s.size[2])];
}
function extentMin(s: Solid, k: number): number {
  const [o, h] = extent(s, k);
  return o - h;
}

/** Room a set of poses needs: radius around the feet and height. */
export function bounds(sets: readonly Solid[][]): { radius: number; top: number } {
  let radius = 0.1;
  let top = 0.1;
  for (const set of sets) {
    for (const s of set) {
      const [of, hf] = extent(s, 0);
      const [ou, hu] = extent(s, 1);
      const [os, hs] = extent(s, 2);
      radius = Math.max(radius, Math.hypot(Math.abs(s.c[0] + of) + hf, Math.abs(s.c[2] + os) + hs));
      top = Math.max(top, s.c[1] + ou + hu);
    }
  }
  return { radius, top };
}

/**
 * Every sprite of one individual, painted the first time it is needed. Frames of a pose share one
 * canvas size so the body does not jump between frames.
 */
export class BodyBank {
  private frames: (Sprite | undefined)[] = [];
  private room = new Map<Pose, { radius: number; top: number }>();
  constructor(
    readonly ind: Individual,
    private hand: number,
  ) {}

  sprite(pose: Pose, frame: number, dir: number): Sprite {
    const nf = POSE_FRAMES[pose];
    const f = ((frame % nf) + nf) % nf;
    const d = ((dir % VIEW_DIRS) + VIEW_DIRS) % VIEW_DIRS;
    const idx = (POSES.indexOf(pose) * 8 + f) * VIEW_DIRS + d;
    const hit = this.frames[idx];
    if (hit) return hit;
    let room = this.room.get(pose);
    if (!room) {
      const sets: Solid[][] = [];
      for (let i = 0; i < nf; i++) sets.push(poseSolids(this.ind, pose, i));
      room = bounds(sets);
      this.room.set(pose, room);
    }
    const s = paintSolids(poseSolids(this.ind, pose, f), this.ind.ppm, (d / VIEW_DIRS) * Math.PI * 2, this.hand, room.radius, room.top);
    this.frames[idx] = s;
    return s;
  }
}
