import type { ItemDef, ItemLook, VesselBody, WeaponStats } from '../../types';
import { pack, rhash } from '../color';
import { swatch } from '../palette';

/**
 * Item pictures, built from the item's definition rather than drawn by hand.
 *
 * Every picture starts from one of a few shared base shapes ("forms"): a vessel, a bladed or
 * hafted weapon, a coin, a key, a loaf, a pelt, a shard, a stone and so on. The definition then
 * decides the details: a potion is a glass flask filled to its level with its own liquid colour,
 * a weapon's length follows its reach, its blade or head grows with damage and weight, a cheap or
 * worn blade has nicks and rust, a valuable one a gilded guard and a gem. Nothing here names an
 * item id, so a new item in content/items.ts gets a fitting picture with no new art. To steer a
 * picture, give the item a `look` (types/defs.ts ItemLook); anything left out is worked out here.
 *
 * Shapes are written in 0..1 picture coordinates, so ITEM_ART can change freely.
 */

/** Side length of every item picture, in pixels. The bag shows it at 2×; the world uses it as a billboard. */
export const ITEM_ART = 20;

type Rgb = readonly [number, number, number];

function rgb(c: number): Rgb {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}
function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k];
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lum(c: Rgb): number {
  return (c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15) / 255;
}

// The everyday materials items are made of. They start as these, and each item kind then picks its
// own from the palettes (content/palettes.ts) before it is painted, so one sword's grip is darker
// leather than another's and no two pots are the same clay.
let WOOD: Rgb = [120, 84, 50];
let CORK: Rgb = [150, 112, 70];
const GLASS: Rgb = [200, 220, 232];
let CLAY: Rgb = [150, 92, 58];
let LEATHER: Rgb = [92, 60, 36];
let GOLD: Rgb = [214, 176, 72];
let BRONZE: Rgb = [150, 112, 64];
const BONE: Rgb = [230, 220, 200];
let STONE: Rgb = [130, 128, 136];
const RUST: Rgb = [140, 74, 40];
const WHITE: Rgb = [255, 255, 255];

function unpack(c: number): Rgb {
  return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255];
}
/** Picks this item kind's own materials from the palettes. */
function materialsFor(seed: number): void {
  WOOD = unpack(swatch('@haft', seed, 11));
  CORK = unpack(swatch('@plank', seed, 12));
  CLAY = unpack(swatch('@clay', seed, 13));
  LEATHER = unpack(swatch('@leather', seed, 14));
  GOLD = unpack(swatch('@gold', seed, 15));
  BRONZE = unpack(swatch('@brass', seed, 16));
  STONE = unpack(swatch('@stone', seed, 17));
}

/** A picture being painted. Shapes are fragment tests: given a pixel centre (u, v), return its colour or null. */
class Pix {
  readonly px = new Uint32Array(ITEM_ART * ITEM_ART);
  paint(frag: (u: number, v: number, x: number, y: number) => Rgb | null): void {
    for (let y = 0; y < ITEM_ART; y++) {
      for (let x = 0; x < ITEM_ART; x++) {
        const c = frag((x + 0.5) / ITEM_ART, (y + 0.5) / ITEM_ART, x, y);
        if (c) this.px[y * ITEM_ART + x] = pack(c[0], c[1], c[2]);
      }
    }
  }
  dot(u: number, v: number, c: Rgb): void {
    const x = Math.floor(u * ITEM_ART);
    const y = Math.floor(v * ITEM_ART);
    if (x >= 0 && y >= 0 && x < ITEM_ART && y < ITEM_ART) this.px[y * ITEM_ART + x] = pack(c[0], c[1], c[2]);
  }
  /** Dark rim round every painted pixel so items read against any background. */
  outline(): void {
    const src = this.px.slice();
    const rim = pack(18, 14, 10);
    const N = ITEM_ART;
    const on = (i: number, j: number): boolean => i >= 0 && j >= 0 && i < N && j < N && (src[j * N + i] ?? 0) !== 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (src[y * N + x]) continue;
        if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) this.px[y * N + x] = rim;
      }
    }
  }
}

/** Light from the top left: a rounded object is brighter where its surface faces up-left. */
function lit(c: Rgb, nx: number, ny: number): Rgb {
  const d = nx * nx + ny * ny;
  return scale(c, 0.72 + Math.max(0, -nx - ny) * 0.32 - d * 0.18);
}

/** An ellipse fragment, lit as a dome. */
function blob(cx: number, cy: number, rx: number, ry: number, c: Rgb, flat = false): (u: number, v: number) => Rgb | null {
  return (u, v) => {
    const nx = (u - cx) / rx;
    const ny = (v - cy) / ry;
    if (nx * nx + ny * ny > 1) return null;
    return flat ? c : lit(c, nx, ny);
  };
}

