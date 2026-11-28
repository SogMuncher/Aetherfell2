// Sun rays (god rays): light streaming past clouds, hills, trees and walls toward the eye, from the depth and cloud cover.
/**
 * At half resolution, every pixel walks toward the sun on the screen and sums the open sky it passes (sky not hidden by
 * a surface, nor by cloud), fading with each step, so gaps between clouds or leaves throw bright shafts and whatever
 * stands in front of the sun throws dark ones. The result is added over the scene in the sun's colour, only while the
 * sun is up and on (or near) the screen. Settings in `SkyDef.rays`.
 */
import { CONTENT } from '../../content';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import type { CamBasis } from './glUtil';

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const RAYS_FS = (n: number): string => `#version 300 es
precision highp float;
uniform sampler2D uDepth, uCl; uniform vec2 uSun, uSize, uHalf; uniform float uHasCl, uDecay, uReach, uAspect;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / uHalf;
  vec2 dv = (uSun - uv) * uReach / ${n}.0;
  vec2 q = uv; float acc = 0.0, wt = 1.0, tot = 0.0;
  for (int i = 0; i < ${n}; i++){
    q += dv;
    float w = wt; wt *= uDecay; tot += w;
    if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue;
    ivec2 px = ivec2(q * uSize);
    float sky = texelFetch(uDepth, px, 0).r >= 0.99999 ? 1.0 : 0.0;
    float open = sky * (1.0 - uHasCl * texelFetch(uCl, px, 0).a);
    // Open sky counts most close to the sun's disc, where the light comes from.
    vec2 off = (q - uSun) * vec2(uAspect, 1.0);
    acc += open * w * exp(-length(off) * 3.0);
  }
  o = vec4(acc / tot, 0.0, 0.0, 1.0);
}`;
const ADD_FS = `#version 300 es
precision highp float; uniform sampler2D uRays; uniform vec2 uSize; uniform vec3 uCol; out vec4 o;
void main(){ o = vec4(uCol * texture(uRays, gl_FragCoord.xy / uSize).r, 0.0); }`;

export class GpuGodRays {
  private readonly rays: WebGLProgram;
  private readonly add: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly none: WebGLTexture;
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.rays = compile(gl, VS, RAYS_FS(CONTENT.sky.rays.samples));
    this.add = compile(gl, VS, ADD_FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.none = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.tex = this.none;
  }

  /** Adds the sun's rays over the scene in `sceneFbo` (`clouds` = the cloud cover drawn this frame, if any). */
  draw(cam: CamBasis, env: Env, w: number, h: number, depth: WebGLTexture, clouds: WebGLTexture | null, sceneFbo: WebGLFramebuffer): void {
    const R = CONTENT.sky.rays;
    if (!env.open || R.strength <= 0) return;
    // The sun on the screen: off when it is down or behind the eye.
    const ce = Math.cos(env.sunEl);
    const s = [ce * Math.cos(env.sunAz), ce * Math.sin(env.sunAz), Math.sin(env.sunEl)];
    const dot = (a: ArrayLike<number>): number => (a[0] ?? 0) * (s[0] ?? 0) + (a[1] ?? 0) * (s[1] ?? 0) + (a[2] ?? 0) * (s[2] ?? 0);
    const f = dot(cam.fwd);
    const tx = cam.tanY * cam.aspect;
    const sx = f > 0.01 ? dot(cam.right) / (f * tx) : 9;
    const sy = f > 0.01 ? dot(cam.up) / (f * cam.tanY) : 9;
    const up = Math.max(0, Math.min(1, (env.sunEl + 0.02) / 0.1));
    const k = R.strength * up * Math.max(0, Math.min(1, f / 0.3)) * (1 - Math.max(0, Math.min(1, (Math.max(Math.abs(sx), Math.abs(sy)) - 0.8) / 0.8)));
    if (k <= 0.002) return;
    const gl = this.gl;
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    if (hw !== this.w || hh !== this.h) {
      this.w = hw;
      this.h = hh;
      if (this.tex !== this.none) gl.deleteTexture(this.tex);
      this.tex = makeTexture(gl, gl.RGBA8, hw, hh, gl.RGBA, gl.UNSIGNED_BYTE);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.vao);
    let p = this.rays;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.uniform1i(loc(gl, p, 'uDepth'), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, clouds ?? this.none);
    gl.uniform1i(loc(gl, p, 'uCl'), 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(loc(gl, p, 'uHasCl'), clouds ? 1 : 0);
    gl.uniform2f(loc(gl, p, 'uSun'), sx * 0.5 + 0.5, sy * 0.5 + 0.5);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uHalf'), hw, hh);
    gl.uniform1f(loc(gl, p, 'uDecay'), R.decay);
    gl.uniform1f(loc(gl, p, 'uReach'), R.reach);
    gl.uniform1f(loc(gl, p, 'uAspect'), w / h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    p = this.add;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
    gl.viewport(0, 0, w, h);
    gl.useProgram(p);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc(gl, p, 'uRays'), 0);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform3f(loc(gl, p, 'uCol'), env.sunR * k, env.sunG * k, env.sunB * k);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
  }
}
