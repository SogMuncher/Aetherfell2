/**
 * GPU clouds: the cloud cells (render/cloudCells.ts: every layer of content/sky.ts as 3D cells around the eye, finer near,
 * coarser far) in one texture array, marched per pixel and cut off at the nearest surface, so you can fly above, around
 * and through them and see them to the far horizon. Each step reads the finest level that holds the spot and steps one
 * of its cells, so far clouds cost no more than near ones. Clouds are lit by the same light as the overcast sky (`Env.cloudLit`)
 * and fade into the horizon colour over the same fog distance as the land (× `sky.haze`, the clearer air up high).
 */
import { CONTENT, layerCover } from '../../content';
import type { WeatherState } from '../../types';
import { CLOUD_REACH, CloudCells } from '../cloudCells';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import type { CamBasis } from './glUtil';

/** Levels per row of the texture atlas; most steps a ray takes through one layer. */
const TX = 8;
const MAXS = 64;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (nl: number, nv: number, n: number): string => `#version 300 es
precision highp float; precision highp sampler2D; precision highp sampler2DArray;
out vec4 o;
uniform sampler2D uDepth; uniform sampler2DArray uCells; uniform vec2 uAtlas;
uniform vec3 uFwd, uRight, uUp, uEye, uHaze, uLit; uniform vec2 uTan, uSize, uDrift;
uniform float uRange, uHazeDist, uNear, uFar, uRain, uSunAz, uFlash;
uniform vec4 uA[${nl}]; // base height, thickness, speed, opacity
uniform vec4 uC[${nl}]; // tint, belly
uniform vec4 uL[${nl}]; // first level, level count, slices, finest cell
uniform float uOn[${nl}];
uniform vec4 uV[${nv}]; // level corner in the drifting frame (x, y), atlas corner (x, y)
const float REACH = ${(CLOUD_REACH * n).toFixed(3)};
// Density at a spot of the layer's drifting frame, from the finest level that holds it.
float cellDens(int li, vec2 q, float hf, float s){
  vec4 L = uL[li]; int first = int(L.x); int cnt = int(L.y);
  for (int k = int(max(0.0, ceil(log2(max(1.0, s) / (L.w * REACH))))); k < cnt; k++){
    vec4 V = uV[first + k]; vec2 g = (q - V.xy) / (L.w * exp2(float(k)));
    if (g.x < 1.0 || g.y < 1.0 || g.x > ${n - 1}.0 || g.y > ${n - 1}.0) continue;
    vec2 uv = (V.zw + g) / uAtlas;
    float z = clamp(hf * L.z - 0.5, 0.0, L.z - 1.0); float z0 = floor(z);
    float a = texture(uCells, vec3(uv, z0)).r, b = texture(uCells, vec3(uv, min(z0 + 1.0, L.z - 1.0))).r;
    return mix(a, b, z - z0);
  }
  return 0.0;
}
// Marches the ray through one layer. dir = horizontal unit direction, e = rise per horizontal metre, sh = horizontal distance to the nearest surface.
vec4 slab(int li, vec2 dir, float e, float sh, float az){
  vec4 A = uA[li], C = uC[li], L = uL[li];
  float zb = A.x, th = A.y, zt = zb + th, cz = uEye.z; float s0, s1;
  if (e > 0.0004){ s0 = max(0.0, (zb - cz) / e); s1 = (zt - cz) / e; }
  else if (e < -0.0004){ s0 = max(0.0, (zt - cz) / e); s1 = (zb - cz) / e; }
  else if (cz >= zb && cz <= zt){ s0 = 0.0; s1 = uRange; } else return vec4(0.0);
  s1 = min(s1, min(uRange, sh));
  if (s1 <= s0) return vec4(0.0);
  vec2 q0 = uEye.xy - uDrift * A.z;
  float kappa = (A.w * 3.2) / max(60.0, th);
  float vstep = th / L.z / max(1e-3, abs(e));
  float silver = pow(max(0.0, cos(az - uSunAz)), 6.0);
  float dark = C.w * (0.55 + uRain * 0.45);
  float trans = 1.0; vec3 acc = vec3(0.0); float s = s0; float skip = 1.0;
  for (int k = 0; k < ${MAXS}; k++){
    if (s >= s1) break;
    float lv = max(0.0, ceil(log2(max(1.0, s) / (L.w * REACH))));
    float ds = min(min(L.w * exp2(lv), vstep) * 1.3 * skip, s1 - s);
    float sm = s + ds * 0.5; s += ds;
    float hf = clamp((cz + e * sm - zb) / th, 0.0, 1.0);
    float dn = cellDens(li, q0 + dir * sm, hf, sm);
    if (dn < 0.004){ skip = min(skip * 1.5, 3.0); continue; }
    skip = 1.0;
    float a = (1.0 - exp(-kappa * dn * ds * sqrt(1.0 + e * e))) * smoothstep(0.0, 60.0, sm) * (1.0 - smoothstep(uRange * 0.7, uRange, sm));
    if (a < 0.002) continue;
    float up = hf * hf * (3.0 - 2.0 * hf);
    float shade = (1.0 - dark * (1.0 - up) * (0.5 + 0.5 * dn)) * (1.0 + 0.25 * silver * (1.0 - dn * 0.6));
    vec3 col = mix(C.rgb * uLit * shade, uHaze, 1.0 - exp(-sm / uHazeDist));
    acc += col * trans * a; trans *= 1.0 - a; if (trans < 0.03) break;
  }
  float alpha = 1.0 - trans; if (alpha < 0.01) return vec4(0.0);
  return vec4(acc / alpha, alpha);
}
void main(){
  vec2 nd = (gl_FragCoord.xy / uSize) * 2.0 - 1.0;
  vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y; vec3 d = normalize(r);
  float hl = max(1e-4, length(d.xy)); float e = d.z / hl; vec2 dir = d.xy / hl; float az = atan(d.y, d.x);
  float dep = texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r;
  float sh = uRange;
  if (dep < 0.99999){ float zn = dep * 2.0 - 1.0; float zv = 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); sh = zv * length(r) * hl; }
  vec4 acc = vec4(0.0);
  for (int li = 0; li < ${nl}; li++){
    if (uOn[li] < 0.5) continue;
    vec4 c = slab(li, dir, e, sh, az);
    if (c.a <= 0.0) continue;
    acc = vec4((c.rgb + vec3(uFlash)) * c.a + acc.rgb * (1.0 - c.a), c.a + acc.a * (1.0 - c.a));
  }
  o = acc;
}`;
const COMP_FS = `#version 300 es
precision highp float; uniform sampler2D uCl; out vec4 o;
void main(){ o = texelFetch(uCl, ivec2(gl_FragCoord.xy), 0); }`;

