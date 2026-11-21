/** Small WebGL2 helpers shared by the GPU passes (shaders, textures, camera maths). Render-only. */
export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('gl program');
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const s = gl.createShader(type);
    if (!s) throw new Error('gl shader');
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    gl.attachShader(prog, s);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  return prog;
}

/** A NEAREST-filtered 2D texture (the retro look never blends texels). */
export function makeTexture(gl: WebGL2RenderingContext, internal: number, w: number, h: number, fmt: number, type: number): WebGLTexture {
  const t = gl.createTexture();
  if (!t) throw new Error('gl texture');
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, type, null);
  return t;
}

export interface CamBasis {
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  /** tan of half the vertical field of view. */
  tanY: number;
  aspect: number;
}

/**
 * Camera basis matching the CPU view: yaw about z, and the CPU's pitch (a screen shear of pitch*0.62 screen heights)
 * turned into the equivalent real tilt. `focal` is the CPU projection's focal length in screen heights.
 */
export function camBasis(yaw: number, pitch: number, fovDegrees: number, aspect: number): CamBasis {
  const tanY = Math.tan((fovDegrees * Math.PI) / 360);
  const tilt = Math.atan((pitch * 0.62) * 2 * tanY);
  const cp = Math.cos(tilt);
  const sp = Math.sin(tilt);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { fwd: [c * cp, s * cp, sp], right: [-s, c, 0], up: [-c * sp, -s * sp, cp], tanY, aspect };
}

/** Column-major view-projection (z-up world). */
export function viewProj(e: { x: number; y: number; z: number }, b: CamBasis, near: number, far: number): Float32Array {
  const [fx, fy, fz] = b.fwd;
  const [rx, ry] = b.right;
  const [ux, uy, uz] = b.up;
  const f = 1 / b.tanY;
  const A = (far + near) / (near - far);
  const B = (2 * far * near) / (near - far);
  const tx = -(rx * e.x + ry * e.y);
  const ty = -(ux * e.x + uy * e.y + uz * e.z);
  const tz = -(fx * e.x + fy * e.y + fz * e.z);
  const fa = f / b.aspect;
  return new Float32Array([fa * rx, f * ux, A * -fx, fx, fa * ry, f * uy, A * -fy, fy, 0, f * uz, A * -fz, fz, fa * tx, f * ty, -A * tz + B, tz]);
}

export function loc(gl: WebGL2RenderingContext, p: WebGLProgram, name: string): WebGLUniformLocation | null {
  return gl.getUniformLocation(p, name);
}
