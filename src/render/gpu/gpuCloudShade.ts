// Cloud shadows: sun light walked up through the air cells into two maps round the eye, which the light pass reads.
/**
 * Each texel is a spot on a flat plane at sea level; its light is walked toward the sun (or moon) through the band of
 * heights where clouds cast shade, summing each cell's shadow share (each layer's `shadow`), so a shadow lands where the
 * sun puts it, slants at dusk, drifts with its cloud and is soft at its edge. A ground point at height z reads the
 * texel it projects onto along the light. Two maps: `near` metres a texel round the eye, `far` beyond (SkyDef.shade).
 */
import { CONTENT } from '../../content';
import type { WeatherState } from '../../types';
import type { Env } from '../lighting';
import type { GpuAirFill } from './gpuAirFill';
import { compile, loc } from './glUtil';

/** Steps up through the shade band per texel. */
const STEPS = 40;

/** GLSL: `cloudShade(p)` = share of the light reaching world point p past the clouds. */
export const CLOUD_SHADE_SHADER = `
uniform highp sampler2D uShade; uniform vec4 uShadeN, uShadeF; uniform vec3 uShadeS;
float cloudShade(vec3 p){
  if (uShadeS.z < 0.5) return 1.0;
  vec2 q = p.xy - uShadeS.xy * p.z;
  vec2 a = (q - uShadeN.xy) / uShadeN.z; vec2 b = (q - uShadeF.xy) / uShadeF.z;
  float far = texture(uShade, clamp(b, 0.0, 1.0)).g;
  float e = max(abs(a.x - 0.5), abs(a.y - 0.5));
  return e < 0.5 ? mix(texture(uShade, a).r, far, smoothstep(0.38, 0.48, e)) : far;
}`;

const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const fs = (air: string, k0: number, k1: number): string => `#version 300 es
precision highp float; precision highp int;
${air}
uniform vec4 uO; uniform vec2 uF; uniform vec3 uS; uniform vec2 uDrift, uBand; uniform float uExt, uFloor;
out vec4 o;
float walk(vec2 q, int k){
  float dz = (uBand.y - uBand.x) / ${STEPS}.0; float seg = dz / uS.z; float sum = 0.0; vec3 c;
  for (int i = 0; i < ${STEPS}; i++){
    float z = uBand.x + (float(i) + 0.5) * dz;
    vec3 p = vec3(q + uS.xy * z / uS.z - uDrift, z);
    sum += airAt(p, k, c).b * seg;
  }
  return max(uFloor, exp(-sum * uExt));
}
void main(){
  vec2 t = floor(gl_FragCoord.xy) + 0.5;
  o = vec4(walk(uO.xy + t * uO.z, ${k0}), walk(uF + t * uO.w, ${k1}), 0.0, 1.0);
}`;

export class GpuCloudShade {
  readonly tex: WebGLTexture;
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private readonly size = CONTENT.sky.shade.size;
  /** Corners of the near and far maps (metres) and the light's slant, as the light pass reads them. */
  private near = [0, 0];
  private far = [0, 0];
  private slant = [0, 0];
  private on = false;
  private frame = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly air: GpuAirFill) {
    const L = air.levels;
    const S = CONTENT.sky.shade;
    // The finest level whose cells are no smaller than a texel, so each step reads one averaged cell.
    const pick = (m: number): number => Math.max(0, Math.min(L.levels.length - 1, Math.round(Math.log2(m / CONTENT.sky.air.cell))));
    this.prog = compile(gl, VS, fs(air.glsl, pick(S.near), pick(S.far)));
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, this.size, this.size, 0, gl.RG, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
  }

  /** Rebuilds both maps every other frame round the eye (off under a roof or a clear sky). */
  update(env: Env, w: WeatherState, eye: { x: number; y: number; z: number }, cloudy: boolean): void {
    this.on = env.open && cloudy;
    if (!this.on || this.frame++ % 2) return;
    const gl = this.gl;
    const S = CONTENT.sky.shade;
    const ll = Math.hypot(env.lx, env.ly, env.lz) || 1;
    const lz = Math.max(0.12, env.lz / ll);
    const sx = env.lx / ll / lz;
    const sy = env.ly / ll / lz;
    this.slant = [sx, sy];
    // Centred on the spot the eye's own ground projects onto, snapped to whole texels so shadows do not crawl.
    const qx = eye.x - sx * eye.z;
    const qy = eye.y - sy * eye.z;
    const corner = (m: number): number[] => [(Math.floor(qx / m) - this.size / 2) * m, (Math.floor(qy / m) - this.size / 2) * m];
    this.near = corner(S.near);
    this.far = corner(S.far);
    const shaders = CONTENT.sky.layers.filter((l) => l.shadow > 0);
    const band = [Math.min(...shaders.map((l) => l.height)), Math.max(...shaders.map((l) => l.height + Math.max(30, l.thickness ?? 0)))];
    const p = this.prog;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.size, this.size);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    this.air.bind(p, 4);
    gl.uniform4f(loc(gl, p, 'uO'), this.near[0] ?? 0, this.near[1] ?? 0, S.near, S.far);
    gl.uniform2f(loc(gl, p, 'uF'), this.far[0] ?? 0, this.far[1] ?? 0);
    gl.uniform3f(loc(gl, p, 'uS'), env.lx / ll, env.ly / ll, lz);
    gl.uniform2f(loc(gl, p, 'uDrift'), w.drift?.x ?? 0, w.drift?.y ?? 0);
    gl.uniform2f(loc(gl, p, 'uBand'), band[0] ?? 0, band[1] ?? 1);
    gl.uniform1f(loc(gl, p, 'uExt'), S.ext);
    gl.uniform1f(loc(gl, p, 'uFloor'), S.floor);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }

  /** Binds the maps for a program that includes CLOUD_SHADE_SHADER. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    const span = (m: number): number => m * this.size;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc(gl, p, 'uShade'), unit);
    gl.uniform4f(loc(gl, p, 'uShadeN'), this.near[0] ?? 0, this.near[1] ?? 0, span(CONTENT.sky.shade.near), 0);
    gl.uniform4f(loc(gl, p, 'uShadeF'), this.far[0] ?? 0, this.far[1] ?? 0, span(CONTENT.sky.shade.far), 0);
    gl.uniform3f(loc(gl, p, 'uShadeS'), this.slant[0] ?? 0, this.slant[1] ?? 0, this.on ? 1 : 0);
  }
}