export class GpuClouds {
  private readonly cells = new CloudCells();
  private readonly prog: WebGLProgram;
  private readonly comp: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly atlas: WebGLTexture;
  private readonly aw: number;
  private readonly ah: number;
  private readonly uploaded: number[];
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;
  private readonly a: Float32Array;
  private readonly c: Float32Array;
  private readonly l: Float32Array;
  private readonly on: Float32Array;
  private readonly v: Float32Array;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const cells = this.cells;
    const nl = cells.layers.length;
    const nv = cells.levels.length;
    const n = cells.n;
    this.prog = compile(gl, VS, fs(nl, nv, n));
    this.comp = compile(gl, VS, COMP_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.a = new Float32Array(nl * 4);
    this.c = new Float32Array(nl * 4);
    this.l = new Float32Array(nl * 4);
    this.on = new Float32Array(nl);
    this.v = new Float32Array(nv * 4);
    this.uploaded = cells.levels.map(() => 0);
    cells.layers.forEach((L, i) => {
      const d = L.def;
      this.a.set([L.base, L.thick, d.speed, d.opacity], i * 4);
      this.c.set([d.tint[0] / 255, d.tint[1] / 255, d.tint[2] / 255, d.belly], i * 4);
      this.l.set([L.first, L.count, L.slices, L.cell0], i * 4);
    });
    // Every level is one tile of the atlas; its slices are the layers of the array.
    this.aw = n * TX;
    this.ah = n * Math.ceil(nv / TX);
    const depth = Math.max(...cells.levels.map((lv) => lv.slices));
    this.atlas = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.R8, this.aw, this.ah, depth);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Uploads every level the cells finished since the last frame and keeps the level corners current. */
  private upload(): void {
    const gl = this.gl;
    const n = this.cells.n;
    this.cells.levels.forEach((lv, i) => {
      const ax = (i % TX) * n;
      const ay = Math.floor(i / TX) * n;
      if (lv.version !== this.uploaded[i]) {
        this.uploaded[i] = lv.version;
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.atlas);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, ax, ay, 0, n, n, lv.slices, gl.RED, gl.UNSIGNED_BYTE, lv.data);
      }
      // An empty level sits far away, so no ray ever reads it.
      this.v.set(lv.version === 0 ? [1e9, 1e9, ax, ay] : [lv.ox, lv.oy, ax, ay], i * 4);
    });
  }

  /**
   * Draws the clouds over the scene in `sceneFbo`, which `depth` belongs to. Nothing is drawn (and nothing costs)
   * under a roof or when no layer has cloud.
   */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, time: number, w: number, h: number, depth: WebGLTexture, sceneFbo: WebGLFramebuffer, near: number, far: number): void {
    if (!env.open) return;
    let any = false;
    this.cells.layers.forEach((L, i) => {
      const on = layerCover(L.def, weather) > 0;
      this.on[i] = on ? 1 : 0;
      any ||= on;
    });
    if (!any) return;
    this.cells.update(weather, eye.x, eye.y, time);
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
    gl.uniform1i(loc(gl, p, 'uCells'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(loc(gl, p, 'uAtlas'), this.aw, this.ah);
    const v3 = (nm: string, a: ArrayLike<number>, k = 1): void => gl.uniform3f(loc(gl, p, nm), (a[0] ?? 0) * k, (a[1] ?? 0) * k, (a[2] ?? 0) * k);
    v3('uFwd', cam.fwd); v3('uRight', cam.right); v3('uUp', cam.up); v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uHaze', env.horizon, 1 / 255);
    v3('uLit', env.cloudLit);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uDrift'), weather.drift?.x ?? 0, weather.drift?.y ?? 0);
    gl.uniform1f(loc(gl, p, 'uRange'), CONTENT.sky.cloudRange);
    gl.uniform1f(loc(gl, p, 'uHazeDist'), env.fogDist * CONTENT.sky.haze);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uRain'), env.rain);
    gl.uniform1f(loc(gl, p, 'uSunAz'), env.sunAz);
    gl.uniform1f(loc(gl, p, 'uFlash'), env.flash * 0.45);
    gl.uniform4fv(loc(gl, p, 'uA'), this.a);
    gl.uniform4fv(loc(gl, p, 'uC'), this.c);
    gl.uniform4fv(loc(gl, p, 'uL'), this.l);
    gl.uniform1fv(loc(gl, p, 'uOn'), this.on);
    gl.uniform4fv(loc(gl, p, 'uV'), this.v);
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
