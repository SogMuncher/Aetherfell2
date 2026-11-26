/**
 * Floating air motes (dust, pollen, ash, snow): points in a box that follows the eye, drifting with the data's drift
 * plus the wind (the caller passes none where the air is still: under a roof, below ground).
 * Depth-tested against the scene, so they sit in the world. Look comes from `AirDef` of the realm or biome.
 */
import type { AirDef, Vec2 } from '../../types';
import { compile, loc } from './glUtil';

const MAX = 600;
const VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uDrift; uniform float uBox, uSize, uCount;
out float vFade;
float h(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
void main(){
  float i = float(gl_VertexID);
  if (i >= uCount){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vFade = 0.0; return; }
  vec3 base = vec3(h(i), h(i + 101.0), h(i + 211.0)) * uBox + uDrift;
  vec3 p = mod(base - uEye, uBox) - uBox * 0.5 + uEye;
  float d = length(p - uEye);
  vFade = smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.4, 1.5, d);
  gl_Position = uVP * vec4(p, 1.0); gl_PointSize = uSize;
}`;
const FS = `#version 300 es
precision highp float; uniform vec4 uCol; in float vFade; out vec4 o;
void main(){ o = vec4(uCol.rgb, uCol.a * vFade); }`;

export class GpuAir {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  /** How far the air has carried the motes so far (drift and wind added up), kept within one box. */
  private readonly moved = { x: 0, y: 0, z: 0 };
  private lastTime: number | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
  }

  draw(vp: Float32Array, eye: { x: number; y: number; z: number }, air: AirDef | undefined, time: number, sunlit: number, wind: Vec2): void {
    const dt = this.lastTime === null ? 0 : Math.max(0, Math.min(0.25, time - this.lastTime));
    this.lastTime = time;
    if (!air || air.count <= 0) return;
    const m = this.moved;
    m.x = (m.x + (air.drift[0] + wind.x) * dt) % air.box;
    m.y = (m.y + (air.drift[1] + wind.y) * dt) % air.box;
    m.z = (m.z + air.drift[2] * dt) % air.box;
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uDrift'), m.x, m.y, m.z);
    gl.uniform1f(loc(gl, p, 'uBox'), air.box);
    gl.uniform1f(loc(gl, p, 'uSize'), air.size);
    gl.uniform1f(loc(gl, p, 'uCount'), Math.min(MAX, air.count));
    gl.uniform4f(loc(gl, p, 'uCol'), (air.colour[0] / 255) * sunlit, (air.colour[1] / 255) * sunlit, (air.colour[2] / 255) * sunlit, air.alpha);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, Math.min(MAX, air.count));
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
