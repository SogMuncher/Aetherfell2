// Shadows of moving frames (an airship): each frame's cells as a small 1 m grid the light rays march through, turned with it
import type { ReadonlyVolume, VolumeFrame } from '../../types';
import { SHAPE_CUBE, SHAPE_FINE } from '../../content/shapes';
import { loc } from './glUtil';

/** Frames that shade at once (the nearest), and the grid each gets (metres; a bigger frame is cut off). */
export const GPU_FRAMES = { max: 2, size: 32, rebuildEvery: 10 } as const;
const N = GPU_FRAMES.size;
const F = N * 2; // fine cells a side

/**
 * GLSL: `frameBlocks(from, dir, length)` is true when the ray passes through a filled part of a moving frame. The ray is
 * turned into each frame's own cells (the same turn its cells are drawn with) and marched through its grid at the
 * fine (0.5 m) size its decks and hull are built at. Each cell keeps its true shape (`shapeBlocks`), so a surface never
 * shades itself or its neighbours (a coarse 1 m block over a half-cell deck did: speckles and streaks all over the ship).
 * A cell is (shape byte, coarse): a coarse shaped cell is tested at its own 1 m size.
 */
export const FRAME_SHADER = `
uniform highp sampler3D uFrameCells; uniform int uFrameN;
uniform vec4 uFrameA[${GPU_FRAMES.max}]; uniform vec4 uFrameB[${GPU_FRAMES.max}];
bool frameBlocks(vec3 o, vec3 d, float len){
  for (int f = 0; f < ${GPU_FRAMES.max}; f++){
    if (f >= uFrameN) break;
    vec4 A = uFrameA[f]; vec4 B = uFrameB[f]; float c = cos(A.w), s = sin(A.w);
    vec2 r = o.xy - A.xy;
    vec3 lo = 2.0 * vec3(c * r.x + s * r.y + B.x, -s * r.x + c * r.y + B.y, o.z - A.z);
    vec3 ld = vec3(c * d.x + s * d.y, -s * d.x + c * d.y, d.z);
    vec3 sz = vec3(${F}.0, ${F}.0, 2.0 * B.z);
    vec3 inv = 1.0 / mix(ld, vec3(1e-6), lessThan(abs(ld), vec3(1e-6)));
    vec3 ta = -lo * inv, tb = (sz - lo) * inv;
    vec3 tn = min(ta, tb), tf = max(ta, tb);
    float a = max(max(tn.x, tn.y), max(tn.z, 0.0)), b = min(min(tf.x, tf.y), min(tf.z, 2.0 * len));
    if (a >= b) continue;
    vec3 p = lo + ld * a;
    ivec3 cell = clamp(ivec3(floor(p)), ivec3(0), ivec3(${F - 1})); vec3 st = sign(ld); vec3 ad = max(abs(ld), vec3(1e-5));
    vec3 tMax = (st * (vec3(cell) + 0.5 - lo) + 0.5) / ad; vec3 tDelta = 1.0 / ad; float t = a;
    for (int i = 0; i < ${F * 3}; i++){
      if (t >= b) break;
      float tn2 = min(min(tMax.x, tMax.y), tMax.z);
      if (all(greaterThanEqual(cell, ivec3(0))) && all(lessThan(cell, ivec3(${F})))){
        vec2 v = texelFetch(uFrameCells, ivec3(cell.x, cell.y, cell.z + f * ${F}), 0).rg;
        int sh = int(v.r * 255.0 + 0.5);
        if (sh != 0){
          // A whole cell blocks unless the ray starts inside it (the surface it leaves); a shaped one only where the ray really crosses it.
          if ((sh & 63) == ${SHAPE_CUBE}){ if (i > 0 || a > 0.0) return true; }
          else if (v.g > 0.5){ vec3 cc = floor(vec3(cell) * 0.5); if (shapeBlocks(sh, lo * 0.5 - cc, ld, min(tn2, b) * 0.5)) return true; }
          else if (shapeBlocks(sh, lo - vec3(cell), ld, min(tn2, b))) return true;
        }
      }
      if (tMax.x == tn2){ cell.x += int(st.x); tMax.x += tDelta.x; } else if (tMax.y == tn2){ cell.y += int(st.y); tMax.y += tDelta.y; } else { cell.z += int(st.z); tMax.z += tDelta.z; }
      t = tn2;
    }
  }
  return false;
}`;

/** Keeps the nearest frames' cells as a grid on the GPU (rebuilt when the 3D layer changes, a few frames apart) and binds them with their poses. */
export class GpuFrameShade {
  private readonly tex: WebGLTexture;
  private readonly cells = new Uint8Array(F * F * F * GPU_FRAMES.max * 2);
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
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RG8, F, F, F * GPU_FRAMES.max, 0, gl.RG, gl.UNSIGNED_BYTE, null);
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
    const put = (i: number, fx: number, fy: number, fz: number, byte: number, coarse: number): void => {
      const k = (((i * F + fz) * F + fy) * F + fx) * 2;
      this.cells[k] = byte;
      this.cells[k + 1] = coarse;
    };
    near.forEach((f, i) => {
      for (let z = 0; z < Math.min(N, f.z1 - f.z0); z++) {
        for (let y = 0; y < Math.min(N, f.y1 - f.y0); y++) {
          for (let x = 0; x < Math.min(N, f.x1 - f.x0); x++) {
            const byte = vol.shapeAt(f.x0 + x, f.y0 + y, f.z0 + z);
            if ((byte & 63) === 0) continue;
            for (let o = 0; o < 8; o++) {
              const fx = x * 2 + (o & 1), fy = y * 2 + ((o >> 1) & 1), fz = z * 2 + (o >> 2);
              // A split cell gives each fine cell its own shape; a whole cell fills all eight; any other shape is kept at its 1 m size.
              if ((byte & 63) === SHAPE_FINE) put(i, fx, fy, fz, vol.fineAt((f.x0 + x) * 2 + (o & 1), (f.y0 + y) * 2 + ((o >> 1) & 1), (f.z0 + z) * 2 + (o >> 2)), 0);
              else put(i, fx, fy, fz, byte, (byte & 63) === SHAPE_CUBE ? 0 : 255);
            }
          }
        }
      }
    });
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, F, F, F * GPU_FRAMES.max, gl.RG, gl.UNSIGNED_BYTE, this.cells);
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
