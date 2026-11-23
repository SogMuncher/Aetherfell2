/** One shared texture atlas of every tile code's floor and wall surface (and the surfaces matter states cover things with), painted from material data (procedural textures from render/materials). */
import type { TileInfo } from '../../types';
import { TILES } from '../../content/tiles';
import { SURFACE_DRIFT, SURFACES } from '../../content/surfaces';
import { surfaceTexture, TEX } from '../materials';
import { makeTexture } from './glUtil';
import { STATE_SURFACES } from '../stateLooks';

/**
 * How surfaces mix: `blend` texels to either side of a ground tile edge, `cellBlend` for 3D cells (same and different kinds alike),
 * `lods` halvings of detail with distance,
 * soft `patchSize` m patches of `patchShade` brightness and `patchWarm` warmth, gone by `patchFade` m.
 */
export const SURFACE_MIX = { blend: 5, cellBlend: 2, lods: 4, patchSize: 6, patchShade: 0.12, patchWarm: 0.06, patchFade: [60, 260] } as const;

/** Atlas slot of the first surface matter states cover things with (render/stateLooks.ts STATE_SURFACES), after every tile's two. */
export const STATE_SURFACE_BASE = 512;

/** Atlas rows of surface pictures; below them one texel per slot (16 * TEX per row) holds that surface's drift. */
const SLOT_ROWS = (32 + Math.ceil(STATE_SURFACES.length / 16)) * TEX;
const DRIFT_W = 16 * TEX;
const SLOTS = STATE_SURFACE_BASE + STATE_SURFACES.length;

/** A surface's drift packed in one texel: hue (degrees * 4), sat, light (shares * 255), and whether it may spin per cell. */
function driftTexel(id: string): number[] {
  const d = { ...SURFACE_DRIFT, ...SURFACES[id]?.drift };
  return [Math.min(255, d.hue * 4), Math.min(255, d.sat * 255), Math.min(255, d.light * 255), SURFACES[id]?.spin ? 255 : 0].map(Math.round);
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
  // Detail levels: slots are TEX-aligned, so each halving stays inside its own slot down to one texel.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, SURFACE_MIX.lods);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
  gl.generateMipmap(gl.TEXTURE_2D);
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
// Detail level for the surfaces this pixel draws: 0 = full 16x16, each level up halves (mips of the atlas), so far
// surfaces show their average instead of shimmering. A pass sets it once per pixel from its texel footprint.
int surfLod = 0;
void surfLodFrom(vec2 texelsPerPixel){ surfLod = clamp(int(floor(log2(max(max(texelsPerPixel.x, texelsPerPixel.y), 1.0)) + 0.4)), 0, ${SURFACE_MIX.lods}); }
uvec3 surfPcg(uvec3 v){ v = v * 1664525u + 1013904223u; v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y; return v; }
/** Three steady randoms 0..1 for an integer spot (no sin, so far from the origin they never band). */
vec3 surfRand(ivec3 k){ return vec3(surfPcg(uvec3(k)) >> 8u) / 16777216.0; }
vec4 surfAt(int idx, ivec2 p, int lod){ int n = ${TEX} >> lod; return texelFetch(uSurf, ivec2(idx % 16, idx / 16) * n + ((p >> lod) & (n - 1)), lod); }
vec3 surfIdx(int idx, vec2 uv){ return surfAt(idx, ivec2(floor(uv)), surfLod).rgb; }
// A placed surface at texel uv of the spot 'key' (a cell). A surface that may spin is turned and mirrored per cell; every
// component (region in alpha) drifts in hue, richness and lightness on its own, by up to the surface's drift, so like
// cells differ but read as one kind.
vec3 surf(int mat, bool wall, vec2 uv, ivec3 key){
  int idx = mat * 2 + (wall ? 1 : 0);
  vec4 d = texelFetch(uSurf, ivec2(idx % ${DRIFT_W}, ${SLOT_ROWS} + idx / ${DRIFT_W}), 0) * vec4(255.0 / 4.0, 1.0, 1.0, 1.0);
  ivec2 p = ivec2(floor(uv)) & ${TEX - 1};
  if (d.a > 0.5) { uint b = surfPcg(uvec3(key + 7)).x; if ((b & 4u) != 0u) p.x = ${TEX - 1} - p.x; for (uint q = 0u; q < (b & 3u); q++) p = ivec2(${TEX - 1} - p.y, p.x); }
  vec4 t = surfAt(idx, p, surfLod); float region = surfLod > 0 ? 0.0 : floor(surfAt(idx, p, 0).a * 255.0 + 0.5);
  vec3 r = surfRand(ivec3(key.xy, key.z * 64 + int(region))) - 0.5;
  float a = radians(r.x * 2.0 * d.x); vec3 k = vec3(0.57735), c = t.rgb * cos(a) + cross(k, t.rgb) * sin(a) + k * dot(k, t.rgb) * (1.0 - cos(a));
  c = mix(vec3(dot(c, vec3(0.299, 0.587, 0.114))), c, 1.0 + r.y * 2.0 * d.y);
  return c * (1.0 + r.z * 2.0 * d.z);
}
// The one edge rule (ground tiles and 3D cells): at fraction f of a cell that is 'texels' texels across on each axis, how much this
// texel leans to its x and y neighbour. Half and half on the edge, 'width' texels to either side (SURFACE_MIX), centres stay pure.
vec2 edgeLean(vec2 f, vec2 texels, float width){ return max(vec2(0.0), 0.5 - 0.5 * min(f, 1.0 - f) * texels / width); }
float surfNoise(vec2 p, int salt){ ivec2 i = ivec2(floor(p)); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(surfRand(ivec3(i, salt)).x, surfRand(ivec3(i + ivec2(1, 0), salt)).x, f.x), mix(surfRand(ivec3(i + ivec2(0, 1), salt)).x, surfRand(ivec3(i + 1, salt)).x, f.x), f.y); }
// Soft patches across the world (lighter/darker, warmer/cooler) so one surface never repeats the same; fades out far away.
vec3 surfPatches(vec3 col, vec2 p, float dist){
  float k = 1.0 - smoothstep(${SURFACE_MIX.patchFade[0].toFixed(1)}, ${SURFACE_MIX.patchFade[1].toFixed(1)}, dist); p /= ${SURFACE_MIX.patchSize.toFixed(1)};
  float s = surfNoise(p, 1) * 0.65 + surfNoise(p * 2.7, 2) * 0.35, w = surfNoise(p * 0.6, 3);
  return col * (1.0 + (s - 0.5) * ${(2 * SURFACE_MIX.patchShade).toFixed(3)} * k) * (1.0 + (w - 0.5) * ${(2 * SURFACE_MIX.patchWarm).toFixed(3)} * k * vec3(1.0, 0.3, -1.0));
}`;
