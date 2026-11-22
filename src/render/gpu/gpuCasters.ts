/**
 * Everything drawn as a sprite (creatures, people, dropped items, props, trees, rocks) casts a shadow of its own shape.
 * Each billboard the sprite pass drew last frame is filed under the 1 m columns of the solid field it covers (two per
 * column); a shadow ray crossing a column meets the sprite as a card turned toward the ray and is blocked where the
 * picture is solid. A caster around the ray's start or end (the pixel's own sprite, the hand holding the torch) is skipped.
 */
import { loc, makeTexture } from './glUtil';
import { GPU_SOLID } from './gpuSolid';

export const GPU_CASTERS = { max: 4096, perColumn: 2, minFade: 0.5 } as const;
const S = GPU_SOLID.size;
const ROW = 64;

/**
 * GLSL (needs `uSolid0` from SOLID_UNIFORMS): `castersAt(column, from, dir, length, end, self)` is true when a sprite
 * blocks the ray. `self` is the sprite the ray starts on (-1 for none), which never shades itself; a caster holding the
 * ray's end (a torch in its hand) is skipped too. A column first rejects by the height band of its casters.
 */
export const CASTER_SHADER = `
uniform highp sampler2D uCastGrid, uCasters; uniform highp sampler2D uAtlas; uniform vec2 uCastFace;
vec4 castT(int k, int j){ return texelFetch(uCasters, ivec2((k % ${ROW}) * 3 + j, k / ${ROW}), 0); }
bool castBlocks(int k, vec3 o, vec3 d, float len, vec3 e){
  vec4 a = castT(k, 0); vec4 c = castT(k, 2);
  if (length(e.xy - a.xy) < a.w * 0.5 + 0.1 && e.z > a.z && e.z < a.z + c.x) return false;
  float hl = length(d.xy); vec2 dh = hl > 0.05 ? d.xy / hl : uCastFace;
  float den = dot(d.xy, dh); if (abs(den) < 1e-4) return false;
  float t = dot(a.xy - o.xy, dh) / den; if (t <= 0.0 || t >= len) return false;
  vec3 q = o + d * t;
  float u = dot(q.xy - a.xy, vec2(-dh.y, dh.x)) / (2.0 * a.w) + 0.5; float v = (q.z - a.z) / c.x;
  if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) return false;
  if (c.y > 0.5) u = 1.0 - u;
  vec4 b = castT(k, 1);
  ivec2 tx = ivec2(b.xy) + clamp(ivec2(vec2(u, 1.0 - v) * b.zw), ivec2(0), ivec2(b.zw) - 1);
  return texelFetch(uAtlas, tx, 0).a > 0.5;
}
bool castersAt(ivec2 col, vec3 o, vec3 d, float len, vec3 e, int self, float zLo, float zHi){
  ivec2 q = col - uSolid0.xy; if (q.x < 0 || q.y < 0 || q.x >= ${S} || q.y >= ${S}) return false;
  vec4 s = texelFetch(uCastGrid, q, 0);
  if (s.x < 0.5 || zHi < s.z || zLo > s.w) return false;
  if (int(s.x) - 1 != self && castBlocks(int(s.x) - 1, o, d, len, e)) return true;
  return s.y > 0.5 && int(s.y) - 1 != self && castBlocks(int(s.y) - 1, o, d, len, e);
}`;

export interface CasterList {
  data: Float32Array;
  count: number;
  stride: number;
  atlas: WebGLTexture;
}

export class GpuCasters {
  private readonly grid: WebGLTexture;
  private readonly casters: WebGLTexture;
  private readonly g = new Float32Array(S * S * 4);
  private readonly c = new Float32Array(ROW * 3 * (GPU_CASTERS.max / ROW) * 4);
  private atlas: WebGLTexture | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.grid = makeTexture(gl, gl.RGBA32F, S, S, gl.RGBA, gl.FLOAT);
    this.casters = makeTexture(gl, gl.RGBA32F, ROW * 3, GPU_CASTERS.max / ROW, gl.RGBA, gl.FLOAT);
  }

  /** Files last frame's billboards (`GpuSprites.casters`, stride 20: xyz, rect, tint, fx(z fade, w flip), size) under the field's columns. */
  update(list: CasterList, ox: number, oy: number): void {
    const { g, c } = this;
    g.fill(0);
    // Caster k is billboard instance k, so the light pass can tell which sprite a pixel belongs to.
    const n = Math.min(list.count, GPU_CASTERS.max);
    for (let i = 0; i < n; i++) {
      const o = i * list.stride;
      const d = list.data;
      const x = d[o] ?? 0;
      const y = d[o + 1] ?? 0;
      const z = d[o + 2] ?? 0;
      const hw = (d[o + 16] ?? 0) / 2;
      const h = d[o + 17] ?? 0;
      c.set([x, y, z, hw, d[o + 4] ?? 0, d[o + 5] ?? 0, d[o + 6] ?? 0, d[o + 7] ?? 0, h, d[o + 15] ?? 0, 0, 0], (Math.floor(i / ROW) * ROW * 3 + (i % ROW) * 3) * 4);
      if ((d[o + 14] ?? 0) < GPU_CASTERS.minFade || hw <= 0 || h <= 0) continue;
      const i0 = Math.max(0, Math.floor(x - hw) - ox);
      const i1 = Math.min(S - 1, Math.floor(x + hw) - ox);
      const j0 = Math.max(0, Math.floor(y - hw) - oy);
      const j1 = Math.min(S - 1, Math.floor(y + hw) - oy);
      for (let j = j0; j <= j1; j++) {
        for (let k = i0; k <= i1; k++) {
          const at = (j * S + k) * 4;
          const slot = (g[at] ?? 0) === 0 ? at : (g[at + 1] ?? 0) === 0 ? at + 1 : -1;
          if (slot < 0) continue;
          g[slot] = i + 1;
          g[at + 2] = slot === at ? z : Math.min(g[at + 2] ?? z, z);
          g[at + 3] = slot === at ? z + h : Math.max(g[at + 3] ?? 0, z + h);
        }
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.grid);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S, S, gl.RGBA, gl.FLOAT, g);
    gl.bindTexture(gl.TEXTURE_2D, this.casters);
    const rows = Math.max(1, Math.ceil(n / ROW));
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW * 3, rows, gl.RGBA, gl.FLOAT, c.subarray(0, rows * ROW * 3 * 4));
    this.atlas = list.atlas;
  }

  /** Binds three units for a program that includes CASTER_SHADER; `face` is the card direction for rays going straight up. */
  bind(p: WebGLProgram, unit: number, face: readonly [number, number]): void {
    const gl = this.gl;
    const texs: [string, WebGLTexture | null][] = [['uCastGrid', this.grid], ['uCasters', this.casters], ['uAtlas', this.atlas]];
    texs.forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + unit + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, name), unit + i);
    });
    gl.uniform2f(loc(gl, p, 'uCastFace'), face[0], face[1]);
  }
}
