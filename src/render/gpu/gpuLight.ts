/**
 * The one light of the GPU renderer: every pixel on screen, land, walls, buildings and sprites alike, is lit here per pixel.
 * Solid passes write what each primary ray hit (`SURFACE_OUT`: albedo, normal) and only their glow + fog. This full-screen
 * pass rebuilds the hit point from the depth and adds: sky light (a short ray up and four ambient-occlusion rays), the
 * sun/moon (a shadow ray through the near solid field, sprites included, then over the land far away, and cloud shade),
 * and the nearest `count` point lights whose radius reaches it, each with a shadow ray. Fixed cost per pixel at any distance.
 * Lights are `LightMap.lights` (shared data); blockers are `gpuSolid.ts`, `gpuCasters.ts`, `gpuFarShade.ts`.
 */
import type { PointLight } from '../lighting';
import type { Env } from '../lighting';
import type { CamBasis } from './glUtil';
import { compile, loc, makeTexture } from './glUtil';
import { SOLID_SHADER, SOLID_UNIFORMS } from './gpuSolid';
import type { GpuSolid } from './gpuSolid';
import { CASTER_SHADER } from './gpuCasters';
import type { GpuCasters } from './gpuCasters';
import { FAR_SHADE_SHADER } from './gpuFarShade';
import type { GpuFarShade } from './gpuFarShade';

/**
 * All numbers live here: lights are sorted into `bin`-metre squares over `span` metres, at most `perBin` each; near sun
 * rays walk `sunSteps` cells of the solid field; `ao` rays of `aoLen` m; the sky ray `skyLen` m up; `indoor` = ambient
 * where the sky ray is blocked (x times ambient + y).
 */
