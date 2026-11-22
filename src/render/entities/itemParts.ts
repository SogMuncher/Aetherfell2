import type { ItemDef } from '../../types';
import { rhash } from '../color';
import type { Look, Rgb, Axis, Painter } from './itemPaint';
import { headgear, torsowear, armwear, legwear, plateOf } from './itemPlates';
import { Pix, scale, mix, clamp, lit, axis, along, WOOD, LEATHER, GOLD, BRONZE, RUST } from './itemPaint';

// ---------------------------------------------------------------------------------------------
// Weapons: pieces laid along one diagonal, from the grip (bottom left) to the tip (top right),
// sized by the weapon's numbers. A piece with an edge puts it on the LEFT (upper) side of the
// diagonal, so in the hand it faces the foe.

interface Arms {
  metal: Rgb;
  haft: Rgb;
  /** 0..1: how far up the diagonal it reaches (from reach). */
  length: number;
  /** Where the grip ends, along the length. */
  grip: number;
  /** 0..1 heft from damage. */
  heft: number;
  /** 0..1 how hard it shoves. */
  push: number;
  /** 0..1 how worn it is: nicks and rust. */
  worn: number;
  /** Gilded fittings. */
  fine: boolean;
  gem: Rgb | null;
  /** Enchanted: the glow runs along the blade. */
  rune: Rgb | null;
  seed: number;
}

/** Anything swung without fighting numbers still gets a sensible size. */
const PLAIN = { damage: 6, reach: 1.6, push: 1 };

function arms(def: ItemDef, L: Look): Arms {
  const w = def.weapon ?? PLAIN;
  const t = def.weapon?.tint;
  const metal = L.shell ?? (t && t.r + t.g + t.b > 0 ? ([t.r, t.g, t.b] as Rgb) : ([196, 202, 212] as Rgb));
  const length = clamp(0.8 + (w.reach - 2) * 0.3, 0.5, 0.98) * L.size;
  return {
    metal,
    haft: mix(WOOD, scale(WOOD, 0.75), rhash(L.seed, 4, 1)),
    length,
    grip: clamp(0.2 / length, 0.14, 0.4),
    heft: clamp((w.damage - 8) / 20, 0, 1),
    push: clamp((w.push - 0.6) / 2, 0, 1),
    worn: clamp(1 - (def.wear ?? 1) / Math.max(1, def.durability ?? 1), 0, 1),
    fine: def.value >= 35,
    gem: L.glow ?? (def.value >= 50 ? ([90, 200, 230] as Rgb) : null),
    rune: L.sparkle && L.glow ? L.glow : null,
    seed: L.seed,
  };
}

/** The diagonal every weapon lies along, from the grip (bottom left) to the tip (top right). */
export function weaponAxis(length: number): Axis {
  const x0 = 0.1;
  const y0 = 0.9;
  return axis(x0, y0, x0 + 0.82 * length, y0 - 0.82 * length);
}

/** Paints one piece along the weapon's diagonal: `frag` gets t (0 grip .. 1 tip) and s (across; negative is the left edge). */
function along1(c: Pix, A: Arms, frag: (t: number, s: number, x: number, y: number) => Rgb | null): void {
  const ax = weaponAxis(A.length);
  c.paint((u, v, x, y) => {
    const { t, s } = along(ax, u, v);
    return t < -0.06 || t > 1.15 ? null : frag(t, s, x, y);
  });
}

function rusty(A: Arms, col: Rgb, x: number, y: number): Rgb {
  return A.worn > 0.5 && rhash(x, y, A.seed) < (A.worn - 0.4) * 0.6 ? mix(col, RUST, 0.7) : col;
}

function bladePart(c: Pix, A: Arms): void {
  const half = 0.045 + A.heft * 0.035;
  along1(c, A, (t, s, x, y) => {
    if (t < A.grip || t > 1) return null;
    // Tapers to a point over its last fifth.
    const taper = t > 0.8 ? (1 - t) / 0.2 : 1;
    const hw = half * taper + 0.012;
    if (Math.abs(s) > hw) return null;
    // Nicks along the edge of a worn blade.
    if (-s > hw - 0.03 && A.worn > 0.4 && rhash(Math.floor(t * 30), 0, A.seed) < A.worn * 0.5) return null;
    let col = s < -hw * 0.2 ? scale(A.metal, 1.12) : s > hw * 0.5 ? scale(A.metal, 0.72) : A.metal;
    if (Math.abs(s) < 0.012 && t < 0.75) col = A.rune ?? scale(A.metal, 0.88); // fuller
    return rusty(A, col, x, y);
  });
}

function gripPart(c: Pix, A: Arms): void {
  along1(c, A, (t, s, x, y) => (t >= 0.02 && t < A.grip - 0.05 && Math.abs(s) < 0.03 ? scale(LEATHER, (x + y) % 2 ? 1 : 0.8) : null));
}

