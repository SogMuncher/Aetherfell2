// The one sprite assembler: builds any art recipe (creature, tree, prop), poses it and paints it from 8 sides, on demand
import type { ArtDef, ArtId, DressDef, MoveId, Turn } from '../../types';
import { CONTENT } from '../../content';
import { IDENT, type Xform, about, apply, compose, mul, rollM, tiltM, yawM } from './bodyMath';
import { paintSolids } from './bodyPaint';
import type { CardSource } from './paintFinish';
import { artColours, buildArt, type Built, type Solid } from './artGrow';
import type { Sprite } from './sprites';

/**
 * Every procedural sprite goes through here. An individual is one of a recipe's `variants` shapes
 * (with its features); colours are regions laid over the shared picture per placed thing, so a
 * wood of oaks or a pack of wolves shares a few pictures yet no two look alike. Things with a gait
 * have walk, rest and knocked-down poses and every body move (content/moves.ts); everything else has one still pose.
 */

/** What a thing is doing in a picture: standing, walking, knocked down, or one of the body moves (content/moves.ts). */
export type Pose = 'idle' | 'walk' | 'down' | MoveId;
export const POSES: readonly Pose[] = ['idle', 'walk', 'down', 'overhead', 'thrust', 'left', 'right', 'throw'];
/** Pictures along a move: half wound, wound up (held while charging), mid-swing, release, follow-through, settling back. */
export const MOVE_FRAMES = 6;
const POSE_FRAMES: Readonly<Record<'idle' | 'walk' | 'down', number>> = { idle: 4, walk: 8, down: 1 };
/** Each move frame as [from key, to key, share]: key -1 = at rest, 0 wound up, 1 release, 2 follow-through. */
const MOVE_STEPS: readonly (readonly [number, number, number])[] = [[-1, 0, 0.5], [0, 0, 0], [0, 1, 0.5], [1, 1, 0], [2, 2, 0], [2, -1, 0.5]];
const isMove = (pose: Pose): pose is MoveId => pose !== 'idle' && pose !== 'walk' && pose !== 'down';
/** Directions a thing is drawn from (0 = seen side-on, its right side to the viewer's right). */
export const VIEW_DIRS = 8;
const DEFAULT_PPM = 10;

/** One built individual, ready to pose and paint. */
export interface Assembled extends Built {
  /** Same for every individual sharing this picture (recipe, variant, features). */
  key: string;
  def: ArtDef;
  /** The colours it was built with (entry 0 unused); a placed copy normally brings its own. */
  colours: Uint32Array;
  ppm: number;
}

/** How many shapes a recipe builds. */
export function artVariants(def: ArtDef): number {
  return Math.max(1, Math.round(def.variants ?? 6));
}
/** The sides it is drawn from: 1, or 8. */
export function artViews(def: ArtDef): number {
  return (def.views ?? VIEW_DIRS) <= 1 ? 1 : VIEW_DIRS;
}
/** Frames in a pose: only things with a gait move. */
export function poseFrames(def: ArtDef, pose: Pose): number {
  return def.gait ? (isMove(pose) ? MOVE_FRAMES : POSE_FRAMES[pose]) : 1;
}
/** The seed shape `variant` of recipe `id` is built from. */
export function variantSeed(id: ArtId, variant: number): number {
  return variant * 7919 + id.length * 131 + id.charCodeAt(0);
}

/** Builds shape `variant` of recipe `id` (dress from a job adds features and colour choices). */
export function assemble(id: ArtId, def: ArtDef, variant: number, dress?: DressDef): Assembled {
  const seed = variantSeed(id, variant);
  const built = buildArt(def, seed, dress);
  return { ...built, key: `${id}|${variant}|${built.features.join(',')}`, def, colours: artColours(def, seed, dress), ppm: def.ppm ?? DEFAULT_PPM };
}

