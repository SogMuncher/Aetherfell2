/**
 * What shades the sun beyond the near solid field, for the one light pass: cloud shadows (the `CloudShadow` grid) and the
 * land itself, walked toward the sun over two of the terrain's own height levels (ground + canopy + far buildings), so
 * hills, forests and towns throw shadows at any distance for the same cost per pixel.
 */
import type { CloudShadow } from '../raycaster/cloudShadow';
import { loc, makeTexture } from './glUtil';
import type { GpuTerrain } from './gpuTerrain';
import { GPU_SOLID } from './gpuSolid';

/** Terrain levels walked (cell 4 m over 512 m, then 64 m over 8 km), and the march: `steps` growing by `grow` from `start` m. */
export const GPU_FAR_SHADE = { levels: [2, 6], start: 1.5, grow: 1.4, steps: 22 } as const;

/** GLSL (after SOLID_UNIFORMS): `cloudShade(xy)`, `landSun(p, sunDir)`. */
export const FAR_SHADE_SHADER = `
uniform highp sampler2D uShade, uFarH0, uFarH1; uniform vec4 uShadeO; uniform float uShadeOn; uniform vec3 uFar0, uFar1;
float cloudShade(vec2 xy){
  if (uShadeOn < 0.5) return 1.0;
  vec2 g = xy / uShadeO.z - uShadeO.xy - 0.5; ivec2 i = ivec2(floor(g)); vec2 t = g - vec2(i);
  if (i.x < 0 || i.y < 0 || i.x >= 127 || i.y >= 127) return uShadeO.w;
  float a = texelFetch(uShade, i, 0).r, b = texelFetch(uShade, i + ivec2(1, 0), 0).r, c = texelFetch(uShade, i + ivec2(0, 1), 0).r, d = texelFetch(uShade, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
}
float landTop(highp sampler2D tex, vec3 o, vec2 p, bool tall, out bool ok){
  vec2 g = (p - o.xy) / o.z; ivec2 i = ivec2(floor(g)); vec2 t = g - vec2(i);
  ok = o.z > 0.0 && i.x >= 0 && i.y >= 0 && i.x < 128 && i.y < 128; if (!ok) return 0.0;
  vec3 a = texelFetch(tex, i, 0).rgb, b = texelFetch(tex, i + ivec2(1, 0), 0).rgb, c = texelFetch(tex, i + ivec2(0, 1), 0).rgb, d = texelFetch(tex, i + ivec2(1, 1), 0).rgb;
  vec3 h = mix(mix(a, b, t.x), mix(c, d, t.x), t.y);
  return h.r + (tall ? h.g + h.b : 0.0);
}
/** 0..1 sun reaching p past the land (soft at a distance). */
float landSun(vec3 p, vec3 s){
  float vis = 1.0; float t = ${GPU_FAR_SHADE.start.toFixed(2)};
  for (int i = 0; i < ${GPU_FAR_SHADE.steps}; i++){
    vec3 q = p + s * t; bool ok; bool tall = t > 6.0;
    t *= ${GPU_FAR_SHADE.grow.toFixed(2)};
    vec2 f = q.xy - vec2(uSolid0.xy); if (f.x > 1.0 && f.y > 1.0 && f.x < ${GPU_SOLID.size - 1}.0 && f.y < ${GPU_SOLID.size - 1}.0) continue; // the near field already walked this
    float cs = uFar0.z; float h = landTop(uFarH0, uFar0, q.xy, tall, ok);
    if (!ok) { cs = uFar1.z; h = landTop(uFarH1, uFar1, q.xy, tall, ok); if (!ok) break; }
    // A coarse level is smoothed land: give it slack in proportion, so ground never shades itself.
    float d = length(q - p);
    vis = min(vis, clamp((q.z - h + 0.3 + cs * 0.35 + d * 0.02) / (0.5 + d * 0.06 + cs * 0.5), 0.0, 1.0));
    if (vis <= 0.0) return 0.0;
  }
  return vis;
}`;

export class GpuFarShade {
  private readonly shadeTex: WebGLTexture;
  private on = 0;
  private mean = 1;
  private o = [0, 0, 48];

  constructor(private readonly gl: WebGL2RenderingContext, private readonly terrain: GpuTerrain) {
    this.shadeTex = makeTexture(gl, gl.R32F, 128, 128, gl.RED, gl.FLOAT);
  }

  /** Cloud shadows: copies the shadow grid into a texture (called every few frames), or switches them off for a clear sky. */
  setClouds(sh: CloudShadow, on: boolean): void {
    this.on = on ? 1 : 0;
    if (!on) return;
    const st = sh.state;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.shadeTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, st.size, st.size, gl.RED, gl.FLOAT, st.grid);
    this.o = [st.ox, st.oy, st.cell];
    this.mean = st.mean;
  }

  /** Binds three units for a program that includes FAR_SHADE_SHADER. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.shadeTex);
    gl.uniform1i(loc(gl, p, 'uShade'), unit);
    gl.uniform4f(loc(gl, p, 'uShadeO'), this.o[0] ?? 0, this.o[1] ?? 0, this.o[2] ?? 48, this.mean);
    gl.uniform1f(loc(gl, p, 'uShadeOn'), this.on);
    GPU_FAR_SHADE.levels.forEach((L, i) => {
      const h = this.terrain.heights(L);
      gl.activeTexture(gl.TEXTURE0 + unit + 1 + i);
      gl.bindTexture(gl.TEXTURE_2D, h ? h.tex : this.shadeTex);
      gl.uniform1i(loc(gl, p, `uFarH${i}`), unit + 1 + i);
      gl.uniform3f(loc(gl, p, `uFar${i}`), h ? h.ox : 0, h ? h.oy : 0, h ? h.cs : 0);
    });
  }
}
