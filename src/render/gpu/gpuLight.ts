/** The CPU light grid (torches, flames, spells, lamps; `LightMap`) as a texture, so land, structures and sprites are lit by the same lights as Classic. */
import { LM_SIZE } from '../lighting';
import type { LightMap } from '../lighting';
import { loc, makeTexture } from './glUtil';

export const LIGHT_SHADER = `
uniform sampler2D uLight; uniform vec3 uLm;
vec3 lightAt(vec2 xy){ ivec2 i = ivec2(floor(xy - uLm.xy)); if (i.x < 0 || i.y < 0 || i.x >= ${LM_SIZE} || i.y >= ${LM_SIZE}) return vec3(0.0); return texelFetch(uLight, i, 0).rgb; }`;

export class GpuLight {
  private readonly tex: WebGLTexture;
  private readonly data = new Float32Array(LM_SIZE * LM_SIZE * 4);
  private ox = 0;
  private oy = 0;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.tex = makeTexture(gl, gl.RGBA32F, LM_SIZE, LM_SIZE, gl.RGBA, gl.FLOAT);
  }

  upload(lm: LightMap): void {
    const d = this.data;
    for (let i = 0; i < LM_SIZE * LM_SIZE; i++) {
      d[i * 4] = lm.r[i] ?? 0;
      d[i * 4 + 1] = lm.g[i] ?? 0;
      d[i * 4 + 2] = lm.b[i] ?? 0;
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LM_SIZE, LM_SIZE, gl.RGBA, gl.FLOAT, d);
    this.ox = lm.ox;
    this.oy = lm.oy;
  }

  /** Binds the grid on a texture unit for a program that includes LIGHT_SHADER. */
  bind(p: WebGLProgram, unit: number): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(loc(gl, p, 'uLight'), unit);
    gl.uniform3f(loc(gl, p, 'uLm'), this.ox, this.oy, LM_SIZE);
  }
}
