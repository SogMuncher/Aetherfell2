/** One shared texture atlas of every tile code's floor and wall surface (and the surfaces matter states cover things with), painted from material data (procedural textures from render/materials). */
import type { TileInfo } from '../../types';
import { TILES } from '../../content/tiles';
import { SURFACE_DRIFT, SURFACES } from '../../content/surfaces';
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

/** Atlas rows of surface pictures; below them one texel per slot (16 * TEX per row) holds that surface's drift. */
const SLOT_ROWS = (32 + Math.ceil(STATE_SURFACES.length / 16)) * TEX;
const DRIFT_W = 16 * TEX;
const SLOTS = STATE_SURFACE_BASE + STATE_SURFACES.length;

/** A surface's drift packed in one texel: hue (degrees * 4), sat, light (shares * 255). */
function driftTexel(id: string): number[] {
  const d = { ...SURFACE_DRIFT, ...SURFACES[id]?.drift };
  return [Math.min(255, d.hue * 4), Math.min(255, d.sat * 255), Math.min(255, d.light * 255), 255].map(Math.round);
}

export function makeSurfaceAtlas(gl: WebGL2RenderingContext): WebGLTexture {
  const atlas = makeTexture(gl, gl.RGBA8, DRIFT_W, SLOT_ROWS + Math.ceil(SLOTS / DRIFT_W), gl.RGBA, gl.UNSIGNED_BYTE);
  const drift = new Uint8Array(Math.ceil(SLOTS / DRIFT_W) * DRIFT_W * 4);
  const fallback = surfaceTexture('grass');
  for (let code = 0; code < 256; code++) {
    const info: TileInfo | undefined = TILES[code];
    for (let wall = 0; wall < 2; wall++) {
      const id = info ? (wall ? info.wall : info.floor) : 'grass';
      const tex = info ? surfaceTexture(id) : fallback;
      const i = code * 2 + wall;
      drift.set(driftTexel(id), i * 4);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % 16) * TEX, Math.floor(i / 16) * TEX, TEX, TEX, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(tex.px.buffer, tex.px.byteOffset, tex.px.byteLength));
    }
  }
  STATE_SURFACES.forEach((id, k) => {
    const tex = surfaceTexture(id);
    const i = STATE_SURFACE_BASE + k;
    drift.set(driftTexel(id), i * 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, (i % 16) * TEX, Math.floor(i / 16) * TEX, TEX, TEX, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(tex.px.buffer, tex.px.byteOffset, tex.px.byteLength));
  });
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, SLOT_ROWS, DRIFT_W, drift.length / 4 / DRIFT_W, gl.RGBA, gl.UNSIGNED_BYTE, drift);
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
vec4 surfRaw(int idx, vec2 uv){ return texelFetch(uSurf, ivec2(idx % 16, idx / 16) * ${TEX} + (ivec2(floor(uv)) & ${TEX - 1}), 0); }
vec3 surfIdx(int idx, vec2 uv){ return surfRaw(idx, uv).rgb; }
// A placed surface at texel uv of the spot 'key' (a cell): every component (region in alpha) drifts in hue, richness and
// lightness on its own, by up to the surface's drift, so like cells differ but read as one kind.
vec3 surf(int mat, bool wall, vec2 uv, vec3 key){
  int idx = mat * 2 + (wall ? 1 : 0); vec4 t = surfRaw(idx, uv);
  vec3 d = texelFetch(uSurf, ivec2(idx % ${DRIFT_W}, ${SLOT_ROWS} + idx / ${DRIFT_W}), 0).rgb * vec3(255.0 / 4.0, 1.0, 1.0);
  vec3 r = fract(sin(vec3(dot(key, vec3(127.1, 311.7, 74.7)) + floor(t.a * 255.0 + 0.5) * 19.19)) * vec3(43758.5453, 22578.1459, 19642.349)) - 0.5;
  float a = radians(r.x * 2.0 * d.x); vec3 k = vec3(0.57735), c = t.rgb * cos(a) + cross(k, t.rgb) * sin(a) + k * dot(k, t.rgb) * (1.0 - cos(a));
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.0 + r.y * 2.0 * d.y);
  return c * (1.0 + r.z * 2.0 * d.z);
}
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
