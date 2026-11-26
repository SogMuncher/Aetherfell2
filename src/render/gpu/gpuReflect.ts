// Reflections: shiny surfaces (shine from surface and matter-state data, written beside each pixel's normal) mirror the lit scene.
import type { Env } from '../lighting';
import type { CamBasis } from './glUtil';
import { compile, loc, makeTexture } from './glUtil';
import { SOLID_SHADER, SOLID_UNIFORMS } from './gpuSolid';
import type { GpuSolid } from './gpuSolid';
import { CASTER_SHADER } from './gpuCasters';
import type { GpuCasters } from './gpuCasters';

/**
 * Runs after the light pass on a copy of the lit scene. Screen space walks the mirrored ray across the depth buffer and
 * takes the colour where it goes behind a surface. Ray traced walks it through the same solid field the shadow rays use
 * (`rayHit`), so it knows what it really hits: seen on screen, that pixel's colour; hidden or off screen, dim unseen
 * stuff; nothing, the sky. Strength = shine x a Fresnel rise toward grazing angles.
 */
export const GPU_REFLECT = { ssrSteps: 20, ssrStart: 0.3, ssrGrow: 1.28, rayLen: 48, raySteps: 48, max: 0.85, unseen: 0.45, edge: 0.08 } as const;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (traced: boolean): string => `#version 300 es
#define TRACED ${traced ? 1 : 0}
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uniform sampler2D uAlb, uNrm, uDepth, uScene; uniform mat4 uVP;
uniform vec3 uEye, uFwd, uRight, uUp, uZenith, uHorizon, uAmb; uniform vec2 uTan, uSize; uniform float uNear, uFar, uOpen;
${traced ? `${SOLID_UNIFORMS}\n${CASTER_SHADER}\n${SOLID_SHADER}` : ''}
out vec4 o;
float lin(ivec2 q){ float zn = texelFetch(uDepth, q, 0).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
vec3 skyCol(vec3 d){ return uOpen > 0.5 ? mix(uHorizon, uZenith, clamp(d.z * 1.5, 0.0, 1.0)) : uAmb * ${GPU_REFLECT.unseen.toFixed(2)}; }
// Where a world point lands on screen (false: off it or behind the eye); w = its view depth.
bool onScreen(vec3 q, out ivec2 sp, out float w, out float edge){
  vec4 c = uVP * vec4(q, 1.0); w = c.w; if (w <= uNear) return false;
  vec2 uv = c.xy / w * 0.5 + 0.5; if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) return false;
  sp = ivec2(uv * uSize); vec2 e = min(uv, 1.0 - uv) / ${GPU_REFLECT.edge.toFixed(2)}; edge = clamp(min(e.x, e.y), 0.0, 1.0); return true;
}
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 nr = texelFetch(uNrm, px, 0); vec4 al = texelFetch(uAlb, px, 0);
  if (nr.a < 0.02 || al.a < 0.75) discard;
  vec3 n = normalize(nr.xyz * 2.0 - 1.0);
  vec2 nd = (vec2(px) + 0.5) / uSize * 2.0 - 1.0; vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y;
  vec3 p = uEye + r * lin(px); vec3 v = normalize(r); vec3 R = reflect(v, n);
  float k = min(${GPU_REFLECT.max.toFixed(2)}, nr.a * (0.2 + 0.8 * pow(1.0 - max(0.0, dot(-v, n)), 4.0)));
  vec3 from = p + n * 0.08; vec3 col = skyCol(R); ivec2 sp; float w, edge;
#if TRACED == 1
  float t = rayHit(from, R, ${GPU_REFLECT.rayLen.toFixed(1)}, ${GPU_REFLECT.raySteps}, false, -1);
  if (t >= 0.0) {
    col = uAmb * ${GPU_REFLECT.unseen.toFixed(2)};
    vec3 h = from + R * t;
    if (onScreen(h, sp, w, edge) && abs(lin(sp) - w) < 0.4 + 0.04 * w) col = mix(col, texelFetch(uScene, sp, 0).rgb, edge);
  } else if (R.z < 0.0) col = uHorizon; // down past the near field: the far land, faded into the horizon
#else
  float t = ${GPU_REFLECT.ssrStart.toFixed(2)}; bool hit = false;
  for (int i = 0; i < ${GPU_REFLECT.ssrSteps}; i++){
    if (!onScreen(from + R * t, sp, w, edge)) break;
    float dz = w - lin(sp);
    if (dz > 0.0 && dz < 0.5 + t * 0.25) { col = mix(col, texelFetch(uScene, sp, 0).rgb, edge); hit = true; break; }
    t = t * ${GPU_REFLECT.ssrGrow.toFixed(2)} + 0.1;
  }
  if (!hit && R.z < 0.05) k = 0.0; // a ray down that left the screen: nothing known to mirror
#endif
  if (k <= 0.0) discard;
  o = vec4(col, k);
}`;

export class GpuReflect {
  private readonly progs: WebGLProgram[] = [];
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private copy: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.copy = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  /** Copies the lit scene, then blends each shiny pixel's reflection over it in `target` (the scene colour without depth). */
  draw(traced: boolean, cam: CamBasis, vp: Float32Array, eye: { x: number; y: number; z: number }, env: Env, alb: WebGLTexture, nrm: WebGLTexture, depth: WebGLTexture, scene: WebGLFramebuffer, target: WebGLFramebuffer, solid: GpuSolid, casters: GpuCasters, w: number, h: number, near: number, far: number): void {
    const gl = this.gl;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      gl.deleteTexture(this.copy);
      this.copy = makeTexture(gl, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.copy, 0);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, scene);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbo);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    const i = traced ? 1 : 0;
    const p = (this.progs[i] ??= compile(gl, VS, fs(traced)));
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    const texs: [string, WebGLTexture][] = [['uAlb', alb], ['uNrm', nrm], ['uDepth', depth], ['uScene', this.copy]];
    texs.forEach(([name, t], u) => {
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, name), u);
    });
    if (traced) {
      solid.bind(p, 4);
      const fl = Math.hypot(cam.fwd[0], cam.fwd[1]) || 1;
      casters.bind(p, 8, [cam.fwd[0] / fl || 1, cam.fwd[1] / fl]);
      solid.bindFrames(p, 11);
    }
    const v3 = (n: string, v: readonly number[], k = 1): void => gl.uniform3f(loc(gl, p, n), (v[0] ?? 0) * k, (v[1] ?? 0) * k, (v[2] ?? 0) * k);
    v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uFwd', cam.fwd);
    v3('uRight', cam.right);
    v3('uUp', cam.up);
    v3('uZenith', env.zenith, 1 / 255);
    v3('uHorizon', env.horizon, 1 / 255);
    v3('uAmb', [env.ambR, env.ambG, env.ambB]);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uOpen'), env.open ? 1 : 0);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }
}
