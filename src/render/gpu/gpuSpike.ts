/**
 * GPU spike (setting 'gpuSpike'): proves one WebGL2 pass with a SHARED DEPTH BUFFER. A height-field mesh,
 * depth-tested billboard sprites and depth fog all land in one low-res target drawn over the CPU canvas.
 * Throwaway scaffold for docs/GPU-RENDER.md stage 1; the real port replaces it. Read-only on the sim.
 */
import type { Env } from '../lighting';
import type { ReadonlyTiles } from '../../types';

/** All spike numbers live here. */
export const GPU_SPIKE = { grid: 129, cell: 2, snap: 8, near: 0.3, far: 6000, spriteDistances: [14, 30, 60, 120, 240], spriteAngles: 10, spriteSize: 6 } as const;

const TERRAIN_VS = `#version 300 es
uniform mat4 uVP; uniform sampler2D uHeight; uniform vec2 uOrigin; uniform float uCell; uniform int uN;
out float vH; out vec3 vPos;
void main(){
  int i = gl_VertexID % uN; int j = gl_VertexID / uN;
  float h = texelFetch(uHeight, ivec2(i, j), 0).r;
  vec3 p = vec3(uOrigin + vec2(i, j) * uCell, h);
  vH = h; vPos = p; gl_Position = uVP * vec4(p, 1.0);
}`;
const TERRAIN_FS = `#version 300 es
precision highp float; uniform vec3 uEye; uniform vec3 uFog; uniform float uFogDist;
in float vH; in vec3 vPos; out vec4 o;
void main(){
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); if (n.z < 0.0) n = -n;
  float lit = 0.45 + 0.55 * max(0.0, n.z * 0.8 + n.x * 0.3);
  vec3 c = mix(vec3(0.30,0.52,0.22), vec3(0.55,0.5,0.42), smoothstep(30.0, 90.0, vH)) * lit;
  float f = 1.0 - exp(-length(vPos - uEye) / uFogDist);
  o = vec4(mix(c, uFog, f), 1.0);
}`;
const SPRITE_VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uBase; uniform vec3 uRight; uniform float uSize;
out vec2 vUv; out vec3 vPos;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 p = uBase + uRight * (q.x - 0.5) * uSize + vec3(0.0, 0.0, q.y * uSize);
  vUv = q; vPos = p; gl_Position = uVP * vec4(p, 1.0);
}`;
const SPRITE_FS = `#version 300 es
precision highp float; uniform sampler2D uTex; uniform vec3 uEye; uniform vec3 uFog; uniform float uFogDist;
in vec2 vUv; in vec3 vPos; out vec4 o;
void main(){
  vec4 t = texture(uTex, vUv); if (t.a < 0.5) discard;
  float f = 1.0 - exp(-length(vPos - uEye) / uFogDist);
  o = vec4(mix(t.rgb, uFog, f), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type);
    if (!prog || !s) throw new Error('gl object');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(prog, s);
  }
  if (!prog) throw new Error('gl program');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  return prog;
}

export class GpuSpike {
  private readonly gl: WebGL2RenderingContext;
  private readonly canvas = document.createElement('canvas');
  private readonly terrain: WebGLProgram;
  private readonly sprite: WebGLProgram;
  private readonly heightTex: WebGLTexture;
  private readonly spriteTex: WebGLTexture;
  private readonly indexCount: number;
  private readonly heights = new Float32Array(GPU_SPIKE.grid * GPU_SPIKE.grid);
  private cx = 0;
  private cy = 0;
  private ox = NaN;
  private oy = NaN;
  private anchors: { x: number; y: number }[] | null = null;

