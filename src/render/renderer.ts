import type { Entity, ReadonlyTiles, SimEvent, SimState, VolumeFrame, WorldSampler } from '../types';
import { computeEnv, LightMap, lerp, poseBetween } from './lighting';
import type { Env } from './lighting';
import { Viewport } from './viewport';
import { TerrainLod } from './raycaster/terrainLod';
import { project } from './raycaster/camera';
import type { Camera, Projection } from './raycaster/camera';
import { SpriteRenderer } from './entities/spriteRenderer';
import { ViewModel, type ViewFrame } from './entities/viewModel';
import type { Surface } from './vfx/glow';
import { ViewGlider } from './entities/viewGlider';
import { Particles } from './vfx/particles';
import { Crumble } from './vfx/crumble';
import { GpuRenderer } from './gpu/gpuRenderer';
import { LIGHT_DEFAULT, type LightQuality } from './gpu/gpuLight';

export interface FrameInput {
  state: SimState;
  tiles: ReadonlyTiles;
  localId: number | null;
  /** 0..1 between the previous and the current sim tick. */
  alpha: number;
  /** The same for your own traveller when it moves on its own clock (a guest's foreseen movement). */
  selfAlpha?: number;
  /** Look direction straight from the mouse — never waits for the sim. */
  yaw: number;
  pitch: number;
  dt: number;
}

/** Strafe lean (Quake-like, gentle): at most `max` radians, reached at `full` m/s sideways, easing at `rate` per second. */
const LEAN = { max: 0.03, full: 4, rate: 7 } as const;

/**
 * Read-only renderer: turns sim state into a frame. Holds only visual memory (caches, particles,
 * camera bob, flashes) — nothing here ever writes to the simulation.
 */
export class Renderer {
  readonly viewport: Viewport;
  /** Cached far land (LOD pyramid) the GPU terrain reads. */
  readonly lod: TerrainLod;
  /** Where clouds keep the sun off the land. */
  private realm = 'overworld';
  private sprites = new SpriteRenderer();
  readonly particles = new Particles();
  /** Dying bodies falling apart into their pixels. */
  private readonly crumble = new Crumble();
  private readonly world: ReadonlyTiles;
  private lightmap = new LightMap();
  private viewModel = new ViewModel();
  private viewGlider = new ViewGlider();
  private gpu: GpuRenderer | null = null;
  /** WebGL2 could not start: nothing can be drawn (said once in the console). */
  private gpuFailed = false;
  private readonly sampler: WorldSampler;
  private time = 0;
  private flash = 0;
  private hurt = 0;
  private shake = 0;
  private bob = 0;
  /** How far the view leans into a sideways step (radians, right +). */
  private lean = 0;
  private hitFlash = new Map<number, number>();
  lastProjection: Projection | null = null;
  lastEnv: Env | null = null;
  stats = { gpuMs: 0, totalMs: 0 };
  /** Look options from the settings menu (main.ts keeps these up to date). */
  options: { shake: boolean; bob: boolean; tilt: boolean; fovDegrees: number; colourLevels: number; light: LightQuality } = { shake: true, bob: true, tilt: true, fovDegrees: 60, colourLevels: 24, light: { ...LIGHT_DEFAULT } };

  constructor(canvas: HTMLCanvasElement, sampler: WorldSampler, tiles: ReadonlyTiles) {
    this.viewport = new Viewport(canvas, 200);
    this.lod = new TerrainLod(sampler, tiles);
    this.world = tiles;
    this.sampler = sampler;
  }

  /** Lets go of the graphics card canvas (a world swap makes a fresh Renderer; the old one must not stay on top, frozen). */
  dispose(): void {
    this.gpu?.dispose();
    this.gpu = null;
  }