const ZERO: Turn = [0, 0, 0];
/** Key k of a move for one role (-1 = at rest). */
const keyTurn = (keys: { windup: Turn; strike: Turn; follow: Turn } | undefined, k: number): Turn => (!keys || k < 0 ? ZERO : k === 0 ? keys.windup : k === 1 ? keys.strike : keys.follow);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Places every solid for frame `frame` of `pose`: joints swing about their pivots, the body bounces, lunges or lies down. */
export function poseSolids(asm: Assembled, pose: Pose, frame: number): Solid[] {
  const def = asm.def;
  const g = def.gait;
  // A walk runs its cycle backwards: tilts tip the top forward, so a falling wave is the foot swinging forward (lifted, knee bent).
  const t = (pose === 'walk' ? -frame : frame) / poseFrames(def, pose);
  const move = isMove(pose) ? CONTENT.moves[pose] : undefined;
  const step = MOVE_STEPS[frame] ?? MOVE_STEPS[0]!;
  const placed: (Xform | undefined)[] = new Array<Xform | undefined>(asm.joints.length);
  const place = (j: number, depth: number): Xform => {
    const hit = placed[j];
    if (hit) return hit;
    const jt = asm.joints[j];
    if (!jt) return { a: IDENT, b: [0, 0, 0] };
    const p = jt.part;
    let swing = 0;
    const wave = Math.sin((t + jt.phase) * Math.PI * 2);
    if (pose === 'walk' && p.stride) swing += p.stride.swing * (p.stride.fold ? Math.max(0, wave) : wave);
    if (pose === 'idle' && p.idle) swing += p.idle * wave;
    let turn = ZERO;
    if (move && p.act) {
      const keys = move.roles[p.act];
      const a = keyTurn(keys, step[0]);
      const b = keyTurn(keys, step[1]);
      turn = [mix(a[0], b[0], step[2]), mix(a[1], b[1], step[2]) * jt.side, mix(a[2], b[2], step[2]) * jt.side];
    }
    let own = about(mul(yawM(turn[1]), mul(tiltM(swing + turn[0]), rollM(turn[2]))), jt.pivot);
    const lift = pose === 'walk' ? (p.stride?.lift ?? 0) * Math.max(0, Math.cos((t + jt.phase) * Math.PI * 2)) : 0;
    if (lift) own = compose({ a: IDENT, b: [0, lift, 0] }, own);
    const x = jt.parent >= 0 && depth < 16 ? compose(place(jt.parent, depth + 1), own) : own;
    placed[j] = x;
    return x;
  };
  let body: Xform = { a: IDENT, b: [0, 0, 0] };
  if (pose === 'walk' && g) {
    const rise = g.hop ? g.bounce * Math.max(0, Math.sin(t * Math.PI * 2)) : g.bounce * (0.5 - 0.5 * Math.cos(t * Math.PI * 4));
    body = { a: IDENT, b: [0, rise, 0] };
    if (g.sway && !g.hop) body = compose(body, about(rollM(g.sway * Math.sin(t * Math.PI * 2)), [0, 0, 0]));
  } else if (move && def.attack) {
    const at = (k: number): number => (k < 0 ? 0 : (move.body[k] ?? 0));
    const k = mix(at(step[0]), at(step[1]), step[2]);
    body = compose({ a: IDENT, b: [def.attack.lunge * k, 0, 0] }, about(tiltM(def.attack.lean * k), [0, 0, 0]));
  } else if (pose === 'down') {
    body = about(rollM(88), [0, 0, 0]);
  }
  if (def.tilt) body = compose(about(tiltM(def.tilt), [0, 0, 0]), body);
  const out: Solid[] = [];
  for (const s of asm.solids) {
    const x = s.joint >= 0 ? compose(body, place(s.joint, 0)) : body;
    const c = apply(x.a, s.c[0], s.c[1], s.c[2]);
    out.push({ ...s, c: [c[0] + x.b[0], c[1] + x.b[1], c[2] + x.b[2]], a: mul(x.a, s.a) });
  }
  if (pose === 'down') {
    // Rest on the ground.
    let low = Infinity;
    for (const s of out) low = Math.min(low, s.c[1] + extentMin(s, 1));
    if (Number.isFinite(low)) for (const s of out) s.c[1] -= low;
  }
  return out;
}

