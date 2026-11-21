/**
 * GPU clouds: the same thick layers as Classic (content/sky.ts, shapes from the same pattern and density rules), marched
 * per pixel and cut off at the nearest surface, so you can fly above, around and through them. Drawn into its own small
 * target from the scene's depth, then laid over the scene. Inside a cloud the march starts in the cloud, so the view turns
 * to cloud-coloured fog and nothing clips.
 */
import { CONTENT, cloudPattern, layerCover, layerThreshold } from '../../content';
import type { WeatherState } from '../../types';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import type { CamBasis } from './glUtil';

const NL = 4;
const N = 256;
/** Layers high to low: lower ones are drawn over higher ones. */
const LAYERS = [...CONTENT.sky.layers].sort((a, b) => b.height - a.height).slice(0, NL);

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2D;
out vec4 o;
uniform sampler2D uPat, uDepth;
uniform vec3 uFwd, uRight, uUp, uEye, uHaze, uLit; uniform vec2 uTan, uSize, uDrift;
uniform float uRange, uNear, uFar, uRain, uSunAz, uFlash;
uniform vec4 uA[${NL}]; // height, thickness, tower, billow
uniform vec4 uB[${NL}]; // scale, stretch, speed, opacity
uniform vec4 uC[${NL}]; // tint, belly
uniform vec4 uD[${NL}]; // softness, edge threshold, cover, on
float pat(int li, vec2 uv){
  vec2 fl = floor(uv); vec2 f = uv - fl; ivec2 i0 = ivec2(fl) & 255; ivec2 i1 = (i0 + 1) & 255; int r = li * ${N};
  float a = texelFetch(uPat, ivec2(i0.x, i0.y + r), 0).r, b = texelFetch(uPat, ivec2(i1.x, i0.y + r), 0).r;
  float c = texelFetch(uPat, ivec2(i0.x, i1.y + r), 0).r, d = texelFetch(uPat, ivec2(i1.x, i1.y + r), 0).r;
  return a + (b - a) * f.x + (c - a + (d - c - b + a) * f.x) * f.y;
}
vec2 gridOf(int li, vec2 p){ vec4 B = uB[li]; return vec2((p.x - uDrift.x * B.z) / (B.x * B.y), (p.y - uDrift.y * B.z) / B.x) * ${N / 4}.0; }
float colDens(int li, vec2 p){
  vec4 D = uD[li]; if (D.z <= 0.0) return 0.0;
  vec2 q = gridOf(li, p);
  float n = pat(li, q) * 0.62 + pat(li, q * 0.577 + vec2(17.3, 5.1)) * 0.38;
  float soft = max(0.01, D.x); float k = clamp((n - (D.y - soft * 0.5)) / soft, 0.0, 1.0);
  return k * k * (3.0 - 2.0 * k);
}
float dens3(int li, vec2 p, float hf){
  vec4 A = uA[li];
  float d = colDens(li, p + vec2(hf * A.y * 0.12, 0.0)); if (d <= 0.0) return 0.0;
  vec2 q = gridOf(li, p) * 2.7 + vec2(hf * 31.0, -hf * 17.0);
  float bump = (pat(li, q) - 0.5) * A.w;
  float edge = ((1.0 - A.z + A.z * d) - hf) / 0.22 + bump; if (edge <= 0.0) return 0.0;
  float body = edge >= 1.0 ? 1.0 : edge * edge * (3.0 - 2.0 * edge);
  return min(1.0, d * 1.15) * body * min(1.0, hf / 0.05);
}
// Marches the ray through one layer. dir = horizontal unit direction, e = rise per horizontal metre, sh = horizontal distance to the nearest surface.
vec4 slab(int li, vec2 dir, float e, float sh, float az){
  vec4 A = uA[li], B = uB[li], C = uC[li];
  float zb = A.x, th = A.y, zt = zb + th, cz = uEye.z; float s0, s1;
  if (e > 0.0004){ s0 = max(0.0, (zb - cz) / e); s1 = (zt - cz) / e; }
  else if (e < -0.0004){ s0 = max(0.0, (zt - cz) / e); s1 = (zb - cz) / e; }
  else if (cz >= zb && cz <= zt){ s0 = 0.0; s1 = uRange; } else return vec4(0.0);
  s1 = min(s1, min(uRange, sh));
  if (s1 <= s0 || s0 >= uRange) return vec4(0.0);
  float mid = (s0 + s1) * 0.5;
  if (colDens(li, uEye.xy + dir * mid) <= 0.0){
    if (s1 - s0 < B.x * 0.6) return vec4(0.0);
    if (colDens(li, uEye.xy + dir * s0) <= 0.0 && colDens(li, uEye.xy + dir * s1) <= 0.0) return vec4(0.0);
  }
  float steps = clamp(ceil((s1 - s0) / (B.x * 0.5)), 3.0, 7.0);
  float ds = (s1 - s0) / steps; float len = ds * sqrt(1.0 + e * e);
  float kappa = (B.w * 3.2) / max(60.0, th);
  float silver = pow(max(0.0, cos(az - uSunAz)), 6.0);
  float trans = 1.0; vec3 acc = vec3(0.0);
  for (int k = 0; k < 7; k++){
    if (float(k) >= steps) break;
    float s = s0 + ds * (float(k) + 0.5);
    float hf = (cz + e * s - zb) / th; if (hf < 0.0 || hf > 1.0) continue;
    float dn = dens3(li, uEye.xy + dir * s, hf); if (dn <= 0.0) continue;
    float a = 1.0 - exp(-kappa * dn * len); if (a < 0.002) continue;
    float up = hf * hf * (3.0 - 2.0 * hf);
    float dark = C.w * (0.55 + uRain * 0.45);
    float shade = (1.0 - dark * (1.0 - up) * (0.5 + 0.5 * dn)) * (1.0 + 0.25 * silver * (1.0 - dn * 0.6));
    vec3 col = C.rgb * uLit * shade; col = mix(col, uHaze, min(1.0, s / uRange * 1.5));
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
  for (int li = 0; li < ${NL}; li++){
    if (uD[li].w < 0.5) continue;
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
  private readonly prog: WebGLProgram;
  private readonly comp: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly pat: WebGLTexture;
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;
  private readonly a = new Float32Array(NL * 4);
  private readonly b = new Float32Array(NL * 4);
  private readonly c = new Float32Array(NL * 4);
  private readonly d = new Float32Array(NL * 4);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.comp = compile(gl, VS, COMP_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.pat = makeTexture(gl, gl.R32F, N, N * NL, gl.RED, gl.FLOAT);
    const all = new Float32Array(N * N * NL);
    LAYERS.forEach((l, i) => all.set(cloudPattern(l), i * N * N));
    gl.bindTexture(gl.TEXTURE_2D, this.pat);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N * NL, gl.RED, gl.FLOAT, all);
  }

  /**
   * Draws the clouds over the scene in `sceneFbo`, which `depth` belongs to. Nothing is drawn (and nothing costs)
   * under a roof or when no layer has cloud.
   */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, w: number, h: number, depth: WebGLTexture, sceneFbo: WebGLFramebuffer, near: number, far: number): void {
    if (!env.open) return;
    let any = false;
    for (let i = 0; i < NL; i++) {
      const l = LAYERS[i];
      const o = i * 4;
      const cov = l ? layerCover(l, weather) : 0;
      if (!l || cov <= 0) { this.d[o + 3] = 0; continue; }
      any = true;
      this.a.set([l.height, l.thickness ?? 0, l.tower ?? 0, l.billow ?? 0.6], o);
      this.b.set([l.scale, l.stretch ?? 1, l.speed, l.opacity], o);
      this.c.set([l.tint[0] / 255, l.tint[1] / 255, l.tint[2] / 255, l.belly], o);
      this.d.set([l.softness, layerThreshold(l, cov), cov, 1], o);
    }
    if (!any) return;
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
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.pat);
    gl.uniform1i(loc(gl, p, 'uPat'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.uniform1i(loc(gl, p, 'uDepth'), 1);
    const v3 = (n: string, a: ArrayLike<number>, k = 1): void => gl.uniform3f(loc(gl, p, n), (a[0] ?? 0) * k, (a[1] ?? 0) * k, (a[2] ?? 0) * k);
    v3('uFwd', cam.fwd); v3('uRight', cam.right); v3('uUp', cam.up); v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uHaze', env.horizon, 1 / 255);
    const lit = 0.3 + env.day * 0.7;
    gl.uniform3f(loc(gl, p, 'uLit'), (0.86 + env.dusk * 0.12) * lit, (0.86 - env.dusk * 0.16) * lit, (0.89 - env.dusk * 0.27) * lit);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uDrift'), weather.drift?.x ?? 0, weather.drift?.y ?? 0);
    gl.uniform1f(loc(gl, p, 'uRange'), CONTENT.sky.cloudRange);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uRain'), env.rain);
    gl.uniform1f(loc(gl, p, 'uSunAz'), env.sunAz);
    gl.uniform1f(loc(gl, p, 'uFlash'), env.flash * 0.45);
    gl.uniform4fv(loc(gl, p, 'uA'), this.a);
    gl.uniform4fv(loc(gl, p, 'uB'), this.b);
    gl.uniform4fv(loc(gl, p, 'uC'), this.c);
    gl.uniform4fv(loc(gl, p, 'uD'), this.d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Lay them over the scene (premultiplied), under the hand and the near motes.
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.useProgram(this.comp);
    gl.activeTexture(gl.TEXTURE0);
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