  onEvent(e: SimEvent, state: SimState, localId: number | null): void {
    this.particles.onEvent(e, state);
    if (e.type === 'death' && this.lastProjection) {
      const b = this.sprites.lastDrawn(e.entity, this.time);
      if (b) this.crumble.spawn(b, this.lastProjection.cam.x, this.lastProjection.cam.y, this.world, state.volume);
    }
    this.viewModel.onEvent(e, state, localId);
    if (e.type === 'thunder') this.flash = 1;
    const by = e.type === 'thrown' ? state.entities.get(e.entity)?.thrownBy : null;
    if (by != null) this.sprites.thrown(by);
    if (e.type === 'hit') {
      this.hitFlash.set(e.target, 0.6);
      if (e.target === localId && e.damage > 0) {
        this.hurt = Math.min(1, this.hurt + e.damage / 30);
        this.shake = Math.min(6, this.shake + e.damage / 4);
      }
      if (e.source === localId) this.shake = Math.max(this.shake, e.parried ? 3 : 1.2 + (e.power ?? 0) * 3.5 + (e.killed ? 1 : 0));
    }
    // Striking a wall, door or tree: a heavy blow on something hard jolts the view; a solid recoil jolts it more.
    const mine = localId !== null ? state.entities.get(localId) : undefined;
    if (e.type === 'strike' && mine && Math.hypot(mine.pos.x - e.x, mine.pos.y - e.y) < 3.5) {
      this.shake = Math.max(this.shake, 0.8 + e.power * 3 + (e.recoil ? 2.5 : 0));
    }
    if (e.type === 'land' && e.entity === localId) this.shake = Math.min(5, e.speed / 3);
  }

  render(f: FrameInput): void {
    const t0 = performance.now();
    this.time += f.dt;
    this.flash = Math.max(0, this.flash - f.dt * 3);
    this.hurt = Math.max(0, this.hurt - f.dt * 1.2);
    this.shake = Math.max(0, this.shake - f.dt * 18);
    for (const [k, v] of this.hitFlash) {
      if (v <= f.dt * 3) this.hitFlash.delete(k);
      else this.hitFlash.set(k, v - f.dt * 3);
    }
    const vp = this.viewport;
    const { state, tiles } = f;
    if (state.realm !== this.realm) {
      this.realm = state.realm;
      this.lod.forgetAll();
      this.gpu?.forget();
    }
    const me: Entity | undefined = f.localId !== null ? state.entities.get(f.localId) : undefined;
    // A fully wound-up blow makes the view tremble a little.
    if (me?.actor?.charge?.full) this.shake = Math.max(this.shake, 0.7);
    let cx = 0;
    let cy = 0;
    let cz = Math.max(0, tiles.ground(0, 0)) + 28;
    const sa = f.selfAlpha ?? f.alpha;
    if (me) {
      cx = lerp(me.prev.x, me.pos.x, sa);
      cy = lerp(me.prev.y, me.pos.y, sa);
      const downed = (me.player?.downed ?? 0) > 0;
      cz = lerp(me.prevZ, me.z, sa) + (downed ? 0.4 : 1.62);
      const speed = Math.hypot(me.vel.x, me.vel.y);
      if (me.actor?.onGround && speed > 0.5) this.bob += f.dt * speed * 1.9;
      if (this.options.bob) cz += Math.sin(this.bob * 2) * 0.04;
    }
    // Stepping sideways leans the view a little into the step (eases in and out).
    const side = me && this.options.tilt && !((me.player?.downed ?? 0) > 0) ? me.vel.y * Math.cos(f.yaw) - me.vel.x * Math.sin(f.yaw) : 0;
    const want = Math.max(-1, Math.min(1, side / LEAN.full)) * LEAN.max;
    this.lean += (want - this.lean) * Math.min(1, f.dt * LEAN.rate);
    const cam: Camera = {
      x: cx,
      y: cy,
      z: cz,
      yaw: f.yaw,
      pitch: f.pitch,
      shakeX: this.options.shake ? (Math.random() - 0.5) * this.shake : 0,
      shakeY: this.options.shake ? (Math.random() - 0.5) * this.shake : 0,
      roll: this.lean,
    };
    const p = project(cam, vp.width, vp.height, 0.5 / Math.tan((this.options.fovDegrees * Math.PI) / 360));
    this.lastProjection = p;
    const env = computeEnv(state, this.flash, cx, cy, cz);
    // Under a roof no rain falls on you (the streaks and splashes stop).
    if (env.rain > 0 && !state.volume.openSky(cx, cy, cz + 0.3)) env.rain = 0;
    this.lastEnv = env;
    if (!this.renderGpu(f, p, cam, env, cx, cy, cz, me)) return;
    this.stats.totalMs = this.stats.totalMs * 0.9 + (performance.now() - t0) * 0.1;
    this.stats.gpuMs = this.gpu?.gpuMs ?? 0;
  }