/** Coordinates along a line: t is 0 at the start and 1 at the end, s the signed distance across it. */
interface Axis {
  x0: number;
  y0: number;
  dx: number;
  dy: number;
  len: number;
}
function axis(x0: number, y0: number, x1: number, y1: number): Axis {
  const dx = x1 - x0;
  const dy = y1 - y0;
  return { x0, y0, dx, dy, len: Math.hypot(dx, dy) };
}
function along(a: Axis, u: number, v: number): { t: number; s: number } {
  const px = u - a.x0;
  const py = v - a.y0;
  const t = (px * a.dx + py * a.dy) / (a.len * a.len);
  // Positive s is the right-hand side when looking from start to end (the lower-right in pictures).
  const s = (px * -a.dy + py * a.dx) / a.len;
  return { t, s };
}

/** A seeded number for this item, so two items of the same form still differ a little. */
function seedOf(def: ItemDef): number {
  let h = 7;
  for (let i = 0; i < def.name.length; i++) h = (h * 31 + def.name.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Deciding the look

/** Everything a form needs, with every gap filled in from the definition. */
interface Look {
  form: string;
  body: VesselBody;
  fill: Rgb;
  level: number;
  shell: Rgb | null;
  glow: Rgb | null;
  sparkle: boolean;
  size: number;
  seed: number;
}

/** The base shape of an item's picture and of the weapon in your hand: named by its look, else worked out from what it does. */
export function itemForm(def: ItemDef): string {
  return def.look?.form ?? defaultForm(def);
}

/** The base form an item gets when its definition does not name one, worked out from what it does. */
function defaultForm(def: ItemDef): string {
  const w = def.weapon;
  if (w) {
    if (w.kind === 'pierce') return w.reach >= 2.4 ? 'spear' : 'blade';
    if (w.kind === 'blunt') return w.push >= 1.8 ? 'hammer' : 'club';
    return w.speed >= 1.2 && w.push >= 1.1 ? 'axe' : 'blade';
  }
  if (def.glide) return 'bundle';
  if (def.teaches) return 'stone';
  switch (def.category) {
    case 'currency':
      return 'coin';
    case 'key':
      return 'key';
    case 'potion':
      return 'vessel';
    case 'throwable':
      return 'vessel';
    case 'food':
      return def.weight >= 0.8 ? 'haunch' : 'loaf';
    case 'material':
      return def.weight >= 1 ? 'pelt' : 'shard';
    default:
      return 'lump';
  }
}

function defaultBody(def: ItemDef): VesselBody {
  if (def.category === 'potion') return def.weight <= 0.2 ? 'vial' : 'round';
  if (def.weight > 0.8) return 'pot';
  if (def.weight <= 0.35) return 'vial';
  return 'tall';
}

function resolveLook(def: ItemDef): Look {
  const l: ItemLook = def.look ?? {};
  const tint = rgb(def.tint);
  return {
    form: l.form ?? defaultForm(def),
    body: l.body ?? defaultBody(def),
    fill: l.fill !== undefined ? rgb(l.fill) : tint,
    level: clamp(l.level ?? 0.75, 0, 1),
    shell: l.shell !== undefined ? rgb(l.shell) : null,
    glow: l.glow !== undefined ? rgb(l.glow) : def.teaches ? tint : null,
    sparkle: l.sparkle ?? false,
    size: clamp(l.size ?? 1, 0.6, 1.4),
    seed: seedOf(def),
  };
}

// ---------------------------------------------------------------------------------------------
// Vessels: one profile shared by flasks, bottles, vials, jugs and pots

interface Profile {
  /** Half-width of the vessel at height v (0 top .. 1 bottom), or 0 outside it. */
  half(v: number): number;
  /** Where the neck ends and the body begins. */
  bodyTop: number;
  bottom: number;
  /** Stopper rows. */
  stopTop: number;
  stopBottom: number;
  neck: number;
  glass: boolean;
}

function profile(body: VesselBody, size: number, seed: number): Profile {
  const k = size;
  const j = (rhash(seed, 1, 3) - 0.5) * 0.04;
  switch (body) {
    case 'round': {
      const cy = 0.64;
      const r = 0.31 * k;
      const neck = 0.075 * k;
      const nt = 0.16 + j;
      return {
        half: (v) => (v >= nt && v < cy - r * 0.8 ? neck : Math.sqrt(Math.max(0, r * r - (v - cy) * (v - cy)))),
        bodyTop: cy - r,
        bottom: cy + r,
        stopTop: nt - 0.11,
        stopBottom: nt,
        neck,
        glass: true,
      };
    }
    case 'tall': {
      const neck = 0.07 * k;
      const w = 0.19 * k;
      const nt = 0.14 + j;
      const sh = 0.36;
      return {
        half: (v) => {
          if (v < nt || v > 0.93) return 0;
          if (v < sh - 0.06) return neck;
          if (v < sh + 0.06) return neck + ((v - (sh - 0.06)) / 0.12) * (w - neck);
          return w;
        },
        bodyTop: sh,
        bottom: 0.93,
        stopTop: nt - 0.1,
        stopBottom: nt,
        neck,
        glass: true,
      };
    }
    case 'vial': {
      const w = 0.1 * k;
      const top = 0.2 + j;
      const bot = 0.88;
      return {
        half: (v) => {
          if (v < top || v > bot) return 0;
          const r = bot - w;
          return v > r ? Math.sqrt(Math.max(0, w * w - (v - r) * (v - r))) : w;
        },
        bodyTop: top,
        bottom: bot,
        stopTop: top - 0.11,
        stopBottom: top,
        neck: w,
        glass: true,
      };
    }
    case 'jug': {
      const neck = 0.1 * k;
      const w = 0.27 * k;
      const nt = 0.14 + j;
      return {
        half: (v) => {
          if (v < nt || v > 0.93) return 0;
          if (v < 0.3) return neck + (v < nt + 0.04 ? 0.025 : 0);
          const t = (v - 0.3) / 0.63;
          return neck + (w - neck) * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5) - (t > 0.85 ? (t - 0.85) * 0.5 : 0);
        },
        bodyTop: 0.3,
        bottom: 0.93,
        stopTop: nt - 0.09,
        stopBottom: nt,
        neck,
        glass: false,
      };
    }
    case 'pot': {
      const neck = 0.14 * k;
      const cy = 0.62;
      const r = 0.31 * k;
      const nt = 0.2 + j;
      return {
        half: (v) => (v >= nt && v < cy - r * 0.85 ? neck : Math.sqrt(Math.max(0, r * r - (v - cy) * (v - cy))) * 1.05),
        bodyTop: cy - r,
        bottom: cy + r,
        stopTop: nt - 0.1,
        stopBottom: nt,
        neck,
        glass: false,
      };
    }
  }
}

function vessel(c: Pix, L: Look): void {
  const P = profile(L.body, L.size, L.seed);
  const cx = 0.5;
  const shell = L.shell ?? (P.glass ? GLASS : CLAY);
  const liquidTop = P.bottom - L.level * (P.bottom - P.bodyTop);
  const stopper = P.glass ? mix(CORK, scale(CORK, 0.7), rhash(L.seed, 2, 3)) : L.fill;
  c.paint((u, v, x, y) => {
    // Stopper (cork for glass, a rag or wax plug in the vessel's own colour for clay).
    if (v >= P.stopTop && v < P.stopBottom && Math.abs(u - cx) <= P.neck + 0.03) return lit(stopper, (u - cx) / (P.neck + 0.03), -0.3);
    const hw = P.half(v);
    if (hw <= 0 || Math.abs(u - cx) > hw) return null;
    const nx = (u - cx) / hw;
    const edge = hw - Math.abs(u - cx) < 0.055;
    if (P.glass) {
      if (v >= liquidTop) {
        if (L.sparkle && rhash(x, y, L.seed) > 0.86) return mix(L.fill, WHITE, 0.6);
        // Liquid: rounded, a little lighter just under its surface.
        const k = 0.8 + (v - liquidTop < 0.06 ? 0.2 : 0) - nx * 0.2 - Math.max(0, v - 0.8) * 0.5;
        const col = scale(L.fill, k);
        return edge ? mix(col, shell, 0.35) : col;
      }
      // Empty glass shows faintly.
      if (edge) return scale(shell, 0.85);
      return nx < -0.3 && nx > -0.65 ? scale(shell, 0.95) : null;
    }
    // Clay: solid, with a painted band in the contents' colour.
    const band = v > P.bodyTop + (P.bottom - P.bodyTop) * 0.3 && v < P.bodyTop + (P.bottom - P.bodyTop) * 0.42;
    return lit(band ? L.fill : shell, nx, (v - (P.bodyTop + P.bottom) / 2) / (P.bottom - P.bodyTop));
  });
  if (P.glass) {
    // Glint on the glass.
    c.dot(cx - P.half(P.bodyTop + 0.12) * 0.55, P.bodyTop + 0.1, WHITE);
    if (L.glow) c.dot(cx + 0.03, liquidTop + 0.12, L.glow);
  } else if (L.body === 'jug') {
    // A handle on the side.
    const hx = cx + P.half(0.5) + 0.04;
    c.paint((u, v) => {
      const d = Math.hypot((u - (hx - 0.04)) / 0.11, (v - 0.46) / 0.15);
      return d > 0.7 && d < 1.15 && u > hx - 0.04 ? lit(shell, 0.4, (v - 0.46) * 4) : null;
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Weapons: grip, guard and blade or head laid along one diagonal, sized by the weapon's stats

interface Arms {
  metal: Rgb;
  haft: Rgb;
  /** 0..1: how far up the diagonal it reaches (from reach). */
  length: number;
  /** 0..1 heft from damage. */
  heft: number;
  /** 0..1 how hard it shoves. */
  push: number;
  /** 0..1 how worn and cheap it is: nicks and rust. */
  worn: number;
  /** Gilded fittings. */
  fine: boolean;
  gem: Rgb | null;
  seed: number;
}

function arms(def: ItemDef, w: WeaponStats, L: Look): Arms {
  const metal = L.shell ?? (w.tint.r + w.tint.g + w.tint.b > 0 ? ([w.tint.r, w.tint.g, w.tint.b] as Rgb) : ([196, 202, 212] as Rgb));
  return {
    metal,
    haft: mix(WOOD, scale(WOOD, 0.75), rhash(L.seed, 4, 1)),
    length: clamp(0.8 + (w.reach - 2) * 0.3, 0.5, 0.98) * L.size,
    heft: clamp((w.damage - 8) / 20, 0, 1),
    push: clamp((w.push - 0.6) / 2, 0, 1),
    worn: clamp(1 - w.durability / 160, 0, 1),
    fine: def.value >= 35,
    gem: L.glow ?? (def.value >= 50 ? ([90, 200, 230] as Rgb) : null),
    seed: L.seed,
  };
}

/** The diagonal every weapon lies along, from the grip (bottom left) to the tip (top right). */
function weaponAxis(length: number): Axis {
  const x0 = 0.1;
  const y0 = 0.9;
  return axis(x0, y0, x0 + 0.82 * length, y0 - 0.82 * length);
}

function blade(c: Pix, A: Arms): void {
  const ax = weaponAxis(A.length);
  const grip = clamp(0.2 / A.length, 0.14, 0.4);
  const half = 0.045 + A.heft * 0.035;
  const guardW = half + 0.06 + A.heft * 0.03;
  const guard = A.fine ? GOLD : BRONZE;
  c.paint((u, v, x, y) => {
    const { t, s } = along(ax, u, v);
    if (t < -0.04 || t > 1) return null;
    const as = Math.abs(s);
    if (t < 0.02) return as < 0.05 ? lit(guard, s * 10, -0.4) : null; // pommel
    if (t < grip - 0.05) return as < 0.03 ? scale(LEATHER, (x + y) % 2 ? 1 : 0.8) : null;
    if (t < grip) return as < guardW ? lit(guard, 0, s / guardW) : null;
    // Blade tapers to a point over its last fifth.
    const taper = t > 0.8 ? (1 - t) / 0.2 : 1;
    const hw = half * taper + 0.012;
    if (as > hw) return null;
    // Nicks along the edge of a worn blade.
    if (s > hw - 0.03 && A.worn > 0.4 && rhash(Math.floor(t * 30), 0, A.seed) < A.worn * 0.5) return null;
    let col = s < -hw * 0.2 ? scale(A.metal, 1.12) : s > hw * 0.5 ? scale(A.metal, 0.72) : A.metal;
    if (Math.abs(s) < 0.012 && t < 0.75) col = scale(A.metal, 0.88); // fuller
    if (A.worn > 0.5 && rhash(x, y, A.seed) < (A.worn - 0.4) * 0.6) col = mix(col, RUST, 0.7);
    return col;
  });
  if (A.gem) c.dot(ax.x0, ax.y0, A.gem);
}

function hafted(c: Pix, A: Arms, head: (t: number, s: number, x: number, y: number) => Rgb | null, haftHalf = 0.028): void {
  const ax = weaponAxis(A.length);
  c.paint((u, v, x, y) => {
    const { t, s } = along(ax, u, v);
    if (t < 0 || t > 1.15) return null;
    const h = head(t, s, x, y);
    if (h) return h;
    if (t > 1) return null;
    if (Math.abs(s) < haftHalf) return s < 0 ? A.haft : scale(A.haft, 0.75);
    return null;
  });
}

function axeHead(A: Arms): (t: number, s: number, x: number, y: number) => Rgb | null {
  const depth = 0.2 + A.heft * 0.1 + A.push * 0.06;
  const span = 0.14 + A.heft * 0.08;
  return (t, s, x, y) => {
    // A fan-shaped bit on one side of the haft, its edge facing away from it.
    const dt = t - (1 - span * 0.6);
    if (s < 0 || s > depth) return null;
    const reach = span * (0.45 + (s / depth) * 0.75);
    if (Math.abs(dt) > reach) return null;
    const edge = s > depth - 0.04;
    let col = edge ? scale(A.metal, 1.15) : lit(A.metal, -dt * 4, -0.2);
    if (A.worn > 0.5 && rhash(x, y, A.seed) < (A.worn - 0.4) * 0.6) col = mix(col, RUST, 0.7);
    return col;
  };
}

function hammerHead(A: Arms): (t: number, s: number) => Rgb | null {
  const along2 = 0.1 + A.heft * 0.05;
  const across = 0.14 + A.push * 0.1;
  return (t, s) => {
    if (Math.abs(t - (1 - along2)) > along2 || Math.abs(s) > across) return null;
    const face = Math.abs(s) > across - 0.04;
    return face ? scale(A.metal, 0.75) : lit(A.metal, s / across, (t - 1) * 3);
  };
}

function clubHead(A: Arms): (t: number, s: number, x: number, y: number) => Rgb | null {
  const swell = 0.06 + A.push * 0.08;
  return (t, s, x, y) => {
    if (t < 0.45) return null;
    const hw = 0.03 + swell * Math.sin(((t - 0.45) / 0.6) * Math.PI * 0.9);
    if (Math.abs(s) > hw || t > 1.02) return null;
    // Iron studs on a heavy club.
    if (A.heft > 0.4 && rhash(x, y, A.seed) > 0.8) return A.metal;
    return lit(A.haft, s / hw, -0.3);
  };
}

function spearHead(A: Arms): (t: number, s: number) => Rgb | null {
  const len = 0.2 + A.heft * 0.08;
  const wide = 0.06 + A.heft * 0.04;
  return (t, s) => {
    const k = (t - (1 - len)) / len;
    if (k < 0 || k > 1.12) return null;
    const hw = wide * Math.sin(Math.min(1, k) * Math.PI) * (k > 1 ? 0 : 1) + (k < 0.15 ? 0.03 : 0);
    if (Math.abs(s) > hw + 0.01) return null;
    return s < 0 ? scale(A.metal, 1.12) : scale(A.metal, 0.8);
  };
}

// ---------------------------------------------------------------------------------------------
// Armour: four base shapes (head, body, arms, legs). Material gives the colour, plates make it hard
// and bright-edged, quality adds shine, and a worn piece gets rusty patches and holes.

interface Plate {
  base: Rgb;
  hi: Rgb;
  /** 0 (cloth) .. 1 (plates). */
  plate: number;
  shine: boolean;
  /** 0 (new) .. 1 (about to fall apart). */
  worn: number;
  seed: number;
}

function plateOf(def: ItemDef, L: Look): Plate {
  const a = def.armour;
  const base = L.shell ?? L.fill;
  return {
    base,
    hi: L.glow ?? mix(base, WHITE, 0.3),
    plate: clamp(def.look?.plate ?? 0, 0, 1),
    shine: L.glow !== null,
    worn: a ? clamp(1 - a.wear / Math.max(1, a.durability), 0, 1) : 0,
    seed: L.seed,
  };
}

/** One pixel of a piece of armour: lit as a curved surface, with a bright edge when it is plate and wear on top. */
function armourPixel(P: Plate, nx: number, ny: number, x: number, y: number, edge: number): Rgb | null {
  let col = lit(P.base, nx, ny);
  if (P.plate > 0.5 && edge < 0.12) col = mix(col, P.hi, 0.6);
  else if (P.shine && edge < 0.2 && nx + ny < 0) col = mix(col, P.hi, 0.5);
  if (P.worn > 0.2) {
    const r = rhash(x, y, P.seed);
    if (P.worn > 0.7 && r < (P.worn - 0.65) * 0.4) return null;
    // Plate rusts; cloth and leather just go dark and ragged.
    if (r < P.worn * 0.5) col = P.plate > 0.5 ? mix(col, RUST, 0.6) : scale(col, 0.6);
  }
  return col;
}

function headgear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    const nx = (u - 0.5) / 0.3;
    const ny = (v - 0.46) / 0.3;
    const band = v >= 0.6 && v <= 0.7;
    if (band ? Math.abs(u - 0.5) > 0.33 : nx * nx + ny * ny > 1 || v > 0.7) {
      // Nasal bar of a helm.
      if (P.plate > 0.5 && Math.abs(u - 0.5) < 0.03 && v > 0.7 && v < 0.84) return armourPixel(P, 0, 0, x, y, 0.5);
      return null;
    }
    const edge = band ? 0.05 : 1 - Math.hypot(nx, ny);
    let col = armourPixel(P, nx, ny, x, y, edge);
    if (!col) return null;
    if (band) col = scale(col, 0.82);
    // A ridge along the crown of a helm; a fold in a cap.
    if (P.plate > 0.5 && Math.abs(u - 0.5) < 0.022 && v < 0.6) col = mix(col, P.hi, 0.7);
    // The eye slit of a helm.
    if (P.plate > 0.5 && v > 0.5 && v < 0.55 && Math.abs(u - 0.5) < 0.19 && Math.abs(u - 0.5) > 0.025) col = scale(col, 0.25);
    if (P.plate < 0.4 && Math.abs(v - 0.5 - (u - 0.5) * 0.4) < 0.015) col = scale(col, 0.75);
    return col;
  });
}

function torsowear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    if (v < 0.16 || v > 0.88) return null;
    const half = 0.27 - (v - 0.16) * 0.1;
    // Cap sleeves, or pauldrons on plate.
    const shoulder = v < 0.36 ? 0.37 - (v - 0.16) * 0.2 : 0;
    const w = Math.max(half, shoulder);
    const d = Math.abs(u - 0.5);
    if (d > w) return null;
    if (Math.hypot(u - 0.5, v - 0.16) < 0.085) return null;
    let col = armourPixel(P, (u - 0.5) / w, (v - 0.5) * 1.6, x, y, (w - d) / w);
    if (!col) return null;
    if (P.plate > 0.5) {
      // Overlapping bands with rivets.
      const k = (v - 0.2) / 0.13;
      if (v > 0.3 && Math.abs(k - Math.round(k)) < 0.07) col = scale(col, 0.62);
      else if (v > 0.3 && Math.abs(Math.abs(u - 0.5) - 0.12) < 0.018 && Math.abs(k - Math.round(k)) < 0.2) col = mix(col, WHITE, 0.45);
    } else {
      if (d < 0.012 && v > 0.22) col = scale(col, 0.75);
      if (v > 0.68 && v < 0.73 && d <= half) col = LEATHER;
    }
    return col;
  });
}

