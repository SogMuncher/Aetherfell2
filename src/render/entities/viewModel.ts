import type { Entity, HandPose, SimEvent, SimState, SwingDir } from '../../types';
import { CONTENT, heldLight, itemDef } from '../../content';
import type { Env, LightMap } from '../lighting';
import { addPixel, blendPixel, glowDisc, glowLine, glowTriangle } from '../vfx/glow';
import type { Surface } from '../vfx/glow';
import { blitWarped, heldSprite, warpPoints } from './spriteWarp';
import type { Warp, WarpPoints } from './spriteWarp';

/**
 * The item in your hand: its flat item picture (itemArt.ts), tilted, foreshortened, slanted and
 * tapered by the swing's pose so it reads as 3D motion (spriteWarp.ts), with a swing trail, hit
 * flashes and sparks. One animation for every held item, torches included. All numbers are in
 * content/viewmodel.ts; the flame comes from the item's light, sparks from the world's effect table.
 */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const rgbR = (c: number): number => (c >> 16) & 255;
const rgbG = (c: number): number => (c >> 8) & 255;
const rgbB = (c: number): number => c & 255;

const mixPose = (a: HandPose, b: HandPose, t: number): HandPose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
  lean: lerp(a.lean, b.lean, t),
  pitch: lerp(a.pitch, b.pitch, t),
  roll: lerp(a.roll, b.roll, t),
  reach: lerp(a.reach, b.reach, t),
});


interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  size: number;
  r: number;
  g: number;
  b: number;
  /** 'flame' and 'spark' add light; 'drop' and 'puff' cover what is behind. */
  kind: 'flame' | 'spark' | 'drop' | 'puff' | 'ember';
}

export interface ViewFrame {
  yaw: number;
  pitch: number;
  bob: number;
  /** 0..1 between sim ticks, for your own traveller. */
  alpha: number;
  dt: number;
  time: number;
}

export class ViewModel {
  private readonly pts: WarpPoints = { tip: { x: 0, y: 0 }, mid: { x: 0, y: 0 } };
  private readonly motes: Mote[] = [];
  /** Remembered tip and ribbon-start positions on screen, newest last. */
  private readonly trail: { tx: number; ty: number; mx: number; my: number; t: number }[] = [];
  private kick = { z: 0, vz: 0, r: 0, vr: 0 };
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private tipSpeed = 0;
  private lastTip: { x: number; y: number } | null = null;
  private lastWeapon: string | null | undefined = undefined;
  private spawnFlame = 0;

  /** Remembers blows you land so the next frames can flash, throw sparks and kick the weapon. */
  /** Remembers blows you land so the next frames can flash, throw sparks and kick the weapon. */
  onEvent(e: SimEvent, state: SimState, localId: number | null): void {
    if (localId === null) return;
    const me = state.entities.get(localId);
    if (!me?.actor) return;
    if (e.type === 'hit' && e.source === localId) {
      const power = clamp((e.power ?? 0) + Math.min(0.6, e.damage / 40), 0, 1.2);
      this.blow(power);
    } else if (e.type === 'strike' && Math.hypot(me.pos.x - e.x, me.pos.y - e.y) < 3.5) {
      this.blow(clamp(e.power, 0, 1.2));
    } else if (e.type === 'equip' && e.entity === localId) {
      this.trail.length = 0;
      this.lastTip = null;
    }
  }

  /** A blow you land rings through the weapon. What flies off is drawn in the world (vfx/particles.ts), from material and weapon data. */
  private blow(power: number): void {
    const vm = CONTENT.viewmodel;
    // The blow rings through the weapon: back along its axis and twisting.
    const kk = vm.kick;
    this.kick.vz -= kk.push * (0.5 + power) * 14;
    this.kick.vr += (Math.random() < 0.5 ? -1 : 1) * kk.twist * (0.5 + power) * 8;
  }

