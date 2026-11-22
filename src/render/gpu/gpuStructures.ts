/**
 * GPU structures (stage 2): the 3D brick layer drawn in the same depth buffer as the land. Bricks near the eye are copied
 * into one atlas texture (shape + material per cell); each brick's box is rasterised and every pixel walks the cells inside it,
 * paints the hit from the material's surface textures, and writes its own depth. Shapes come from `content/shapes.ts` as textures.
 */
import type { ReadonlyVolume, VolumeBrick } from '../../types';
import { SHAPE_COUNT, SHAPE_PIECES, SHAPE_START } from '../../content/shapes';
import type { Env } from '../lighting';
import { compile, loc, makeTexture, makeTextureArray } from './glUtil';
import { bindStateLooks, packStates, STATE_LAYERS } from './gpuStates';
import type { CamBasis } from './glUtil';
import type { GpuLight } from './gpuLight';
import { GRID, PIECE_FLOATS, STRUCT_FS, STRUCT_VS } from './gpuStructShader';

/** All numbers live here. */
export const GPU_STRUCT = { range: 170, fade: 36, slots: 1024, uploadsPerFrame: 24, freshPerFrame: 64, tile: 64 } as const;
const GW = GRID.win * 2 + 1;
const ATLAS = 32 * GPU_STRUCT.tile;
const CORNERS = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]);
const INDICES = new Uint8Array([0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5]);

interface Resident {
  slot: number;
  /** Volume version this brick was last checked at. */
  version: number;
  /** What the atlas holds for it (to upload only real changes). */
  copy: Uint8Array;
  /** What the state atlas holds for it (every matter state per cell, gpuStates layout), or null while it is all zero there. */
  copyState: Uint8Array | null;
}

