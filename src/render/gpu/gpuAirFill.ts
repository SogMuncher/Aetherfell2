// Fills the air cells on the graphics card: every sky layer into one stack of 3D cell levels, by the skyField rule.
/**
 * The levels (render/airLevels.ts) live in one texture array: level k is rows k·n .. k·n + n − 1, one array layer per
 * cell height. A level is rebuilt whole in one frame by drawing its layers, so nothing is ever half built and nothing is
 * read back. The shader is content/skyField.ts `airColumn` in GLSL: the same layer patterns (uploaded once), the same
 * cloud edge per layer (`layerEdge`, set each frame from the weather), the land's moisture and open water close by
 * (render/airGrids.ts, read from the same cached cells), so the sky drawn matches the rain and the in-cloud fog. Each
 * cell keeps density, brightness and how much of it casts a shadow (by each layer's `shadow`).
 */
import { CONTENT, MOIST_CELL, MOIST_SHIFT, cloudPattern, layerCover, layerEdge, moistCell, waterCell } from '../../content';
import type { WeatherState } from '../../types';
import { AirLevels } from '../airLevels';
import { WrapGrid } from '../airGrids';
import { compile, loc } from './glUtil';

/** Cells of the coarse moisture grid along a side (600 m each: wider than the cloud range). */
const MOIST_N = 160;
/** A flat sheet is kept as a slab this tall (skyField's FLAT). */
const FLAT = 30;

/** GLSL for a drawer of the air: `airAt(p, k, c)` = the cell holding p (drifting frame) at level k, or at the first coarser
 * level that holds it (density, brightness, shadow share; zero outside them all); `c` = that cell's size. Uniforms set by `bind`. */
export const airLookup = (nl: number, n: number, tall: number): string => `
uniform highp sampler2DArray uAir; uniform vec4 uW[${nl}]; uniform float uCell, uCapZ;
vec4 airAt(vec3 p, int k, out vec3 c){
  for (; k < ${nl}; k++){
    float w = uCell * exp2(float(k)); c = vec3(w, w, min(w, uCapZ));
    vec4 W = uW[k]; if (W.w < 0.5) continue;
    ivec3 r = ivec3(floor(p / c)) - ivec3(W.xyz);
    if (r.x < 0 || r.y < 0 || r.z < 0 || r.x >= ${n} || r.y >= ${n} || r.z >= ${tall}) continue;
    return texelFetch(uAir, ivec3(r.x, k * ${n} + r.y, r.z), 0);
  }
  float w = uCell * exp2(float(${nl - 1})); c = vec3(w, w, min(w, uCapZ)); return vec4(0.0, 1.0, 0.0, 0.0);
}`;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (nl: number): string => `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform sampler2DArray uPat; uniform sampler2D uMoist, uWater;
uniform vec4 uA[${nl}], uB[${nl}], uC[${nl}], uD[${nl}];
uniform vec3 uWin; uniform vec2 uCellSz, uDrift, uEye, uGrid; uniform float uZ, uRow, uWaterSpan;
out vec4 o;
float pat(float u, float v, int l){ return texture(uPat, vec3((u + 0.5) / 256.0, (v + 0.5) / 256.0, float(l))).r; }
float mixed(float u, float v, int l){ return pat(u, v, l) * 0.62 + pat(u * 0.577 + 17.3, v * 0.577 + 5.1, l) * 0.38; }
float colDens(int l, float t, vec2 pd){
  vec4 A = uA[l]; float k = (mixed(pd.x / (A.z * A.w) * 64.0, pd.y / A.z * 64.0, l) - t) / uB[l].x;
  return k <= 0.0 ? 0.0 : k >= 1.0 ? 1.0 : k * k * (3.0 - 2.0 * k);
}
// Heaps with flat bases, lumpy sides and tops that lean a little with height.
float shape(int l, float t, vec2 pd, float hf){
  vec4 A = uA[l]; vec4 B = uB[l];
  float d = colDens(l, t, pd + vec2(hf * A.z * 0.05, 0.0)); if (d <= 0.0) return 0.0;
  float bump = (pat(pd.x / (A.z * A.w) * 172.8 + hf * 31.0, pd.y / A.z * 172.8 - hf * 17.0, l) - 0.5) * B.z;
  float e = (1.0 - B.y + B.y * d - hf) / 0.22 + bump; if (e <= 0.0) return 0.0;
  return min(1.0, d * 1.15) * (e >= 1.0 ? 1.0 : e * e * (3.0 - 2.0 * e)) * min(1.0, hf / 0.05);
}
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec3 g = uWin + vec3(float(px.x), float(px.y) - uRow, uZ);
  float cell = uCellSz.x, cz = uCellSz.y; float z0 = g.z * cz, z1 = z0 + cz;
  vec2 c = (g.xy + 0.5) * cell;
  float dens = 0.0, lite = 0.0, shad = 0.0;
  for (int l = 0; l < ${nl}; l++){
    vec4 A = uA[l]; vec4 B = uB[l]; vec4 C = uC[l]; vec4 D = uD[l];
    float lo = A.x, hi = A.x + A.y;
    if (C.x > 1e8 || hi <= z0 || lo >= z1) continue;
    float a = max(lo, z0), b = min(hi, z1); float hf = ((a + b) * 0.5 - lo) / A.y; float share = (b - a) / cz;
    // A cell wider than a quarter of the shapes averages 2 x 2 spots, so far clouds thin out instead of flickering.
    int sub = cell * 4.0 > A.z ? 2 : 1; float fsub = float(sub);
    for (int sy = 0; sy < sub; sy++) for (int sx = 0; sx < sub; sx++){
      vec2 pd = c + ((vec2(float(sx), float(sy)) + 0.5) / fsub - 0.5) * cell; vec2 wp = pd + uDrift;
      float wat = C.z > 0.0 ? texture(uWater, wp / uWaterSpan).r * (1.0 - smoothstep(0.35, 0.45, length(wp - uEye) / uWaterSpan)) : 0.0;
      float t = C.x - C.y * (texture(uMoist, wp / uGrid.x).r - 0.5) - C.z * wat;
      float d = (D.z > 0.5 ? colDens(l, t, pd) : shape(l, t, pd, hf)) * B.w * share / (fsub * fsub);
      dens += d; lite += d * C.w * (1.0 - D.x * (1.0 - hf)); shad += d * D.y;
    }
  }
  o = vec4(min(dens, 1.0), dens > 0.0 ? min(1.0, lite / dens) : 1.0, min(shad, 1.0), 1.0);
}`;