  draw(vp: Surface, e: Entity, env: Env, lm: LightMap, f: ViewFrame): void {
    const a = e.actor;
    const p = e.player;
    if (!a || !p || p.downed > 0 || p.gliding) return;
    const vm = CONTENT.viewmodel;
    const W = vp.width;
    const H = vp.height;
    const dt = Math.max(0.0005, Math.min(0.1, f.dt));
    const item = a.weapon === null ? null : itemDef(CONTENT, a.weapon) ?? null;
    if (a.weapon !== this.lastWeapon) {
      this.lastWeapon = a.weapon;
      this.trail.length = 0;
      this.lastTip = null;
    }
    const held = heldLight(CONTENT, e);
    const ch = CONTENT.rules.combat.charge;
    // A solid blow holds still for its hitstop.
    const frozen = (e.freeze ?? 0) > 0;
    const al = frozen ? 0 : f.alpha;

    // --- Where the hand is: the swing's pose, mixed from the keyframes in content/viewmodel.ts.
    let pose: HandPose = { ...vm.rest };
    let shake = 0;
    let glow = 0;
    const sw = a.swing;
    const c = a.charge;
    if (sw) {
      const wind = 0.5 + 0.5 * sw.power;
      const wp = vm.wind[sw.dir] ?? vm.rest;
      const ep = vm.end[sw.dir] ?? vm.rest;
      const start = mixPose(vm.rest, wp, wind);
      const at = sw.t + al;
      if (at < sw.strikeAt) {
        const t = at / Math.max(1, sw.strikeAt);
        pose = mixPose(start, ep, t * t);
      } else {
        const after = (at - sw.strikeAt) / Math.max(1, sw.recover - sw.strikeAt);
        // Follows through a little past the end of the blow, lingers, then eases home.
        const over = Math.sin(clamp(after * 3, 0, 1) * Math.PI) * 0.12 * (1 - clamp(after, 0, 1));
        const home = smooth((after - 0.25) / 0.75);
        pose = mixPose(mixPose(ep, start, -over), vm.rest, home);
      }
      glow = sw.power * (1 - Math.min(1, sw.t / Math.max(1, sw.recover)));
    } else if (c) {
      const draw = smooth((c.t + al) / 10);
      const frac = c.t <= ch.tap ? 0 : Math.min(1, (c.t - ch.tap) / Math.max(1, ch.full - ch.tap));
      pose = mixPose(vm.rest, vm.wind[c.dir] ?? vm.rest, draw * (0.7 + 0.3 * frac));
      shake = frac * 0.006 + (c.full ? 0.004 : 0);
      glow = c.full ? 0.6 + 0.4 * Math.sin((c.t + al) * 0.9) : frac * 0.35;
    } else if (a.guard) {
      pose = { ...vm.guard };
    }
    const walk = Math.abs(Math.sin(f.bob));
    if (!sw && !c) {
      // Walking bobs the hand in a figure of eight; breathing lifts it a little.
      pose.y += walk * vm.sway.walk - vm.sway.walk * 0.4 + Math.sin(f.time * 1.7) * vm.sway.breath;
      pose.x += Math.sin(f.bob) * vm.sway.walk * 0.6;
    }
    if (p.holding !== null) pose.y += vm.carry.y;
    // Turning the view drags the item behind it, then it catches up.
    const dyaw = Math.atan2(Math.sin(f.yaw - this.lastYaw), Math.cos(f.yaw - this.lastYaw)) / dt;
    const dpit = (f.pitch - this.lastPitch) / dt;
    this.lastYaw = f.yaw;
    this.lastPitch = f.pitch;
    const catchUp = Math.min(1, vm.sway.follow * dt);
    this.swayX += (clamp(dyaw * 0.012 * vm.sway.turn, -0.07, 0.07) - this.swayX) * catchUp;
    this.swayY += (clamp(-dpit * 0.012 * vm.sway.turn, -0.05, 0.05) - this.swayY) * catchUp;
    pose.x += this.swayX;
    pose.y += this.swayY;
    pose.roll += this.swayX * 2;
    // A blow rings through it (spring), and a held-still blow trembles.
    const k = this.kick;
    k.vz += (-vm.kick.stiff * k.z - vm.kick.damp * k.vz) * dt;
    k.z += k.vz * dt;
    k.vr += (-vm.kick.stiff * k.r - vm.kick.damp * k.vr) * dt;
    k.r += k.vr * dt;
    pose.z += k.z;
    pose.pitch += k.z * 3;
    pose.roll += k.r;
    const buzz = frozen ? 0.006 : shake;
    if (buzz) {
      pose.x += Math.sin(f.time * 90) * buzz;
      pose.y += Math.cos(f.time * 77) * buzz;
    }

    // --- Pose to picture: the same flat sprite, tilted and foreshortened so it reads as 3D.
    const wv = vm.warp;
    const z = Math.max(0.15, pose.z);
    const sc = (vm.focal * H) / z;
    const gx = W / 2 + pose.x * sc;
    const gy = H / 2 - pose.y * sc;
    const light = new Float32Array(3);
    lm.sample(e.pos.x, e.pos.y, light);
    const flick = held ? 1 - held.flicker * 0.5 + Math.sin(f.time * 17) * held.flicker * 0.25 + Math.sin(f.time * 29) * held.flicker * 0.25 : 1;
    const lit = (amb: number, sun: number, l: number, own: number): number => Math.min(1.5, (Math.max(0.22, amb * 0.8 + l * 0.55) + sun * 0.3 + own * flick * 0.35));
    const warp: Warp = {
      x: gx,
      y: gy,
      side: wv.side * pose.reach * sc,
      angle: pose.lean,
      along: Math.cos(pose.pitch),
      across: lerp(wv.flat, 1, Math.abs(Math.cos(pose.roll))),
      shear: Math.sin(pose.roll) * wv.shear,
      taper: Math.sin(pose.pitch) * wv.taper,
      r: lit(env.ambR, env.sunR, light[0] ?? 0, held?.r ?? 0),
      g: lit(env.ambG, env.sunG, light[1] ?? 0, held?.g ?? 0),
      b: lit(env.ambB, env.sunB, light[2] ?? 0, held?.b ?? 0),
      flare: glow,
    };
    const pts = this.pts;
    pts.tip.x = pts.mid.x = gx;
    pts.tip.y = pts.mid.y = gy;
    const sprite = item && a.weapon !== null ? heldSprite(a.weapon, item) : null;
    const tx = (): number => pts.tip.x;
    const ty = (): number => pts.tip.y;
    // Measure first (the trail is painted under the item), then paint the item.
    if (sprite) warpPoints(sprite, warp, pts);
    // How fast the tip moves, in screen heights per second.
    if (sprite && this.lastTip) this.tipSpeed += (Math.hypot(tx() - this.lastTip.x, ty() - this.lastTip.y) / H / dt - this.tipSpeed) * Math.min(1, dt * 22);
    else this.tipSpeed = 0;
    this.lastTip = sprite ? { x: tx(), y: ty() } : null;
    if (frozen) this.tipSpeed *= 0.5;

    // --- The ribbon behind a fast sweep, under the item.
    if (sprite) {
      this.trail.push({ tx: tx(), ty: ty(), mx: pts.mid.x, my: pts.mid.y, t: f.time });
      while (this.trail.length > vm.trail.frames) this.trail.shift();
    }
    const tr = vm.trail;
    const strength = clamp((this.tipSpeed - tr.from) / tr.from, 0, 1) * tr.strength * (frozen ? 0.5 : 1);
    if (strength > 0.02 && this.trail.length > 1) {
      const fire = held?.flame;
      const tc = item?.weapon?.tint ?? { r: 220, g: 220, b: 230 };
      const cr = fire ? 255 : lerp(tc.r, 255, 0.55);
      const cg = fire ? lerp(held?.g ?? 0.6, 1, 0.3) * 255 : lerp(tc.g, 255, 0.55);
      const cb = fire ? (held?.b ?? 0.3) * 255 : lerp(tc.b, 255, 0.55);
      const n = this.trail.length;
      for (let i = 0; i < n - 1; i++) {
        const q0 = this.trail[i] as (typeof this.trail)[number];
        const q1 = this.trail[i + 1] as (typeof this.trail)[number];
        if (q1.t - q0.t > 0.12) continue;
        const k0 = strength * Math.pow((i + 0.2) / (n - 1), 1.7);
        const k1 = strength * Math.pow((i + 1.2) / (n - 1), 1.7);
        glowTriangle(vp, q0.tx, q0.ty, k0 * 0.9, q1.tx, q1.ty, k1 * 0.9, q1.mx, q1.my, 0, cr, cg, cb);
        glowTriangle(vp, q0.tx, q0.ty, k0 * 0.9, q1.mx, q1.my, 0, q0.mx, q0.my, 0, cr, cg, cb);
      }
    }

    // --- The item itself.
    if (sprite) blitWarped(vp, sprite, warp, pts);

    // --- Light on top: the flame and its glow, a charged item's gleam.
    if (sprite && held?.flame) this.flame(vp, pts.tip.x, pts.tip.y, warp.side / (H * 0.65), held, f, dt, H);
    if (glow > 0.05 && sprite) {
      const gr = item?.weapon?.tint ?? { r: 255, g: 220, b: 160 };
      glowDisc(vp, pts.tip.x, pts.tip.y, H * (0.02 + glow * 0.05), lerp(gr.r, 255, 0.5), lerp(gr.g, 255, 0.5), lerp(gr.b, 255, 0.4), 0.25 + glow * 0.4);
    }
    this.fx(vp, dt, H);
  }

