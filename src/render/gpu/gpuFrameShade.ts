// Shadows of moving frames (an airship): each frame's cells as a small 1 m grid the light rays march through, turned with it
import type { ReadonlyVolume, VolumeFrame } from '../../types';
import { SHAPE_FINE } from '../../content/shapes';
import { loc } from './glUtil';

/** Frames that shade at once (the nearest), and the grid each gets (metres; a bigger frame is cut off). */
export const GPU_FRAMES = { max: 2, size: 32, rebuildEvery: 10 } as const;
const N = GPU_FRAMES.size;

/**
 * GLSL: `frameBlocks(from, dir, length)` is true when the ray passes through a filled cell of a moving frame. The ray is
 * turned into each frame's own cells (the same turn its cells are drawn with) and marched through its grid; the first
 * 0.6 m are skipped so a ship's own deck never shades itself.
 */
export const FRAME_SHADER = `
uniform highp sampler3D uFrameCells; uniform int uFrameN;
uniform vec4 uFrameA[${GPU_FRAMES.max}]; uniform vec4 uFrameB[${GPU_FRAMES.max}];
bool frameBlocks(vec3 o, vec3 d, float len){
  for (int f = 0; f < ${GPU_FRAMES.max}; f++){
    if (f >= uFrameN) break;
    vec4 A = uFrameA[f]; vec4 B = uFrameB[f]; float c = cos(A.w), s = sin(A.w);
    vec2 r = o.xy - A.xy;
    vec3 lo = vec3(c * r.x + s * r.y + B.x, -s * r.x + c * r.y + B.y, o.z - A.z);
    vec3 ld = vec3(c * d.x + s * d.y, -s * d.x + c * d.y, d.z);
    vec3 sz = vec3(${N}.0, ${N}.0, B.z);
    vec3 inv = 1.0 / mix(ld, vec3(1e-6), lessThan(abs(ld), vec3(1e-6)));
    vec3 ta = -lo * inv, tb = (sz - lo) * inv;
    vec3 tn = min(ta, tb), tf = max(ta, tb);
    float a = max(max(tn.x, tn.y), max(tn.z, 0.6)), b = min(min(tf.x, tf.y), min(tf.z, len));
    if (a >= b) continue;
    vec3 p = lo + ld * (a + 1e-3);
    ivec3 cell = ivec3(floor(p)); vec3 st = sign(ld); vec3 ad = max(abs(ld), vec3(1e-5));
    vec3 tMax = a + (st * (vec3(cell) + 0.5 - p) + 0.5) / ad; vec3 tDelta = 1.0 / ad; float t = a;
    for (int i = 0; i < ${N * 3}; i++){
      if (t > b) break;
      if (all(greaterThanEqual(cell, ivec3(0))) && all(lessThan(cell, ivec3(${N}))) && texelFetch(uFrameCells, ivec3(cell.x, cell.y, cell.z + f * ${N}), 0).r > 0.5) return true;
      float tn2 = min(min(tMax.x, tMax.y), tMax.z);
      if (tMax.x == tn2){ cell.x += int(st.x); tMax.x += tDelta.x; } else if (tMax.y == tn2){ cell.y += int(st.y); tMax.y += tDelta.y; } else { cell.z += int(st.z); tMax.z += tDelta.z; }
      t = tn2;
    }
  }
  return false;
}`;

/** Keeps the nearest frames' cells as a grid on the GPU (rebuilt when the 3D layer changes, a few frames apart) and binds them with their poses. */
export class GpuFrameShade {
  private readonly tex: WebGLTexture;
  private readonly cells = new Uint8Array(N * N * N * GPU_FRAMES.max);
  private readonly a = new Float32Array(4 * GPU_FRAMES.max);
  private readonly b = new Float32Array(4 * GPU_FRAMES.max);
  private n = 0;
  private built = '';
  private version = -1;
  private frame = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, N, N, N * GPU_FRAMES.max, 0, gl.RED, gl.UNSIGNED_BYTE, null);
  }

  update(eye: { x: number; y: number }, vol: ReadonlyVolume, frames: readonly VolumeFrame[]): void {
    const near = [...frames].sort((p, q) => Math.hypot(p.wx - eye.x, p.wy - eye.y) - Math.hypot(q.wx - eye.x, q.wy - eye.y)).slice(0, GPU_FRAMES.max);
    this.n = near.length;
    near.forEach((f, i) => {
      this.a.set([f.wx, f.wy, f.wz, f.yaw], i * 4);
      this.b.set([f.px - f.x0, f.py - f.y0, Math.min(N, f.z1 - f.z0), 0], i * 4);
    });
    const key = near.map((f) => f.id).join(',');
    const due = this.frame++ % GPU_FRAMES.rebuildEvery === 0;
    if (key === this.built && (vol.version === this.version || !due)) return;
    this.built = key;
    this.version = vol.version;
    this.cells.fill(0);
    near.forEach((f, i) => {
      for (let z = 0; z < Math.min(N, f.z1 - f.z0); z++) {
        for (let y = 0; y < Math.min(N, f.y1 - f.y0); y++) {
          for (let x = 0; x < Math.min(N, f.x1 - f.x0); x++) {
            const byte = vol.shapeAt(f.x0 + x, f.y0 + y, f.z0 + z) & 63;
            if (byte === 0) continue;
            // A split cell shades when at least two of its eight fine cells are filled (a deck, a hull's skin, the envelope).
            let n = 8;
            if (byte === SHAPE_FINE) {
              n = 0;
              for (let o = 0; o < 8; o++) if (vol.fineAt((f.x0 + x) * 2 + (o & 1), (f.y0 + y) * 2 + ((o >> 1) & 1), (f.z0 + z) * 2 + (o >> 2)) !== 0) n++;
            }
            if (n >= 2) this.cells[((i * N + z) * N + y) * N + x] = 255;
          }
        }
      }
    });
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, N, N, N * GPU_FRAMES.max, gl.RED, gl.UNSIGNED_BYTE, this.cells);
  }

  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.uniform1i(loc(gl, p, 'uFrameCells'), unit);
    gl.uniform1i(loc(gl, p, 'uFrameN'), this.n);
    gl.uniform4fv(loc(gl, p, 'uFrameA'), this.a);
    gl.uniform4fv(loc(gl, p, 'uFrameB'), this.b);
  }
}
