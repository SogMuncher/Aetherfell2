// GPU clouds, mist and smoke: the air cells walked nearest first per pixel, each clump one solid shape, cut at the scene depth.
/**
 * The air cells (gpuAirFill.ts: one stack of levels of cubic cells round the eye, fine near and twice as wide per
 * level) are walked cell by cell per pixel, nearest first, and cut off at the nearest surface, so you can fly above,
 * around and through them and they always overlap in the right order. Far from the eye a level blends smoothly into
 * the next over the second half of each doubling of distance, so the size of the cells never pops. Each clump of
 * cloud cells is one solid shape: the face the ray enters by sets its look (lit top, dark base, sides by the sun) and
 * a short walk toward the sun shades it by the cloud in the way, and that look holds right through it, so no inside
 * faces. Clouds are lit by the same light as the overcast sky (`Env.cloudLit`), glow at their edges against the sun,
 * and fade into the horizon colour over the land's fog distance × `sky.haze`. Smoke (render/airSmoke.ts) is its own
 * box of cells in the same walk. `prepare` builds the air and the cloud shadows before the light pass reads them.
 */
import { CONTENT, layerCover } from '../../content';
import type { ReadonlyTiles, ReadonlyVolume, WeatherState } from '../../types';
import { AirSmoke } from '../airSmoke';
import type { Env } from '../lighting';
import { GpuAirFill } from './gpuAirFill';
import { GpuCloudShade } from './gpuCloudShade';
import { compile, loc, makeTexture } from './glUtil';
import type { CamBasis } from './glUtil';

