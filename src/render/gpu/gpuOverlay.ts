/** The held item: still painted into a small pixel buffer by `ViewModel` (a perspective-warped sprite, never a 3D model), then laid over the scene on the GPU, always on top. */
import { compile, loc, makeTexture } from './glUtil';
import type { Surface } from '../vfx/glow';

const VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)); vUv = vec2(p.x, 1.0 - p.y); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;
const FS = `#version 300 es
precision highp float; uniform sampler2D uTex; in vec2 vUv; out vec4 o;
void main(){ vec4 c = texture(uTex, vUv); if (c.a < 0.5 || (c.r + c.g + c.b) == 0.0) discard; o = vec4(c.rgb, 1.0); }`;

export class GpuOverlay {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private tex: WebGLTexture;
  /** Pixels the held item paints into (transparent = 0). Same size as the frame. */
  readonly surface: Surface = { width: 0, height: 0, pixels: new Uint32Array(0) };

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, VS, FS);
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject;
    this.tex = makeTexture(gl, gl.RGBA8, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE);
  }

  /** Clears the buffer for a new frame (resizing it with the frame). */
  begin(w: number, h: number): Surface {
    const s = this.surface;
    if (s.width !== w || s.height !== h) {
      s.width = w;
      s.height = h;
      s.pixels = new Uint32Array(w * h);
      const gl = this.gl;
      gl.deleteTexture(this.tex);
      this.tex = makeTexture(gl, gl.RGBA8, w, h, gl.RGBA, gl.UNSIGNED_BYTE);
    } else s.pixels.fill(0);
    return s;
  }

  draw(): void {
    const gl = this.gl;
    const s = this.surface;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, s.width, s.height, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(s.pixels.buffer));
    gl.uniform1i(loc(gl, this.prog, 'uTex'), 0);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
  }
}
