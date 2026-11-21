/**
 * GPU sky: a full-screen pass drawn first. Gradient from horizon to zenith, sun glow and disc, moon, fixed stars,
 * and the cloud layers of content/sky.ts as lit slabs (drifting, soft-edged). All numbers come from the sky data and Env.
 * Cloud shapes are a shader noise, not the CPU renderer's exact pattern; aurora arrives with the later polish stage.
 */
import { CONTENT, layerCover } from '../../content';
import type { WeatherState } from '../../types';
import type { Env } from '../lighting';
import { compile, loc } from './glUtil';
import type { CamBasis } from './glUtil';

const MAX_LAYERS = 4;
const LAYERS = [...CONTENT.sky.layers].sort((a, b) => b.height - a.height).slice(0, MAX_LAYERS);

const VS = `#version 300 es
out vec2 vNdc;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vNdc = p * 2.0 - 1.0; gl_Position = vec4(vNdc, 1.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 o;
uniform vec3 uFwd, uRight, uUp, uEye, uZenith, uHorizon, uSunDir, uMoonDir, uSunGlow, uSunDisc, uMoonCol, uCloudLit;
uniform vec2 uTan; uniform float uOpen, uSunSize, uMoonSize, uDusk, uNight, uStarCut, uFlash, uTime, uRange;
uniform vec4 uA[${MAX_LAYERS}]; uniform vec4 uB[${MAX_LAYERS}]; uniform vec4 uC[${MAX_LAYERS}]; uniform vec4 uD[${MAX_LAYERS}];
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
float fbm(vec2 p, int oct){ float a = 0.5, s = 0.0; for (int k = 0; k < 6; k++){ if (k >= oct) break; s += a * vn(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(uFwd + uRight * vNdc.x * uTan.x + uUp * vNdc.y * uTan.y);
  float hl = max(1e-4, length(d.xy)); float e = d.z / hl;
  if (uOpen < 0.5){ o = vec4(uHorizon, 1.0); return; }
  float t = e <= 0.0 ? 0.0 : pow(min(1.0, e * 1.7), 0.6);
  vec3 c = mix(uHorizon, uZenith, t);
  if (e < 0.0) c *= 1.0 - min(1.0, -e * 3.0) * 0.22;
  float sd = dot(d, uSunDir); float sa = acos(clamp(sd, -1.0, 1.0));
  c += uSunGlow * pow(max(0.0, sd), 8.0) * (0.4 + uDusk) * max(0.0, 1.0 - abs(d.z - uSunDir.z) * 1.5);
  if (sa < uSunSize) c += uSunDisc * (1.0 - sa / uSunSize);
  float ma = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  if (ma < uMoonSize && uMoonDir.z > -0.05) c = uMoonCol * (0.9 + 0.1 * vn(d.xy * 300.0));
  if (uNight > 0.01 && e > 0.0){ vec3 q = floor(d * 190.0); float s = h3(q); if (s > uStarCut) c += vec3(1.0) * uNight * (0.5 + 0.5 * h3(q + 3.1)); }
  for (int li = 0; li < ${MAX_LAYERS}; li++){
    vec4 A = uA[li], B = uB[li], C = uC[li], D = uD[li];
    if (D.z < 0.5 || d.z <= 0.002 || uEye.z >= A.x) continue;
    float tt = (A.x - uEye.z) / d.z; if (tt > uRange) continue;
    vec2 p = uEye.xy + d.xy * tt;
    vec2 q = vec2((p.x - D.x) / (A.y * A.z), (p.y - D.y) / A.y) * 2.5;
    float n = fbm(q, int(A.w));
    float th = 1.0 - B.w * 0.85 - B.x * 0.5;
    float dens = smoothstep(th, th + max(0.02, B.x), n);
    float haze = smoothstep(0.01, 0.12, e);
    float a = dens * B.y * haze;
    vec3 col = C.rgb * uCloudLit * (1.0 - B.z * dens * 0.55) + vec3(uFlash);
    c = mix(c, col, a);
  }
  o = vec4(c, 1.0);
}`;

export class GpuSky {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly a = new Float32Array(MAX_LAYERS * 4);
  private readonly b = new Float32Array(MAX_LAYERS * 4);
  private readonly c = new Float32Array(MAX_LAYERS * 4);
  private readonly d = new Float32Array(MAX_LAYERS * 4);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
  }

  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, weather: WeatherState, time: number): void {
    const gl = this.gl;
    const p = this.prog;
    const SKY = CONTENT.sky;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    const u3 = (n: string, v: ArrayLike<number>, k = 1 / 255): void => gl.uniform3f(loc(gl, p, n), (v[0] ?? 0) * k, (v[1] ?? 0) * k, (v[2] ?? 0) * k);
    u3('uFwd', cam.fwd, 1); u3('uRight', cam.right, 1); u3('uUp', cam.up, 1); u3('uEye', [eye.x, eye.y, eye.z], 1);
    u3('uZenith', env.zenith); u3('uHorizon', env.horizon);
    const dir = (az: number, el: number): number[] => [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    u3('uSunDir', dir(env.sunAz, env.sunEl), 1);
    u3('uMoonDir', dir(env.sunAz + Math.PI, -env.sunEl), 1);
    u3('uSunGlow', SKY.sun.glow); u3('uSunDisc', SKY.sun.disc); u3('uMoonCol', SKY.moon.colour);
    const lit = 0.3 + env.day * 0.7;
    gl.uniform3f(loc(gl, p, 'uCloudLit'), (0.86 + env.dusk * 0.12) * lit, (0.86 - env.dusk * 0.16) * lit, (0.89 - env.dusk * 0.27) * lit);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform1f(loc(gl, p, 'uOpen'), env.open ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uSunSize'), SKY.sun.size);
    gl.uniform1f(loc(gl, p, 'uMoonSize'), SKY.moon.size);
    gl.uniform1f(loc(gl, p, 'uDusk'), env.dusk);
    gl.uniform1f(loc(gl, p, 'uNight'), env.night);
    gl.uniform1f(loc(gl, p, 'uStarCut'), 1 - SKY.stars.density * 2);
    gl.uniform1f(loc(gl, p, 'uFlash'), env.flash * 0.45);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    gl.uniform1f(loc(gl, p, 'uRange'), SKY.cloudRange);
    for (let i = 0; i < MAX_LAYERS; i++) {
      const l = LAYERS[i];
      const o = i * 4;
      if (!l) { this.d[o + 2] = 0; continue; }
      const cov = layerCover(l, weather);
      this.a.set([l.height, l.scale, l.stretch ?? 1, l.detail], o);
      this.b.set([l.softness, l.opacity, l.belly, cov], o);
      this.c.set([l.tint[0] / 255, l.tint[1] / 255, l.tint[2] / 255, 0], o);
      this.d.set([(weather.drift?.x ?? 0) * l.speed, (weather.drift?.y ?? 0) * l.speed, cov > 0 ? 1 : 0, 0], o);
    }
    gl.uniform4fv(loc(gl, p, 'uA'), this.a); gl.uniform4fv(loc(gl, p, 'uB'), this.b);
    gl.uniform4fv(loc(gl, p, 'uC'), this.c); gl.uniform4fv(loc(gl, p, 'uD'), this.d);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }
}