/** Most cells a ray walks. */
const MAXS = 320;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (air: string, nl: number, sn: number, st: number): string => `#version 300 es
precision highp float; precision highp int; precision highp sampler3D;
${air}
out vec4 o;
uniform sampler2D uDepth; uniform sampler3D uSmokeTex;
uniform vec3 uFwd, uRight, uUp, uEye, uHaze, uLit, uSky, uSunCol, uSunDir, uSmoke; uniform vec2 uTan, uSize, uDrift;
uniform float uRange, uHazeDist, uNear, uFar, uRain, uFlash, uLod, uExt, uSelf, uLo, uHi, uSCell, uSExt;
uniform vec4 uSW; // smoke box corner in whole cells (x, y, z), on (w)
const float CUT = 0.08; const int SN = ${sn}; const int ST = ${st};
float smokeAt(vec3 p){
  ivec3 g = ivec3(floor(p / uSCell)); ivec3 r = g - ivec3(uSW.xyz);
  if (uSW.w < 0.5 || r.x < 0 || r.y < 0 || r.z < 0 || r.x >= SN || r.y >= SN || r.z >= ST) return 0.0;
  return texelFetch(uSmokeTex, ivec3(((g.x % SN) + SN) % SN, ((g.y % SN) + SN) % SN, ((g.z % ST) + ST) % ST), 0).r;
}
// The air at p seen from distance t: the level for that distance, blended into the next over the second half of the doubling.
vec4 airView(vec3 p, float t, out vec3 c, out int k){
  float lk = log2(max(1.0, t) / (uCell * uLod)); k = int(max(0.0, floor(lk)));
  vec4 a = airAt(p, k, c);
  float b = lk < 0.0 ? 0.0 : smoothstep(0.5, 1.0, fract(lk));
  if (b > 0.0 && k + 1 < ${nl}){ vec3 c2; a = mix(a, airAt(p, k + 1, c2), b); }
  return a;
}
vec3 exitT(vec3 lo, vec3 c, vec3 p, vec3 d){
  return vec3(d.x > 0.0 ? (lo.x + c.x - p.x) / d.x : d.x < 0.0 ? (lo.x - p.x) / d.x : 1e9,
              d.y > 0.0 ? (lo.y + c.y - p.y) / d.y : d.y < 0.0 ? (lo.y - p.y) / d.y : 1e9,
              d.z > 0.0 ? (lo.z + c.z - p.z) / d.z : d.z < 0.0 ? (lo.z - p.z) / d.z : 1e9);
}
void main(){
  vec2 nd = (gl_FragCoord.xy / uSize) * 2.0 - 1.0;
  vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y; vec3 d = normalize(r);
  float dep = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  float t1 = uRange;
  if (dep < 0.99999){ float zn = dep * 2.0 - 1.0; float zv = 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); t1 = zv * length(r); }
  // Only the band of heights that holds air worth drawing (every layer, and the smoke box).
  float t0 = 0.0; float cz = uEye.z;
  if (abs(d.z) > 1e-5){
    float a = (uLo - cz) / d.z, b = (uHi - cz) / d.z;
    t0 = max(0.0, min(a, b)); t1 = min(t1, max(a, b));
  } else if (cz < uLo || cz > uHi) t1 = 0.0;
  if (t1 <= t0){ o = vec4(0.0); return; }
  vec3 q0 = vec3(uEye.xy - uDrift, cz);
  vec3 sd = normalize(uSunDir);
  // Light scattered forward through thin cloud toward the eye: a silver edge round clouds in front of the sun.
  float silver = pow(max(0.0, dot(d, sd)), 8.0);
  vec3 sc = vec3(uSCell); vec3 sLo = uSW.xyz * uSCell; vec3 sHi = sLo + vec3(float(SN), float(SN), float(ST)) * uSCell;
  float trans = 1.0; vec3 acc = vec3(0.0); float t = t0;
  bool inC = false; float cd = 0.0; vec3 col = vec3(0.0); float gap = 0.0;
  for (int i = 0; i < ${MAXS}; i++){
    if (t >= t1) break;
    float tp = t + max(0.01, t * 2e-5);
    vec3 p = q0 + d * tp;
    vec3 c; int k; vec4 a = airView(p, t, c, k);
    vec3 lo = floor(p / c) * c;
    vec3 tt = exitT(lo, c, p, d);
    float tc = min(tt.x, min(tt.y, tt.z));
    // Inside the smoke box the walk also stops at every smoke cell, so smoke is drawn cell by cell.
    float sm = 0.0; float ts = 1e9;
    if (uSW.w > 0.5 && all(greaterThanEqual(p, sLo)) && all(lessThan(p, sHi))){
      sm = smokeAt(p);
      vec3 st = exitT(floor(p / sc) * sc, sc, p, d);
      ts = min(st.x, min(st.y, st.z));
    }
    float tn = min(tp + min(tc, ts), t1);
    float seg = tn - t; t = tn;
    float fade = smoothstep(0.0, 2.0, t) * (1.0 - smoothstep(uRange * 0.7, uRange, t));
    float haze = 1.0 - exp(-t / uHazeDist);
    if (sm > 0.004){
      float als = (1.0 - exp(-uSExt * sm * seg)) * fade;
      acc += mix(uSmoke * uLit, uHaze, haze) * trans * als; trans *= 1.0 - als;
    }
    // A clump is one solid shape: its look is fixed where the ray enters it from clear air and stays the same right
    // through it, so cells inside a clump never show as faces or seams. A sliver of clear air (a ray slipping along
    // the edge where two cells meet) does not end the clump.
    if (a.r < CUT){ gap += seg; if (gap > 0.5 * min(c.x, c.z)) inC = false; continue; }
    gap = 0.0;
    if (!inC){
      inC = true; cd = clamp(a.r * 2.5, 0.3, 1.0);
      // The face it came in by, from the cell's own box (the side the ray crossed last), not from the step before.
      vec3 tin = vec3(d.x > 0.0 ? (lo.x - p.x) / d.x : d.x < 0.0 ? (lo.x + c.x - p.x) / d.x : -1e9,
                      d.y > 0.0 ? (lo.y - p.y) / d.y : d.y < 0.0 ? (lo.y + c.y - p.y) / d.y : -1e9,
                      d.z > 0.0 ? (lo.z - p.z) / d.z : d.z < 0.0 ? (lo.z + c.z - p.z) / d.z : -1e9);
      int f = t0 > 0.0 || i > 0 ? (tin.x >= tin.y && tin.x >= tin.z ? 0 : (tin.y >= tin.z ? 1 : 2)) : 3;
      float fs = f == 2 ? (d.z < 0.0 ? 1.06 : 0.62) : f == 0 ? 0.8 - 0.16 * sign(d.x) * sd.x : f == 1 ? 0.8 - 0.16 * sign(d.y) * sd.y : 0.86;
      // Self-shadow: the cloud between this cell and the sun, a few cells out (1, 2, 4, 8 cells).
      float block = 0.0; vec3 cs;
      for (int j = 0; j < 4; j++){ float u = exp2(float(j)); block += airAt(p + sd * (u * c.x), k, cs).r * max(1.0, u * 0.5); }
      float sunT = sd.z > -0.1 ? exp(-uSelf * block) : 0.0;
      col = uLit * a.g * fs * mix(0.5, 1.0, sunT) * (1.0 - 0.2 * uRain) + uSky * 0.16 * (1.0 - sunT) + uSunCol * silver * sunT * (1.2 - cd) * 0.5 + vec3(uFlash);
    }
    float al = (1.0 - exp(-uExt * cd * seg)) * fade;
    if (al < 0.002) continue;
    acc += mix(col, uHaze, haze) * trans * al; trans *= 1.0 - al; if (trans < 0.03) break;
  }
  o = vec4(acc, 1.0 - trans);
}`;
const COMP_FS = `#version 300 es
precision highp float; uniform sampler2D uCl; out vec4 o;
void main(){ o = texelFetch(uCl, ivec2(gl_FragCoord.xy), 0); }`;

