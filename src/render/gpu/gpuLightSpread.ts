// Smoothed lighting: light worked out at half or quarter resolution, spread to every pixel only from samples on the same surface.
import type { Env } from '../lighting';
import type { CamBasis } from './glUtil';
import { compile, loc, makeTexture } from './glUtil';

/**
 * Each pixel takes its four nearest light samples, weighted by how close they are and by how much each sample's own
 * pixel looks like this one (same depth, same facing, same sprite), so light never bleeds across an edge. Where none
 * match (a thin twig against the sky) it falls back to the open-air light of the moment.
 */
const VS = `#version 300 es
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uAlb, uNrm, uDepth, uLight;
uniform vec3 uFwd, uRight, uUp, uSunDir, uSun, uAmb; uniform vec2 uTan, uSize; uniform ivec2 uLow; uniform float uNear, uFar, uFogDist; uniform int uS;
out vec4 o;
float lin(ivec2 q){ float zn = texelFetch(uDepth, q, 0).r * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear)); }
void main(){
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 al = texelFetch(uAlb, px, 0);
  if (al.a < 0.25) discard;
  vec4 nr = texelFetch(uNrm, px, 0); bool sprite = al.a < 0.75; vec3 n = nr.xyz * 2.0 - 1.0;
  float z = lin(px);
  vec2 f = (vec2(px) - float(uS / 2)) / float(uS); ivec2 b = ivec2(floor(f)); vec2 t = f - vec2(b);
  vec3 sum = vec3(0.0); float ws = 0.0; vec3 best = vec3(0.0); float bw = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++){
    ivec2 lq = clamp(b + ivec2(i, j), ivec2(0), uLow - 1);
    ivec2 q = min(lq * uS + uS / 2, ivec2(uSize) - 1);
    vec4 qa = texelFetch(uAlb, q, 0); vec4 qn = texelFetch(uNrm, q, 0);
    float rel = abs(lin(q) - z) / (0.03 * z + 0.08);
    float w = exp(-rel * rel);
    if (qa.a < 0.25) w = 0.0;
    else if (sprite != (qa.a < 0.75)) w *= 0.01;
    else if (sprite) w *= all(equal(qn.rg, nr.rg)) ? 1.0 : 0.05;
    else w *= pow(max(0.0, dot(qn.xyz * 2.0 - 1.0, n)), 8.0);
    vec3 l = texelFetch(uLight, lq, 0).rgb; l = l * l * 4.0;
    float wb = (i == 0 ? 1.0 - t.x : t.x) * (j == 0 ? 1.0 - t.y : t.y) + 1e-3;
    sum += l * w * wb; ws += w * wb;
    if (w > bw){ bw = w; best = l; }
  }
  vec3 sd = normalize(uSunDir);
  vec3 L = ws > 1e-3 ? sum / ws : bw > 1e-4 ? best : uAmb + uSun * (0.25 + 0.55 * max(0.0, sd.z));
  vec2 nd = (vec2(px) + 0.5) / uSize * 2.0 - 1.0; vec3 r = uFwd + uRight * nd.x * uTan.x + uUp * nd.y * uTan.y;
  float keep = 1.0 - min(0.97, 1.0 - exp(-z * length(r) / uFogDist));
  o = vec4(al.rgb * L * keep, 1.0);
}`;

export class GpuLightSpread {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly fbo: WebGLFramebuffer;
  private tex: WebGLTexture;
  private w = 0;
  private h = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  /** The small target the light pass writes its samples into (sized to the frame / scale). */
  lowTarget(w: number, h: number): WebGLFramebuffer {
    const gl = this.gl;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      gl.deleteTexture(this.tex);
      this.tex = makeTexture(gl, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    }
    return this.fbo;
  }

  /** Lights every pixel from the samples (blend state set by the caller: added to the scene colour). */
  draw(cam: CamBasis, env: Env, scale: number, lw: number, lh: number, alb: WebGLTexture, nrm: WebGLTexture, depth: WebGLTexture, w: number, h: number, near: number, far: number): void {
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    ([['uAlb', alb], ['uNrm', nrm], ['uDepth', depth], ['uLight', this.tex]] as const).forEach(([name, t], i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.uniform1i(loc(gl, p, name), i);
    });
    const v3 = (n: string, v: readonly number[]): void => gl.uniform3f(loc(gl, p, n), v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
    v3('uFwd', cam.fwd);
    v3('uRight', cam.right);
    v3('uUp', cam.up);
    v3('uSunDir', [env.lx, env.ly, env.lz]);
    v3('uSun', [env.sunR, env.sunG, env.sunB]);
    v3('uAmb', [env.ambR, env.ambG, env.ambB]);
    gl.uniform2f(loc(gl, p, 'uTan'), cam.tanY * cam.aspect, cam.tanY);
    gl.uniform2f(loc(gl, p, 'uSize'), w, h);
    gl.uniform2i(loc(gl, p, 'uLow'), lw, lh);
    gl.uniform1i(loc(gl, p, 'uS'), scale);
    gl.uniform1f(loc(gl, p, 'uNear'), near);
    gl.uniform1f(loc(gl, p, 'uFar'), far);
    gl.uniform1f(loc(gl, p, 'uFogDist'), env.fogDist);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