export class GpuAirFill {
  readonly levels = new AirLevels();
  /** RGBA8 array: density, brightness, shadow share; level k in rows k·n.., one layer per cell height. */
  readonly tex: WebGLTexture;
  /** Each level's window corner in whole cells (x, y, z) and 1 once built. */
  readonly win: Float32Array;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly pat: WebGLTexture;
  private readonly moist = new WrapGrid(MOIST_N, MOIST_CELL, moistCell);
  private readonly water = new WrapGrid(CONTENT.sky.damp.count, CONTENT.sky.damp.cell, waterCell);
  private readonly moistTex: WebGLTexture;
  private readonly waterTex: WebGLTexture;
  private readonly sent = [-1, -1];

  constructor(private readonly gl: WebGL2RenderingContext) {
    const L = this.levels;
    const nl = L.levels.length;
    const layers = CONTENT.sky.layers;
    this.prog = compile(gl, VS, fs(layers.length));
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.win = new Float32Array(nl * 4);
    this.tex = this.array(gl.RGBA8, L.n, L.n * nl, L.tall, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.NEAREST, gl.CLAMP_TO_EDGE);
    const N = 256;
    const pats = new Float32Array(N * N * layers.length);
    layers.forEach((l, i) => pats.set(cloudPattern(l), i * N * N));
    this.pat = this.array(gl.R16F, N, N, layers.length, gl.RED, gl.FLOAT, pats, gl.LINEAR, gl.REPEAT);
    this.moistTex = this.grid(MOIST_N);
    this.waterTex = this.grid(CONTENT.sky.damp.count);
  }

