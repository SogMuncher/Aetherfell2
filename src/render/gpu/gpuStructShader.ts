import { SURFACE_OUT, SURFACE_SHADER } from './gpuSurfaces';
import { STATE_SHADER } from './gpuStates';

/** Shader text for GPU structures (docs/GPU-RENDER.md stage 2): each brick's box is rasterised, the pixel walks the cells inside it. */
export const PIECE_FLOATS = 23;
export const GRID = { win: 11, zLow: 2, zCount: 14 } as const;
const GW = GRID.win * 2 + 1;

export const STRUCT_VS = `#version 300 es
uniform mat4 uVP; uniform vec3 uEye;
in vec3 aCorner; in vec4 aB0; in vec4 aB1; in vec4 aB2;
out vec3 vWorld; flat out vec4 fB0; flat out vec4 fB1; flat out vec4 fB2;
void main(){
  vec3 p = mix(aB0.xyz, aB1.xyz, aCorner);
  vWorld = p; fB0 = aB0; fB1 = aB1; fB2 = aB2; gl_Position = uVP * vec4(p, 1.0);
  // Eye inside the brick's box: the box walls would be clipped by the near plane, so cover the whole screen instead.
  if (all(greaterThan(uEye, aB0.xyz - 0.5)) && all(lessThan(uEye, aB1.xyz + 0.5))) { gl_Position = vec4(aCorner.x * 2.0 - 1.0, aCorner.y * 2.0 - 1.0, 0.0, 1.0); }
}`;

