/**
 * The GPU pipeline (stage 1: terrain, sky, air motes, post). One WebGL2 canvas at the same low resolution as the CPU
 * view, one shared depth buffer, passes in this order: sky, terrain (LOD clipmap), air motes, post (dither, tints).
 * Read-only on sim state; the CPU renderer stays alongside until the last stage is verified (docs/GPU-RENDER.md).
 */
import { CONTENT } from '../../content';
import type { AirDef, WorldSampler } from '../../types';
import type { Env } from '../lighting';
import type { TerrainLod } from '../raycaster/terrainLod';
import type { ReadonlyTiles, ReadonlyVolume, VolumeFrame, WeatherState } from '../../types';
import type { Billboard } from '../entities/spriteRenderer';
import type { LightMap } from '../lighting';
import type { Particle } from '../vfx/particleKinds';
import type { Surface } from '../vfx/glow';
import { GpuAir } from './gpuAir';
import { GpuSpeedLines } from './gpuSpeedLines';
import { GpuClouds } from './gpuClouds';
import { GpuGodRays } from './gpuGodRays';
import { GpuOverlay } from './gpuOverlay';
import { GpuParticles } from './gpuParticles';
import { GpuLight, type LightQuality } from './gpuLight';
import { GpuReflect } from './gpuReflect';
import { GpuSolid } from './gpuSolid';
import { GpuCasters } from './gpuCasters';
import { GpuFarShade } from './gpuFarShade';
import { GpuSprites } from './gpuSprites';
import { GpuPost } from './gpuPost';
import type { PostParams } from './gpuPost';
import { GpuSky } from './gpuSky';
import { makeSurfaceAtlas } from './gpuSurfaces';
import { GpuStructures } from './gpuStructures';
import { GpuTerrain } from './gpuTerrain';
import { GpuTileBlocks } from './gpuTileBlocks';
import { camBasis, viewProj } from './glUtil';

const NEAR = 0.3;
const FAR = 20000;

/** No wind, where the air is still. */
const STILL = { x: 0, y: 0 } as const;

export interface GpuFrame {
  eye: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  /** Lean of the view to the right (radians). */
  roll?: number;
  fovDegrees: number;
  env: Env;
  weather: WeatherState;
  volume: ReadonlyVolume;
  /** Moving frames (airships) where they are drawn this frame (between ticks). */
  frames?: readonly VolumeFrame[];
  lightmap: LightMap;
  /** How the light pass works (Video settings). */
  light: LightQuality;
  tiles: ReadonlyTiles;
  /** Burning ground spots (smoke sources; the 3D layer's are in `volume`). */
  burning: ReadonlySet<number>;
  billboards: readonly Billboard[];
  motes: readonly Particle[];
  /** Crumbs of dying bodies, already in the motes' vertex layout (vfx/crumble.ts). */
  crumbs?: { readonly data: Float32Array; readonly count: number };
  /** Wind across your view (for the rain slant). */
  windSide: number;
  /** Paints the held item into the overlay buffer. */
  paintHand: ((s: Surface) => void) | null;
  realm: string;
  time: number;
  post: PostParams;
}

interface TimerExt {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly gl: WebGL2RenderingContext;
  private readonly terrain: GpuTerrain;
  private readonly structures: GpuStructures;
  private readonly blocks: GpuTileBlocks;
  private readonly light: GpuLight;
  private readonly reflect: GpuReflect;
  private readonly solid: GpuSolid;
  private readonly casters: GpuCasters;
  private readonly farShade: GpuFarShade;
  private readonly sprites: GpuSprites;
  private readonly fx: GpuParticles;
  private readonly overlay: GpuOverlay;
  private readonly sky: GpuSky;
  private readonly clouds: GpuClouds;
  private readonly rays: GpuGodRays;
  private readonly air: GpuAir;
  private readonly speedLines: GpuSpeedLines;
  private readonly post: GpuPost;
  private readonly timer: TimerExt | null;
  private query: WebGLQuery | null = null;
  private frames = 0;
  private biomeAir: AirDef | undefined;
  /** GPU time of a frame in ms (0 when the browser cannot measure it). */
  gpuMs = 0;

  constructor(private readonly host: HTMLCanvasElement, lod: TerrainLod, private readonly sampler: WorldSampler, tiles: ReadonlyTiles) {
    this.canvas.style.cssText = 'position:absolute;image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none';
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    const surf = makeSurfaceAtlas(gl);
    this.light = new GpuLight(gl);
    this.reflect = new GpuReflect(gl);
    this.solid = new GpuSolid(gl);
    this.terrain = new GpuTerrain(gl, lod, tiles, surf);
    this.casters = new GpuCasters(gl);
    this.farShade = new GpuFarShade(gl, this.terrain);
    this.structures = new GpuStructures(gl, surf);
    this.blocks = new GpuTileBlocks(gl, surf);
    this.sprites = new GpuSprites(gl);
    this.fx = new GpuParticles(gl);
    this.overlay = new GpuOverlay(gl);
    this.sky = new GpuSky(gl);
    this.clouds = new GpuClouds(gl);
    this.farShade.setClouds(this.clouds.shade);
    this.rays = new GpuGodRays(gl);
    this.air = new GpuAir(gl);
    this.speedLines = new GpuSpeedLines(gl);
    this.post = new GpuPost(gl);
    this.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExt | null;
    host.insertAdjacentElement('afterend', this.canvas);
    host.style.opacity = '0';
  }