  /** Flames at the head of a brand: motes that rise from where it is, and are left behind when it moves. */
  private flame(vp: Surface, fx: number, fy: number, size: number, light: { r: number; g: number; b: number }, f: ViewFrame, dt: number, H: number): void {
    const scale = (H / 200) * size * 1.15;
    this.spawnFlame += dt * 110;
    const em = CONTENT.effects['torchFlame'];
    const c0 = em?.colour ?? 0xff9632;
    const c1 = em?.colourTo ?? 0xffdc32;
    while (this.spawnFlame >= 1) {
      this.spawnFlame -= 1;
      const k = Math.random();
      this.motes.push({
        x: fx + (Math.random() - 0.5) * 5 * scale,
        y: fy + (Math.random() - 0.3) * 3 * scale,
        vx: (Math.random() - 0.5) * 14 * scale,
        vy: -(30 + Math.random() * 40) * scale,
        life: 0.3 + Math.random() * 0.3,
        age: 0,
        size: (3.4 + Math.random() * 3.4) * scale,
        r: lerp(rgbR(c0), rgbR(c1), k) * (0.55 + light.r * 0.45),
        g: lerp(rgbG(c0), rgbG(c1), k) * (0.55 + light.g * 0.45),
        b: lerp(rgbB(c0), rgbB(c1), k) * (0.55 + light.b * 0.45),
        kind: 'flame',
      });
    }
    // Rising smoke is left to the world; the glow round the flame lights the hand and the air.
    const flick = 0.85 + Math.sin(f.time * 23) * 0.08 + Math.sin(f.time * 41) * 0.07;
    glowDisc(vp, fx, fy, 26 * scale * flick, light.r * 255, light.g * 190, light.b * 100, 0.22);
    glowDisc(vp, fx, fy, 9 * scale * flick, 255, 210, 130, 0.55);
  }

