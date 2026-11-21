/** One shared texture atlas of every tile code's floor and wall surface, painted from material data (the same procedural textures Classic uses). */
import type { TileInfo } from '../../types';
import { TILES } from '../../content/tiles';
import { surfaceTexture, TEX } from '../materials';
import { makeTexture } from './glUtil';

/** Atlas slot of a tile code's surface: code*2 (floor) or code*2+1 (wall); 16 per row, TEX pixels each. */
export const SURFACE_SHADER = `
uniform sampler2D uSurf;
vec3 surf(int mat, bool wall, vec2 uv){
  int idx = mat * 2 + (wall ? 1 : 0); ivec2 t = ivec2(idx % 16, idx / 16) * ${TEX};
  return texelFetch(uSurf, t + (ivec2(floor(uv)) & ${TEX - 1}), 0).rgb;
}`;

export function makeSurfaceAtlas(gl: WebGL2RenderingContext): WebGLTexture {
  const atlas = makeTexture(gl, gl.RGBA8, 16 * TEX, 32 * TEX, gl.RGBA, gl.UNSIGNED_BYTE);
  const fallback = surfaceTexture('grass');
  for (let code = 0; code < 256; code++) {
    const info: TileInfo | undefined = TILES[code];
    for (let wall = 0; wall < 2; wall++) {
      const tex = info ? surfaceTexture(wall ? info.wall : info.floor) : fallback;
      const i = code * 2 + wall;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % 16) * TEX, Math.floor(i / 16) * TEX, TEX, TEX, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(tex.px.buffer, tex.px.byteOffset, tex.px.byteLength));
    }
  }
  return atlas;
}
