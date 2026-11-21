/**
 * GPU scene target and finishing pass: everything is drawn into a low-res colour+depth target, then this pass does the
 * retro finish (vignette, pain/water/downed tints, ordered dither into fewer colours) and writes the canvas.
 */
import { compile, loc, makeTexture } from './glUtil';

const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = p; gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uScene; uniform vec2 uSize; uniform float uLevels, uHurt, uUnder, uDown;
in vec2 vUv; out vec4 o;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uScene, px, 0).rgb * 255.0;
  vec2 q = gl_FragCoord.xy - uSize * 0.5; float r2 = dot(q, q) / dot(uSize * 0.5, uSize * 0.5);
  c *= 1.0 - r2 * 0.45;
  c.r += (200.0 - c.r) * uHurt * r2; c.gb *= 1.0 - uHurt * r2 * 0.6;
  c = vec3(c.r * (1.0 - uUnder * 0.6), c.g * (1.0 - uUnder * 0.3) + 20.0 * uUnder, c.b * (1.0 - uUnder * 0.1) + 40.0 * uUnder);
  float l = dot(c, vec3(0.3, 0.59, 0.11)); c += (vec3(l) - c) * uDown;
  float step_ = 255.0 / (uLevels - 1.0);
  float d = (BAYER[(px.y & 3) * 4 + (px.x & 3)] / 16.0 - 0.5) * step_;
  c = clamp(floor((c + d) / step_ + 0.5) * step_, 0.0, 255.0) / 255.0;
  o = vec4(c, 1.0);
}`;

export interface PostParams {
  hurt: number;
  underwater: number;
  downed: number;
  levels: number;
}

export class GpuPost {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private fbo: WebGLFramebuffer;
  private tex: WebGLTexture;
  private depthTex: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
    this.depthTex = makeTexture(gl, gl.DEPTH_COMPONENT24, 1, 1, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
  }

  private resize(w: number, h: number): void {
    const gl = this.gl;
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    gl.deleteTexture(this.tex);
    this.tex = makeTexture(gl, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE);
    gl.deleteTexture(this.depthTex);
    this.depthTex = makeTexture(gl, gl.DEPTH_COMPONENT24, w, h, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);
  }

  /** The scene's depth, for passes (clouds) that need to know how far the nearest surface is. Only sample it while drawing into another target. */
  get depthTexture(): WebGLTexture {
    return this.depthTex;
  }

  /** Back to drawing into the scene target (after a pass that drew elsewhere). */
  get sceneTarget(): WebGLFramebuffer {
    return this.fbo;
  }

  /** Binds the low-res target and clears it. */
  begin(w: number, h: number): void {
    const gl = this.gl;
    this.resize(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, w, h);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  }

  /** Finishes the frame onto the canvas. */
  finish(p: PostParams): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc(gl, this.prog, 'uScene'), 0);
    gl.uniform2f(loc(gl, this.prog, 'uSize'), this.w, this.h);
    gl.uniform1f(loc(gl, this.prog, 'uLevels'), p.levels);
    gl.uniform1f(loc(gl, this.prog, 'uHurt'), p.hurt);
    gl.uniform1f(loc(gl, this.prog, 'uUnder'), p.underwater);
    gl.uniform1f(loc(gl, this.prog, 'uDown'), p.downed);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
