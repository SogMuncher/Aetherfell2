/**
 * GPU sky: a full-screen pass drawn first. Gradient from horizon to zenith, sun glow and disc, moon, fixed stars,
 * and aurora curtains on clear nights. The clouds are their own pass (gpuClouds.ts). All numbers come from the sky data and Env.
 */
import { CONTENT } from '../../content';
import type { Env } from '../lighting';
import { compile, loc } from './glUtil';
import type { CamBasis } from './glUtil';

const VS = `#version 300 es
out vec2 vNdc;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vNdc = p * 2.0 - 1.0; gl_Position = vec4(vNdc, 1.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
in vec2 vNdc; out vec4 o;
uniform vec3 uAuroraC, uAuroraE; uniform float uAurora;
uniform vec3 uFwd, uRight, uUp, uEye, uZenith, uHorizon, uSunDir, uMoonDir, uSunGlow, uSunDisc, uMoonCol;
uniform vec2 uTan; uniform float uOpen, uSunSize, uMoonSize, uDusk, uNight, uStarCut, uTime;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1,0)), f.x), mix(h2(i + vec2(0,1)), h2(i + vec2(1,1)), f.x), f.y); }
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
  if (uAurora > 0.0 && e > 0.08 && e < 1.1){
    float az = atan(d.y, d.x), el = atan(e);
    float band = sin(az * 3.0 + sin(az * 7.0 + uTime * 0.3) * 1.5 + uTime * 0.1) * 0.5 + 0.5;
    float curtain = vn(vec2(az * 18.0 + uTime * 0.4, el * 2.0));
    float a = uAurora * pow(band, 3.0) * curtain * sin((e - 0.08) / 1.02 * 3.14159);
    c += a * uAuroraC + a * (1.0 - e) * uAuroraE;
  }
  o = vec4(c, 1.0);
}`;

export class GpuSky {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
  }

  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, time: number): void {
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
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform1f(loc(gl, p, 'uOpen'), env.open ? 1 : 0);
    gl.uniform1f(loc(gl, p, 'uSunSize'), SKY.sun.size);
    gl.uniform1f(loc(gl, p, 'uMoonSize'), SKY.moon.size);
    gl.uniform1f(loc(gl, p, 'uDusk'), env.dusk);
    gl.uniform1f(loc(gl, p, 'uNight'), env.night);
    gl.uniform1f(loc(gl, p, 'uStarCut'), 1 - SKY.stars.density * 2);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    gl.uniform1f(loc(gl, p, 'uAurora'), env.aurora);
    u3('uAuroraC', SKY.aurora.colour); u3('uAuroraE', SKY.aurora.edge);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }
}
