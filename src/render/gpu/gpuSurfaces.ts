/** One shared texture atlas of every tile code's floor and wall surface (and the surfaces matter states cover things with), painted from material data (the same procedural textures Classic uses). */
import type { TileInfo } from '../../types';
import { TILES } from '../../content/tiles';
import { surfaceTexture, TEX } from '../materials';
import { makeTexture } from './glUtil';
import { STATE_SURFACES } from '../stateLooks';

/** Atlas slot of a tile code's surface: code*2 (floor) or code*2+1 (wall); 16 per row, TEX pixels each. */
export const SURFACE_SHADER = `
uniform sampler2D uSurf;
vec3 surfIdx(int idx, vec2 uv){
  ivec2 t = ivec2(idx % 16, idx / 16) * ${TEX};
  return texelFetch(uSurf, t + (ivec2(floor(uv)) & ${TEX - 1}), 0).rgb;
}
vec3 surf(int mat, bool wall, vec2 uv){ return surfIdx(mat * 2 + (wall ? 1 : 0), uv); }`;

/** Atlas slot of the first surface matter states cover things with (render/stateLooks.ts STATE_SURFACES), after every tile's two. */
export const STATE_SURFACE_BASE = 512;

export function makeSurfaceAtlas(gl: WebGL2RenderingContext): WebGLTexture {
  const atlas = makeTexture(gl, gl.RGBA8, 16 * TEX, (32 + Math.ceil(STATE_SURFACES.length / 16)) * TEX, gl.RGBA, gl.UNSIGNED_BYTE);
  const fallback = surfaceTexture('grass');
  for (let code = 0; code < 256; code++) {
    const info: TileInfo | undefined = TILES[code];
    for (let wall = 0; wall < 2; wall++) {
      const tex = info ? surfaceTexture(wall ? info.wall : info.floor) : fallback;
      const i = code * 2 + wall;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % 16) * TEX, Math.floor(i / 16) * TEX, TEX, TEX, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(tex.px.buffer, tex.px.byteOffset, tex.px.byteLength));
    }
  }
  STATE_SURFACES.forEach((id, k) => {
    const tex = surfaceTexture(id);
    const i = STATE_SURFACE_BASE + k;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % 16) * TEX, Math.floor(i / 16) * TEX, TEX, TEX, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(tex.px.buffer, tex.px.byteOffset, tex.px.byteLength));
  });
  return atlas;
}
