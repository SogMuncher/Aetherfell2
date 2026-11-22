/**
 * Per-pixel ray-traced light. Solid passes write what each pixel's primary ray hit (albedo, normal, share of sun;
 * `SURFACE_OUT`). One full-screen pass then rebuilds the hit point from the depth, takes the nearest `count` lights
 * (setting) whose own radius reaches it, fires a shadow ray to each through the solid field (`gpuSolid.ts`), and one
 * toward the sun/moon, and adds the light to the pixel. Fixed cost per pixel. Lights are `LightMap.lights` (shared data).
 */
import type { PointLight } from '../lighting';
import type { Env } from '../lighting';
import type { CamBasis } from './glUtil';
import { compile, loc, makeTexture } from './glUtil';
import { SOLID_SHADER } from './gpuSolid';
import type { GpuSolid } from './gpuSolid';

/** All numbers live here: lights are sorted into `bin`-metre squares over `span` metres, at most `perBin` each; sun shadows reach `sunReach` m. */
export const GPU_LIGHT = { bin: 4, span: 96, perBin: 16, maxPerPixel: 8, sunReach: 44, steps: 40, sunSteps: 72 } as const;
const BINS = GPU_LIGHT.span / GPU_LIGHT.bin;
const K = GPU_LIGHT.perBin;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uniform sampler2D uAlb, uNrm, uDepth, uLights;
uniform vec3 uEye, uFwd, uRight, uUp, uSunDir; uniform vec2 uTan, uSize, uBin0; uniform float uNear, uFar, uFogDist; uniform int uCount;
${SOLID_SHADER}
out vec4 o;
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 al = texelFetch(uAlb, px, 0);
  if (al.a < 0.25) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec4 nr = texelFetch(uNrm, px, 0); vec3 n = normalize(nr.xyz * 2.0 - 1.0); bool sprite = al.a < 0.75;
  vec2 nd = gl_FragCoord.xy / uSize * 2.0 - 1.0; vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y;
  float zn = texelFetch(uDepth, px, 0).r * 2.0 - 1.0; float zv = 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
  vec3 p = uEye + r * zv; float dist = length(p - uEye);
  float keep = 1.0 - min(0.97, 1.0 - exp(-dist / uFogDist)); // the pass's own fog hides light the same way
  vec3 from = p + (sprite ? -normalize(r) * 0.2 : n * 0.08);
  // The nearest lights whose radius reaches this point, from its square's short list.
  ivec2 b = ivec2(floor((p.xy - uBin0) / ${GPU_LIGHT.bin.toFixed(1)}));
  int idx[${GPU_LIGHT.maxPerPixel}]; float dd[${GPU_LIGHT.maxPerPixel}]; int got = 0; int row = 0;
  if (b.x >= 0 && b.y >= 0 && b.x < ${BINS} && b.y < ${BINS}) {
    row = b.y * ${BINS} + b.x;
    for (int k = 0; k < ${K}; k++){
      vec4 L = texelFetch(uLights, ivec2(k * 2, row), 0);
      if (L.w <= 0.0) break;
      float d = length(L.xyz - p); if (d >= L.w) continue;
      int at = got;
      if (got < uCount) got++; else { if (d >= dd[uCount - 1]) continue; at = uCount - 1; }
      while (at > 0 && dd[at - 1] > d){ idx[at] = idx[at - 1]; dd[at] = dd[at - 1]; at--; }
      idx[at] = k; dd[at] = d;
    }
  }
  vec3 lit = vec3(0.0);
  for (int i = 0; i < got; i++){
    vec4 L = texelFetch(uLights, ivec2(idx[i] * 2, row), 0); vec3 c = texelFetch(uLights, ivec2(idx[i] * 2 + 1, row), 0).rgb;
    vec3 to = L.xyz - from; float d = length(to); vec3 dir = to / max(d, 1e-4);
    float ndl = sprite ? 1.0 : max(0.0, dot(n, dir)); if (ndl <= 0.0) continue;
    float f = 1.0 - dd[i] / L.w; float k = f * f * (sprite ? 1.0 : 0.35 + 0.65 * ndl);
    if (d > 0.7) k *= shadowRay(from, dir, d - 0.6, ${GPU_LIGHT.steps});
    lit += c * k;
  }
  // The sun or moon: its light on this pixel is taken away where something stands between them, near the eye.
  float a = 1.0;
  float near = 1.0 - smoothstep(${(GPU_LIGHT.sunReach * 0.7).toFixed(1)}, ${GPU_LIGHT.sunReach.toFixed(1)}, length(p.xy - uEye.xy));
  if (nr.a > 0.02 && near > 0.0 && uSunDir.z > 0.0) a = 1.0 - nr.a * near * keep * (1.0 - shadowRay(from, normalize(uSunDir), ${GPU_LIGHT.sunReach.toFixed(1)}, ${GPU_LIGHT.sunSteps}));
  o = vec4(al.rgb * lit * keep, a);
}`;

export class GpuLight {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly tex: WebGLTexture;
  private readonly data = new Float32Array(K * 2 * BINS * BINS * 4);
  private readonly dist = new Float32Array(K * BINS * BINS);
  private readonly used = new Uint8Array(BINS * BINS);
  private ox = 0;
  private oy = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.tex = makeTexture(gl, gl.RGBA32F, K * 2, BINS * BINS, gl.RGBA, gl.FLOAT);
  }

  /** Sorts the frame's lights into squares around the eye: each square keeps the `perBin` lights nearest its middle that reach it. */
  upload(lights: readonly PointLight[], eyeX: number, eyeY: number): void {
    const B = GPU_LIGHT.bin;
    this.ox = Math.floor(eyeX / B) * B - GPU_LIGHT.span / 2;
    this.oy = Math.floor(eyeY / B) * B - GPU_LIGHT.span / 2;
    const { data, dist, used } = this;
    data.fill(0);
    used.fill(0);
    for (const l of lights) {
      if (l.radius <= 0 || l.r + l.g + l.b <= 0.01) continue;
      const i0 = Math.max(0, Math.floor((l.x - l.radius - this.ox) / B));
      const i1 = Math.min(BINS - 1, Math.floor((l.x + l.radius - this.ox) / B));
      const j0 = Math.max(0, Math.floor((l.y - l.radius - this.oy) / B));
      const j1 = Math.min(BINS - 1, Math.floor((l.y + l.radius - this.oy) / B));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const dx = l.x - (this.ox + (i + 0.5) * B);
          const dy = l.y - (this.oy + (j + 0.5) * B);
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > l.radius + B * 0.71) continue;
          const row = j * BINS + i;
          let n = used[row] ?? 0;
          if (n >= K && d >= (dist[row * K + K - 1] ?? 0)) continue;
          if (n < K) used[row] = n + 1;
          else n = K - 1;
          // Insertion keeps each square's list nearest first.
          while (n > 0 && (dist[row * K + n - 1] ?? 0) > d) {
            dist[row * K + n] = dist[row * K + n - 1] ?? 0;
            data.copyWithin((row * K * 2 + n * 2) * 4, (row * K * 2 + (n - 1) * 2) * 4, (row * K * 2 + n * 2) * 4);
            n--;
          }
          dist[row * K + n] = d;
          data.set([l.x, l.y, l.z, l.radius, l.r, l.g, l.b, 0], (row * K * 2 + n * 2) * 4);
        }
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, K * 2, BINS * BINS, gl.RGBA, gl.FLOAT, data);
  }

  /** Adds the light to the scene colour (and dims sun where it is blocked). Draw into a target without depth. */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, count: number, alb: WebGLTexture, nrm: WebGLTexture, depth: WebGLTexture, solid: GpuSolid, w: number, h: number, near: number, far: number): void {
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.SRC_ALPHA);
    const texs: [string, WebGLTexture][] = [['uAlb', alb], ['uNrm', nrm], ['uDepth', depth], ['uLights', this.tex]];
    texs.forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, name), i);
    });
    solid.bind(p, texs.length);
    const v3 = (n: string, v: readonly number[]): void => gl.uniform3f(loc(gl, p, n), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    v3('uFwd', cam.fwd);
    v3('uRight', cam.right);
    v3('uUp', cam.up);
    v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uSunDir', [env.lx, env.ly, env.lz]);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2f(loc(gl, p, 'uBin0'), this.ox, this.oy);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.uniform1i(loc(gl, p, 'uCount'), Math.max(1, Math.min(GPU_LIGHT.maxPerPixel, count)));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
  }
}
