/**
 * What blocks light near the eye, for the per-pixel shadow rays (`gpuLight.ts`): one 1 m solid field around the camera
 * built from the same matter every pass draws: tile walls and closed doors (the boxes `gpuTileBlocks` draws), every
 * filled cell of the 3D layer, and the ground as a height grid (hills shade too). Rebuilt when the eye moves a step,
 * the 3D layer changes, or every few frames (doors, walls burnt away).
 */
import type { ReadonlyTiles, ReadonlyVolume } from '../../types';
import { BRICK_SIZE, CHUNK_SIZE } from '../../types';
import { TILES } from '../../content/tiles';
import { loc } from './glUtil';
import { GPU_TILE_BLOCKS } from './gpuTileBlocks';

export const GPU_SOLID = { size: 96, height: 48, step: 8, rebuildEvery: 12 } as const;
const S = GPU_SOLID.size;
const H = GPU_SOLID.height;

/** GLSL uniforms of the field; put them before CASTER_SHADER (gpuCasters.ts) and SOLID_SHADER. */
export const SOLID_UNIFORMS = `
uniform highp sampler3D uSolid; uniform highp sampler2D uGround; uniform ivec3 uSolid0;`;

/** GLSL: `solidAt(cell)`, `groundAt(xy)` and `shadowRay(from, dir, length, steps, sprites, selfSprite)` (1 = reaches, 0 = blocked). */
export const SOLID_SHADER = `
bool solidAt(ivec3 c){ ivec3 q = c - uSolid0; if (any(lessThan(q, ivec3(0))) || any(greaterThanEqual(q, ivec3(${S}, ${S}, ${H})))) return false; return texelFetch(uSolid, q, 0).r > 0.5; }
float groundAt(vec2 p){
  vec2 g = p - vec2(uSolid0.xy); if (g.x < 0.0 || g.y < 0.0 || g.x >= ${S}.0 || g.y >= ${S}.0) return -1e9;
  return texture(uGround, (g + 0.5) / ${S + 1}.0).r + float(uSolid0.z); // one filtered fetch: heights are kept relative to the field
}
float shadowRay(vec3 o, vec3 d, float len, int steps, bool sprites, int self){
  ivec3 cell = ivec3(floor(o)); vec3 st = sign(d); vec3 ad = max(abs(d), vec3(1e-5));
  vec3 tMax = (st * (vec3(cell) + 0.5 - o) + 0.5) / ad; vec3 tDelta = 1.0 / ad; float t = 0.0; vec3 e = o + d * len;
  bool newCol = true;
  for (int i = 0; i < steps; i++){
    if (t >= len) return 1.0;
    ivec3 q = cell - uSolid0;
    if (q.x < 0 || q.y < 0 || q.x >= ${S} || q.y >= ${S} || (q.z >= ${H} && d.z >= 0.0)) return 1.0; // left the field: the far land takes over
    float tn = min(min(tMax.x, tMax.y), tMax.z);
    vec3 m = o + d * min((t + tn) * 0.5, len);
    if (t > 0.5 && m.z < groundAt(m.xy) - 0.3) return 0.0; // the drawn land is a mesh over the same heights: allow it a little slack
    if (i > 0 && solidAt(cell)) return 0.0; // the first cell holds the surface itself (slopes, slabs)
    if (sprites && newCol){ float za = o.z + d.z * t, zb = o.z + d.z * min(tn, len); if (castersAt(cell.xy, o, d, len, e, self, min(za, zb), max(za, zb))) return 0.0; }
    newCol = tMax.z != tn;
    if (tMax.x == tn){ cell.x += int(st.x); tMax.x += tDelta.x; } else if (tMax.y == tn){ cell.y += int(st.y); tMax.y += tDelta.y; } else { cell.z += int(st.z); tMax.z += tDelta.z; }
    t = tn;
  }
  return 1.0;
}`;

