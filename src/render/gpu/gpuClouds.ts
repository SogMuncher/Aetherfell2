/**
 * GPU clouds and mist: the air cells (render/airCells.ts: ONE grid of cubic cells around the eye that every layer of
 * content/sky.ts writes into, fine near and merged into bigger cells far) in one texture, walked cell by cell per pixel,
 * nearest first, and cut off at the nearest surface, so you can fly above, around and through them and they always
 * overlap in the right order. Each clump of cloud cells is one solid shape: the face the ray enters by sets its look
 * (lit top, dark base, sides by the sun, darker under thick air) and that look holds right through it, so no inside faces. Clouds are lit
 * by the same light as the overcast sky (`Env.cloudLit`) and fade into the horizon colour over the land's fog
 * distance × `sky.haze` (the clearer air up high).
 */
import { CONTENT, layerCover } from '../../content';
import type { ReadonlyTiles, ReadonlyVolume, WeatherState } from '../../types';
import { AirCells } from '../airCells';
import { AirSmoke } from '../airSmoke';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import type { CamBasis } from './glUtil';

/** Most cells a ray walks. */
const MAXS = 224;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (nl: number, n: number, tall: number, sn: number, st: number): string => `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray; precision highp sampler3D;
out vec4 o;
uniform sampler2D uDepth; uniform sampler2DArray uAir; uniform sampler3D uSmokeTex;
uniform vec3 uFwd, uRight, uUp, uEye, uHaze, uLit; uniform vec2 uTan, uSize, uDrift;
uniform float uRange, uHazeDist, uNear, uFar, uRain, uSunAz, uFlash, uCell, uCapZ, uLod, uExt, uLo, uHi, uSCell, uSExt;
uniform vec4 uSW; uniform vec3 uSmoke; // smoke box corner in whole cells (x, y, z), on (w); smoke colour
uniform vec4 uW[${nl}]; // window corner of each level in whole cells (x, y, z), filled (w)
const int N = ${n}; const int T = ${tall}; const float CUT = 0.08; const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0); const int SN = ${sn}; const int ST = ${st};
// Density and brightness of the cell holding p (drifting frame) at level k, or at the first coarser level holding it.
vec2 airAt(vec3 p, int k, out vec3 c){
  for (; k < ${nl}; k++){
    float w = uCell * exp2(float(k)); c = vec3(w, w, min(w, uCapZ)); vec4 W = uW[k];
    if (W.w < 0.5) continue;
    ivec3 g = ivec3(floor(p / c)); ivec3 r = g - ivec3(W.xyz);
    if (r.x < 0 || r.y < 0 || r.z < 0 || r.x >= N || r.y >= N || r.z >= T) continue;
    ivec3 m = ivec3(((g.x % N) + N) % N, ((g.y % N) + N) % N, ((g.z % T) + T) % T);
    return texelFetch(uAir, ivec3(k * N + m.x, m.y, m.z), 0).rg;
  }
  float w = uCell * exp2(float(${nl - 1})); c = vec3(w, w, min(w, uCapZ)); return vec2(0.0);
}
// Smoke (render/airSmoke.ts): its own box of cells in the same drifting frame.
float smokeAt(vec3 p){
  ivec3 g = ivec3(floor(p / uSCell)); ivec3 r = g - ivec3(uSW.xyz);
  if (uSW.w < 0.5 || r.x < 0 || r.y < 0 || r.z < 0 || r.x >= SN || r.y >= SN || r.z >= ST) return 0.0;
  return texelFetch(uSmokeTex, ivec3(((g.x % SN) + SN) % SN, ((g.y % SN) + SN) % SN, ((g.z % ST) + ST) % ST), 0).r;
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
  vec2 sun = vec2(cos(uSunAz), sin(uSunAz));
  float silver = pow(max(0.0, dot(normalize(d.xy + 1e-6), sun)), 6.0);
  // A fixed per-pixel threshold (4x4 ordered dither) cross-fades each level into the next over the last part of its reach.
  ivec2 bq = ivec2(gl_FragCoord.xy) & 3;
  float dith = BAYER[bq.y * 4 + bq.x] / 16.0;
  vec3 sc = vec3(uSCell); vec3 sLo = uSW.xyz * uSCell; vec3 sHi = sLo + vec3(float(SN), float(SN), float(ST)) * uSCell;
  float trans = 1.0; vec3 acc = vec3(0.0); float t = t0; int face = t0 > 0.0 ? 2 : 3;
  bool inC = false; float cd = 0.0; float cs = 0.0; float gap = 0.0;
  for (int i = 0; i < ${MAXS}; i++){
    if (t >= t1) break;
    int k = int(max(0.0, ceil(log2(max(1.0, t) / (uCell * uLod)) - 0.3 * dith)));
    float tp = t + max(0.01, t * 2e-5);
    vec3 p = q0 + d * tp;
    vec3 c; vec2 a = airAt(p, k, c);
    vec3 lo = floor(p / c) * c;
    vec3 tt = vec3(d.x > 0.0 ? (lo.x + c.x - p.x) / d.x : d.x < 0.0 ? (lo.x - p.x) / d.x : 1e9,
                   d.y > 0.0 ? (lo.y + c.y - p.y) / d.y : d.y < 0.0 ? (lo.y - p.y) / d.y : 1e9,
                   d.z > 0.0 ? (lo.z + c.z - p.z) / d.z : d.z < 0.0 ? (lo.z - p.z) / d.z : 1e9);
    int ax = tt.x <= tt.y && tt.x <= tt.z ? 0 : (tt.y <= tt.z ? 1 : 2);
    float tc = min(tt.x, min(tt.y, tt.z));
    // Inside the smoke box the walk also stops at every smoke cell, so smoke is drawn cell by cell.
    float sm = 0.0; float ts = 1e9;
    if (uSW.w > 0.5 && all(greaterThanEqual(p, sLo)) && all(lessThan(p, sHi))){
      sm = smokeAt(p);
      vec3 sl = floor(p / sc) * sc;
      vec3 st = vec3(d.x > 0.0 ? (sl.x + sc.x - p.x) / d.x : d.x < 0.0 ? (sl.x - p.x) / d.x : 1e9,
                     d.y > 0.0 ? (sl.y + sc.y - p.y) / d.y : d.y < 0.0 ? (sl.y - p.y) / d.y : 1e9,
                     d.z > 0.0 ? (sl.z + sc.z - p.z) / d.z : d.z < 0.0 ? (sl.z - p.z) / d.z : 1e9);
      ts = min(st.x, min(st.y, st.z));
    }
    float tn = min(tp + min(tc, ts), t1);
    float seg = tn - t; int f = face; t = tn;
    if (tc <= ts) face = ax;
    float fade = smoothstep(0.0, 2.0, t) * (1.0 - smoothstep(uRange * 0.7, uRange, t));
    float haze = 1.0 - exp(-t / uHazeDist);
    if (sm > 0.004){
      float als = (1.0 - exp(-uSExt * sm * seg)) * fade;
      acc += mix(uSmoke * uLit, uHaze, haze) * trans * als; trans *= 1.0 - als;
    }
    // A clump is one solid shape: its look (face shade, light, thickness) is fixed where the ray enters it from clear
    // air and stays the same right through it, so cells inside a clump never show as faces or seams. A sliver of clear
    // air (a ray slipping along the edge where two cells meet) does not end the clump.
    if (a.r < CUT){ gap += seg; if (gap > 0.2 * min(c.x, c.z)) inC = false; continue; }
    gap = 0.0;
    if (!inC){
      inC = true; cd = clamp(a.r * 2.5, 0.3, 1.0);
      float fs = f == 2 ? (d.z < 0.0 ? 1.06 + 0.2 * silver : 0.62) : f == 0 ? 0.8 - 0.16 * sign(d.x) * sun.x : f == 1 ? 0.8 - 0.16 * sign(d.y) * sun.y : 0.86;
      vec3 cu; float above = airAt(p + vec3(0.0, 0.0, c.z), k, cu).r;
      cs = a.g * fs * (1.0 - 0.3 * above) * (1.0 - 0.2 * uRain);
    }
    float al = (1.0 - exp(-uExt * cd * seg)) * fade;
    if (al < 0.002) continue;
    vec3 col = mix(uLit * cs + vec3(uFlash), uHaze, haze);
    acc += col * trans * al; trans *= 1.0 - al; if (trans < 0.03) break;
  }
  o = vec4(acc, 1.0 - trans);
}`;
const COMP_FS = `#version 300 es
precision highp float; uniform sampler2D uCl; out vec4 o;
void main(){ o = texelFetch(uCl, ivec2(gl_FragCoord.xy), 0); }`;