export const STRUCT_FS = `#version 300 es
precision highp float; precision highp int; precision highp usampler2D;
uniform mat4 uVP; uniform vec3 uEye, uFog; uniform float uFogDist;
uniform vec3 uFwd, uRight, uUp; uniform vec3 uRes; /* x,y = target size, z = tanY */ uniform float uTime; uniform float uRainWet; uniform vec2 uFade; uniform usampler2D uAtlas, uPage; uniform sampler2D uPieces, uShapeIdx; uniform ivec2 uGrid0;
in vec3 vWorld; flat in vec4 fB0; flat in vec4 fB1; flat in vec4 fB2; layout(location = 0) out vec4 o;
${SURFACE_SHADER}
${STATE_SHADER}
${SURFACE_OUT}
float P(int pc, int k){ return texelFetch(uPieces, ivec2(k, pc), 0).r; }
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec4 rayShape(int byte, vec3 o, vec3 d){
  int n = int(texelFetch(uShapeIdx, ivec2(byte, 1), 0).r); int s = int(texelFetch(uShapeIdx, ivec2(byte, 0), 0).r);
  float best = 1e9; vec3 bn = vec3(0.0);
  for (int k = 0; k < 4; k++){ if (k >= n) break; int pc = s + k;
    float t0 = 0.0, t1 = 1e9; vec3 nn = vec3(0.0); bool miss = false;
    for (int a = 0; a < 3; a++){
      float oo = o[a], dd = d[a], lo = P(pc, a), hi = P(pc, 3 + a);
      if (abs(dd) < 1e-9){ if (oo < lo || oo > hi) miss = true; continue; }
      float ta = (lo - oo) / dd, tb = (hi - oo) / dd; if (ta > tb){ float x = ta; ta = tb; tb = x; }
      if (ta > t0){ t0 = ta; nn = vec3(0.0); nn[a] = dd > 0.0 ? -1.0 : 1.0; }
      if (tb < t1) t1 = tb;
    }
    if (miss) continue;
    int cuts = int(P(pc, 6));
    for (int c = 0; c < 4; c++){ if (c >= cuts) break; int b = 7 + c * 4;
      vec3 cn = vec3(P(pc, b), P(pc, b + 1), P(pc, b + 2)); float cd = P(pc, b + 3);
      float den = dot(cn, d), num = cd - dot(cn, o);
      if (abs(den) < 1e-9){ if (num < 0.0) miss = true; continue; }
      float t = num / den;
      if (den < 0.0){ if (t > t0){ t0 = t; nn = normalize(cn); } } else if (t < t1) t1 = t;
    }
    if (miss || t0 > t1 || t1 <= 0.0) continue;
    if (t0 < best){ best = t0; bn = nn; }
  }
  return best >= 1e8 ? vec4(-1.0) : vec4(best, bn);
}
uvec2 cellAt(int slot, ivec3 l){
  return texelFetch(uAtlas, ivec2((slot % 32) * 64 + (l.z & 3) * 16 + l.x, (slot / 32) * 64 + (l.z >> 2) * 16 + l.y), 0).rg;
}
int fdiv(int a, int b){ return (a - (((a % b) + b) % b)) / b; }
/** Shape and material of the world cell q (0 shape = empty or not loaded), whichever brick holds it. */
uvec2 cellWorld(ivec3 q){
  ivec3 g = ivec3(fdiv(q.x, 16) - uGrid0.x, fdiv(q.y, 16) - uGrid0.y, fdiv(q.z, 16) + ${GRID.zLow});
  if (g.x < 0 || g.y < 0 || g.x >= ${GW} || g.y >= ${GW} || g.z < 0 || g.z >= ${GRID.zCount}) return uvec2(0u);
  int slot = int(texelFetch(uPage, ivec2(g.y * ${GW} + g.x, g.z), 0).r);
  return slot > 0 ? cellAt(slot - 1, ivec3(q.x & 15, q.y & 15, q.z & 15)) : uvec2(0u);
}
/** Is there anything solid in this cell or straight above it, so the sun cannot reach? */
bool covered(ivec3 c){
  for (int k = 0; k <= 24; k++) if (cellWorld(c + ivec3(0, 0, k)).r != 0u) return true;
  return false;
}
/** The surface of the cell one step e along a face (one further along the face's own slope if that is empty), times that cell's tint; this cell's if both are empty. */
vec3 nextFace(ivec3 c, ivec3 e, vec3 n, ivec3 dom, int own, vec3 t, float tint, bool wall, vec2 uv){
  float k = dot(n, vec3(e)); ivec3 q = c + e; uvec2 sm = cellWorld(q);
  if (sm.x == 0u && abs(k) > 0.05){ q -= int(sign(k)) * dom; sm = cellWorld(q); }
  if (sm.x == 0u) return t * tint;
  return (int(sm.y) == own ? t : surf(int(sm.y), wall, uv)) * (0.93 + 0.14 * h3(vec3(q)));
}
void main(){
  vec2 nd = gl_FragCoord.xy / uRes.xy * 2.0 - 1.0;
  vec3 d = normalize(uFwd + uRight * nd.x * uRes.z * (uRes.x / uRes.y) + uUp * nd.y * uRes.z); vec3 org = uEye;
  vec3 bmin = fB0.xyz, bmax = fB1.xyz; int slot = int(fB0.w); ivec3 origin = ivec3(fB2.xyz);
  vec3 inv = 1.0 / d; vec3 ta = (bmin - org) * inv, tb = (bmax - org) * inv;
  float tin = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), max(min(ta.z, tb.z), 0.0));
  float tout = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
  if (tin > tout) discard;
  vec3 p = org + d * (tin + 1e-4);
  ivec3 cell = clamp(ivec3(floor(p)), ivec3(bmin), ivec3(bmax) - 1);
  ivec3 st = ivec3(sign(d)); vec3 tDelta = abs(inv);
  vec3 tMax = vec3(((d.x > 0.0 ? float(cell.x + 1) : float(cell.x)) - org.x) * inv.x, ((d.y > 0.0 ? float(cell.y + 1) : float(cell.y)) - org.y) * inv.y, ((d.z > 0.0 ? float(cell.z + 1) : float(cell.z)) - org.z) * inv.z);
  float tc = tin; int axis = -1;
  // The box face the ray came in through: a wall flush with the box edge is hit in the very first cell and must not read as a floor.
  vec3 tm = min(ta, tb);
  if (tin > 0.0) axis = (tm.x >= tm.y && tm.x >= tm.z) ? 0 : (tm.y >= tm.z ? 1 : 2);
  bool hit = false; vec3 n = vec3(0.0); float th = 0.0; int mat = 0;
  for (int i = 0; i < 64; i++){
    if (any(lessThan(cell, ivec3(bmin))) || any(greaterThanEqual(cell, ivec3(bmax)))) break;
    uvec2 sm = cellAt(slot, cell - origin);
    if (sm.x != 0u){
      vec3 fn = axis < 0 ? vec3(0.0, 0.0, 1.0) : vec3(0.0); if (axis >= 0) fn[axis] = -float(st[axis]);
      // The eye can sit inside a cell (a wall it brushes, a doorpost): look out of it instead of painting it over the whole view.
      bool within = axis < 0 && all(equal(cell, ivec3(floor(org))));
      if ((sm.x & 63u) == 1u){ if (!within){ hit = true; th = tc; n = fn; mat = int(sm.y); break; } }
      else {
        vec3 lo = clamp(org + d * tc - vec3(cell), 0.0, 1.0);
        vec4 r = rayShape(int(sm.x), lo, d);
        if (r.x > (within ? 1e-3 : -1.0)){ hit = true; th = tc + r.x; n = (r.y == 0.0 && r.z == 0.0 && r.w == 0.0) ? fn : r.yzw; mat = int(sm.y); break; }
      }
    }
    if (tMax.x < tMax.y && tMax.x < tMax.z){ tc = tMax.x; cell.x += st.x; tMax.x += tDelta.x; axis = 0; }
    else if (tMax.y < tMax.z){ tc = tMax.y; cell.y += st.y; tMax.y += tDelta.y; axis = 1; }
    else { tc = tMax.z; cell.z += st.z; tMax.z += tDelta.z; axis = 2; }
  }
  if (!hit) discard;
  vec3 w = org + d * th;
  // Far buildings dissolve into the ground's own raised blocks (the terrain pass ramps those in over the same band), so a town never pops.
  float away = smoothstep(uFade.x, uFade.y, length(w.xy - uEye.xy));
  if (away > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
  // Texture coords, where in its cell this texel is (f, texels per cell tx), the face's two steps to neighbour cells and its normal axis.
  vec2 suv, f, tx; ivec3 ea, eb, dom; bool wall = abs(n.z) <= 0.6;
  if (!wall) { suv = w.xy * 16.0; f = fract((floor(suv) + 0.5) / 16.0); tx = vec2(16.0); ea = ivec3(1, 0, 0); eb = ivec3(0, 1, 0); dom = ivec3(0, 0, n.z < 0.0 ? -1 : 1); }
  else {
    bool xFace = abs(n.x) > abs(n.y); float across = xFace ? w.y : w.x; float nh = abs(n.z) > 0.05 ? max(0.35, sqrt(1.0 - n.z * n.z)) : 1.0;
    suv = vec2(across * 16.0, -w.z * 10.0 / nh); f = vec2(fract((floor(suv.x) + 0.5) / 16.0), fract(-(floor(suv.y) + 0.5) * nh / 10.0)); tx = vec2(16.0, 10.0 / nh);
    ea = xFace ? ivec3(0, 1, 0) : ivec3(1, 0, 0); eb = ivec3(0, 0, 1); dom = xFace ? ivec3(n.x < 0.0 ? -1 : 1, 0, 0) : ivec3(0, n.y < 0.0 ? -1 : 1, 0);
  }
  bool open = !covered(ivec3(floor(vec3(cell) + 0.5 + n * 0.7))); // from the middle of the cell, not the exact pixel, so a wall face is lit evenly
  float tint = 0.93 + 0.14 * h3(vec3(cell));
  // Neighbour cells meet by the ground's one edge rule (edgeLean), same material too, so each cell's tint fades into the next.
  vec3 t0 = surf(mat, wall, suv), col = t0 * tint; vec2 lean = edgeLean(f, tx);
  if (lean.x + lean.y > 0.0) {
    ivec3 sa = ea * (f.x < 0.5 ? -1 : 1), sb = eb * (f.y < 0.5 ? -1 : 1);
    col = mix(mix(col, nextFace(cell, sa, n, dom, mat, t0, tint, wall, suv), lean.x), mix(nextFace(cell, sb, n, dom, mat, t0, tint, wall, suv), nextFace(cell, sa + sb, n, dom, mat, t0, tint, wall, suv), lean.x), lean.y);
  }
  col = surfPatches(col, w.xy + w.z * vec2(1.7, -1.3), length(w - uEye));
  // What has happened to this cell (the same matter states the sim's rules use), blended over its own surface.
  vec3 glow = vec3(0.0);
  col = blendStates(col, ivec2((slot % 32) * 64 + (cell.z - origin.z & 3) * 16 + (cell.x - origin.x), (slot / 32) * 64 + ((cell.z - origin.z) >> 2) * 16 + (cell.y - origin.y)), suv, open ? uRainWet : 0.0, 0.75 + 0.25 * sin(uTime * 40.0 + float(cell.x) * 1.7 + float(cell.y) * 2.3 + float(cell.z)), glow);
  surfaceOut(col, n, 1.0);
  float f = min(0.97, 1.0 - exp(-length(w - uEye) / uFogDist));
  o = vec4(col * glow * (1.0 - f) + uFog * f, 1.0);
  vec4 cp = uVP * vec4(w, 1.0); gl_FragDepth = (cp.z / cp.w) * 0.5 + 0.5;
}`;