export class GpuSolid {
  private readonly solid: WebGLTexture;
  private readonly ground: WebGLTexture;
  private readonly cells = new Uint8Array(S * S * H);
  private readonly heights = new Float32Array((S + 1) * (S + 1));
  private ox = NaN;
  private oy = NaN;
  private oz = NaN;
  private version = -1;
  private frame = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.solid = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_3D, this.solid);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, S, S, H, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    this.ground = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, S + 1, S + 1, 0, gl.RED, gl.FLOAT, null);
  }

  update(eye: { x: number; y: number; z: number }, tiles: ReadonlyTiles, vol: ReadonlyVolume): void {
    const st = GPU_SOLID.step;
    const ox = Math.floor(eye.x / st) * st - S / 2;
    const oy = Math.floor(eye.y / st) * st - S / 2;
    const oz = Math.floor(eye.z / st) * st - H / 2;
    const due = this.frame++ % GPU_SOLID.rebuildEvery === 0;
    if (!due && ox === this.ox && oy === this.oy && oz === this.oz && vol.version === this.version) return;
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.version = vol.version;
    this.build(tiles, vol);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.solid);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, S, S, H, gl.RED, gl.UNSIGNED_BYTE, this.cells);
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S + 1, S + 1, gl.RED, gl.FLOAT, this.heights);
  }

  private build(tiles: ReadonlyTiles, vol: ReadonlyVolume): void {
    const { ox, oy, oz, cells, heights } = this;
    cells.fill(0);
    for (let j = 0; j <= S; j++) for (let i = 0; i <= S; i++) heights[j * (S + 1) + i] = tiles.ground(ox + i, oy + j) - oz;
    // Tile walls and closed doors, the same boxes the tile-block pass draws.
    for (let cy = Math.floor(oy / CHUNK_SIZE); cy * CHUNK_SIZE < oy + S; cy++) {
      for (let cx = Math.floor(ox / CHUNK_SIZE); cx * CHUNK_SIZE < ox + S; cx++) {
        const ch = tiles.peekChunk(cx, cy);
        if (!ch) continue;
        for (let k = 0; k < CHUNK_SIZE * CHUNK_SIZE; k++) {
          const info = TILES[ch.kind[k] ?? 0];
          if (!info || info.height <= 0) continue;
          if (info.shape !== 'block' && !(info.shape === 'door' && (ch.door[k] ?? 0) < 128)) continue;
          const i = cx * CHUNK_SIZE + (k % CHUNK_SIZE) - ox;
          const j = cy * CHUNK_SIZE + Math.floor(k / CHUNK_SIZE) - oy;
          if (i < 0 || j < 0 || i >= S || j >= S) continue;
          const g = tiles.ground(ox + i + 0.5, oy + j + 0.5) - GPU_TILE_BLOCKS.sink;
          const z0 = Math.max(0, Math.floor(g) - oz);
          const z1 = Math.min(H, Math.ceil(g + GPU_TILE_BLOCKS.sink + info.height) - oz);
          for (let z = z0; z < z1; z++) cells[(z * S + j) * S + i] = 255;
        }
      }
    }
    // Every filled cell of the 3D layer.
    for (const b of vol.bricks.values()) {
      if (b.count === 0) continue;
      const bx = b.bx * BRICK_SIZE - ox;
      const by = b.by * BRICK_SIZE - oy;
      const bz = b.bz * BRICK_SIZE - oz;
      if (bx >= S || by >= S || bz >= H || bx + BRICK_SIZE <= 0 || by + BRICK_SIZE <= 0 || bz + BRICK_SIZE <= 0) continue;
      for (let c = 0; c < BRICK_SIZE * BRICK_SIZE * BRICK_SIZE; c++) {
        if ((b.shape[c] ?? 0) === 0) continue;
        const i = bx + (c & 15);
        const j = by + ((c >> 4) & 15);
        const z = bz + (c >> 8);
        if (i < 0 || j < 0 || z < 0 || i >= S || j >= S || z >= H) continue;
        cells[(z * S + j) * S + i] = 255;
      }
    }
  }

  /** Corner of the field (whole metres). */
  get origin(): { x: number; y: number } {
    return { x: this.ox, y: this.oy };
  }

  /** Binds the field on two texture units for a program that includes SOLID_UNIFORMS. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, this.solid);
    gl.uniform1i(loc(gl, p, 'uSolid'), unit);
    gl.activeTexture(gl.TEXTURE0 + unit + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.uniform1i(loc(gl, p, 'uGround'), unit + 1);
    gl.uniform3i(loc(gl, p, 'uSolid0'), this.ox, this.oy, this.oz);
  }
}
