/**
 * What blocks light near the eye, for the per-pixel shadow rays (`gpuLight.ts`): one 1 m solid field around the camera
 * built from the same matter every pass draws: tile walls and closed doors (the boxes `gpuTileBlocks` draws), every
 * filled cell of the 3D layer, and the ground as a height grid (hills shade too); moving frames (airships) shade through
 * their own grid (`gpuFrameShade.ts`). Rebuilt when the eye moves a step,
 * the 3D layer changes, or every few frames (doors, walls burnt away).
 */
import type { ReadonlyTiles, ReadonlyVolume, VolumeFrame } from '../../types';
import { BRICK_SIZE, CHUNK_SIZE } from '../../types';
import { TILES } from '../../content/tiles';
import { SHAPE_COUNT, SHAPE_CUBE, SHAPE_FINE, SHAPE_PIECES, SHAPE_START } from '../../content/shapes';
import { loc, makeTexture } from './glUtil';
import { GPU_TILE_BLOCKS } from './gpuTileBlocks';
import { FRAME_SHADER, GpuFrameShade } from './gpuFrameShade';

export const GPU_SOLID = { size: 96, height: 48, step: 8, rebuildEvery: 12 } as const;
const S = GPU_SOLID.size;
const H = GPU_SOLID.height;

/** Floats per shape piece row: box(6) + cut count(1) + four cuts (4 each). */
export const PIECE_FLOATS = 23;

/** The shape table (content/shapes.ts) as two textures, `uPieces` and `uShapeIdx`, for SHAPE_SHADER. */
export function makeShapeTextures(gl: WebGL2RenderingContext): [pieces: WebGLTexture, idx: WebGLTexture] {
  const n = SHAPE_PIECES.length / PIECE_FLOATS;
  const pieces = makeTexture(gl, gl.R32F, PIECE_FLOATS, n, gl.RED, gl.FLOAT);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PIECE_FLOATS, n, gl.RED, gl.FLOAT, SHAPE_PIECES);
  const idx = makeTexture(gl, gl.R32F, 256, 2, gl.RED, gl.FLOAT);
  const v = new Float32Array(512);
  for (let i = 0; i < 256; i++) {
    v[i] = SHAPE_START[i] ?? 0;
    v[256 + i] = SHAPE_COUNT[i] ?? 0;
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 2, gl.RED, gl.FLOAT, v);
  return [pieces, idx];
}

/** GLSL, shared by the structure pass and the shadow rays: `pieceSpan` is where a ray (cell's 0..1 coordinates) is inside one piece of a shape. */
export const SHAPE_SHADER = `
uniform highp sampler2D uPieces, uShapeIdx;
float P(int pc, int k){ return texelFetch(uPieces, ivec2(k, pc), 0).r; }
int shapeStart(int byte){ return int(texelFetch(uShapeIdx, ivec2(byte, 0), 0).r); }
int shapeCount(int byte){ return int(texelFetch(uShapeIdx, ivec2(byte, 1), 0).r); }
bool pieceSpan(int pc, vec3 o, vec3 d, out float t0, out float t1, out vec3 nn){
  t0 = -1e9; t1 = 1e9; nn = vec3(0.0);
  for (int a = 0; a < 3; a++){
    float oo = o[a], dd = d[a], lo = P(pc, a), hi = P(pc, 3 + a);
    if (abs(dd) < 1e-9){ if (oo < lo || oo > hi) return false; continue; }
    float ta = (lo - oo) / dd, tb = (hi - oo) / dd; if (ta > tb){ float x = ta; ta = tb; tb = x; }
    if (ta > t0){ t0 = ta; nn = vec3(0.0); nn[a] = dd > 0.0 ? -1.0 : 1.0; }
    if (tb < t1) t1 = tb;
  }
  int cuts = int(P(pc, 6));
  for (int c = 0; c < 4; c++){ if (c >= cuts) break; int b = 7 + c * 4;
    vec3 cn = vec3(P(pc, b), P(pc, b + 1), P(pc, b + 2)); float cd = P(pc, b + 3);
    float den = dot(cn, d), num = cd - dot(cn, o);
    if (abs(den) < 1e-9){ if (num < 0.0) return false; continue; }
    float t = num / den;
    if (den < 0.0){ if (t > t0){ t0 = t; nn = normalize(cn); } } else if (t < t1) t1 = t;
  }
  return t0 <= t1;
}
/** Does the ray o + d*t, t in 0..len, pass through the shape for more than a hair (so a surface never shades itself)? */
bool shapeBlocks(int byte, vec3 o, vec3 d, float len){
  int n = shapeCount(byte), s = shapeStart(byte);
  for (int k = 0; k < 4; k++){ if (k >= n) break; float t0, t1; vec3 nn;
    if (pieceSpan(s + k, o, d, t0, t1, nn) && min(t1, len) - max(t0, 0.0) > 0.03) return true; }
  return false;
}`;

/** GLSL uniforms of the field; put them before CASTER_SHADER (gpuCasters.ts) and SOLID_SHADER. */
export const SOLID_UNIFORMS = `
uniform highp sampler3D uSolid; uniform highp sampler2D uGround; uniform ivec3 uSolid0;
${SHAPE_SHADER}
${FRAME_SHADER}`;

/**
 * GLSL: `solidShape(cell)` (0 empty, 255 whole block, else the 3D layer's shape byte), `groundAt(xy)` and
 * `shadowRay(from, dir, length, steps, sprites, selfSprite)` (1 = reaches, 0 = blocked). Shaped cells (roofs, slopes, slabs)
 * block only where the ray really passes through their pieces, so they shade by their true shape, themselves included.
 */
