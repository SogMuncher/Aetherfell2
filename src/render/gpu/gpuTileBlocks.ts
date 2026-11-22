/**
 * Tile walls on the GPU: every solid tile near the eye (walls, posts, windows, closed doors; `shape: 'block' | 'door'`) is a
 * box rising from the ground to the tile's `height`, painted from the tile's wall surface (floor surface on top), lit by the light pass and
 * the light grid, fogged, in the shared depth buffer, with its matter states (soot, frost…) blended over it. Tile data only:
 * a new wall tile needs no render code.
 */
import { CHUNK_SIZE } from '../../types';
import type { ReadonlyTiles } from '../../types';
import { TILES } from '../../content/tiles';
import type { Env } from '../lighting';
import { compile, loc, makeTextureArray } from './glUtil';
import { bindStateLooks, packStates, STATE_LAYERS, STATE_SHADER } from './gpuStates';
import { SURFACE_OUT, SURFACE_SHADER } from './gpuSurfaces';

/** All numbers live here. */
export const GPU_TILE_BLOCKS = { range: 56, rebuildEvery: 4, max: 12000, sink: 0.6 } as const;
const STRIDE = 8;
/** Block i's states sit at texel (i % ST_W, i / ST_W) of the state texture. */
const ST_W = 256;
const ST_H = Math.ceil(GPU_TILE_BLOCKS.max / ST_W);

const CORNERS = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]);
// Counter-clockwise seen from outside.
const INDICES = new Uint8Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);

const VS = `#version 300 es
uniform mat4 uVP;
in vec3 aCorner; in vec4 aBox; in vec4 aMat;
out vec3 vPos; flat out float fMat; flat out int vInst;
void main(){
  vInst = gl_InstanceID;
  vec3 p = aBox.xyz + aCorner * vec3(1.0, 1.0, aBox.w);
  vPos = p; fMat = aMat.x; gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float; precision highp int;
${SURFACE_SHADER}
${SURFACE_OUT}
${STATE_SHADER}
uniform vec3 uEye, uFog; uniform float uFogDist, uRainWet, uTime;
in vec3 vPos; flat in float fMat; flat in int vInst; layout(location = 0) out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  vec3 col; vec2 suv;
  if (abs(n.z) > 0.6) { suv = vPos.xy * 16.0; col = surf(int(fMat), false, suv); }
  else { float across = abs(n.x) > abs(n.y) ? vPos.y : vPos.x; suv = vec2(across * 16.0, -vPos.z * 10.0); col = surf(int(fMat), true, suv); }
  vec3 glow = vec3(0.0);
  col = blendStates(col, ivec2(vInst % ${ST_W}, vInst / ${ST_W}), suv, uRainWet, 0.75 + 0.25 * sin(uTime * 40.0 + vPos.x * 1.7 + vPos.y * 2.3), glow);
  surfaceOut(col, dot(n, uEye - vPos) < 0.0 ? -n : n, 1.0);
  float f = min(0.97, 1.0 - exp(-length(vPos - uEye) / uFogDist));
  o = vec4(col * glow * (1.0 - f) + uFog * f, 1.0);
}`;

export class GpuTileBlocks {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private data = new Float32Array(STRIDE * 1024);
  private count = 0;
  private readonly stTex: WebGLTexture;
  private readonly st = new Uint8Array(ST_W * ST_H * 4 * STATE_LAYERS);
  /** Some block carried a state at the last upload (so a clean list is sent once more to clear it). */
  private stAny = true;
  private frame = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly surf: WebGLTexture) {
    this.prog = compile(gl, VS, FS);
    this.stTex = makeTextureArray(gl, gl.RGBA8, ST_W, ST_H, STATE_LAYERS, gl.RGBA, gl.UNSIGNED_BYTE);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
    const aC = gl.getAttribLocation(this.prog, 'aCorner');
    gl.enableVertexAttribArray(aC);
    gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDICES, gl.STATIC_DRAW);
    this.buf = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (const [i, name] of ['aBox', 'aMat'].entries()) {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
  }

  /** Walks the loaded chunks near the eye and lists their solid tiles. */
  private rebuild(tiles: ReadonlyTiles, ex: number, ey: number): void {
    const R = GPU_TILE_BLOCKS.range;
    let n = 0;
    let any = false;
    for (const ch of tiles.loadedChunks()) {
      const x0 = ch.cx * CHUNK_SIZE;
      const y0 = ch.cy * CHUNK_SIZE;
      if (x0 + CHUNK_SIZE < ex - R || x0 > ex + R || y0 + CHUNK_SIZE < ey - R || y0 > ey + R) continue;
      for (let j = 0; j < CHUNK_SIZE; j++) {
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const k = j * CHUNK_SIZE + i;
          const code = ch.kind[k] ?? 0;
          const info = TILES[code];
          if (!info || info.height <= 0) continue;
          if (info.shape === 'block') { /* always a wall */ } else if (info.shape === 'door') { if ((ch.door[k] ?? 0) >= 128) continue; } else continue;
          const dx = x0 + i - ex;
          const dy = y0 + j - ey;
          if (dx * dx + dy * dy > R * R || n >= GPU_TILE_BLOCKS.max) continue;
          if ((n + 1) * STRIDE > this.data.length) {
            const bigger = new Float32Array(this.data.length * 2);
            bigger.set(this.data);
            this.data = bigger;
          }
          const g = tiles.ground(x0 + i + 0.5, y0 + j + 0.5);
          const sink = GPU_TILE_BLOCKS.sink;
          this.data.set([x0 + i, y0 + j, g - sink, info.height + sink, code, 0, 0, 0], n * STRIDE);
          if (packStates(ch, k, this.st, n, ST_W * ST_H)) any = true;
          n++;
        }
      }
    }
    this.count = n;
    if (!any && !this.stAny) return;
    this.stAny = any;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, ST_W, ST_H, STATE_LAYERS, gl.RGBA, gl.UNSIGNED_BYTE, this.st);
  }

  draw(vp: Float32Array, eye: { x: number; y: number; z: number }, env: Env, tiles: ReadonlyTiles, time: number): void {
    const gl = this.gl;
    if (this.frame++ % GPU_TILE_BLOCKS.rebuildEvery === 0) this.rebuild(tiles, eye.x, eye.y);
    if (this.count === 0) return;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * STRIDE), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.surf);
    gl.uniform1i(loc(gl, p, 'uSurf'), 0);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stTex);
    bindStateLooks(gl, p, 2);
    gl.uniform1f(loc(gl, p, 'uRainWet'), env.rain > 0 ? 0.5 : 0);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.enable(gl.CULL_FACE);
    // The view maps the world mirrored (x east, y south, z up), so faces wound counter-clockwise from outside show clockwise: cull FRONT, or every wall is drawn by its far face a metre too deep.
    gl.cullFace(gl.FRONT);
    gl.drawElementsInstanced(gl.TRIANGLES, INDICES.length, gl.UNSIGNED_BYTE, 0, this.count);
    gl.disable(gl.CULL_FACE);
  }
}
