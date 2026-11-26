// The held item in first person: its picture warped along the swing paths, with trail, impact flash and flame.
import type { Entity, HandPose, SimEvent, SimState, SwingDir } from '../../types';
import { CONTENT, actorHandling, chargeTicks, heldLight, itemDef, thingDef } from '../../content';
import type { Env, LightMap } from '../lighting';
import { glowDisc, glowLine, glowTriangle } from '../vfx/glow';
import type { Surface } from '../vfx/glow';
import { blitWarped, heldSprite, warpPoints } from './spriteWarp';
import type { Warp, WarpPoints } from './spriteWarp';
import { ViewMotes } from './viewFx';
import { arcAt, fromHand, mix, settle, smooth, swingIn, swingOut, toHand } from './viewPose';
import type { Pose3, SwingStart } from './viewPose';

/**
 * The item in your hand: its flat item picture (itemArt.ts), tilted, foreshortened, slanted and
 * tapered by the swing's pose so it reads as 3D motion (spriteWarp.ts), with a swing trail, hit
 * flashes and sparks. One animation for every held item, torches included. All numbers are in
 * content/viewmodel.ts; the flame comes from the item's light, sparks from the world's effect table.
 */

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);



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
  private readonly motes = new ViewMotes();
  /** The pose being shown (settles toward where the hand should be), and where the current swing set off from. */
  private cur: Pose3 | null = null;
  private start: SwingStart | null = null;
  private swingDir: SwingDir | null = null;
  private swingT = 0;
  /** While winding up: how far along the arc the hand is aiming (below 0 = drawn back past the start) and how drawn back it is (0..1). */
  private aimS = 0;
  private drawn = 0;
  /** Remembered tip and ribbon-start positions on screen, newest last. */
  private readonly trail: { tx: number; ty: number; mx: number; my: number; t: number }[] = [];
  private kick = { z: 0, vz: 0, r: 0, vr: 0 };
  /** Seconds left of the flash where a blow landed, and how hard it was. */
  private flash = 0;
  private flashPower = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private tipSpeed = 0;
  private lastTip: { x: number; y: number } | null = null;
  private lastWeapon: string | null | undefined = undefined;

  /** Remembers blows you land so the next frames can flash, throw sparks and kick the weapon. */
  onEvent(e: SimEvent, state: SimState, localId: number | null): void {
    if (localId === null) return;
    const me = state.entities.get(localId);
    if (!me?.actor) return;
    if (e.type === 'hit' && e.source === localId) {
      // Heavier blows (longer hitstop) ring harder.
      const power = clamp((e.power ?? 0) + Math.min(0.6, e.damage / 40) + (e.hold ?? 0) * 0.08, 0, 1.4);
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
    this.flash = Math.max(this.flash, vm.impact.flash * (0.6 + power * 0.6));
    this.flashPower = power;
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

    // --- Where the hand is: along the swing's arc (content/viewmodel.ts), settling smoothly between poses.
    const mo = vm.motion;
    const rest = fromHand(a.guard ? vm.guard : vm.rest);
    const cur = this.cur ?? (this.cur = { ...rest });
    let shake = 0;
    let glow = 0;
    const sw = a.swing;
    const c = a.charge;
    if (sw) {
      const arc = vm.arcs[sw.dir] ?? vm.arcs['thrust'];
      // A new swing sets off from wherever the hand was.
      if (!this.start || sw.dir !== this.swingDir || sw.t < this.swingT) this.start = { pose: { ...cur }, s0: this.aimS, drawn: this.drawn };
      this.swingDir = sw.dir;
      this.swingT = sw.t;
      const at = sw.t + al;
      const after = (at - sw.strikeAt) / Math.max(1, sw.recover - sw.strikeAt);
      if (arc && at < sw.strikeAt) Object.assign(cur, swingIn(arc, this.start, at / Math.max(1, sw.strikeAt), mo.tapWind, mo.lag));
      else if (arc && after < mo.through) Object.assign(cur, swingOut(arc, after / mo.through, mo.lag));
      else settle(cur, rest, mo.home, dt);
      glow = sw.power * (1 - Math.min(1, sw.t / Math.max(1, sw.recover)));
    } else {
      this.start = null;
      this.aimS = 0;
      this.drawn = 0;
      const arc = c ? vm.arcs[c.dir] : undefined;
      if (c && arc) {
        // Winding up: drawn back along the arc (further the longer it is held), and when the mouse
        // picks another way of swinging the hand glides over to it instead of jumping.
        const hd = actorHandling(CONTENT, thingDef(CONTENT, e.def), a.weapon);
        const full = chargeTicks(CONTENT, hd, c.dir);
        const frac = c.t <= ch.tap ? 0 : Math.min(1, (c.t + al - ch.tap) / Math.max(1, full - ch.tap));
        this.drawn = smooth((c.t + al) / 6);
        this.aimS = -mo.draw * frac;
        settle(cur, mix(rest, arcAt(arc, this.aimS), this.drawn), mo.aim, dt);
        shake = frac * 0.006 + (c.full ? 0.004 : 0);
        glow = c.full ? 0.6 + 0.4 * Math.sin((c.t + al) * 0.9) : frac * 0.35;
      } else {
        settle(cur, rest, a.guard ? mo.aim : mo.home, dt);
      }
    }
    const pose: HandPose = toHand(cur);
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
    lm.sample(e.pos.x, e.pos.y, e.z + 1.4, light);
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
    if (sprite && held?.flame) this.motes.flame(vp, pts.tip.x, pts.tip.y, warp.side / (H * 0.65), held, f, dt, H);
    if (glow > 0.05 && sprite) {
      const gr = item?.weapon?.tint ?? { r: 255, g: 220, b: 160 };
      glowDisc(vp, pts.tip.x, pts.tip.y, H * (0.02 + glow * 0.05), lerp(gr.r, 255, 0.5), lerp(gr.g, 255, 0.5), lerp(gr.b, 255, 0.4), 0.25 + glow * 0.4);
    }
    // A landed blow flashes where the weapon meets it: a bright core and a short star of streaks.
    if (this.flash > 0 && sprite) {
      const k = this.flash / Math.max(0.01, vm.impact.flash);
      const r = H * (0.025 + this.flashPower * 0.03) * (1.4 - k * 0.4);
      glowDisc(vp, pts.tip.x, pts.tip.y, r * 1.8, 255, 236, 200, 0.35 * k);
      glowDisc(vp, pts.tip.x, pts.tip.y, r * 0.6, 255, 255, 255, 0.8 * k);
      for (let i = 0; i < 4; i++) {
        const an = i * 1.5708 + 0.4;
        glowLine(vp, pts.tip.x, pts.tip.y, pts.tip.x + Math.cos(an) * r * 2.4, pts.tip.y + Math.sin(an) * r * 2.4, 255, 245, 220, 0.7 * k, 0.15);
      }
      this.flash = Math.max(0, this.flash - dt);
    }
    this.motes.fx(vp, dt, H);
  }
}

export type { SwingDir };
