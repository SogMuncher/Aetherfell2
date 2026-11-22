/**
 * GPU terrain: a clipmap of nested grids around the eye, one per LOD level (cell 1 m .. 128 m), fed from the same
 * `TerrainLod` blocks the CPU renderer reads (so burns, soot, frozen lakes and far colours all carry over).
 * Heights and colours live in textures; the vertex shader displaces a fixed grid. Each level hides the part the
 * finer one already covers. Fog is depth based. Read-only on the sim.
 */
import { compile, loc, makeTexture, makeTextureArray } from './glUtil';
import { bindStateLooks, STATE_LAYERS, STATE_SHADER } from './gpuStates';
import type { Env } from '../lighting';
import { BLOCK, LEVEL_CELL, TerrainLod } from '../raycaster/terrainLod';
import { CHUNK_SIZE } from '../../types';
import type { ReadonlyTiles } from '../../types';
import { refreshGroundState } from './gpuTerrainState';
import { CANOPY_FULL, FLORA_FADE } from '../raycaster/tileBillboards';
import { GPU_STRUCT } from './gpuStructures';
import { SURFACE_OUT, SURFACE_SHADER } from './gpuSurfaces';

/** All numbers live here. */
export const GPU_TERRAIN = { cells: 128, snapCells: 16, levels: LEVEL_CELL.length, refillEvery: 45, recolourEvery: 15, texLevels: 2, texFade: [30, 90], sink: 0.03, grit: 0.09 } as const;
const N = GPU_TERRAIN.cells;
const V = N + 1;

const VS = `#version 300 es
uniform mat4 uVP; uniform sampler2D uH; uniform sampler2D uC; uniform vec3 uEye; uniform vec2 uCanopy; uniform vec2 uLift; uniform vec2 uOrigin; uniform float uCell; uniform float uSink;
out vec3 vPos; out vec3 vCol; flat out float vA;
void main(){
  int i = gl_VertexID % ${V}; int j = gl_VertexID / ${V};
  vec3 hc = texelFetch(uH, ivec2(i, j), 0).rgb;
  vec2 xy = uOrigin + vec2(i, j) * uCell;
  // Treetops rise in with distance while the tree pictures fade out, so forests never pop.
  float dd = length(xy - uEye.xy);
  // Building and wall blocks rise exactly where the real structures dissolve (gpuStructures fade).
  float h = hc.r + hc.g * smoothstep(uCanopy.x, uCanopy.y, dd) + hc.b * smoothstep(uLift.x, uLift.y, dd) - uSink;
  vec3 p = vec3(xy, h);
  vec4 cc = texelFetch(uC, ivec2(i, j), 0); vCol = cc.rgb; vA = cc.a; // alpha (water, fire glow) is per triangle: it must never blend, or water edges glow like fire
  vPos = p; gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float; precision highp usampler2D;
${SURFACE_SHADER}
${SURFACE_OUT}
${STATE_SHADER}
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogDist;
uniform vec4 uHole; uniform float uGrit; uniform usampler2D uCode; uniform vec2 uOrigin; uniform float uCell; uniform float uTexOn; uniform vec2 uTexFade;
uniform float uRainWet; uniform vec3 uHorizon; uniform float uDay, uTime;
in vec3 vPos; in vec3 vCol; flat in float vA; layout(location = 0) out vec4 o;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  if (vPos.x > uHole.x && vPos.x < uHole.z && vPos.y > uHole.y && vPos.y < uHole.w) discard;
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); if (n.z < 0.0) n = -n;
  float d = length(vPos - uEye);
  vec3 base = vCol;
  if (uTexOn > 0.5) {
    uint code = texelFetch(uCode, ivec2(floor((vPos.xy - uOrigin) / uCell)), 0).r;
    if (code != 255u) base = mix(surf(int(code), false, vPos.xy * 16.0), base, smoothstep(uTexFade.x, uTexFade.y, d));
  }
  // Grit: per-metre speckle that fades with distance (the near ground never looks flat).
  base *= 1.0 + (hash(floor(vPos.xy)) - 0.5) * uGrit * 2.0 * (1.0 - smoothstep(20.0, 120.0, d));
  // Lit later, per pixel, by the one light pass (gpuLight.ts): here only what it is, what glows, and the fog.
  vec3 glow = vec3(0.0);
  if (uTexOn > 0.5 && vA <= 0.99) base = blendStates(base, ivec2(floor((vPos.xy - uOrigin) / uCell)), vPos.xy * 16.0, uRainWet, 0.7 + 0.3 * sin(uTime * 20.0 + vPos.x * 3.0), glow);
  vec3 emit = base * glow;
  if (vA > 0.99) {
    float glint = d < 900.0 && h2(floor(vPos.xy * 0.5 + vec2(floor(uTime * 2.0), 0.0))) > 0.992 ? (1.4 * uDay + 0.3) * 0.31 : 0.0;
    base = base * 0.75 + uHorizon * 0.25 + glint; // as Classic: a quarter sky, lit like the ground
  } else if (vA > 0.0) emit += vec3(0.9, 0.38, 0.09) * vA * 2.0 * (0.75 + 0.25 * sin(uTime * 9.0 + vPos.x * 0.7 + vPos.y * 0.3));
  surfaceOut(base, n, 1.0);
  float f = min(0.97, 1.0 - exp(-d / uFogDist));
  o = vec4(emit * (1.0 - f) + uFog * f, 1.0);
}`;