export const GPU_LIGHT = { bin: 4, span: 96, perBin: 16, maxPerPixel: 8, steps: 24, sunSteps: 48, pick: 0.15, ao: 4, aoLen: 1.2, aoDark: 0.16, skyLen: 10, indoor: [0.9, 0.09] } as const;
const BINS = GPU_LIGHT.span / GPU_LIGHT.bin;
const K = GPU_LIGHT.perBin;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D; precision highp sampler3D;
uniform sampler2D uAlb, uNrm, uDepth, uLights;
uniform vec3 uEye, uFwd, uRight, uUp, uSunDir, uSun, uAmb; uniform vec2 uTan, uSize, uBin0; uniform float uNear, uFar, uFogDist; uniform int uCount;
${SOLID_UNIFORMS}
${CASTER_SHADER}
${SOLID_SHADER}
${FAR_SHADE_SHADER}
out vec4 o;
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 al = texelFetch(uAlb, px, 0);
  if (al.a < 0.25) { o = vec4(0.0); return; }
  vec4 nr = texelFetch(uNrm, px, 0); vec3 n = normalize(nr.xyz * 2.0 - 1.0); bool sprite = al.a < 0.75;
  int self = sprite ? int(nr.r * 255.0 + 0.5) + int(nr.g * 255.0 + 0.5) * 256 - 1 : -1; // which sprite this pixel is on: it never shades itself
  vec2 nd = gl_FragCoord.xy / uSize * 2.0 - 1.0; vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y;
  float zn = texelFetch(uDepth, px, 0).r * 2.0 - 1.0; float zv = 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
  vec3 p = uEye + r * zv; float dist = length(p - uEye);
  float keep = 1.0 - min(0.97, 1.0 - exp(-dist / uFogDist)); // the pass's own fog hides light the same way
  vec3 from = p + (sprite ? -normalize(r) * 0.2 : n * 0.08);
  // The nearest lights whose radius reaches this point, from its square's short list.
  ivec2 b = ivec2(floor((p.xy - uBin0) / ${GPU_LIGHT.bin.toFixed(1)}));
  // Ranked by reach (distance over radius). The ones that only just made the cut fade out against the first one left out,
  // so where the chosen set changes across a wall there is no hard edge (that drew wedges over walls lit by many torches).
  int idx[${GPU_LIGHT.maxPerPixel}]; float dd[${GPU_LIGHT.maxPerPixel}]; int got = 0; int row = 0; float cut = 2.0;
  if (b.x >= 0 && b.y >= 0 && b.x < ${BINS} && b.y < ${BINS}) {
    row = b.y * ${BINS} + b.x;
    for (int k = 0; k < ${K}; k++){
      vec4 L = texelFetch(uLights, ivec2(k * 2, row), 0);
      if (L.w <= 0.0) break;
      float d = length(L.xyz - p) / L.w; if (d >= 1.0) continue;
      int at = got;
      if (got < uCount) got++; else { if (d >= dd[uCount - 1]) { cut = min(cut, d); continue; } cut = min(cut, dd[uCount - 1]); at = uCount - 1; }
      while (at > 0 && dd[at - 1] > d){ idx[at] = idx[at - 1]; dd[at] = dd[at - 1]; at--; }
      idx[at] = k; dd[at] = d;
    }
  }
  vec3 lit = vec3(0.0);
  for (int i = 0; i < got; i++){
    vec4 L = texelFetch(uLights, ivec2(idx[i] * 2, row), 0); vec3 c = texelFetch(uLights, ivec2(idx[i] * 2 + 1, row), 0).rgb;
    vec3 to = L.xyz - from; float d = length(to); vec3 dir = to / max(d, 1e-4);
    float ndl = sprite ? 1.0 : max(0.0, dot(n, dir)); if (ndl <= 0.0) continue;
    float f = 1.0 - dd[i]; float k = f * f * (sprite ? 1.0 : 0.35 + 0.65 * ndl) * clamp((cut - dd[i]) / ${GPU_LIGHT.pick.toFixed(2)}, 0.0, 1.0);
    if (d > 0.7) k *= shadowRay(from, dir, d - 0.6, ${GPU_LIGHT.steps}, true, self);
    lit += c * k;
  }
  // Sky light: open sky above or a roof, and the corners and creases near the point (ambient occlusion).
  float sky = shadowRay(from, vec3(0.0, 0.0, 1.0), ${GPU_LIGHT.skyLen.toFixed(1)}, ${GPU_LIGHT.skyLen + 2}, false, -1);
  vec3 tA = normalize(abs(n.z) < 0.9 ? cross(n, vec3(0.0, 0.0, 1.0)) : cross(n, vec3(1.0, 0.0, 0.0))); vec3 tB = cross(n, tA);
  float spin = fract(sin(dot(vec2(px), vec2(12.9898, 78.233))) * 43758.5453) * 6.2832; float ao = 1.0;
  if (!sprite) for (int i = 0; i < ${GPU_LIGHT.ao}; i++){
    float an = spin + float(i) * 1.5708; vec3 dir = normalize(n + 0.9 * (cos(an) * tA + sin(an) * tB));
    ao -= ${GPU_LIGHT.aoDark.toFixed(2)} * (1.0 - shadowRay(from, dir, ${GPU_LIGHT.aoLen.toFixed(2)}, 3, false, -1));
  }
  vec3 L = (sky > 0.5 ? uAmb : uAmb * ${GPU_LIGHT.indoor[0].toFixed(2)} + ${GPU_LIGHT.indoor[1].toFixed(2)}) * ao + lit;
  // The sun or moon: through the near field (walls, cells, every sprite), then over the land far off, then the clouds.
  vec3 sd = normalize(uSunDir);
  float ndl = sprite ? 0.25 + 0.55 * max(0.0, sd.z) : max(0.0, dot(n, sd));
  if (ndl > 0.0) {
    float vis = sd.z > 0.0 ? shadowRay(from, sd, 200.0, ${GPU_LIGHT.sunSteps}, true, self) : 1.0;
    if (vis > 0.0 && sd.z > 0.0) vis *= landSun(from, sd);
    L += uSun * ndl * vis * cloudShade(p.xy);
  }
  o = vec4(al.rgb * L * keep, 1.0);
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

  /** Adds every pixel's light to the scene colour. Draw into a target without depth. */
  draw(cam: CamBasis, eye: { x: number; y: number; z: number }, env: Env, count: number, alb: WebGLTexture, nrm: WebGLTexture, depth: WebGLTexture, solid: GpuSolid, casters: GpuCasters, farShade: GpuFarShade, w: number, h: number, near: number, far: number): void {
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const texs: [string, WebGLTexture][] = [['uAlb', alb], ['uNrm', nrm], ['uDepth', depth], ['uLights', this.tex]];
    texs.forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, name), i);
    });
    solid.bind(p, texs.length);
    const fl = Math.hypot(cam.fwd[0], cam.fwd[1]) || 1;
    casters.bind(p, texs.length + 2, [cam.fwd[0] / fl || 1, cam.fwd[1] / fl]);
    farShade.bind(p, texs.length + 5);
    const v3 = (n: string, v: readonly number[]): void => gl.uniform3f(loc(gl, p, n), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    v3('uFwd', cam.fwd);
    v3('uRight', cam.right);
    v3('uUp', cam.up);
    v3('uEye', [eye.x, eye.y, eye.z]);
    v3('uSunDir', [env.lx, env.ly, env.lz]);
    v3('uSun', [env.sunR, env.sunG, env.sunB]);
    v3('uAmb', [env.ambR, env.ambG, env.ambB]);
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