  /** Motes, flashes and sparks: advance them and paint them. */
  private fx(vp: Surface, dt: number, H: number): void {
    const g = CONTENT.viewmodel.impact.gravity * H;
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i] as Mote;
      m.age += dt;
      if (m.age >= m.life) {
        this.motes.splice(i, 1);
        continue;
      }
      const t = m.age / m.life;
      const px = m.x;
      const py = m.y;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.kind === 'spark' || m.kind === 'drop' || m.kind === 'ember') {
        m.vy += g * dt;
        m.vx *= 1 - dt * 1.2;
      } else if (m.kind === 'puff') {
        m.vx *= 1 - dt * 3;
        m.vy = m.vy * (1 - dt * 3) - H * 0.02 * dt;
      } else {
        m.vx *= 1 - dt * 1.5;
      }
      if (m.kind === 'flame') {
        // Hot white-yellow at birth, orange, then deep red as it dies; and smaller.
        const heat = 1 - t;
        const sz = m.size * (1 - t * 0.55);
        glowDisc(vp, m.x, m.y, sz, m.r, m.g * (0.45 + 0.55 * heat), m.b * heat * heat, 0.7 * (1 - t * t), 0.4);
      } else if (m.kind === 'spark') {
        glowLine(vp, m.x, m.y, px - (m.x - px) * 1.2, py - (m.y - py) * 1.2, m.r, m.g, m.b, 0.95 * (1 - t), 0.1);
        addPixel(vp, m.x, m.y, 255, 255, 255, 0.7 * (1 - t));
      } else if (m.kind === 'ember') {
        addPixel(vp, m.x, m.y, m.r, m.g, m.b, 0.9 * (1 - t));
        addPixel(vp, m.x, m.y - 1, m.r, m.g * 0.7, m.b * 0.4, 0.5 * (1 - t));
      } else if (m.kind === 'drop') {
        blendPixel(vp, m.x, m.y, m.r, m.g, m.b, 0.9 * (1 - t * 0.5));
        blendPixel(vp, m.x, m.y + 1, m.r, m.g, m.b, 0.55 * (1 - t));
      } else {
        const rr = (m.size + t * 4) * (H / 200);
        for (let j = -2; j <= 2; j++) {
          for (let k = -2; k <= 2; k++) {
            if (j * j + k * k > rr) continue;
            blendPixel(vp, m.x + k, m.y + j, m.r, m.g, m.b, 0.38 * (1 - t));
          }
        }
      }
    }
  }
}

export type { SwingDir };
