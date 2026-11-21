/**
 * Tile walls on the GPU: every solid tile near the eye (walls, posts, windows, closed doors; `shape: 'block' | 'door'`) is a
 * box rising from the ground to the tile's `height`, painted from the tile's wall surface (floor surface on top), lit by sun and
 * the light grid, fogged, in the shared depth buffer. Tile data only: a new wall tile needs no render code.
 */
import { CHUNK_SIZE } from '../../types';
import type { ReadonlyTiles } from '../../types';
import { TILES } from '../../content/tiles';
import type { Env } from '../lighting';
import { compile, loc } from './glUtil';
import { LIGHT_SHADER } from './gpuLight';
import type { GpuLight } from './gpuLight';
import { SURFACE_SHADER } from './gpuSurfaces';

/** All numbers live here. */
export const GPU_TILE_BLOCKS = { range: 56, rebuildEvery: 4, max: 12000, sink: 0.6 } as const;
const STRIDE = 8;

const CORNERS = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]);
// Counter-clockwise seen from outside.
const INDICES = new Uint8Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);

const VS = `#version 300 es
uniform mat4 uVP;
in vec3 aCorner; in vec4 aBox; in vec4 aMat;
out vec3 vPos; flat out float fMat;
void main(){
  vec3 p = aBox.xyz + aCorner * vec3(1.0, 1.0, aBox.w);
  vPos = p; fMat = aMat.x; gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
${SURFACE_SHADER}
${LIGHT_SHADER}
uniform vec3 uEye, uFog, uSun, uAmb, uSunDir; uniform float uFogDist;
in vec3 vPos; flat in float fMat; out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  vec3 col;
  if (abs(n.z) > 0.6) col = surf(int(fMat), false, vPos.xy * 16.0);
  else { float across = abs(n.x) > abs(n.y) ? vPos.y : vPos.x; col = surf(int(fMat), true, vec2(across * 16.0, -vPos.z * 10.0)); }
  float lit = max(0.0, dot(n, uSunDir));
  vec3 c = col * (uAmb + uSun * lit + lightAt(vPos.xy + n.xy * 0.6));
  float f = 1.0 - exp(-length(vPos - uEye) / uFogDist);
  o = vec4(mix(c, uFog, f), 1.0);
}`;

export class GpuTileBlocks {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private data = new Float32Array(STRIDE * 1024);
  private count = 0;
  private frame = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly surf: WebGLTexture, private readonly light: GpuLight) {
    this.prog = compile(gl, VS, FS);
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
          n++;
        }
      }
    }
    this.count = n;
  }

  draw(vp: Float32Array, eye: { x: number; y: number; z: number }, env: Env, tiles: ReadonlyTiles): void {
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
    this.light.bind(p, 1);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.uniform3f(loc(gl, p, 'uSun'), env.sunR, env.sunG, env.sunB);
    gl.uniform3f(loc(gl, p, 'uAmb'), env.ambR, env.ambG, env.ambB);
    gl.uniform3f(loc(gl, p, 'uSunDir'), env.lx, env.ly, env.lz);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.drawElementsInstanced(gl.TRIANGLES, INDICES.length, gl.UNSIGNED_BYTE, 0, this.count);
    gl.disable(gl.CULL_FACE);
  }
}