interface Level {
  cs: number;
  ox: number;
  oy: number;
  hTex: WebGLTexture;
  cTex: WebGLTexture;
  h: Float32Array;
  c: Uint8Array;
  code: Uint8Array;
  codeTex: WebGLTexture;
  st: Uint8Array;
  stDirty: boolean;
  stTex: WebGLTexture;
  frame: number;
  coarse: boolean;
  valid: boolean;
  /** A tile kind changed under this level: its far colours (the base the detail fades into) need refilling from the LOD. */
  recolour: boolean;
}

export class GpuTerrain {
  private readonly prog: WebGLProgram;
  private readonly indexCount: number;
  private readonly vao: WebGLVertexArrayObject;
  private readonly levels: Level[] = [];
  private frame = 0;
  private paintedSeen = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly lod: TerrainLod, private readonly tiles: ReadonlyTiles, private readonly surf: WebGLTexture) {
    this.prog = compile(gl, VS, FS);
    const idx = new Uint32Array(N * N * 6);
    let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * V + i;
      idx.set([a, a + 1, a + V, a + 1, a + V + 1, a + V], k);
      k += 6;
    }
    this.indexCount = idx.length;
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    gl.bindVertexArray(this.vao);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    for (let L = 0; L < GPU_TERRAIN.levels; L++) {
      this.levels.push({
        cs: LEVEL_CELL[L] ?? 1, ox: NaN, oy: NaN, frame: 0, coarse: true, valid: false, recolour: false,
        hTex: makeTexture(gl, gl.RGB32F, V, V, gl.RGB, gl.FLOAT),
        cTex: makeTexture(gl, gl.RGBA8, V, V, gl.RGBA, gl.UNSIGNED_BYTE),
        h: new Float32Array(V * V * 3), c: new Uint8Array(V * V * 4), code: new Uint8Array(V * V).fill(255), st: new Uint8Array(V * V * 4 * STATE_LAYERS), stDirty: true,
        stTex: makeTextureArray(gl, gl.RGBA8, V, V, STATE_LAYERS, gl.RGBA, gl.UNSIGNED_BYTE),
        codeTex: makeTexture(gl, gl.R8UI, V, V, gl.RED_INTEGER, gl.UNSIGNED_BYTE),
      });
    }
  }

  /** Tile code at a point if its chunk is loaded (live tiles carry the real material), else 255 (colour only). */
  private tileCode(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const ch = this.tiles.peekChunk(Math.floor(tx / CHUNK_SIZE), Math.floor(ty / CHUNK_SIZE));
    return ch ? (ch.kind[(ty - ch.cy * CHUNK_SIZE) * CHUNK_SIZE + (tx - ch.cx * CHUNK_SIZE)] ?? 255) : 255;
  }

  /** A level's heights (r ground, g canopy x0.1, b buildings x0.1) for passes that walk the land (sun shadows far away). */
  heights(L: number): { tex: WebGLTexture; ox: number; oy: number; cs: number } | null {
    const l = this.levels[L];
    return l && l.valid ? { tex: l.hTex, ox: l.ox, oy: l.oy, cs: l.cs } : null;
  }

  forget(): void {
    for (const l of this.levels) l.valid = false;
  }

  /** Refills at most two levels a frame, finest first (a level moves when the eye passes its snap step, or retries while it used coarse stand-ins). */
  update(ex: number, ey: number): void {
    this.frame++;
    if (this.frame % 4 === 0) for (let L = 0; L < GPU_TERRAIN.texLevels; L++) { const l = this.levels[L]; if (l && l.valid && refreshGroundState(this.gl, this.tiles, l, V)) l.recolour = true; }
    if (this.lod.painted !== this.paintedSeen) {
      this.paintedSeen = this.lod.painted;
      for (let L = 0; L < GPU_TERRAIN.texLevels; L++) { const l = this.levels[L]; if (l) l.recolour = true; }
    }
    let budget = 2;
    for (const l of this.levels) {
      const snap = GPU_TERRAIN.snapCells * l.cs;
      const ox = Math.round(ex / snap) * snap - (N / 2) * l.cs;
      const oy = Math.round(ey / snap) * snap - (N / 2) * l.cs;
      const stale = !l.valid || ox !== l.ox || oy !== l.oy || ((l.coarse || l.recolour) && this.frame - l.frame > (l.recolour ? GPU_TERRAIN.recolourEvery : GPU_TERRAIN.refillEvery));
      if (!stale || budget <= 0) continue;
      budget--;
      this.fill(l, ox, oy);
    }
  }

  private fill(l: Level, ox: number, oy: number): void {
    const gl = this.gl;
    const L = this.levels.indexOf(l);
    let coarse = false;
    const textured = L < GPU_TERRAIN.texLevels;
    for (let j = 0; j < V; j++) {
      for (let i = 0; i < V; i++) {
        const x = ox + i * l.cs;
        const y = oy + j * l.cs;
        const b = this.lod.get(L, x, y);
        if (b.level !== L) coarse = true;
        const fx = (x - b.ox) / b.cs;
        const fy = (y - b.oy) / b.cs;
        const ix = Math.max(0, Math.min(BLOCK, Math.round(fx)));
        const iy = Math.max(0, Math.min(BLOCK, Math.round(fy)));
        const k = j * V + i;
        const q = Math.min(BLOCK - 1, iy) * BLOCK + Math.min(BLOCK - 1, ix);
        // Far away, buildings and walls (lift) and treetops (canopy) stand up from the ground; near the eye real tiles and billboards do that.
        l.h[k * 3] = b.h[iy * (BLOCK + 1) + ix] ?? 0;
        l.h[k * 3 + 1] = (b.canopy[q] ?? 0) * 0.1;
        l.h[k * 3 + 2] = L >= GPU_TERRAIN.texLevels ? (b.lift[q] ?? 0) * 0.1 : 0;
        const col = b.col[q] ?? 0;
        l.c[k * 4] = col & 255;
        l.c[k * 4 + 1] = (col >>> 8) & 255;
        l.c[k * 4 + 2] = (col >>> 16) & 255;
        l.c[k * 4 + 3] = b.water[q] ? 255 : (b.glow[q] ?? 0) >> 1;
        if (textured) l.code[k] = this.tileCode(x, y);
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, l.hTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, V, V, gl.RGB, gl.FLOAT, l.h);
    gl.bindTexture(gl.TEXTURE_2D, l.cTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, V, V, gl.RGBA, gl.UNSIGNED_BYTE, l.c);
    if (textured) {
      gl.bindTexture(gl.TEXTURE_2D, l.codeTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, V, V, gl.RED_INTEGER, gl.UNSIGNED_BYTE, l.code);
    }
    l.ox = ox;
    l.oy = oy;
    l.frame = this.frame;
    l.coarse = coarse;
    l.valid = true;
    l.recolour = false;
  }

  draw(vp: Float32Array, eye: { x: number; y: number; z: number }, env: Env, time: number): void {
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uFog'), env.fog[0] / 255, env.fog[1] / 255, env.fog[2] / 255);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.uniform1f(loc(gl, p, 'uGrit'), GPU_TERRAIN.grit);
    gl.uniform1i(loc(gl, p, 'uH'), 0);
    gl.uniform1i(loc(gl, p, 'uC'), 1);
    gl.uniform1i(loc(gl, p, 'uCode'), 2);
    gl.uniform1i(loc(gl, p, 'uSurf'), 3);
    gl.uniform2f(loc(gl, p, 'uTexFade'), GPU_TERRAIN.texFade[0], GPU_TERRAIN.texFade[1]);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.surf);
    gl.uniform3f(loc(gl, p, 'uHorizon'), env.horizon[0] / 255, env.horizon[1] / 255, env.horizon[2] / 255);
    gl.uniform2f(loc(gl, p, 'uCanopy'), FLORA_FADE, CANOPY_FULL);
    gl.uniform2f(loc(gl, p, 'uLift'), GPU_STRUCT.range - GPU_STRUCT.fade, GPU_STRUCT.range);
    gl.uniform1f(loc(gl, p, 'uDay'), env.day);
    bindStateLooks(gl, p, 6);
    gl.uniform1f(loc(gl, p, 'uRainWet'), env.rain > 0 ? 0.5 : 0);
    gl.uniform1f(loc(gl, p, 'uTime'), time);
    for (let L = 0; L < this.levels.length; L++) {
      const l = this.levels[L];
      if (!l || !l.valid) continue;
      const inner = this.levels[L - 1];
      if (inner && inner.valid) {
        const m = 2 * inner.cs;
        gl.uniform4f(loc(gl, p, 'uHole'), inner.ox + m, inner.oy + m, inner.ox + N * inner.cs - m, inner.oy + N * inner.cs - m);
      } else gl.uniform4f(loc(gl, p, 'uHole'), 0, 0, 0, 0);
      gl.uniform2f(loc(gl, p, 'uOrigin'), l.ox, l.oy);
      gl.uniform1f(loc(gl, p, 'uCell'), l.cs);
      // Coarser levels sit a little lower so they never fight the finer ones where they overlap.
      gl.uniform1f(loc(gl, p, 'uSink'), GPU_TERRAIN.sink * l.cs);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, l.hTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, l.cTex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, l.codeTex);
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, l.stTex);
      gl.uniform1f(loc(gl, p, 'uTexOn'), L < GPU_TERRAIN.texLevels ? 1 : 0);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
}