export const SOLID_SHADER = `
int solidShape(ivec3 c){ ivec3 q = c - uSolid0; if (any(lessThan(q, ivec3(0))) || any(greaterThanEqual(q, ivec3(${S}, ${S}, ${H})))) return 0; return int(texelFetch(uSolid, q, 0).r * 255.0 + 0.5); }
float groundAt(vec2 p){
  vec2 g = p - vec2(uSolid0.xy); if (g.x < 0.0 || g.y < 0.0 || g.x >= ${S}.0 || g.y >= ${S}.0) return -1e9;
  return texture(uGround, (g + 0.5) / ${S + 1}.0).r + float(uSolid0.z); // one filtered fetch: heights are kept relative to the field
}
// How far along the ray the first blocker is (-1: nothing in the way). Reflections use it to know what they mirror.
float rayHit(vec3 o, vec3 d, float len, int steps, bool sprites, int self){
  if (uFrameN > 0 && frameBlocks(o, d, len)) return 0.0; // a moving frame (an airship) in the way
  ivec3 cell = ivec3(floor(o)); vec3 st = sign(d); vec3 ad = max(abs(d), vec3(1e-5));
  vec3 tMax = (st * (vec3(cell) + 0.5 - o) + 0.5) / ad; vec3 tDelta = 1.0 / ad; float t = 0.0; vec3 e = o + d * len;
  bool newCol = true;
  for (int i = 0; i < steps; i++){
    if (t >= len) return -1.0;
    ivec3 q = cell - uSolid0;
    if (q.x < 0 || q.y < 0 || q.x >= ${S} || q.y >= ${S} || (q.z >= ${H} && d.z >= 0.0)) return -1.0; // left the field: the far land takes over
    float tn = min(min(tMax.x, tMax.y), tMax.z);
    vec3 m = o + d * min((t + tn) * 0.5, len);
    if (t > 0.5 && m.z < groundAt(m.xy) - 0.3) return t; // the drawn land is a mesh over the same heights: allow it a little slack
    int sh = solidShape(cell);
    if (sh == 255){ if (i > 0) return t; } // a whole block; the first cell is the one the surface lies on
    else if (sh > 0 && shapeBlocks(sh, o - vec3(cell), d, min(tn, len))) return t;
    if (sprites && newCol){ float za = o.z + d.z * t, zb = o.z + d.z * min(tn, len); if (castersAt(cell.xy, o, d, len, e, self, min(za, zb), max(za, zb))) return t; }
    newCol = tMax.z != tn;
    if (tMax.x == tn){ cell.x += int(st.x); tMax.x += tDelta.x; } else if (tMax.y == tn){ cell.y += int(st.y); tMax.y += tDelta.y; } else { cell.z += int(st.z); tMax.z += tDelta.z; }
    t = tn;
  }
  return -1.0;
}
float shadowRay(vec3 o, vec3 d, float len, int steps, bool sprites, int self){ return rayHit(o, d, len, steps, sprites, self) < 0.0 ? 1.0 : 0.0; }`;

export class GpuSolid {
  private readonly solid: WebGLTexture;
  private readonly ground: WebGLTexture;
  private readonly shapes: [WebGLTexture, WebGLTexture];
  private readonly cells = new Uint8Array(S * S * H);
  private readonly heights = new Float32Array((S + 1) * (S + 1));
  private ox = NaN;
  private oy = NaN;
  private oz = NaN;
  private version = -1;
  private frame = 0;
  private readonly frames: GpuFrameShade;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.frames = new GpuFrameShade(gl);
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
    this.shapes = makeShapeTextures(gl);
  }

  update(eye: { x: number; y: number; z: number }, tiles: ReadonlyTiles, vol: ReadonlyVolume, frames: readonly VolumeFrame[] = []): void {
    this.frames.update(eye, vol, frames);
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
        const byte = b.shape[c] ?? 0;
        // A split cell shades like a block when at least half of it is filled.
        cells[(z * S + j) * S + i] = (byte & 63) === SHAPE_CUBE || ((byte & 63) === SHAPE_FINE && fineFill(vol, i + ox, j + oy, z + oz) >= 4) ? 255 : (byte & 63) === SHAPE_FINE ? 0 : byte;
      }
    }
  }

  /** Binds the moving frames' cells (FRAME_SHADER, part of SOLID_UNIFORMS) on one more texture unit. */
  bindFrames(p: WebGLProgram, unit: number): void {
    this.frames.bind(p, unit);
  }

  /** Corner of the field (whole metres). */
  get origin(): { x: number; y: number } {
    return { x: this.ox, y: this.oy };
  }

  /** Binds the field and the shape table on four texture units for a program that includes SOLID_UNIFORMS. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, this.solid);
    gl.uniform1i(loc(gl, p, 'uSolid'), unit);
    gl.activeTexture(gl.TEXTURE0 + unit + 1);
    gl.bindTexture(gl.TEXTURE_2D, this.ground);
    gl.uniform1i(loc(gl, p, 'uGround'), unit + 1);
    this.shapes.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + unit + 2 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, i === 0 ? 'uPieces' : 'uShapeIdx'), unit + 2 + i);
    });
    gl.uniform3i(loc(gl, p, 'uSolid0'), this.ox, this.oy, this.oz);
  }
}

/** How many of a split cell's eight fine cells hold anything. */
function fineFill(vol: ReadonlyVolume, x: number, y: number, z: number): number {
  let n = 0;
  for (let o = 0; o < 8; o++) if (vol.fineAt(x * 2 + (o & 1), y * 2 + ((o >> 1) & 1), z * 2 + (o >> 2)) !== 0) n++;
  return n;
}
