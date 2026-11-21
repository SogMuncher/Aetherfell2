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
  private time = 0;
  private flash = 0;
  private hurt = 0;
  private shake = 0;
  private bob = 0;
  private hitFlash = new Map<number, number>();
  lastProjection: Projection | null = null;
  lastEnv: Env | null = null;
  stats = { terrainMs: 0, spritesMs: 0, totalMs: 0 };
  /** Look options from the settings menu (main.ts keeps these up to date). */
  options = { shake: true, bob: true, fovDegrees: 60, colourLevels: 24 };

  constructor(canvas: HTMLCanvasElement, sampler: WorldSampler, tiles: ReadonlyTiles) {
    this.viewport = new Viewport(canvas, 200);
    this.terrain = new TerrainRenderer(sampler, tiles);
  }

  onEvent(e: SimEvent, state: SimState, localId: number | null): void {
    this.particles.onEvent(e, state);
    this.viewModel.onEvent(e, state, localId, this.lastProjection);
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
    this.lightmap.build(state, tiles, cx, cy, this.time, f.alpha);
    this.terrain.time = this.time;
    this.terrain.shadow.update(state.weather, cx, cy);
    this.terrain.draw(vp, p, env, this.lightmap);
    drawSky(vp, p, env, this.terrain.colTop, this.time, state.weather);
    this.volume.draw(vp, p, env, this.lightmap, state.volume);
    const t1 = performance.now();
    this.sprites.draw(vp, p, env, this.lightmap, state, tiles, f.localId, f.alpha, this.time, this.hitFlash);
    this.particles.emit(state, tiles, cx, cy, f.dt, env);
    this.particles.update(f.dt);
    this.particles.draw(vp, p, env);
    this.particles.drawRain(vp, p, env, state.weather.wind.x, state.weather.wind.y, this.time);
    if (me) this.viewModel.draw(vp, me, env, this.lightmap, { yaw: f.yaw, pitch: f.pitch, bob: this.bob, alpha: sa, dt: f.dt, time: this.time });
    const t2 = performance.now();
    const wl = tiles.waterLevel(cx, cy);
    const underwater = me && cz < wl && tiles.ground(cx, cy) < wl ? Math.min(1, (wl - cz) * 2) : 0;
    postProcess(vp, { hurt: this.hurt, underwater, downed: me?.player && me.player.downed > 0 ? 0.8 : 0 }, this.options.colourLevels);
    vp.present();
    const t3 = performance.now();
    this.stats.terrainMs = this.stats.terrainMs * 0.9 + (t1 - t0) * 0.1;
    this.stats.spritesMs = this.stats.spritesMs * 0.9 + (t2 - t1) * 0.1;
    this.stats.totalMs = this.stats.totalMs * 0.9 + (t3 - t0) * 0.1;
  }
}
