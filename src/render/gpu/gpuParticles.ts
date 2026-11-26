/**
 * GPU effects: the motes `Particles` keeps (fire, smoke, sparks, spell looks) as depth-tested point sprites, and rain streaks.
 * The CPU moves the motes and picks each one's colour of the moment (effect and rune data); the card fades, fogs and lights them.
 */
import type { Env } from '../lighting';
import type { Particle } from '../vfx/particleKinds';
import { compile, loc } from './glUtil';
import type { CamBasis } from './glUtil';

/** All numbers live here. */
export const GPU_FX = { maxMotes: 6000, rainLen: [4, 5, 6, 7], rainSpeed: 420, rainColour: [190, 200, 225], rainStrength: 0.25 } as const;
const STRIDE = 12;

const VS = `#version 300 es
uniform mat4 uVP; uniform float uFpx, uAmb, uFogDist, uFrame; uniform vec3 uFog;
in vec4 aPos; in vec4 aCol; in vec4 aLife; // aCol: colour now + glow; aLife: life left (1..0), soft, palette mote, -
flat out vec4 fCover; flat out vec4 fAdd; flat out vec4 fFlags;
void main(){
  gl_Position = uVP * vec4(aPos.xyz, 1.0);
  gl_PointSize = max(1.0, aPos.w * uFpx / max(0.1, gl_Position.w));
  float t = aLife.x, soft = aLife.y; bool pal = aLife.z > 0.5;
  float fog = min(0.95, 1.0 - exp(-max(0.0, gl_Position.w) / uFogDist));
  float k = (pal ? 1.0 : t) * (1.0 - fog) * aCol.w;
  fCover = vec4(mix(aCol.rgb * uAmb, uFog, fog), max(0.0, (1.0 - aCol.w) * (0.85 + (t * 0.5 - 0.85) * soft)));
  fAdd = vec4(aCol.rgb * k, soft);
  fFlags = vec4(pal && t < 0.3 ? 1.0 : 0.0, uFrame, pal ? 1.0 : 0.0, 0.0);
}`;
const FS = `#version 300 es
precision highp float;
flat in vec4 fCover; flat in vec4 fAdd; flat in vec4 fFlags; out vec4 o;
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  if (fFlags.x > 0.5 && ((px.x + px.y + int(fFlags.y)) & 1) == 0) discard;
  vec2 q = (gl_PointCoord - 0.5) * 2.0; float d2 = dot(q, q);
  bool pal = fFlags.z > 0.5;
  if (!pal && d2 > 1.0) discard;
  float fall = pal ? 1.0 : 1.0 - d2;
  float edge = 1.0 - fAdd.w + fAdd.w * fall;
  float aa = fCover.w * edge;
  o = vec4(fCover.rgb * aa + fAdd.rgb * fall, aa);
}`;
const RAIN_VS = `#version 300 es
uniform vec2 uSize; uniform float uTime, uSlant, uSpeed, uCount; uniform vec4 uLens;
void main(){
  int i = gl_VertexID >> 1; int end = gl_VertexID & 1; float fi = float(i);
  if (fi >= uCount){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float hx = mod(fi * 7919.0 + floor(uTime * 37.0) * 104729.0, uSize.x * 13.0) / 13.0;
  float hy = mod(mod(fi * 15485863.0, uSize.y) + uTime * uSpeed * (1.0 + float(i % 3) * 0.3), uSize.y);
  float len = uLens[i % 4]; float k = end == 1 ? len : 0.0;
  vec2 p = vec2(hx + uSlant * k, hy + k);
  gl_Position = vec4(p.x / uSize.x * 2.0 - 1.0, 1.0 - p.y / uSize.y * 2.0, 0.0, 1.0);
}`;
const RAIN_FS = `#version 300 es
precision highp float; uniform vec4 uCol; out vec4 o;
void main(){ o = uCol; }`;

export class GpuParticles {
  private readonly prog: WebGLProgram;
  private readonly rain: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly rainVao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private data = new Float32Array(STRIDE * 512);

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.rain = compile(gl, RAIN_VS, RAIN_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (const [i, name] of ['aPos', 'aCol', 'aLife'].entries()) {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    this.rainVao = gl.createVertexArray() as WebGLVertexArrayObject;
  }

  /** Motes: the CPU gives each its colour of the moment; the shader does the fade, sky light and fog. */
  drawMotes(vp: Float32Array, cam: CamBasis, env: Env, list: readonly Particle[], time: number, height: number): void {
    const n = Math.min(GPU_FX.maxMotes, list.length);
    if (n === 0) return;
    if (this.data.length < n * STRIDE) this.data = new Float32Array(n * STRIDE * 2);
    const d = this.data;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (!p) continue;
      const t = p.life / p.max;
      const u = 1 - t;
      let pr = p.r + (p.r2 - p.r) * u;
      let pg = p.g + (p.g2 - p.g) * u;
      let pb = p.b + (p.b2 - p.b) * u;
      const pal = p.pal;
      if (pal && pal.length > 0) {
        const c = pal[Math.min(pal.length - 1, Math.floor(u * pal.length))] ?? 0;
        pr = (c >> 16) & 255;
        pg = (c >> 8) & 255;
        pb = c & 255;
      }
      const o = count * STRIDE;
      d[o] = p.x;
      d[o + 1] = p.y;
      d[o + 2] = p.z;
      d[o + 3] = p.size;
      d[o + 4] = pr / 255;
      d[o + 5] = pg / 255;
      d[o + 6] = pb / 255;
      d[o + 7] = p.glow;
      d[o + 8] = t;
      d[o + 9] = p.soft;
      d[o + 10] = pal && pal.length > 0 ? 1 : 0;
      d[o + 11] = 0;
      count++;
    }
    if (count === 0) return;
    const gl = this.gl;
    const pg = this.prog;
    gl.useProgram(pg);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(loc(gl, pg, 'uVP'), false, vp);
    gl.uniform1f(loc(gl, pg, 'uFpx'), height / (2 * cam.tanY));
    gl.uniform1f(loc(gl, pg, 'uAmb'), 0.35 + env.day * 0.65);
    gl.uniform1f(loc(gl, pg, 'uFogDist'), env.fogDist);
    gl.uniform1f(loc(gl, pg, 'uFrame'), Math.floor(time * 14));
    gl.uniform3f(loc(gl, pg, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArraysInstanced(gl.POINTS, 0, 1, count);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /** Screen-space streaks slanted by the wind across your view; none under a roof (the caller sets env.rain to 0). */
  drawRain(env: Env, w: number, h: number, windSide: number, time: number): void {
    if (env.rain < 0.05) return;
    const gl = this.gl;
    const p = this.rain;
    const n = Math.floor(env.rain * w * 0.9);
    gl.useProgram(p);
    gl.bindVertexArray(this.rainVao);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    gl.uniform1f(loc(gl, p, 'uSlant'), Math.max(-1.5, Math.min(1.5, windSide * 0.12)));
    gl.uniform1f(loc(gl, p, 'uSpeed'), GPU_FX.rainSpeed);
    gl.uniform1f(loc(gl, p, 'uCount'), n);
    gl.uniform4f(loc(gl, p, 'uLens'), GPU_FX.rainLen[0], GPU_FX.rainLen[1], GPU_FX.rainLen[2], GPU_FX.rainLen[3]);
    const light = 0.45 + env.day * 0.4;
    const c = GPU_FX.rainColour;
    gl.uniform4f(loc(gl, p, 'uCol'), (c[0] / 255) * light, (c[1] / 255) * light, (c[2] / 255) * light, GPU_FX.rainStrength);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, n * 2);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
}
