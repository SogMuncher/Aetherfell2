import type { Entity, ReadonlyTiles, SimEvent, SimState, WorldSampler } from '../types';
import { computeEnv, LightMap, lerp } from './lighting';
import type { Env } from './lighting';
import { Viewport } from './viewport';
import { TerrainRenderer } from './raycaster/terrainRenderer';
import { drawSky } from './raycaster/sky';
import { VolumeRenderer } from './raycaster/volumeRenderer';
import { project } from './raycaster/camera';
import type { Camera, Projection } from './raycaster/camera';
import { SpriteRenderer } from './entities/spriteRenderer';
import { ViewModel } from './entities/viewModel';
import { Particles } from './vfx/particles';
import { postProcess } from './post';
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
  readonly terrain: TerrainRenderer;
  private realm = 'overworld';
  readonly volume = new VolumeRenderer();
  private sprites = new SpriteRenderer();
  readonly particles = new Particles();
  private lightmap = new LightMap();
  private viewModel = new ViewModel();
  private gpu: GpuRenderer | null = null;
  private readonly sampler: WorldSampler;
  private time = 0;
  private flash = 0;
  private hurt = 0;
  private shake = 0;
  private bob = 0;
  private hitFlash = new Map<number, number>();
  lastProjection: Projection | null = null;
  lastEnv: Env | null = null;
  stats = { gpuMs: 0, terrainMs: 0, spritesMs: 0, totalMs: 0, lightMs: 0, skyMs: 0, volumeMs: 0, vfxMs: 0, postMs: 0 };
  /** Look options from the settings menu (main.ts keeps these up to date). */
  options = { shake: true, bob: true, fovDegrees: 60, colourLevels: 24, gpu: false };

  constructor(canvas: HTMLCanvasElement, sampler: WorldSampler, tiles: ReadonlyTiles) {
    this.viewport = new Viewport(canvas, 200);
    this.terrain = new TerrainRenderer(sampler, tiles);
    this.sampler = sampler;
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
      this.terrain.forgetFar();
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
    const env = computeEnv(state, this.flash, cx, cy);
    // Under a roof no rain falls on you (the streaks and splashes stop).
    if (env.rain > 0 && !state.volume.openSky(cx, cy, cz + 0.3)) env.rain = 0;
    this.lastEnv = env;
    if (this.options.gpu && this.renderGpu(f, p, cam, env, cx, cy, cz, me)) {
      this.stats.totalMs = this.stats.totalMs * 0.9 + (performance.now() - t0) * 0.1;
      this.stats.gpuMs = this.gpu?.gpuMs ?? 0;
      return;
    }
    if (this.gpu) {
      this.gpu.dispose();
      this.gpu = null;
    }
    const a0 = performance.now();
    this.lightmap.build(state, tiles, cx, cy, this.time, f.alpha);
    this.terrain.time = this.time;
    this.terrain.shadow.update(state.weather, cx, cy);
    const a1 = performance.now();
    this.terrain.draw(vp, p, env, this.lightmap);
    const a2 = performance.now();
    drawSky(vp, p, env, this.terrain.colTop, this.time, state.weather);
    const a3 = performance.now();
    this.volume.draw(vp, p, env, this.lightmap, state.volume);
    const t1 = performance.now();
    this.sprites.draw(vp, p, env, this.lightmap, state, tiles, f.localId, f.alpha, this.time, this.hitFlash);
    const b0 = performance.now();
    this.particles.emit(state, tiles, cx, cy, f.dt, env);
    this.particles.update(f.dt);
    this.particles.draw(vp, p, env);
    this.particles.drawRain(vp, p, env, state.weather.wind.x, state.weather.wind.y, this.time);
    if (me) this.viewModel.draw(vp, me, env, this.lightmap, { yaw: f.yaw, pitch: f.pitch, bob: this.bob, alpha: sa, dt: f.dt, time: this.time });
    const t2 = performance.now();
    const b1 = t2;
    const wl = tiles.waterLevel(cx, cy);
    const underwater = me && cz < wl && tiles.ground(cx, cy) < wl ? Math.min(1, (wl - cz) * 2) : 0;
    postProcess(vp, { hurt: this.hurt, underwater, downed: me?.player && me.player.downed > 0 ? 0.8 : 0 }, this.options.colourLevels);
    vp.present();
    const t3 = performance.now();
    const st = this.stats;
    const avg = (old: number, v: number): number => old * 0.9 + v * 0.1;
    st.lightMs = avg(st.lightMs, a1 - a0);
    st.terrainMs = avg(st.terrainMs, a2 - a1);
    st.skyMs = avg(st.skyMs, a3 - a2);
    st.volumeMs = avg(st.volumeMs, t1 - a3);
    st.spritesMs = avg(st.spritesMs, b0 - t1);
    st.vfxMs = avg(st.vfxMs, b1 - b0);
    st.postMs = avg(st.postMs, t3 - b1);
    this.stats.totalMs = this.stats.totalMs * 0.9 + (t3 - t0) * 0.1;
  }

  /** GPU pipeline frame (docs/GPU-RENDER.md). Returns false when WebGL2 is unavailable, so the CPU path draws instead. */
  private renderGpu(f: FrameInput, p: Projection, cam: Camera, env: Env, cx: number, cy: number, cz: number, me: Entity | undefined): boolean {
    const { state, tiles } = f;
    try {
      this.gpu ??= new GpuRenderer(this.viewport.canvas, this.terrain.lod, this.sampler, tiles);
    } catch (e) {
      console.warn('GPU renderer unavailable, using the classic one', e);
      this.options.gpu = false;
      return false;
    }
    this.terrain.lod.beginFrame(7);
    this.lightmap.build(state, tiles, cx, cy, this.time, f.alpha);
    const billboards = this.sprites.collect(p, state, tiles, f.localId, f.alpha, this.time, this.hitFlash);
    const wl = tiles.waterLevel(cx, cy);
    const underwater = me && cz < wl && tiles.ground(cx, cy) < wl ? Math.min(1, (wl - cz) * 2) : 0;
    this.terrain.shadow.update(state.weather, cx, cy);
    this.particles.emit(state, tiles, cx, cy, f.dt, env);
    this.particles.update(f.dt);
    const wind = state.weather.wind;
    this.gpu.draw({
      eye: { x: cam.x, y: cam.y, z: cam.z }, yaw: cam.yaw, pitch: cam.pitch, fovDegrees: this.options.fovDegrees,
      env, weather: state.weather, volume: state.volume, lightmap: this.lightmap, tiles, billboards, motes: this.particles.motes, shadow: this.terrain.shadow, shadowOn: this.terrain.shadow.active && env.open, windSide: wind.x * p.RX + wind.y * p.RY, paintHand: me ? (s) => this.viewModel.draw(s, me, env, this.lightmap, { yaw: f.yaw, pitch: f.pitch, bob: this.bob, alpha: f.selfAlpha ?? f.alpha, dt: f.dt, time: this.time }) : null, realm: state.realm, time: this.time,
      post: { hurt: this.hurt, underwater, downed: me?.player && me.player.downed > 0 ? 0.8 : 0, levels: this.options.colourLevels },
    });
    return true;
  }
}