/** How far a solid reaches along axis k (0 forward, 1 up, 2 side): [centre offset, half extent]. */
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

/** The box a set of solids fills: [min, max] along forward, up and side. */
export function solidBox(solids: readonly Solid[]): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const s of solids) {
    for (let k = 0; k < 3; k++) {
      const [o, h] = extent(s, k);
      min[k] = Math.min(min[k] ?? 0, (s.c[k] ?? 0) + o - h);
      max[k] = Math.max(max[k] ?? 0, (s.c[k] ?? 0) + o + h);
    }
  }
  return { min, max };
}

/** Room a set of poses needs: radius around the foot and height. */
function bounds(sets: readonly Solid[][]): { radius: number; top: number } {
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

/** Time (ms, from performance.now) until which painting new pictures is allowed this frame. */
let budgetEnd = Infinity;
/** Sets how long this frame may spend painting pictures it has not drawn before. */
export function artPaintBudget(ms: number): void {
  budgetEnd = performance.now() + ms;
}

/**
 * Every picture of one individual, painted the first time it is needed. Frames of a pose share one
 * canvas size so the body does not jump. When the frame's painting budget is spent, an already
 * painted moment seen from the same side stands in (never another side: it would face the wrong way).
 */
export class ArtBank {
  private pics: (Sprite | undefined)[] = [];
  private room = new Map<Pose, { radius: number; top: number }>();
  readonly nviews: number;
  constructor(
    readonly asm: Assembled,
    private hand: number,
    /** Pictures for flat card parts (held items). */
    private cards?: CardSource,
  ) {
    this.nviews = artViews(asm.def);
  }

  /** The colours this individual was built with, for a copy that brings none of its own. */
  get colours(): Uint32Array {
    return this.asm.colours;
  }

  /** Height standing still (metres). */
  get top(): number {
    return this.roomOf('idle').top;
  }

  private roomOf(pose: Pose): { radius: number; top: number } {
    let room = this.room.get(pose);
    if (!room) {
      const sets: Solid[][] = [];
      for (let i = 0; i < poseFrames(this.asm.def, pose); i++) sets.push(poseSolids(this.asm, pose, i));
      room = bounds(sets);
      this.room.set(pose, room);
    }
    return room;
  }

  sprite(pose: Pose, frame: number, dir: number): Sprite {
    const nf = poseFrames(this.asm.def, pose);
    const f = ((frame % nf) + nf) % nf;
    const n = this.nviews;
    const d = n === 1 ? 0 : ((dir % n) + n) % n;
    const base = (POSES.indexOf(pose) * 8 + f) * VIEW_DIRS;
    const hit = this.pics[base + d];
    if (hit) return hit;
    if (performance.now() > budgetEnd) {
      // Out of time: stand in with a picture that FACES THE SAME WAY (another moment of this pose,
      // then of any pose), so it never turns sideways; one side it was never drawn from is painted anyway.
      for (let k = 1; k < nf; k++) {
        const near = this.pics[(POSES.indexOf(pose) * 8 + ((f + k) % nf)) * VIEW_DIRS + d];
        if (near) return near;
      }
      for (let i = 0; i < POSES.length * 8; i++) {
        const near = this.pics[i * VIEW_DIRS + d];
        if (near) return near;
      }
    }
    const room = this.roomOf(pose);
    const s = paintSolids(poseSolids(this.asm, pose, f), this.asm.ppm, (d / VIEW_DIRS) * Math.PI * 2, this.hand, room.radius, room.top, this.cards);
    this.pics[base + d] = s;
    return s;
  }
}