function armwear(c: Pix, P: Plate): void {
  const limbs = [axis(0.3, 0.18, 0.2, 0.82), axis(0.7, 0.18, 0.8, 0.82)];
  c.paint((u, v, x, y) => {
    for (const a of limbs) {
      const { t, s } = along(a, u, v);
      const w = 0.105 - t * 0.03;
      if (t < 0 || t > 1 || Math.abs(s) > w) continue;
      const col = armourPixel(P, s / w, (t - 0.5) * 1.4, x, y, (w - Math.abs(s)) / w);
      if (!col) continue;
      if (P.plate > 0.5) return Math.abs(t * 4 - Math.round(t * 4)) < 0.1 && t > 0.1 && t < 0.9 ? scale(col, 0.62) : col;
      // Cloth wraps wind round the arm.
      return Math.floor((t + s * 0.8) * 9) % 2 === 0 ? scale(col, 0.82) : col;
    }
    return null;
  });
}

function legwear(c: Pix, P: Plate): void {
  c.paint((u, v, x, y) => {
    if (v < 0.12 || v > 0.9) return null;
    for (const cx of [0.36, 0.64]) {
      const w = 0.125 - (v - 0.12) * 0.06;
      const d = Math.abs(u - cx);
      if (d > w) continue;
      const col = armourPixel(P, (u - cx) / w, (v - 0.5) * 1.2, x, y, (w - d) / w);
      if (!col) continue;
      // Boots below the shin.
      if (v > 0.8) return lit(LEATHER, (u - cx) / w, 0.2);
      if (P.plate > 0.5 && Math.hypot(u - cx, v - 0.45) < 0.07) return mix(col, P.hi, 0.7);
      if (P.plate <= 0.5 && Math.abs(u - cx) < 0.012) return scale(col, 0.78);
      return col;
    }
    return null;
  });
}

