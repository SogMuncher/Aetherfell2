/**
 * Speed lines: thin streaks hanging still in the air around the eye, each drawn stretched along how fast the eye is moving,
 * so flying (a glider, the airship, a long fall) rushes past with depth. Driven only by the eye's own speed, whatever moves it.
 */
import { compile, loc } from './glUtil';

/** All numbers live here. Speeds in m/s; `trail` is how many seconds of travel each streak shows. */
export const SPEED_LINES = { count: 260, box: 56, start: 7, full: 15, trail: 0.07, maxTrail: 5, alpha: 0.32, colour: [225, 232, 245], teleport: 200 } as const;

const VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uEye; uniform vec3 uVel; uniform float uBox, uCount, uTrail;
out float vFade;
float h(float n){ return fract(sin(n * 12.9898) * 43758.5453); }
void main(){
  int id = gl_VertexID >> 1; float i = float(id);
  if (i >= uCount){ gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vFade = 0.0; return; }
  vec3 base = vec3(h(i), h(i + 101.0), h(i + 211.0)) * uBox;
  vec3 p = mod(base - uEye, uBox) - uBox * 0.5 + uEye;
  float d = length(p - uEye);
  vFade = smoothstep(uBox * 0.5, uBox * 0.25, d) * smoothstep(2.0, 6.0, d);
  float k = (gl_VertexID & 1) == 1 ? 1.0 : 0.0;
  // The far end of a streak is where the eye was moments ago, seen from here: the point plus your travel.
  if (k > 0.5) vFade = 0.0;
  p += uVel * uTrail * k * (0.6 + h(i + 307.0) * 0.8);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS = `#version 300 es
precision highp float; uniform vec4 uCol; in float vFade; out vec4 o;
void main(){ o = vec4(uCol.rgb, uCol.a * vFade); }`;

export class GpuSpeedLines {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private last: { x: number; y: number; z: number; t: number } | null = null;
  private vel = { x: 0, y: 0, z: 0 };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
  }

  draw(vp: Float32Array, eye: { x: number; y: number; z: number }, time: number, sunlit: number): void {
    const L = SPEED_LINES;
    const last = this.last;
    this.last = { x: eye.x, y: eye.y, z: eye.z, t: time };
    const dt = last ? time - last.t : 0;
    if (!last || dt <= 0 || dt > 0.25) return;
    const vx = (eye.x - last.x) / dt;
    const vy = (eye.y - last.y) / dt;
    const vz = (eye.z - last.z) / dt;
    if (Math.hypot(vx, vy, vz) > L.teleport) return;
    // Smoothed, so a jerky frame does not make the streaks flicker.
    const v = this.vel;
    const k = Math.min(1, dt * 8);
    v.x += (vx - v.x) * k;
    v.y += (vy - v.y) * k;
    v.z += (vz - v.z) * k;
    const speed = Math.hypot(v.x, v.y, v.z);
    const on = Math.min(1, Math.max(0, (speed - L.start) / (L.full - L.start)));
    if (on <= 0) return;
    const trail = Math.min(L.trail, L.maxTrail / speed);
    const gl = this.gl;
    const p = this.prog;
    gl.useProgram(p);
    gl.bindVertexArray(this.vao);
    gl.uniformMatrix4fv(loc(gl, p, 'uVP'), false, vp);
    gl.uniform3f(loc(gl, p, 'uEye'), eye.x, eye.y, eye.z);
    gl.uniform3f(loc(gl, p, 'uVel'), v.x, v.y, v.z);
    gl.uniform1f(loc(gl, p, 'uBox'), L.box);
    gl.uniform1f(loc(gl, p, 'uCount'), L.count);
    gl.uniform1f(loc(gl, p, 'uTrail'), trail);
    const c = L.colour;
    gl.uniform4f(loc(gl, p, 'uCol'), (c[0] / 255) * sunlit, (c[1] / 255) * sunlit, (c[2] / 255) * sunlit, L.alpha * on);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.LINES, 0, L.count * 2);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