  private array(internal: number, w: number, h: number, d: number, fmt: number, type: number, data: ArrayBufferView | null, filter: number, wrap: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, filter);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, p, wrap);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, internal, w, h, d, 0, fmt, type, data);
    return t;
  }

  /** A wrapped (repeating), smoothly read byte grid. */
  private grid(n: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, n, n, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    return t;
  }

  /** The GLSL of `airLookup` for these levels. */
  get glsl(): string {
    return airLookup(this.levels.levels.length, this.levels.n, this.levels.tall);
  }

  /** Binds the air for a program that includes `glsl`. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    const L = this.levels;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(loc(gl, p, 'uAir'), unit);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform4fv(loc(gl, p, 'uW'), this.win);
    gl.uniform1f(loc(gl, p, 'uCell'), CONTENT.sky.air.cell);
    gl.uniform1f(loc(gl, p, 'uCapZ'), L.levels[L.levels.length - 1]?.cellZ ?? 1);
  }

  /** Fills the moisture and water grids a little, then rebuilds the levels that are due (whole, this frame). */
  update(w: WeatherState, ex: number, ey: number, ez: number, time: number): void {
    const gl = this.gl;
    this.moist.update(ex, ey, 0.6);
    this.water.update(ex, ey, 0.8);
    [this.moist, this.water].forEach((g, i) => {
      if (g.version === this.sent[i]) return;
      this.sent[i] = g.version;
      gl.bindTexture(gl.TEXTURE_2D, i ? this.waterTex : this.moistTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, g.n, g.n, gl.RED, gl.UNSIGNED_BYTE, g.data);
    });
    const due = this.levels.plan(w, ex, ey, ez, time);
    if (!due.length) return;
    const p = this.prog;
    const S = CONTENT.sky;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    const units: [number, string, number, WebGLTexture][] = [[gl.TEXTURE_2D_ARRAY, 'uPat', 4, this.pat], [gl.TEXTURE_2D, 'uMoist', 5, this.moistTex], [gl.TEXTURE_2D, 'uWater', 6, this.waterTex]];
    for (const [kind, nm, u, t] of units) {
      gl.activeTexture(gl.TEXTURE0 + u);
      gl.bindTexture(kind, t);
      gl.uniform1i(loc(gl, p, nm), u);
    }
    gl.activeTexture(gl.TEXTURE0);
    const A: number[] = [], B: number[] = [], C: number[] = [], D: number[] = [];
    for (const l of S.layers) {
      const cover = layerCover(l, w);
      const flat = (l.thickness ?? 0) <= 0;
      A.push(l.height, flat ? FLAT : l.thickness ?? 0, l.scale, l.stretch ?? 1);
      B.push(Math.max(0.01, l.softness), l.tower ?? 0, l.billow ?? 0.6, l.opacity);
      C.push(cover > 0 ? layerEdge(l, cover) : 1e9, (l.wet ?? 0) * MOIST_SHIFT, (l.water ?? 0) * S.damp.shift, (l.tint[0] + l.tint[1] + l.tint[2]) / 765);
      D.push(l.belly * (0.55 + 0.45 * w.rain), l.shadow, flat ? 1 : 0, 0);
    }
    gl.uniform4fv(loc(gl, p, 'uA'), A);
    gl.uniform4fv(loc(gl, p, 'uB'), B);
    gl.uniform4fv(loc(gl, p, 'uC'), C);
    gl.uniform4fv(loc(gl, p, 'uD'), D);
    gl.uniform2f(loc(gl, p, 'uEye'), ex, ey);
    gl.uniform2f(loc(gl, p, 'uGrid'), MOIST_N * MOIST_CELL, 0);
    gl.uniform1f(loc(gl, p, 'uWaterSpan'), S.damp.count * S.damp.cell);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const n = this.levels.n;
    for (const lv of due) {
      gl.uniform3f(loc(gl, p, 'uWin'), lv.ox, lv.oy, lv.oz);
      gl.uniform2f(loc(gl, p, 'uCellSz'), lv.cell, lv.cellZ);
      gl.uniform2f(loc(gl, p, 'uDrift'), lv.dx, lv.dy);
      gl.uniform1f(loc(gl, p, 'uRow'), lv.k * n);
      gl.viewport(0, lv.k * n, n, n);
      for (let z = 0; z < this.levels.tall; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.tex, 0, z);
        gl.uniform1f(loc(gl, p, 'uZ'), z);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      this.win.set([lv.ox, lv.oy, lv.oz, 1], lv.k * 4);
    }
    gl.enable(gl.DEPTH_TEST);
  }
}