// ---------------------------------------------------------------------------------------------
// Other forms

type Painter = (c: Pix, def: ItemDef, L: Look) => void;

const FORMS: Record<string, Painter> = {
  headgear: (c, d, L) => headgear(c, plateOf(d, L)),
  torsowear: (c, d, L) => torsowear(c, plateOf(d, L)),
  armwear: (c, d, L) => armwear(c, plateOf(d, L)),
  legwear: (c, d, L) => legwear(c, plateOf(d, L)),
  vessel: (c, _d, L) => vessel(c, L),
  blade: (c, d, L) => (d.weapon ? blade(c, arms(d, d.weapon, L)) : FORMS.lump?.(c, d, L)),
  axe: (c, d, L) => {
    if (!d.weapon) return;
    const A = arms(d, d.weapon, L);
    hafted(c, A, axeHead(A));
  },
  hammer: (c, d, L) => {
    if (!d.weapon) return;
    const A = arms(d, d.weapon, L);
    hafted(c, A, hammerHead(A), 0.032);
  },
  club: (c, d, L) => {
    if (!d.weapon) return;
    const A = arms(d, d.weapon, L);
    hafted(c, A, clubHead(A), 0.034);
  },
  spear: (c, d, L) => {
    if (!d.weapon) return;
    const A = arms(d, d.weapon, L);
    hafted(c, A, spearHead(A), 0.022);
  },
  // A brand: a haft, a rag-wrapped head scorched at the top, and a flame in the colour of its light.
  torch: (c, d, L) => {
    const ax = weaponAxis(0.74 * L.size);
    const fire: Rgb = d.light ? [d.light.r * 255, d.light.g * 255, d.light.b * 255] : [255, 160, 60];
    const rag = mix(LEATHER, WOOD, 0.4);
    const haft = mix(WOOD, scale(WOOD, 0.75), rhash(L.seed, 4, 1));
    c.paint((u, v, x, y) => {
      const { t, s } = along(ax, u, v);
      if (t < -0.02 || t > 1.3) return null;
      const as = Math.abs(s);
      // Flame: a teardrop licking up from the head, white-hot in the middle.
      if (t > 0.9) {
        const k = (t - 0.9) / 0.4;
        const hw = 0.085 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.9) * (1 - k * 0.35);
        if (as < hw && k < 1) {
          const core = 1 - as / Math.max(0.001, hw);
          return mix(fire, WHITE, clamp(core * 0.9 - k * 0.3, 0, 0.85));
        }
      }
      if (t > 1) return null;
      if (t > 0.74) {
        const hw = 0.055 - (t - 0.74) * 0.06;
        if (as > hw) return null;
        const scorch = clamp((t - 0.86) / 0.14, 0, 1);
        const base = lit(rag, s / hw, 0.1);
        return rhash(x, y, L.seed) < 0.3 ? scale(mix(base, [30, 24, 18], scorch), 0.85) : mix(base, [30, 24, 18], scorch);
      }
      if (as < 0.028) return s < 0 ? haft : scale(haft, 0.72);
      return null;
    });
  },
  coin: (c, _d, L) => {
    const r = 0.24 * L.size;
    const face = blob(0.5, 0.5, r, r, L.fill);
    c.paint((u, v) => {
      const col = face(u, v);
      if (!col) return null;
      const d = Math.hypot(u - 0.5, v - 0.5);
      return d > r - 0.05 ? scale(L.fill, 0.75) : col;
    });
    c.dot(0.4, 0.38, WHITE);
  },
  key: (c, _d, L) => {
    const ax = axis(0.3, 0.3, 0.8, 0.8);
    c.paint((u, v) => {
      const ring = Math.hypot(u - 0.27, v - 0.27);
      if (ring < 0.16 && ring > 0.07) return lit(L.fill, (u - 0.27) * 5, (v - 0.27) * 5);
      const { t, s } = along(ax, u, v);
      if (t >= 0 && t <= 1 && Math.abs(s) < 0.035) return L.fill;
      // Teeth.
      if (t > 0.7 && t <= 1 && s > 0 && s < 0.13 && Math.floor(t * 12) % 2 === 0) return scale(L.fill, 0.8);
      return null;
    });
  },
  loaf: (c, _d, L) => {
    const rx = 0.32 * L.size;
    const ry = 0.2 * L.size;
    const base = blob(0.5, 0.56, rx, ry, L.fill);
    const cuts = 2 + Math.floor(rhash(L.seed, 5, 5) * 3);
    c.paint((u, v) => {
      const col = base(u, v);
      if (!col) return null;
      const k = ((u - 0.5 + rx) / (2 * rx)) * (cuts + 1);
      const score = Math.abs(k - Math.round(k)) < 0.12 && Math.round(k) > 0 && Math.round(k) <= cuts && v < 0.58;
      return score ? scale(col, 0.6) : col;
    });
  },
  haunch: (c, _d, L) => {
    c.paint(blob(0.42, 0.58, 0.27 * L.size, 0.23 * L.size, L.fill));
    const bone = axis(0.6, 0.42, 0.82, 0.18);
    c.paint((u, v) => {
      const { t, s } = along(bone, u, v);
      if (t > 0 && t < 1 && Math.abs(s) < 0.035) return BONE;
      return Math.hypot(u - 0.84, v - 0.16) < 0.06 ? BONE : null;
    });
  },
  pelt: (c, _d, L) => {
    const base = blob(0.5, 0.55, 0.36 * L.size, 0.24 * L.size, L.fill);
    c.paint((u, v, x, y) => {
      const col = base(u, v);
      if (!col) return null;
      // Fur: streaks and a ragged lower edge.
      if (v > 0.68 && (x + Math.floor(rhash(x, 0, L.seed) * 2)) % 2 === 0) return null;
      return rhash(x, y, L.seed) > 0.75 ? scale(col, 0.82) : col;
    });
  },
  shard: (c, _d, L) => {
    const s = L.size;
    c.paint((u, v) => {
      const dv = v - 0.5;
      const hw = (0.2 - Math.abs(dv) * 0.42) * s;
      if (Math.abs(dv) > 0.42 * s || Math.abs(u - 0.5) > hw) return null;
      return u < 0.5 ? scale(L.fill, 1.12) : scale(L.fill, 0.78);
    });
    c.dot(0.45, 0.32, WHITE);
  },
  stone: (c, _d, L) => {
    const base = blob(0.5, 0.55, 0.32 * L.size, 0.28 * L.size, L.shell ?? STONE);
    const glow = L.glow ?? L.fill;
    // A carved rune: a few strokes picked from the item's seed.
    const strokes: Axis[] = [];
    const n = 2 + Math.floor(rhash(L.seed, 7, 1) * 2);
    for (let i = 0; i < n; i++) {
      const a = rhash(L.seed, i, 8) * Math.PI;
      const r = 0.14;
      strokes.push(axis(0.5 - Math.cos(a) * r, 0.55 - Math.sin(a) * r, 0.5 + Math.cos(a) * r * 0.8, 0.55 + Math.sin(a) * r * 0.8));
    }
    c.paint((u, v) => {
      const col = base(u, v);
      if (!col) return null;
      for (const ax of strokes) {
        const { t, s } = along(ax, u, v);
        if (t >= 0 && t <= 1 && Math.abs(s) < 0.03) return glow;
      }
      return col;
    });
  },
  bundle: (c, _d, L) => {
    // Cloth rolled round two poles and lashed.
    const poles = axis(0.12, 0.84, 0.86, 0.12);
    c.paint((u, v) => {
      const { t, s } = along(poles, u, v);
      if (t < 0 || t > 1) return null;
      if (Math.abs(s) < 0.2 * L.size && t > 0.2 && t < 0.8) {
        if (Math.abs(t - 0.5) < 0.03) return LEATHER;
        return lit(L.fill, s / 0.2, (t - 0.5) * 2);
      }
      if (Math.abs(Math.abs(s) - 0.05) < 0.025) return WOOD;
      return null;
    });
  },
  lump: (c, _d, L) => {
    c.paint(blob(0.5, 0.55, 0.26 * L.size, 0.24 * L.size, L.fill));
    c.dot(0.4, 0.42, WHITE);
  },
};

