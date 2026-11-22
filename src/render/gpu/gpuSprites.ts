/**
 * GPU billboards: trees, props, creatures, items. `SpriteRenderer.collect` still decides WHAT is drawn (and the sprite art
 * stays procedural, cached on the CPU); here each picture (with its individual's colour regions filled in) lives in one atlas
 * texture and every billboard is an instanced quad, depth-tested in the shared depth buffer, lit by the light pass, fogged.
 */
import { SHADE_ONE } from '../palette';
import type { Billboard } from '../entities/spriteRenderer';
import type { Sprite } from '../entities/sprites';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import { SURFACE_OUT } from './gpuSurfaces';
import type { CamBasis } from './glUtil';

/** All numbers live here. */
export const GPU_SPRITES = { atlas: 2048, max: 4096 } as const;
const STRIDE = 20;

const VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uRight;
in vec4 aPos; in vec4 aRect; in vec4 aTint; in vec4 aFx; in vec4 aSize;
out vec2 vUv; flat out vec4 fRect; flat out vec4 fTint; flat out vec4 fFx; flat out vec3 fBase; out vec3 vWorld;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 p = aPos.xyz + uRight * (q.x - 0.5) * aSize.x + vec3(0.0, 0.0, q.y * aSize.y);
  vUv = vec2(aFx.w > 0.5 ? 1.0 - q.x : q.x, 1.0 - q.y); fRect = aRect; fTint = aTint; fFx = aFx; fBase = aPos.xyz; vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas; uniform vec3 uEye, uFog; uniform float uFogDist;
${SURFACE_OUT}
in vec2 vUv; flat in vec4 fRect; flat in vec4 fTint; flat in vec4 fFx; flat in vec3 fBase; in vec3 vWorld; layout(location = 0) out vec4 o;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  if (fFx.z < 1.0 && BAYER[(px.y & 3) * 4 + (px.x & 3)] >= floor(fFx.z * 16.0 + 0.5)) discard;
  ivec2 t = ivec2(fRect.xy) + clamp(ivec2(vUv * fRect.zw), ivec2(0), ivec2(fRect.zw) - 1);
  vec4 c = texelFetch(uAtlas, t, 0);
  if (c.a < 0.5) discard;
  // Burning and hit flashes glow on their own; the light pass lights the rest.
  vec3 alb = c.rgb * fTint.rgb;
  vec3 emit = alb * (vec3(fFx.x, fFx.x * 0.45, fFx.x * 0.1) + vec3(fFx.y * 2.0, fFx.y * 0.4, fFx.y * 0.4));
  surfaceOut(alb, vec3(0.0, 0.0, 1.0), 0.5);
  float f = min(0.97, 1.0 - exp(-length(vWorld - uEye) / uFogDist));
  o = vec4(emit * (1.0 - f) + uFog * f, 1.0);
}`;

interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GpuSprites {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly atlas: WebGLTexture;
  private slots = new Map<Sprite, Map<Uint32Array | null, Slot>>();
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  private data = new Float32Array(STRIDE * 256);
  /** Billboards drawn in the last frame. */
  drawn = 0;
  /** Last frame's billboards as shadow casters: per billboard x,y,z, atlas rect, size, flip (see `draw`), and the atlas. */
  get casters(): { data: Float32Array; count: number; stride: number; atlas: WebGLTexture } {
    return { data: this.data, count: this.drawn, stride: STRIDE, atlas: this.atlas };
  }

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (const [i, name] of ['aPos', 'aRect', 'aTint', 'aFx', 'aSize'].entries()) {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    this.atlas = makeTexture(gl, gl.RGBA8, GPU_SPRITES.atlas, GPU_SPRITES.atlas, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  /** A picture with its individual's colour regions filled in, copied into the atlas once. */
  private slotFor(s: Sprite, colours: Uint32Array | null): Slot | null {
    let per = this.slots.get(s);
    const key = colours && s.regions ? colours : null;
    const hit = per?.get(key);
    if (hit) return hit;
    if (this.shelfX + s.w > GPU_SPRITES.atlas) {
      this.shelfX = 0;
      this.shelfY += this.shelfH;
      this.shelfH = 0;
    }
    if (this.shelfY + s.h > GPU_SPRITES.atlas) {
      // Full: start over; pictures come back as they are needed.
      this.slots.clear();
      this.shelfX = this.shelfY = this.shelfH = 0;
      per = undefined;
    }
    const px = new Uint32Array(s.px);
    if (key && s.regions && s.shade) {
      for (let i = 0; i < px.length; i++) {
        const reg = s.regions[i] ?? 0;
        if (!reg) continue;
        const c = key[reg] ?? px[i] ?? 0;
        const k = (s.shade[i] ?? SHADE_ONE) / SHADE_ONE;
        const r = Math.min(255, (c & 255) * k);
        const g = Math.min(255, ((c >>> 8) & 255) * k);
        const b = Math.min(255, ((c >>> 16) & 255) * k);
        px[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, this.shelfX, this.shelfY, s.w, s.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer));
    const slot = { x: this.shelfX, y: this.shelfY, w: s.w, h: s.h };
    this.shelfX += s.w;
    this.shelfH = Math.max(this.shelfH, s.h);
    if (!per) {
      per = new Map();
      this.slots.set(s, per);
    }
    per.set(key, slot);
    return slot;
  }

  draw(vp: Float32Array, cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, list: readonly Billboard[]): void {
    const gl = this.gl;
    const n = Math.min(GPU_SPRITES.max, list.length);
    if (this.data.length < n * STRIDE) this.data = new Float32Array(n * STRIDE * 2);
    const d = this.data;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!b) continue;
      const slot = this.slotFor(b.sprite, b.colours);
      if (!slot) continue;
      d.set([b.x, b.y, b.z, 0, slot.x, slot.y, slot.w, slot.h, b.tr, b.tg, b.tb, 0, b.heat, b.flash, b.fade, b.flip ? 1 : 0, b.sprite.worldW * b.scale, b.sprite.worldH * b.scale, 0, 0], count * STRIDE);
      count++;
    }
    this.drawn = count;
    if (count === 0) return;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, count * STRIDE), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(loc(gl, p, 'uAtlas'), 0);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uRight'), cam.right[0], cam.right[1], 0);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
}