export class GpuClouds {
  private readonly air = new AirCells();
  private readonly smoke = new AirSmoke();
  private readonly smokeTex: WebGLTexture;
  private smokeVersion = -1;
  private lastTime = 0;
  private readonly prog: WebGLProgram;
  private readonly comp: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly atlas: WebGLTexture;
  private readonly uploaded: number[];
  private readonly win: Float32Array;
  private readonly lo: number;
  private readonly hi: number;
  private readonly capZ: number;
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const air = this.air;
    const nl = air.levels.length;
    const n = air.n;
    this.prog = compile(gl, VS, fs(nl, n, air.tall, this.smoke.n, this.smoke.tall));
    this.comp = compile(gl, VS, COMP_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.win = new Float32Array(nl * 4);
    this.uploaded = air.levels.map(() => 0);
    this.lo = air.lo;
    this.hi = air.hi;
    this.capZ = air.levels[air.levels.length - 1]?.cellZ ?? CONTENT.sky.air.cell;
    // Every level is one n-wide strip of the atlas; heights are the layers of the array.
    this.atlas = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RG8, n * nl, n, air.tall);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, pn, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.smokeTex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R8, this.smoke.n, this.smoke.n, this.smoke.tall);
    for (const pn of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, pn, gl.NEAREST);
  }

  /** Uploads every level the air cells finished since the last frame, with its window. */
  private upload(): void {
    const gl = this.gl;
    const n = this.air.n;
    this.air.levels.forEach((lv, i) => {
      if (lv.version === this.uploaded[i]) return;
      this.uploaded[i] = lv.version;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, i * n, 0, 0, n, n, this.air.tall, gl.RG, gl.UNSIGNED_BYTE, lv.data);
      this.win.set([lv.ox, lv.oy, lv.oz, 1], i * 4);
    });
    const sm = this.smoke;
    if (sm.version !== this.smokeVersion && Number.isFinite(sm.ox)) {
      this.smokeVersion = sm.version;
      gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, sm.n, sm.n, sm.tall, gl.RED, gl.UNSIGNED_BYTE, sm.bytes);
    }
  }

  /**
   * Draws the clouds, mist and smoke over the scene in `sceneFbo`, which `depth` belongs to. Smoke is moved on even
   * under a roof (fires keep smoking); nothing is drawn there, or when the air holds neither cloud nor smoke.
   */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, time: number, w: number, h: number, depth: WebGLTexture, sceneFbo: WebGLFramebuffer, near: number, far: number, src: { tiles: ReadonlyTiles; burning: ReadonlySet<number>; volume: ReadonlyVolume }): void {
    const dt = Math.max(0, Math.min(0.5, time - this.lastTime));
    this.lastTime = time;
    this.smoke.update(dt, weather, eye.x, eye.y, eye.z, src.tiles, src.burning, src.volume);
    if (!env.open) return;
    const cloudy = CONTENT.sky.layers.some((l) => layerCover(l, weather) > 0);
    if (!cloudy && !this.smoke.active) return;
    if (cloudy) this.air.update(weather, eye.x, eye.y, eye.z, time);
    this.upload();
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
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.uniform1i(loc(gl, p, 'uAir'), 2);
    gl.activeTexture(gl.TEXTURE0);
    const v3 = (nm: string, a: ArrayLike<number>, k = 1): void => gl.uniform3f(loc(gl, p, nm), (a[0] ?? 0) * k, (a[1] ?? 0) * k, (a[2] ?? 0) * k);
    v3('uFwd', cam.fwd); v3('uRight', cam.right); v3('uUp', cam.up); v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uHaze', env.horizon, 1 / 255);
    v3('uLit', env.cloudLit);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uDrift'), weather.drift?.x ?? 0, weather.drift?.y ?? 0);
    gl.uniform1f(loc(gl, p, 'uRange'), CONTENT.sky.cloudRange);
    const A = CONTENT.sky.air;
    gl.uniform1f(loc(gl, p, 'uCell'), A.cell);
    gl.uniform1f(loc(gl, p, 'uCapZ'), this.capZ);
    gl.uniform1f(loc(gl, p, 'uLod'), A.lod);
    gl.uniform1f(loc(gl, p, 'uExt'), A.ext);
    const sOn = this.smoke.active;
    gl.uniform1f(loc(gl, p, 'uLo'), sOn ? Math.min(this.lo, this.smoke.oz * this.smoke.cell) : this.lo);
    gl.uniform1f(loc(gl, p, 'uHi'), sOn ? Math.max(this.hi, (this.smoke.oz + this.smoke.tall) * this.smoke.cell) : this.hi);
    gl.uniform1f(loc(gl, p, 'uHazeDist'), env.fogDist * CONTENT.sky.haze);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uRain'), env.rain);
    gl.uniform1f(loc(gl, p, 'uSunAz'), env.sunAz);
    gl.uniform1f(loc(gl, p, 'uFlash'), env.flash * 0.45);
    gl.uniform4fv(loc(gl, p, 'uW'), this.win);
    const sm = this.smoke;
    const S = CONTENT.sky.smoke;
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_3D, this.smokeTex);
    gl.uniform1i(loc(gl, p, 'uSmokeTex'), 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4f(loc(gl, p, 'uSW'), sm.ox, sm.oy, sm.oz, sm.active ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uSCell'), sm.cell);
    gl.uniform1f(loc(gl, p, 'uSExt'), S.ext);
    gl.uniform3f(loc(gl, p, 'uSmoke'), S.colour[0] / 255, S.colour[1] / 255, S.colour[2] / 255);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
