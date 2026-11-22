/** One shared texture atlas of every tile code's floor and wall surface (and the surfaces matter states cover things with), painted from material data (procedural textures from render/materials). */
import type { TileInfo } from '../../types';
import { TILES } from '../../content/tiles';
import { surfaceTexture, TEX } from '../materials';
import { makeTexture } from './glUtil';
import { STATE_SURFACES } from '../stateLooks';

/**
 * How surfaces mix: `blend` texels to either side of any cell edge (ground and 3D cells, same and different kinds alike),
 * soft `patchSize` m patches of `patchShade` brightness and `patchWarm` warmth, gone by `patchFade` m.
 */
export const SURFACE_MIX = { blend: 5, patchSize: 6, patchShade: 0.12, patchWarm: 0.06, patchFade: [60, 260] } as const;

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

/**
 * GLSL for solid passes. They do no lighting: each writes what its pixel is (`surfaceOut(albedo, normal, kind)`, kind 1 =
 * surface; sprites use `spriteOut(albedo, instance)`, lit from all sides and known by number to their own shadow) and puts only what glows plus the fog in the colour. The one light pass
 * (`gpuLight.ts`) lights every pixel.
 */
export const SURFACE_OUT = `
layout(location = 1) out vec4 oAlb; layout(location = 2) out vec4 oNrm;
void surfaceOut(vec3 albedo, vec3 n, float kind){ oAlb = vec4(clamp(albedo, 0.0, 1.0), kind); oNrm = vec4(n * 0.5 + 0.5, 1.0); }
void spriteOut(vec3 albedo, int id){ oAlb = vec4(clamp(albedo, 0.0, 1.0), 0.5); oNrm = vec4(float((id + 1) & 255) / 255.0, float((id + 1) >> 8) / 255.0, 0.0, 1.0); }`;

/** Atlas slot of a tile code's surface: code*2 (floor) or code*2+1 (wall); 16 per row, TEX pixels each. */
export const SURFACE_SHADER = `
uniform sampler2D uSurf;
vec3 surfIdx(int idx, vec2 uv){
  ivec2 t = ivec2(idx % 16, idx / 16) * ${TEX};
  return texelFetch(uSurf, t + (ivec2(floor(uv)) & ${TEX - 1}), 0).rgb;
}
vec3 surf(int mat, bool wall, vec2 uv){ return surfIdx(mat * 2 + (wall ? 1 : 0), uv); }
float surfHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// The one edge rule (ground tiles and 3D cells): at fraction f of a cell that is 'texels' texels across on each axis, how much this
// texel leans to its x and y neighbour. Half and half on the edge, ${SURFACE_MIX.blend} texels to either side, centres stay pure.
vec2 edgeLean(vec2 f, vec2 texels){ return max(vec2(0.0), 0.5 - 0.5 * min(f, 1.0 - f) * texels / ${SURFACE_MIX.blend.toFixed(1)}); }
float surfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(surfHash(i), surfHash(i + vec2(1.0, 0.0)), f.x), mix(surfHash(i + vec2(0.0, 1.0)), surfHash(i + 1.0), f.x), f.y); }
// Soft patches across the world (lighter/darker, warmer/cooler) so one surface never repeats the same; fades out far away.
vec3 surfPatches(vec3 col, vec2 p, float dist){
  float k = 1.0 - smoothstep(${SURFACE_MIX.patchFade[0].toFixed(1)}, ${SURFACE_MIX.patchFade[1].toFixed(1)}, dist); p /= ${SURFACE_MIX.patchSize.toFixed(1)};
  float s = surfNoise(p) * 0.65 + surfNoise(p * 2.7 + 17.0) * 0.35, w = surfNoise(p * 0.6 + 41.0);
  return col * (1.0 + (s - 0.5) * ${(2 * SURFACE_MIX.patchShade).toFixed(3)} * k) * (1.0 + (w - 0.5) * ${(2 * SURFACE_MIX.patchWarm).toFixed(3)} * k * vec3(1.0, 0.3, -1.0));
}`;