export class GpuStructures {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly inst: WebGLBuffer;
  private readonly atlas: WebGLTexture;
  private readonly stateAtlas: WebGLTexture;
  private readonly stateData = new Uint8Array(4096 * 4 * STATE_LAYERS);
  private readonly page: WebGLTexture;
  private readonly pieces: WebGLTexture;
  private readonly shapeIdx: WebGLTexture;
  private readonly resident = new Map<number, Resident>();
  private readonly free: number[] = [];
  private readonly pageData = new Uint16Array(GW * GW * GRID.zCount);
  private readonly tileData = new Uint8Array(4096 * 2);
  private instData = new Float32Array(12 * 64);
  private count = 0;
  /** Bricks drawn in the last frame. */
  bricks = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly surf: WebGLTexture, private readonly light: GpuLight) {
    this.prog = compile(gl, STRUCT_VS, STRUCT_FS);
    for (let i = GPU_STRUCT.slots - 1; i >= 0; i--) this.free.push(i);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    const cb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, CORNERS, gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, INDICES, gl.STATIC_DRAW);
    this.inst = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    const aC = gl.getAttribLocation(this.prog, 'aCorner');
    gl.enableVertexAttribArray(aC);
    gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    for (const [i, name] of ['aB0', 'aB1', 'aB2'].entries()) {
      const a = gl.getAttribLocation(this.prog, name);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(a, 1);
    }
    this.atlas = makeTexture(gl, gl.RG8UI, ATLAS, ATLAS, gl.RG_INTEGER, gl.UNSIGNED_BYTE);
    this.stateAtlas = makeTextureArray(gl, gl.RGBA8, ATLAS, ATLAS, STATE_LAYERS, gl.RGBA, gl.UNSIGNED_BYTE);
    this.page = makeTexture(gl, gl.R16UI, GW * GW, GRID.zCount, gl.RED_INTEGER, gl.UNSIGNED_SHORT);
    const n = SHAPE_PIECES.length / PIECE_FLOATS;
    this.pieces = makeTexture(gl, gl.R32F, PIECE_FLOATS, n, gl.RED, gl.FLOAT);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PIECE_FLOATS, n, gl.RED, gl.FLOAT, SHAPE_PIECES);
    this.shapeIdx = makeTexture(gl, gl.R32F, 256, 2, gl.RED, gl.FLOAT);
    const idx = new Float32Array(512);
    for (let i = 0; i < 256; i++) {
      idx[i] = SHAPE_START[i] ?? 0;
      idx[256 + i] = SHAPE_COUNT[i] ?? 0;
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 2, gl.RED, gl.FLOAT, idx);
  }

  forget(): void {
    this.resident.clear();
    this.free.length = 0;
    for (let i = GPU_STRUCT.slots - 1; i >= 0; i--) this.free.push(i);
  }

  /** Copies a brick's cells into its atlas tile if they differ from what is there. Returns false when nothing changed. */
  private upload(b: VolumeBrick, r: Resident): boolean {
    const gl = this.gl;
    const slot = r.slot;
    const t = this.tileData;
    for (let i = 0; i < 4096; i++) {
      const x = i & 15;
      const y = (i >> 4) & 15;
      const z = i >> 8;
      const o = (((z >> 2) * 16 + y) * 64 + (z & 3) * 16 + x) * 2;
      t[o] = b.shape[i] ?? 0;
      t[o + 1] = b.mat[i] ?? 0;
    }
    const m = b.matter;
    const ts = this.stateData;
    if (m) {
      for (let i = 0; i < 4096; i++) {
        packStates(m, i, ts, ((i >> 8 >> 2) * 16 + ((i >> 4) & 15)) * 64 + ((i >> 8) & 3) * 16 + (i & 15), 4096);
      }
    }
    const stateSame = m ? r.copyState !== null && ts.every((v, i) => v === (r.copyState?.[i] ?? 0)) : r.copyState === null;
    if (r.version >= 0 && stateSame && t.every((v, i) => v === r.copy[i])) return false;
    r.copy.set(t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (slot % 32) * 64, Math.floor(slot / 32) * 64, 64, 64, gl.RG_INTEGER, gl.UNSIGNED_BYTE, t);
    if (m || r.copyState) {
      if (m) r.copyState = (r.copyState ?? new Uint8Array(ts.length)).fill(0);
      if (m && r.copyState) r.copyState.set(ts);
      else r.copyState = null;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stateAtlas);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, (slot % 32) * 64, Math.floor(slot / 32) * 64, 0, 64, 64, STATE_LAYERS, gl.RGBA, gl.UNSIGNED_BYTE, m ? ts : new Uint8Array(ts.length));
    }
    return true;
  }

  draw(vp: Float32Array, cam: CamBasis, w: number, h: number, time: number, eye: { x: number; y: number; z: number }, env: Env, vol: ReadonlyVolume): void {
    this.bricks = 0;
    if (vol.bricks.size === 0) return;
    const gl = this.gl;
    const R2 = GPU_STRUCT.range * GPU_STRUCT.range;
    const gx0 = (Math.floor(eye.x) >> 4) - GRID.win;
    const gy0 = (Math.floor(eye.y) >> 4) - GRID.win;
    let budget = GPU_STRUCT.uploadsPerFrame;
    let fresh = GPU_STRUCT.freshPerFrame;
    this.pageData.fill(0);
    this.count = 0;
    const seen = new Set<number>();
    for (const [key, b] of vol.bricks) {
      const gx = b.bx - gx0;
      const gy = b.by - gy0;
      const gz = b.bz + GRID.zLow;
      if (gx < 0 || gx >= GW || gy < 0 || gy >= GW || gz < 0 || gz >= GRID.zCount || b.count === 0) continue;
      const bx0 = b.bx * 16 + (b.box[0] ?? 0), by0 = b.by * 16 + (b.box[1] ?? 0), bz0 = b.bz * 16 + (b.box[2] ?? 0);
      const bx1 = b.bx * 16 + (b.box[3] ?? 16), by1 = b.by * 16 + (b.box[4] ?? 16), bz1 = b.bz * 16 + (b.box[5] ?? 16);
      const nx = Math.max(bx0 - eye.x, 0, eye.x - bx1);
      const ny = Math.max(by0 - eye.y, 0, eye.y - by1);
      if (nx * nx + ny * ny > R2) continue;
      seen.add(key);
      let r = this.resident.get(key);
      if (!r) {
        const slot = this.free.pop();
        if (slot === undefined) continue;
        r = { slot, version: -1, copy: new Uint8Array(4096 * 2), copyState: null };
        this.resident.set(key, r);
      }
      // New bricks come first (their own budget); changed ones are re-checked a few a frame, so a busy world never starves new walls.
      if (r.version < 0 ? fresh > 0 : r.version !== vol.version && budget > 0) {
        if (r.version < 0) fresh--;
        else budget--;
        this.upload(b, r);
        r.version = vol.version;
      }
      if (r.version < 0) continue;
      this.pageData[(gz * GW + gy) * GW + gx] = r.slot + 1;
      if ((this.count + 1) * 12 > this.instData.length) {
        const bigger = new Float32Array(this.instData.length * 2);
        bigger.set(this.instData);
        this.instData = bigger;
      }
      this.instData.set([bx0, by0, bz0, r.slot, bx1, by1, bz1, 0, b.bx * 16, b.by * 16, b.bz * 16, 0], this.count * 12);
      this.count++;
    }
    for (const [key, r] of this.resident) {
      if (!seen.has(key)) {
        this.free.push(r.slot);
        this.resident.delete(key);
      }
    }
    this.bricks = this.count;
    if (this.count === 0) return;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, this.instData.subarray(0, this.count * 12), gl.DYNAMIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, this.page);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, GW * GW, GRID.zCount, gl.RED_INTEGER, gl.UNSIGNED_SHORT, this.pageData);
    const bind = (unit: number, tex: WebGLTexture, name: string): void => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc(gl, p, name), unit);
    };
    bind(0, this.atlas, 'uAtlas'); bind(1, this.page, 'uPage'); bind(2, this.pieces, 'uPieces'); bind(3, this.shapeIdx, 'uShapeIdx'); bind(4, this.surf, 'uSurf');
    this.light.bind(p, 5);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.stateAtlas);
    bindStateLooks(gl, p, 6);
    gl.uniform1f(loc(gl, p, 'uRainWet'), env.rain > 0 ? 0.5 : 0);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uFwd'), cam.fwd[0], cam.fwd[1], cam.fwd[2]);
    gl.uniform3f(loc(gl, p, 'uRight'), cam.right[0], cam.right[1], cam.right[2]);
    gl.uniform3f(loc(gl, p, 'uUp'), cam.up[0], cam.up[1], cam.up[2]);
    gl.uniform3f(loc(gl, p, 'uRes'), w, h, cam.tanY);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.uniform2f(loc(gl, p, 'uFade'), GPU_STRUCT.range - GPU_STRUCT.fade, GPU_STRUCT.range);
    gl.uniform3f(loc(gl, p, 'uSun'), env.sunR, env.sunG, env.sunB);
    gl.uniform3f(loc(gl, p, 'uAmb'), env.ambR, env.ambG, env.ambB);
    gl.uniform3f(loc(gl, p, 'uSunDir'), env.lx, env.ly, env.lz);
    gl.uniform2i(loc(gl, p, 'uGrid0'), gx0, gy0);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.drawElementsInstanced(gl.TRIANGLES, INDICES.length, gl.UNSIGNED_BYTE, 0, this.count);
    gl.disable(gl.CULL_FACE);
    gl.activeTexture(gl.TEXTURE0);
  }
}
