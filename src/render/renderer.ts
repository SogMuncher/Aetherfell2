import type { Entity, ReadonlyTiles, SimEvent, SimState, WorldSampler } from '../types';
import { computeEnv, LightMap, lerp } from './lighting';
import type { Env } from './lighting';
import { Viewport } from './viewport';
import { TerrainLod } from './raycaster/terrainLod';
import { CloudShadow } from './raycaster/cloudShadow';
import { project } from './raycaster/camera';
import type { Camera, Projection } from './raycaster/camera';
import { SpriteRenderer } from './entities/spriteRenderer';
import { ViewModel } from './entities/viewModel';
import { Particles } from './vfx/particles';
import { GpuRenderer } from './gpu/gpuRenderer';

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

/**
 * Read-only renderer: turns sim state into a frame. Holds only visual memory (caches, particles,
 * camera bob, flashes) — nothing here ever writes to the simulation.
 */
export class Renderer {
  readonly viewport: Viewport;
  /** Cached far land (LOD pyramid) the GPU terrain reads. */
  readonly lod: TerrainLod;
  /** Where clouds keep the sun off the land. */
  private readonly shadow = new CloudShadow();
  private realm = 'overworld';
  private sprites = new SpriteRenderer();
  readonly particles = new Particles();
  private lightmap = new LightMap();
  private viewModel = new ViewModel();
  private gpu: GpuRenderer | null = null;
  /** WebGL2 could not start: nothing can be drawn (said once in the console). */
  private gpuFailed = false;
  private readonly sampler: WorldSampler;
  private time = 0;
  private flash = 0;
  private hurt = 0;
  private shake = 0;
  private bob = 0;
  private hitFlash = new Map<number, number>();
  lastProjection: Projection | null = null;
  lastEnv: Env | null = null;
  stats = { gpuMs: 0, totalMs: 0 };
  /** Look options from the settings menu (main.ts keeps these up to date). */
  options = { shake: true, bob: true, fovDegrees: 60, colourLevels: 24, lights: 4 };

  constructor(canvas: HTMLCanvasElement, sampler: WorldSampler, tiles: ReadonlyTiles) {
    this.viewport = new Viewport(canvas, 200);
    this.lod = new TerrainLod(sampler, tiles);
    this.sampler = sampler;
  }

  /** Lets go of the graphics card canvas (a world swap makes a fresh Renderer; the old one must not stay on top, frozen). */
  dispose(): void {
    this.gpu?.dispose();
    this.gpu = null;
  }

  onEvent(e: SimEvent, state: SimState, localId: number | null): void {
    this.particles.onEvent(e, state);
    this.viewModel.onEvent(e, state, localId);
    if (e.type === 'thunder') this.flash = 1;
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
    const cam: Camera = {
      x: cx,
      y: cy,
      z: cz,
      yaw: f.yaw,
      pitch: f.pitch,
      shakeX: this.options.shake ? (Math.random() - 0.5) * this.shake : 0,
      shakeY: this.options.shake ? (Math.random() - 0.5) * this.shake : 0,
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
    this.lod.beginFrame(7);
    this.lightmap.build(state, tiles, cx, cy, this.time, f.alpha);
    const billboards = this.sprites.collect(p, state, tiles, f.localId, f.alpha, this.time, this.hitFlash);
    const wl = tiles.waterLevel(cx, cy);
    const underwater = me && cz < wl && tiles.ground(cx, cy) < wl ? Math.min(1, (wl - cz) * 2) : 0;
    this.shadow.update(state.weather, cx, cy);
    this.particles.emit(state, tiles, cx, cy, f.dt, env);
    this.particles.update(f.dt);
    const wind = state.weather.wind;
    this.gpu.draw({
      eye: { x: cam.x, y: cam.y, z: cam.z }, yaw: cam.yaw, pitch: cam.pitch, fovDegrees: this.options.fovDegrees,
      env, weather: state.weather, volume: state.volume, lightmap: this.lightmap, lightsPerPixel: this.options.lights, tiles, burning: state.burning, billboards, motes: this.particles.motes, shadow: this.shadow, shadowOn: this.shadow.active && env.open, windSide: wind.x * p.RX + wind.y * p.RY, paintHand: me ? (s) => this.viewModel.draw(s, me, env, this.lightmap, { yaw: f.yaw, pitch: f.pitch, bob: this.bob, alpha: f.selfAlpha ?? f.alpha, dt: f.dt, time: this.time }) : null, realm: state.realm, time: this.time,
      post: { hurt: this.hurt, underwater, downed: me?.player && me.player.downed > 0 ? 0.8 : 0, levels: this.options.colourLevels },
    });
    return true;
  }
}