export class GpuClouds {
  private readonly fill: GpuAirFill;
  /** Cloud shadows on the land, for the light pass. */
  readonly shade: GpuCloudShade;
  private readonly smoke = new AirSmoke();
  private readonly smokeTex: WebGLTexture;
  private smokeVersion = -1;
  private lastTime = 0;
  private readonly prog: WebGLProgram;
  private readonly comp: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;
  private cloudy = false;
  private drawn = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.fill = new GpuAirFill(gl);
    this.shade = new GpuCloudShade(gl, this.fill);
    this.prog = compile(gl, VS, fs(this.fill.glsl, this.fill.levels.levels.length, this.smoke.n, this.smoke.tall));
    this.comp = compile(gl, VS, COMP_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.smokeTex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, this.smoke.n, this.smoke.n, this.smoke.tall);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.NEAREST);
  }

  /** The clouds drawn this frame (premultiplied colour, alpha = how much they hide), or null when none were. */
  get cover(): WebGLTexture | null {
    return this.drawn ? this.tex : null;
  }

  /**
   * Before the light pass: moves the smoke on (fires keep smoking under a roof), rebuilds the air levels that are due
   * and the cloud shadows. Nothing is built under a roof or when the sky holds no cloud.
   */
  prepare(eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, time: number, src: { tiles: ReadonlyTiles; burning: ReadonlySet<number>; volume: ReadonlyVolume }): void {
    const dt = Math.max(0, Math.min(0.5, time - this.lastTime));
    this.lastTime = time;
    this.drawn = false;
    this.smoke.update(dt, weather, eye.x, eye.y, eye.z, src.tiles, src.burning, src.volume);
    this.cloudy = env.open && CONTENT.sky.layers.some((l) => layerCover(l, weather) > 0);
    if (this.cloudy) this.fill.update(weather, eye.x, eye.y, eye.z, time);
    this.shade.update(env, weather, eye, this.cloudy);
    const sm = this.smoke;
    if (sm.version !== this.smokeVersion && Number.isFinite(sm.ox)) {
      const gl = this.gl;
      this.smokeVersion = sm.version;
      gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, sm.n, sm.n, sm.tall, gl.RED, gl.UNSIGNED_BYTE, sm.bytes);
    }
  }

  /** Draws the clouds, mist and smoke over the scene in `sceneFbo`, which `depth` belongs to. */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, w: number, h: number, depth: WebGLTexture, sceneFbo: WebGLFramebuffer, near: number, far: number): void {
    if (!env.open || (!this.cloudy && !this.smoke.active)) return;
    const gl = this.gl;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      gl.deleteTexture(this.tex);
      this.tex = makeTexture(gl, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    }
    const p = this.prog;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.uniform1i(loc(gl, p, 'uDepth'), 1);
    this.fill.bind(p, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
    gl.uniform1i(loc(gl, p, 'uSmokeTex'), 3);
    gl.activeTexture(gl.TEXTURE0);
    const v3 = (nm: string, a: ArrayLike<number>, k = 1): void => gl.uniform3f(loc(gl, p, nm), (a[0] ?? 0) * k, (a[1] ?? 0) * k, (a[2] ?? 0) * k);
    v3('uFwd', cam.fwd); v3('uRight', cam.right); v3('uUp', cam.up); v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uHaze', env.horizon, 1 / 255);
    v3('uSky', env.zenith, 1 / 255);
    v3('uLit', env.cloudLit);
    v3('uSunCol', [env.sunR, env.sunG, env.sunB]);
    v3('uSunDir', [env.lx, env.ly, env.lz]);
    const S = CONTENT.sky;
    v3('uSmoke', S.smoke.colour, 1 / 255);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uDrift'), weather.drift?.x ?? 0, weather.drift?.y ?? 0);
    gl.uniform1f(loc(gl, p, 'uRange'), S.cloudRange);
    gl.uniform1f(loc(gl, p, 'uLod'), S.air.lod);
    gl.uniform1f(loc(gl, p, 'uExt'), S.air.ext);
    gl.uniform1f(loc(gl, p, 'uSelf'), S.air.self);
    const sm = this.smoke;
    const L = this.fill.levels;
    gl.uniform1f(loc(gl, p, 'uLo'), sm.active ? Math.min(L.lo, sm.oz * sm.cell) : L.lo);
    gl.uniform1f(loc(gl, p, 'uHi'), sm.active ? Math.max(L.hi, (sm.oz + sm.tall) * sm.cell) : L.hi);
    gl.uniform1f(loc(gl, p, 'uHazeDist'), env.fogDist * S.haze);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uRain'), env.rain);
    gl.uniform1f(loc(gl, p, 'uFlash'), env.flash * 0.45);
    gl.uniform4f(loc(gl, p, 'uSW'), sm.ox, sm.oy, sm.oz, sm.active ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uSCell'), sm.cell);
    gl.uniform1f(loc(gl, p, 'uSExt'), S.smoke.ext);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.drawn = true;
    // Lay them over the scene (premultiplied), under the hand and the near motes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.useProgram(this.comp);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc(gl, this.comp, 'uCl'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
}