  /** The frame on the graphics card (docs/GPU-RENDER.md). Returns false when WebGL2 is unavailable. */
  private renderGpu(f: FrameInput, p: Projection, cam: Camera, env: Env, cx: number, cy: number, cz: number, me: Entity | undefined): boolean {
    const { state, tiles } = f;
    if (this.gpuFailed) return false;
    try {
      this.gpu ??= new GpuRenderer(this.viewport.canvas, this.lod, this.sampler, tiles);
    } catch (e) {
      console.error('This game needs WebGL2 (a graphics card and browser that support it).', e);
      this.gpuFailed = true;
      return false;
    }
    this.lod.beginFrame(4, cx, cy);
    // What a guest foresees itself (its own traveller, crafts and what is fixed aboard them) moves every tick, so it is drawn
    // by the time since that tick, like the view; the rest by the time since the host's last update. One on the host.
    const alphaOf = (e: Entity): number => (e.id === f.localId || e.craft || e.ride || (me?.actor?.holding ?? null) === e.id ? (f.selfAlpha ?? f.alpha) : f.alpha);
    this.lightmap.build(state, tiles, cx, cy, this.time, alphaOf);
    const billboards = this.sprites.collect(p, state, tiles, f.localId, alphaOf, this.time, this.hitFlash);
    const wl = tiles.waterLevel(cx, cy);
    const underwater = me && cz < wl && tiles.ground(cx, cy) < wl ? Math.min(1, (wl - cz) * 2) : 0;
    this.particles.emit(state, tiles, cx, cy, f.dt, env);
    this.particles.update(f.dt);
    const wind = state.weather.wind;
    this.crumble.update(f.dt, wind, tiles, state.volume);
    this.gpu.draw({
      eye: { x: cam.x, y: cam.y, z: cam.z }, yaw: cam.yaw, pitch: cam.pitch, roll: cam.roll, fovDegrees: this.options.fovDegrees,
      env, weather: state.weather, volume: state.volume, frames: framesBetween(state, alphaOf), lightmap: this.lightmap, light: this.options.light, tiles, burning: state.burning, billboards, motes: this.particles.motes, crumbs: this.crumble, windSide: wind.x * p.RX + wind.y * p.RY, paintHand: me ? (s) => this.paintView(s, me, env, { yaw: f.yaw, pitch: f.pitch, bob: this.bob, alpha: f.selfAlpha ?? f.alpha, dt: f.dt, time: this.time, wind }) : null, realm: state.realm, time: this.time,
      post: { hurt: this.hurt, underwater, downed: me?.player && me.player.downed > 0 ? 0.8 : 0, levels: this.options.colourLevels },
    });
    return true;
  }

  /** Your own hands in the view: the held item, and over it the glider while it is open. */
  private paintView(s: Surface, me: Entity, env: Env, v: ViewFrame): void {
    this.viewModel.draw(s, me, env, this.lightmap, v);
    this.viewGlider.draw(s, me, env, this.lightmap, v);
  }
}

/** Moving frames (airships) where they are between two ticks, from their owners' last two places. */
function framesBetween(state: SimState, alphaOf: (e: Entity) => number): VolumeFrame[] {
  const out: VolumeFrame[] = [];
  for (const f of state.volume.frames.values()) {
    const e = state.entities.get(f.id);
    if (!e?.craft) {
      out.push(f);
      continue;
    }
    const at = poseBetween(e, alphaOf(e));
    out.push({ ...f, wx: at.x, wy: at.y, wz: at.z, yaw: at.yaw });
  }
  return out;
}
