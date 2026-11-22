/**
 * Matter states (soot, wet, oil, frost, fire…) blended over the GPU's ground, tile walls and 3D cells. Every pass that
 * draws stuff keeps the states of what it draws in a `sampler2DArray uState` (four states per RGBA layer, SHOWN_STATES
 * order) and calls `blendStates` from STATE_SHADER; the looks come from content/matterStates.ts as uniform arrays.
 * The stuff's own surface is always drawn underneath, so a state that fades leaves it exactly as it was.
 */
import { SHOWN_STATES, type ShownState } from '../../types';
import { LOOKS, STATE_COUNT, STATE_LAYERS } from '../stateLooks';
import { loc } from './glUtil';
import { STATE_SURFACE_BASE } from './gpuSurfaces';

export { STATE_COUNT, STATE_LAYERS };

/** GLSL: needs SURFACE_SHADER (surfIdx) before it. `at` is the texel of the spot in uState. */
export const STATE_SHADER = `
#define STATES ${STATE_COUNT}
uniform highp sampler2DArray uState;
uniform vec3 uStShade[STATES]; uniform vec4 uStCover[STATES]; uniform int uStSurf[STATES]; uniform vec2 uStGlint[STATES]; uniform vec3 uStGlow[STATES]; uniform float uStRain[STATES];
float stHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// Blends every state of the spot over its colour (uv = its surface coordinates, rain = how much rain falls on it) and adds the
// light the states give off to glow (flick = flame flicker 0..1).
vec3 blendStates(vec3 col, ivec2 at, vec2 uv, float rain, float flick, inout vec3 glow){
  float speck = stHash(floor(uv * 0.5));
  for (int i = 0; i < STATES; i++){
    float w = min(1.0, texelFetch(uState, ivec3(at, i / 4), 0)[i % 4] + rain * uStRain[i]);
    if (w <= 0.0) continue;
    col *= mix(vec3(1.0), uStShade[i], w);
    if (uStCover[i].a > 0.0) col = mix(col, uStSurf[i] >= 0 ? surfIdx(${STATE_SURFACE_BASE} + uStSurf[i], uv) : uStCover[i].rgb, w * uStCover[i].a);
    if (speck > 1.0 - uStGlint[i].x) col += uStGlint[i].y * w;
    glow += uStGlow[i] * w * flick;
  }
  return col;
}`;

/** Sends the state looks to a program that includes STATE_SHADER (and binds its uState to texture `unit`). */
export function bindStateLooks(gl: WebGL2RenderingContext, p: WebGLProgram, unit: number): void {
  gl.uniform1i(loc(gl, p, 'uState'), unit);
  gl.uniform3fv(loc(gl, p, 'uStShade'), LOOKS.shade);
  gl.uniform4fv(loc(gl, p, 'uStCover'), LOOKS.cover);
  gl.uniform1iv(loc(gl, p, 'uStSurf'), LOOKS.surface);
  gl.uniform2fv(loc(gl, p, 'uStGlint'), LOOKS.glint);
  gl.uniform3fv(loc(gl, p, 'uStGlow'), LOOKS.glow);
  gl.uniform1fv(loc(gl, p, 'uStRain'), LOOKS.rain);
}

/**
 * Copies spot `i` of a store with one array per state (a chunk, a brick's matter) into texel `t` of a layer-major RGBA
 * buffer whose layers are `layer` texels apart. Says whether any state is set there.
 */
export function packStates(from: Readonly<Record<ShownState, ArrayLike<number>>>, i: number, out: Uint8Array, t: number, layer: number): boolean {
  let any = 0;
  for (let s = 0; s < STATE_COUNT; s++) {
    const v = from[SHOWN_STATES[s] as ShownState][i] ?? 0;
    out[((s >> 2) * layer + t) * 4 + (s & 3)] = v;
    any |= v;
  }
  return any !== 0;
}

/** Clears texel `t` in every layer. */
export function clearStates(out: Uint8Array, t: number, layer: number): void {
  for (let s = 0; s < STATE_LAYERS * 4; s++) out[((s >> 2) * layer + t) * 4 + (s & 3)] = 0;
}