  forget(): void {
    this.terrain.forget();
    this.structures.forget();
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
    this.host.style.opacity = '';
  }

  private fit(): void {
    const { width, height, style } = this.host;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.canvas.style.width = style.width;
    this.canvas.style.height = style.height;
    this.canvas.style.left = `${this.host.offsetLeft}px`;
    this.canvas.style.top = `${this.host.offsetTop}px`;
  }

  draw(f: GpuFrame): void {
    const gl = this.gl;
    this.fit();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.frames++;
    this.readTimer();
    const timing = this.timer && !this.query;
    if (timing && this.timer) {
      this.query = gl.createQuery();
      if (this.query) gl.beginQuery(this.timer.TIME_ELAPSED_EXT, this.query);
    }
    const cam = camBasis(f.yaw, f.pitch, f.fovDegrees, w / h, f.roll ?? 0);
    const vp = viewProj(f.eye, cam, NEAR, FAR);
    this.terrain.update(f.eye.x, f.eye.y);
    this.light.upload(f.lightmap.lights, f.eye.x, f.eye.y);
    this.solid.update(f.eye, f.tiles, f.volume, f.frames);
    // The air and its cloud shadows are built before the light pass reads them.
    this.clouds.prepare(f.eye, f.env, f.weather, f.time, { tiles: f.tiles, burning: f.burning, volume: f.volume });
    this.post.begin(w, h);
    this.sky.draw(cam, f.eye, f.env, f.time);
    this.post.surfaces(true);
    this.terrain.draw(vp, f.eye, f.env, f.time);
    this.blocks.draw(vp, f.eye, f.env, f.tiles, f.time);
    this.structures.draw(vp, cam, w, h, f.time, f.eye, f.env, f.volume, NEAR, FAR, f.frames);
    this.sprites.draw(vp, cam, f.eye, f.env, f.billboards);
    this.post.surfaces(false);
    this.casters.update(this.sprites.casters, this.solid.origin.x, this.solid.origin.y);
    // Every pixel's surface is known now: light all of them in one pass (sky, sun, lights, each with its shadow rays).
    const s = this.post.surfaceTextures;
    this.light.draw(cam, f.eye, f.env, f.light, s.alb, s.nrm, this.post.depthTexture, this.post.litTarget, this.solid, this.casters, this.farShade, w, h, NEAR, FAR);
    // Shiny surfaces (wet, ice, polished stuff) mirror the lit scene: from the screen or by a ray through the solid field.
    if (f.light.reflections !== 'off') this.reflect.draw(f.light.reflections === 'traced', cam, vp, f.eye, f.env, s.alb, s.nrm, this.post.depthTexture, this.post.sceneTarget, this.post.litTarget, this.solid, this.casters, w, h, NEAR, FAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.post.sceneTarget);
    this.clouds.draw(cam, f.eye, f.env, f.weather, w, h, this.post.depthTexture, this.post.sceneTarget, NEAR, FAR);
    this.rays.draw(cam, f.env, w, h, this.post.depthTexture, this.clouds.cover, this.post.sceneTarget);
    gl.viewport(0, 0, w, h);
    if (this.frames % 30 === 1) this.biomeAir = CONTENT.biomes[this.sampler.sample(f.eye.x, f.eye.y, 1).biome]?.air;
    const air = CONTENT.realms[f.realm]?.air ?? this.biomeAir;
    this.air.draw(vp, f.eye, air, f.time, 0.35 + 0.65 * f.env.day, f.env.open ? f.weather.wind : STILL);
    this.speedLines.draw(vp, f.eye, f.time, 0.35 + 0.65 * f.env.day);
    this.fx.drawMotes(vp, cam, f.env, f.motes, f.time, h, f.crumbs);
    this.fx.drawRain(f.env, w, h, f.windSide, f.time);
    const hand = this.overlay.begin(w, h);
    if (f.paintHand) {
      f.paintHand(hand);
      this.overlay.draw();
    }
    this.post.finish(f.post);
    if (timing && this.timer && this.query) gl.endQuery(this.timer.TIME_ELAPSED_EXT);
  }

  private readTimer(): void {
    const gl = this.gl;
    if (!this.timer || !this.query) return;
    if (!gl.getQueryParameter(this.query, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(this.timer.GPU_DISJOINT_EXT)) {
      const ns = gl.getQueryParameter(this.query, gl.QUERY_RESULT) as number;
      this.gpuMs = this.gpuMs * 0.9 + (ns / 1e6) * 0.1;
    }
    gl.deleteQuery(this.query);
    this.query = null;
  }
}
