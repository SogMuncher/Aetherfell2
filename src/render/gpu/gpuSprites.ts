/**
 * GPU billboards: trees, props, creatures, items. `SpriteRenderer.collect` still decides WHAT is drawn (and the sprite art
 * stays procedural, cached on the CPU); here each picture lives ONCE in one atlas texture and every billboard is an instanced
 * quad, depth-tested in the shared depth buffer, lit by the light pass, fogged. A picture's colour-region pixels are stored as
 * (region, shade) codes; each individual's colours are one row of a small palette texture, so a forest of differently
 * coloured trees shares a handful of pictures instead of filling the atlas.
 */
import { SHADE_ONE } from '../palette';
import type { Billboard } from '../entities/spriteRenderer';
import type { Sprite } from '../entities/sprites';
import type { Env } from '../lighting';
import { compile, loc, makeTexture } from './glUtil';
import { SURFACE_OUT } from './gpuSurfaces';
import type { CamBasis } from './glUtil';

/** All numbers live here. `palW` colours per palette row (regions 1..palW-1), `palRows` rows (more than `max`, so one frame always fits). */
export const GPU_SPRITES = { atlas: 2048, max: 4096, palW: 32, palRows: 8192 } as const;
const STRIDE = 20;
const PAL_PER_LINE = GPU_SPRITES.atlas / GPU_SPRITES.palW;
const PAL_LINES = GPU_SPRITES.palRows / PAL_PER_LINE;
/** Atlas alpha byte marking a colour-region pixel (r = region, g = shade); still > 0.5 for shadow casters. */
const REGION_A = 254;

const VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uRight, uEye;
in vec4 aPos; in vec4 aRect; in vec4 aTint; in vec4 aFx; in vec4 aSize;
out vec2 vUv; flat out int fId, fPal; flat out vec4 fRect; flat out vec4 fTint; flat out vec4 fFx; flat out vec3 fBase; out vec3 vWorld;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  // Each sprite turns to face the camera's POSITION (upright), so turning or tilting the view never swings it round.
  vec2 to = aPos.xy - uEye.xy; float tl = length(to);
  vec3 right = tl > 1e-3 ? vec3(-to.y / tl, to.x / tl, 0.0) : uRight;
  vec3 p = aPos.xyz + right * (q.x - 0.5) * aSize.x + vec3(0.0, 0.0, q.y * aSize.y);
  fId = gl_InstanceID; fPal = int(aPos.w); vUv = vec2(aFx.w > 0.5 ? 1.0 - q.x : q.x, 1.0 - q.y); fRect = aRect; fTint = aTint; fFx = aFx; fBase = aPos.xyz; vWorld = p;
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas, uPal; uniform vec3 uEye, uFog; uniform float uFogDist;
${SURFACE_OUT}
in vec2 vUv; flat in int fId, fPal; flat in vec4 fRect; flat in vec4 fTint; flat in vec4 fFx; flat in vec3 fBase; in vec3 vWorld; layout(location = 0) out vec4 o;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  if (fFx.z < 1.0 && BAYER[(px.y & 3) * 4 + (px.x & 3)] >= floor(fFx.z * 16.0 + 0.5)) discard;
  ivec2 t = ivec2(fRect.xy) + clamp(ivec2(vUv * fRect.zw), ivec2(0), ivec2(fRect.zw) - 1);
  vec4 c = texelFetch(uAtlas, t, 0);
  if (c.a < 0.5) discard;
  // A colour-region pixel: this individual's colour for the region, at the picture's shade there.
  if (c.a < ${(REGION_A + 0.5) / 255} && fPal >= 0) {
    int reg = int(c.r * 255.0 + 0.5);
    vec3 col = texelFetch(uPal, ivec2((fPal % ${PAL_PER_LINE}) * ${GPU_SPRITES.palW} + reg, fPal / ${PAL_PER_LINE}), 0).rgb;
    c.rgb = min(vec3(1.0), col * (c.g * 255.0 / ${SHADE_ONE}.0));
  }
  // Burning and hit flashes glow on their own; the light pass lights the rest.
  vec3 alb = c.rgb * fTint.rgb;
  vec3 emit = alb * (vec3(fFx.x, fFx.x * 0.45, fFx.x * 0.1) + vec3(fFx.y * 2.0, fFx.y * 0.4, fFx.y * 0.4));
  spriteOut(alb, fId);
  float f = min(0.97, 1.0 - exp(-length(vWorld - uEye) / uFogDist));
  o = vec4(emit * (1.0 - f) + uFog * f, 1.0);
}`;


interface Slot {
  x: number;
  y: number;
  w: number;
  h: number;
}

const UNIFORMS = ['uAtlas', 'uPal', 'uVP', 'uRight', 'uEye', 'uFog', 'uFogDist'] as const;

export class GpuSprites {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private readonly atlas: WebGLTexture;
  private readonly pal: WebGLTexture;
  private readonly u: Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  /** Per picture: its slot with colour regions coded (`coded`) and/or as painted (`plain`, for no individual colours). */
  private slots = new Map<Sprite, { coded?: Slot; plain?: Slot }>();
  private shelfX = 0;
  private shelfY = 0;
  private shelfH = 0;
  private full = false;
  /** Palette row of each individual's colours; rows are reused only between frames, never inside one. */
  private rows = new Map<Uint32Array, number>();
  private readonly palPx = new Uint32Array(GPU_SPRITES.atlas * PAL_LINES);
  private dirtyLo = PAL_LINES;
  private dirtyHi = -1;
  private readonly data = new Float32Array(STRIDE * GPU_SPRITES.max);
  /** Billboards drawn in the last frame. */
  drawn = 0;
  /** Last frame's billboards as shadow casters: per billboard x,y,z, atlas rect, size, flip (see `draw`), and the atlas. */
  get casters(): { data: Float32Array; count: number; stride: number; atlas: WebGLTexture } {
    return { data: this.data, count: this.drawn, stride: STRIDE, atlas: this.atlas };
  }

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    const p = this.prog;
    this.u = Object.fromEntries(UNIFORMS.map((n) => [n, loc(gl, p, n)])) as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    this.buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (const [i, name] of ['aPos', 'aRect', 'aTint', 'aFx', 'aSize'].entries()) {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    gl.bindVertexArray(null);
    this.atlas = makeTexture(gl, gl.RGBA8, GPU_SPRITES.atlas, GPU_SPRITES.atlas, gl.RGBA, gl.UNSIGNED_BYTE);
    this.pal = makeTexture(gl, gl.RGBA8, GPU_SPRITES.atlas, PAL_LINES, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  /** Empties the atlas; only ever between filling two frames' instances, so no queued billboard points at a reused slot. */
  private resetAtlas(): void {
    this.slots.clear();
    this.shelfX = this.shelfY = this.shelfH = 0;
    this.full = false;
  }

  /** A picture copied into the atlas once (colour regions coded when `coded`); null when the atlas is full. */
  private slotFor(s: Sprite, coded: boolean): Slot | null {
    const per = this.slots.get(s);
    const hit = coded ? per?.coded : per?.plain;
    if (hit) return hit;
    if (this.shelfX + s.w > GPU_SPRITES.atlas) {
      this.shelfX = 0;
      this.shelfY += this.shelfH;
      this.shelfH = 0;
    }
    if (this.shelfY + s.h > GPU_SPRITES.atlas || s.w > GPU_SPRITES.atlas) {
      this.full = true;
      return null;
    }
    const px = new Uint32Array(s.px);
    if (coded && s.regions) {
      for (let i = 0; i < px.length; i++) {
        const reg = s.regions[i] ?? 0;
        if (reg) px[i] = ((REGION_A << 24) | ((s.shade?.[i] ?? SHADE_ONE) << 8) | Math.min(reg, GPU_SPRITES.palW - 1)) >>> 0;
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, this.shelfX, this.shelfY, s.w, s.h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px.buffer));
    const slot = { x: this.shelfX, y: this.shelfY, w: s.w, h: s.h };
    this.shelfX += s.w;
    this.shelfH = Math.max(this.shelfH, s.h);
    if (per) per[coded ? 'coded' : 'plain'] = slot;
    else this.slots.set(s, coded ? { coded: slot } : { plain: slot });
    return slot;
  }

  /** This individual's palette row, written into the CPU copy (uploaded once per frame). */
  private rowFor(colours: Uint32Array): number {
    const hit = this.rows.get(colours);
    if (hit !== undefined) return hit;
    const row = this.rows.size;
    this.rows.set(colours, row);
    const line = Math.floor(row / PAL_PER_LINE);
    const o = line * GPU_SPRITES.atlas + (row % PAL_PER_LINE) * GPU_SPRITES.palW;
    const n = Math.min(colours.length, GPU_SPRITES.palW);
    for (let i = 0; i < n; i++) this.palPx[o + i] = (colours[i] ?? 0) | 0xff000000;
    this.dirtyLo = Math.min(this.dirtyLo, line);
    this.dirtyHi = Math.max(this.dirtyHi, line);
    return row;
  }

  /** Writes this frame's instances; false when the atlas filled up part way (nothing queued is drawn then). */
  private fill(list: readonly Billboard[], n: number, giveUp: boolean): boolean {
    const d = this.data;
    let o = 0;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!b) continue;
      const coded = b.colours !== null && b.sprite.regions !== undefined;
      const slot = this.slotFor(b.sprite, coded);
      if (!slot) {
        if (giveUp) continue;
        return false;
      }
      d[o] = b.x;
      d[o + 1] = b.y;
      d[o + 2] = b.z;
      d[o + 3] = coded && b.colours ? this.rowFor(b.colours) : -1;
      d[o + 4] = slot.x;
      d[o + 5] = slot.y;
      d[o + 6] = slot.w;
      d[o + 7] = slot.h;
      d[o + 8] = b.tr;
      d[o + 9] = b.tg;
      d[o + 10] = b.tb;
      d[o + 11] = 0;
      d[o + 12] = b.heat;
      d[o + 13] = b.flash;
      d[o + 14] = b.fade;
      d[o + 15] = b.flip ? 1 : 0;
      d[o + 16] = b.sprite.worldW * b.scale;
      d[o + 17] = b.sprite.worldH * b.scale;
      d[o + 18] = 0;
      d[o + 19] = 0;
      o += STRIDE;
    }
    this.drawn = o / STRIDE;
    return true;
  }

  draw(vp: Float32Array, cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, list: readonly Billboard[]): void {
    const gl = this.gl;
    const n = Math.min(GPU_SPRITES.max, list.length);
    // Palette rows only start over between frames, and there are more rows than one frame can use.
    if (this.rows.size + n > GPU_SPRITES.palRows) this.rows.clear();
    // A full atlas starts over and the frame is filled again from scratch (pictures are shared, so one frame always fits).
    if (this.full) this.resetAtlas();
    if (!this.fill(list, n, false)) {
      this.resetAtlas();
      this.fill(list, n, true);
    }
    const count = this.drawn;
    if (count === 0) return;
    if (this.dirtyHi >= this.dirtyLo) {
      gl.bindTexture(gl.TEXTURE_2D, this.pal);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      const lo = this.dirtyLo * GPU_SPRITES.atlas;
      const hi = (this.dirtyHi + 1) * GPU_SPRITES.atlas;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, this.dirtyLo, GPU_SPRITES.atlas, this.dirtyHi + 1 - this.dirtyLo, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(this.palPx.buffer, lo * 4, (hi - lo) * 4));
      this.dirtyLo = PAL_LINES;
      this.dirtyHi = -1;
    }
    const u = this.u;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, count * STRIDE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(u.uAtlas, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(u.uPal, 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniformMatrix4fv(u.uVP, false, vp);
    // Level right (a leaning view never tips the billboards: they stand upright in the world).
    const fl = Math.max(1e-6, Math.hypot(cam.fwd[0], cam.fwd[1]));
    gl.uniform3f(u.uRight, -cam.fwd[1] / fl, cam.fwd[0] / fl, 0);
    gl.uniform3f(u.uEye, eye.x, eye.y, eye.z);
    gl.uniform3f(u.uFog, env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(u.uFogDist, env.fogDist);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
}