/**
 * Paints the picture of an item from what its definition says it is, using the shared base forms
 * above. Any new item gets a sensible picture with no new art.
 */
export function paintItem(def: ItemDef | undefined): Uint32Array {
  const c = new Pix();
  if (!def) {
    c.paint(blob(0.5, 0.5, 0.25, 0.25, [255, 0, 255]));
  } else {
    materialsFor(seedOf(def));
    const L = resolveLook(def);
    (FORMS[L.form] ?? FORMS.lump)?.(c, def, L);
    // Very dark items still need to read as something.
    if (lum(L.fill) < 0.12 && L.form === 'lump') c.dot(0.5, 0.5, WHITE);
  }
  c.outline();
  return c.px;
}

/** How big the item looks lying in the world, in metres. */
export function itemWorldSize(def: ItemDef | undefined): number {
  if (!def) return 0.35;
  const L = resolveLook(def);
  if (def.weapon) return (0.55 + def.weapon.reach * 0.14) * L.size;
  if (def.armour) return 0.45 * L.size;
  if (L.form === 'bundle') return 0.7 * L.size;
  if (L.form === 'vessel') return (L.body === 'pot' || L.body === 'jug' ? 0.42 : 0.34) * L.size;
  return 0.38 * L.size;
}

/** The base forms this painter knows, for checks and tools. */
export const ITEM_FORMS: readonly string[] = Object.keys(FORMS);