function guardPart(c: Pix, A: Arms): void {
  const w = 0.045 + A.heft * 0.035 + 0.06 + A.heft * 0.03;
  const guard = A.fine ? GOLD : BRONZE;
  along1(c, A, (t, s) => (t >= A.grip - 0.05 && t < A.grip && Math.abs(s) < w ? lit(guard, 0, s / w) : null));
}

function pommelPart(c: Pix, A: Arms): void {
  const guard = A.fine ? GOLD : BRONZE;
  along1(c, A, (t, s) => (t >= -0.04 && t < 0.02 && Math.abs(s) < 0.05 ? lit(guard, s * 10, -0.4) : null));
  const ax = weaponAxis(A.length);
  if (A.gem) c.dot(ax.x0, ax.y0, A.gem);
}

function haftPart(c: Pix, A: Arms): void {
  const half = 0.022 + A.heft * 0.012;
  along1(c, A, (t, s) => (t >= 0 && t <= 1 && Math.abs(s) < half ? (s < 0 ? A.haft : scale(A.haft, 0.75)) : null));
}

function axeBit(c: Pix, A: Arms): void {
  const depth = 0.2 + A.heft * 0.1 + A.push * 0.06;
  const span = 0.14 + A.heft * 0.08;
  along1(c, A, (t, s, x, y) => {
    // A fan-shaped bit on the left of the haft, its edge facing away from it.
    const q = -s;
    const dt = t - (1 - span * 0.6);
    if (q < 0 || q > depth) return null;
    const reach = span * (0.45 + (q / depth) * 0.75);
    if (Math.abs(dt) > reach) return null;
    const col = q > depth - 0.04 ? scale(A.metal, 1.15) : lit(A.metal, -dt * 4, -0.2);
    return rusty(A, col, x, y);
  });
}

function hammerHead(c: Pix, A: Arms): void {
  const along2 = 0.1 + A.heft * 0.05;
  const across = 0.14 + A.push * 0.1;
  along1(c, A, (t, s, x, y) => {
    if (Math.abs(t - (1 - along2)) > along2 || Math.abs(s) > across) return null;
    const face = Math.abs(s) > across - 0.04;
    return rusty(A, face ? scale(A.metal, 0.75) : lit(A.metal, s / across, (t - 1) * 3), x, y);
  });
}

function clubHead(c: Pix, A: Arms): void {
  const swell = 0.06 + A.push * 0.08;
  along1(c, A, (t, s, x, y) => {
    if (t < 0.45 || t > 1.02) return null;
    const hw = 0.03 + swell * Math.sin(((t - 0.45) / 0.6) * Math.PI * 0.9);
    if (Math.abs(s) > hw) return null;
    // Iron studs on a heavy club.
    if (A.heft > 0.4 && rhash(x, y, A.seed) > 0.8) return A.metal;
    return lit(A.haft, s / hw, -0.3);
  });
}

function spearHead(c: Pix, A: Arms): void {
  const len = 0.2 + A.heft * 0.08;
  const wide = 0.06 + A.heft * 0.04;
  along1(c, A, (t, s, x, y) => {
    const k = (t - (1 - len)) / len;
    if (k < 0 || k > 1.12) return null;
    const hw = wide * Math.sin(Math.min(1, k) * Math.PI) * (k > 1 ? 0 : 1) + (k < 0.15 ? 0.03 : 0);
    if (Math.abs(s) > hw + 0.01) return null;
    if (A.rune && Math.abs(s) < 0.012) return A.rune;
    return rusty(A, s < 0 ? scale(A.metal, 1.12) : scale(A.metal, 0.8), x, y);
  });
}

/**
 * The pieces gear (and any item with `look.parts`) is put together from, painted in order. A new
 * weapon or garment is a new list of these in content/gear.ts; a new kind of piece is one entry here.
 */
export const ITEM_PARTS: Record<string, Painter> = {
  grip: (c, d, L) => gripPart(c, arms(d, L)),
  guard: (c, d, L) => guardPart(c, arms(d, L)),
  blade: (c, d, L) => bladePart(c, arms(d, L)),
  pommel: (c, d, L) => pommelPart(c, arms(d, L)),
  haft: (c, d, L) => haftPart(c, arms(d, L)),
  axeBit: (c, d, L) => axeBit(c, arms(d, L)),
  hammerHead: (c, d, L) => hammerHead(c, arms(d, L)),
  clubHead: (c, d, L) => clubHead(c, arms(d, L)),
  spearHead: (c, d, L) => spearHead(c, arms(d, L)),
  headgear: (c, d, L) => headgear(c, plateOf(d, L)),
  torsowear: (c, d, L) => torsowear(c, plateOf(d, L)),
  armwear: (c, d, L) => armwear(c, plateOf(d, L)),
  legwear: (c, d, L) => legwear(c, plateOf(d, L)),
};