  constructor(private readonly host: HTMLCanvasElement) {
    this.canvas.style.cssText = 'position:absolute;image-rendering:pixelated;image-rendering:crisp-edges;pointer-events:none';
    host.insertAdjacentElement('afterend', this.canvas);
    const gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;
    this.terrain = compile(gl, TERRAIN_VS, TERRAIN_FS);
    this.sprite = compile(gl, SPRITE_VS, SPRITE_FS);
    const n = GPU_SPIKE.grid;
    const idx = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      idx.set([a, a + 1, a + n, a + 1, a + n + 1, a + n], k);
      k += 6;
    }
    this.indexCount = idx.length;
    const ib = gl.createBuffer();
    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.heightTex = this.texture(gl.R32F, n, n, null, gl.RED, gl.FLOAT);
    // A procedural stand-in sprite (a standing stone): same idea as the real atlas, generated at runtime.
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#8a8478'; g.fillRect(4, 1, 8, 15);
      g.fillStyle = '#b8b09c'; g.fillRect(4, 1, 3, 15);
      g.fillStyle = '#5c574d'; g.fillRect(10, 1, 2, 15);
    }
    this.spriteTex = this.texture(gl.RGBA8, 16, 16, c, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  private texture(internal: number, w: number, h: number, src: HTMLCanvasElement | null, fmt: number, type: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('gl texture');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
    return t;
  }

  /** Same size as the CPU canvas so the existing pixel-size setting drives it. */
  private fit(): void {
    const { width, height, style } = this.host;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.canvas.style.width = style.width;
    this.canvas.style.height = style.height;
    this.canvas.style.left = `${this.host.offsetLeft}px`;
    this.canvas.style.top = `${this.host.offsetTop}px`;
  }

  draw(tiles: ReadonlyTiles, env: Env, eye: { x: number; y: number; z: number }, yaw: number, pitch: number, fovDeg: number): void {
    const gl = this.gl;
    const S = GPU_SPIKE;
    this.fit();
    const ox = Math.round(eye.x / S.snap) * S.snap - (S.grid >> 1) * S.cell;
    const oy = Math.round(eye.y / S.snap) * S.snap - (S.grid >> 1) * S.cell;
    gl.bindTexture(gl.TEXTURE_2D, this.heightTex);
    if (ox !== this.ox || oy !== this.oy) {
      this.ox = ox; this.oy = oy;
      for (let j = 0; j < S.grid; j++) for (let i = 0; i < S.grid; i++) this.heights[j * S.grid + i] = tiles.ground(ox + i * S.cell, oy + j * S.cell);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, S.grid, S.grid, gl.RED, gl.FLOAT, this.heights);
    }
    if (!this.anchors || Math.hypot(eye.x - this.cx, eye.y - this.cy) > 40) {
      this.cx = eye.x;
      this.cy = eye.y;
      this.anchors = S.spriteDistances.flatMap((d, r) =>
        Array.from({ length: S.spriteAngles }, (_, i) => {
          const a = ((i + r * 0.5) / S.spriteAngles) * Math.PI * 2;
          return { x: eye.x + Math.cos(a) * d, y: eye.y + Math.sin(a) * d };
        }),
      );
    }
    const vp = viewProj(eye, yaw, pitch, (fovDeg * Math.PI) / 180, this.canvas.width / this.canvas.height);
    const fog = env.fog.map((v) => v / 255);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(env.horizon[0] / 255, env.horizon[1] / 255, env.horizon[2] / 255, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.common(this.terrain, vp, eye, fog, env.fogDist);
    gl.uniform1i(gl.getUniformLocation(this.terrain, 'uHeight'), 0);
    gl.uniform2f(gl.getUniformLocation(this.terrain, 'uOrigin'), ox, oy);
    gl.uniform1f(gl.getUniformLocation(this.terrain, 'uCell'), S.cell);
    gl.uniform1i(gl.getUniformLocation(this.terrain, 'uN'), S.grid);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    this.common(this.sprite, vp, eye, fog, env.fogDist);
    gl.bindTexture(gl.TEXTURE_2D, this.spriteTex);
    gl.uniform1i(gl.getUniformLocation(this.sprite, 'uTex'), 0);
    gl.uniform3f(gl.getUniformLocation(this.sprite, 'uRight'), -Math.sin(yaw), Math.cos(yaw), 0);
    gl.uniform1f(gl.getUniformLocation(this.sprite, 'uSize'), S.spriteSize);
    for (const a of this.anchors) {
      gl.uniform3f(gl.getUniformLocation(this.sprite, 'uBase'), a.x, a.y, tiles.ground(a.x, a.y));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  private common(p: WebGLProgram, vp: Float32Array, eye: { x: number; y: number; z: number }, fog: number[], fogDist: number): void {
    const gl = this.gl;
    gl.useProgram(p);
    gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uVP'), false, vp);
    gl.uniform3f(gl.getUniformLocation(p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(gl.getUniformLocation(p, 'uFog'), fog[0] ?? 0, fog[1] ?? 0, fog[2] ?? 0);
    gl.uniform1f(gl.getUniformLocation(p, 'uFogDist'), fogDist);
  }

  dispose(): void {
    this.canvas.remove();
  }
}

/** Column-major view-projection for a z-up world: yaw about z, pitch up/down. */
function viewProj(e: { x: number; y: number; z: number }, yaw: number, pitch: number, fovY: number, aspect: number): Float32Array {
  const cp = Math.cos(pitch * 0.62 * 1.2), sp = Math.sin(pitch * 0.62 * 1.2);
  const fx = Math.cos(yaw) * cp, fy = Math.sin(yaw) * cp, fz = sp;
  const rx = -Math.sin(yaw), ry = Math.cos(yaw);
  const ux = -Math.cos(yaw) * sp, uy = -Math.sin(yaw) * sp, uz = cp;
  const f = 1 / Math.tan(fovY / 2);
  const n = GPU_SPIKE.near, fa = GPU_SPIKE.far;
  const A = (fa + n) / (n - fa), B = (2 * fa * n) / (n - fa);
  const tx = -(rx * e.x + ry * e.y), ty = -(ux * e.x + uy * e.y + uz * e.z), tz = -(fx * e.x + fy * e.y + fz * e.z);
  // rows: right, up, -forward (view), then projection
  return new Float32Array([
    (f / aspect) * rx, f * ux, A * -fx, fx, (f / aspect) * ry, f * uy, A * -fy, fy,
    0, f * uz, A * -fz, fz, (f / aspect) * tx, f * ty, -A * tz + B, tz,
  ]);
}
