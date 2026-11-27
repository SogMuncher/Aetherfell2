import { SURFACE_MIX, SURFACE_OUT, SURFACE_SHADER } from './gpuSurfaces';
import { STATE_SHADER } from './gpuStates';
import { SHAPE_SHADER } from './gpuSolid';
import { SHAPE_FINE } from '../../content/shapes';

/** Shader text for GPU structures (docs/GPU-RENDER.md stage 2): each brick's box is rasterised, the pixel walks the cells inside it. */
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
uniform mat4 uVP; uniform vec3 uEye, uFog; uniform float uFogDist; uniform vec2 uTurn; /* a moving frame's turn (cos, sin): normals back to the world */
/* The eye as a whole cell plus the rest, and the view with the eye at 0: the march runs in the brick's own small numbers (a ship's cells sit
   60 km out at the dock, where a float's step is 4 mm: hits, faces and depth came out as noise and rings that crawled as the view moved). */
uniform ivec3 uEyeCell; uniform vec3 uEyeFrac; uniform mat4 uVP0;
uniform vec3 uFwd, uRight, uUp; uniform vec3 uRes; /* x,y = target size, z = tanY */ uniform float uTime; uniform float uRainWet; uniform vec2 uFade; uniform usampler2D uAtlas, uPage, uFine; uniform ivec2 uGrid0;
in vec3 vWorld; flat in vec4 fB0; flat in vec4 fB1; flat in vec4 fB2; layout(location = 0) out vec4 o;
${SURFACE_SHADER}
${STATE_SHADER}
${SURFACE_OUT}
${SHAPE_SHADER}
vec4 rayShape(int byte, vec3 o, vec3 d){
  int n = shapeCount(byte), s = shapeStart(byte);
  float best = 1e9; vec3 bn = vec3(0.0);
  for (int k = 0; k < 4; k++){ if (k >= n) break; float t0, t1; vec3 nn;
    if (!pieceSpan(s + k, o, d, t0, t1, nn) || t1 <= 0.0) continue;
    if (t0 <= 0.0){ t0 = 0.0; nn = vec3(0.0); }
    if (t0 < best){ best = t0; bn = nn; }
  }
  return best >= 1e8 ? vec4(-1.0) : vec4(best, bn);
}
uvec2 cellAt(int slot, ivec3 l){
  return texelFetch(uAtlas, ivec2((slot % 32) * 64 + (l.z & 3) * 16 + l.x, (slot / 32) * 64 + (l.z >> 2) * 16 + l.y), 0).rg;
}
/** Shape and material of fine cell l (0..31 inside the brick) in fine slot fs (FINE_ATLAS layout in gpuStructures). */
uvec2 fineAt(int fs, ivec3 l){
  return texelFetch(uFine, ivec2((fs % 16) * 256 + (l.z & 7) * 32 + l.x, (fs / 16) * 128 + (l.z >> 3) * 32 + l.y), 0).rg;
}
/** A ray through a split cell (l: the cell in its brick, lo: where the ray is in the cell, fn: the face it came in by): walks its 2 × 2 × 2 fine cells. Returns (t in cell units, normal) and the material, or t < 0 on a miss. */
vec4 rayFine(int fs, ivec3 l, vec3 lo, vec3 d, vec3 fn, bool within, out int fm){
  vec3 q = lo * 2.0; ivec3 c = clamp(ivec3(floor(q)), ivec3(0), ivec3(1));
  ivec3 st = ivec3(sign(d)); vec3 inv = 1.0 / d; vec3 tD = abs(inv);
  vec3 tM = vec3(((d.x > 0.0 ? float(c.x + 1) : float(c.x)) - q.x) * inv.x, ((d.y > 0.0 ? float(c.y + 1) : float(c.y)) - q.y) * inv.y, ((d.z > 0.0 ? float(c.z + 1) : float(c.z)) - q.z) * inv.z);
  float tc = 0.0; fm = 0;
  for (int i = 0; i < 4; i++){
    if (any(lessThan(c, ivec3(0))) || any(greaterThan(c, ivec3(1)))) break;
    uvec2 sm = fineAt(fs, l * 2 + c);
    if (sm.x != 0u){
      bool inside = within && i == 0;
      if ((sm.x & 63u) == 1u){ if (!inside){ fm = int(sm.y); return vec4(tc * 0.5, fn); } }
      else {
        vec4 r = rayShape(int(sm.x), clamp(q + d * tc - vec3(c), 0.0, 1.0), d);
        if (r.x > (inside ? 1e-3 : -1.0)){ fm = int(sm.y); return vec4((tc + r.x) * 0.5, (r.y == 0.0 && r.z == 0.0 && r.w == 0.0) ? fn : r.yzw); }
      }
    }
    if (tM.x < tM.y && tM.x < tM.z){ tc = tM.x; c.x += st.x; tM.x += tD.x; fn = vec3(-float(st.x), 0.0, 0.0); }
    else if (tM.y < tM.z){ tc = tM.y; c.y += st.y; tM.y += tD.y; fn = vec3(0.0, -float(st.y), 0.0); }
    else { tc = tM.z; c.z += st.z; tM.z += tD.z; fn = vec3(0.0, 0.0, -float(st.z)); }
  }
  return vec4(-1.0);
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
/** The surface of the cell one step e along a face (one further along the face's own slope if that is empty), drifted for that cell; this cell's own (t) if both are empty. */
vec3 nextFace(ivec3 c, ivec3 e, vec3 n, ivec3 dom, vec3 t, bool wall, vec2 uv){
  float k = dot(n, vec3(e)); ivec3 q = c + e; uvec2 sm = cellWorld(q);
  if (sm.x == 0u && abs(k) > 0.05){ q -= int(sign(k)) * dom; sm = cellWorld(q); }
  return sm.x == 0u ? t : surf(int(sm.y), wall, uv, q);
}
void main(){
  vec2 nd = gl_FragCoord.xy / uRes.xy * 2.0 - 1.0;
  vec3 d = normalize(uFwd + uRight * nd.x * uRes.z * (uRes.x / uRes.y) + uUp * nd.y * uRes.z); 
  ivec3 origin = ivec3(fB2.xyz); vec3 org = vec3(uEyeCell - origin) + uEyeFrac; // everything below is relative to the brick's origin
  vec3 bmin = fB0.xyz - fB2.xyz, bmax = fB1.xyz - fB2.xyz; int slot = int(fB0.w);
  vec3 inv = 1.0 / d; vec3 ta = (bmin - org) * inv, tb = (bmax - org) * inv;
  float tin = max(max(min(ta.x, tb.x), min(ta.y, tb.y)), max(min(ta.z, tb.z), 0.0));
  float tout = min(min(max(ta.x, tb.x), max(ta.y, tb.y)), max(ta.z, tb.z));
  if (tin > tout) discard;
  vec3 p = org + d * (tin + 1e-4);
  ivec3 cell = origin + clamp(ivec3(floor(p)), ivec3(bmin), ivec3(bmax) - 1);
  ivec3 st = ivec3(sign(d)); vec3 tDelta = abs(inv);
  vec3 tMax = (vec3(cell - origin) + vec3(greaterThan(d, vec3(0.0))) - org) * inv;
  float tc = tin; int axis = -1;
  // The box face the ray came in through: a wall flush with the box edge is hit in the very first cell and must not read as a floor.
  vec3 tm = min(ta, tb);
  if (tin > 0.0) axis = (tm.x >= tm.y && tm.x >= tm.z) ? 0 : (tm.y >= tm.z ? 1 : 2);
  bool hit = false; vec3 n = vec3(0.0); float th = 0.0; int mat = 0;
  for (int i = 0; i < 64; i++){
    if (any(lessThan(cell - origin, ivec3(bmin))) || any(greaterThanEqual(cell - origin, ivec3(bmax)))) break;
    uvec2 sm = cellAt(slot, cell - origin);
    if (sm.x != 0u){
      vec3 fn = axis < 0 ? vec3(0.0, 0.0, 1.0) : vec3(0.0); if (axis >= 0) fn[axis] = -float(st[axis]);
      // The eye can sit inside a cell (a wall it brushes, a doorpost): look out of it instead of painting it over the whole view.
      bool within = axis < 0 && all(equal(cell - origin, ivec3(floor(org))));
      if ((sm.x & 63u) == 1u){ if (!within){ hit = true; th = tc; n = fn; mat = int(sm.y); break; } }
      else if ((sm.x & 63u) == ${SHAPE_FINE}u){
        int fs = int(fB1.w) - 1, fm;
        if (fs >= 0){
          vec4 r = rayFine(fs, cell - origin, clamp(org + d * tc - vec3(cell - origin), 0.0, 1.0), d, fn, within, fm);
          if (r.x >= 0.0){ hit = true; th = tc + r.x; n = r.yzw; mat = fm; break; }
        }
      }
      else {
        vec3 lo = clamp(org + d * tc - vec3(cell - origin), 0.0, 1.0);
        vec4 r = rayShape(int(sm.x), lo, d);
        if (r.x > (within ? 1e-3 : -1.0)){ hit = true; th = tc + r.x; n = (r.y == 0.0 && r.z == 0.0 && r.w == 0.0) ? fn : r.yzw; mat = int(sm.y); break; }
      }
    }
    if (tMax.x < tMax.y && tMax.x < tMax.z){ tc = tMax.x; cell.x += st.x; tMax.x += tDelta.x; axis = 0; }
    else if (tMax.y < tMax.z){ tc = tMax.y; cell.y += st.y; tMax.y += tDelta.y; axis = 1; }
    else { tc = tMax.z; cell.z += st.z; tMax.z += tDelta.z; axis = 2; }
  }
  if (!hit) discard;
  vec3 w = vec3(origin) + org + d * th; // the world spot, for texture and patch lookups only (precision-critical math uses d * th)
  // Far buildings dissolve into the ground's own raised blocks (the terrain pass ramps those in over the same band), so a town never pops.
  float away = smoothstep(uFade.x, uFade.y, length(d.xy * th));
  if (away > fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
  // Texture coords, where in its cell this texel is (f, texels per cell tx), the face's two steps to neighbour cells and its normal axis.
  vec2 suv, fc, tx; ivec3 ea, eb, dom; bool wall = abs(n.z) <= 0.6;
  if (!wall) { suv = w.xy * 16.0; fc = fract((floor(suv) + 0.5) / 16.0); tx = vec2(16.0); ea = ivec3(1, 0, 0); eb = ivec3(0, 1, 0); dom = ivec3(0, 0, n.z < 0.0 ? -1 : 1); }
  else {
    bool xFace = abs(n.x) > abs(n.y); float across = xFace ? w.y : w.x; float nh = abs(n.z) > 0.05 ? max(0.35, sqrt(1.0 - n.z * n.z)) : 1.0;
    suv = vec2(across * 16.0, -w.z * 16.0 / nh); fc = vec2(fract((floor(suv.x) + 0.5) / 16.0), fract(-(floor(suv.y) + 0.5) * nh / 16.0)); tx = vec2(16.0, 16.0 / nh);
    ea = xFace ? ivec3(0, 1, 0) : ivec3(1, 0, 0); eb = ivec3(0, 0, 1); dom = xFace ? ivec3(n.x < 0.0 ? -1 : 1, 0, 0) : ivec3(0, n.y < 0.0 ? -1 : 1, 0);
  }
  bool open = !covered(ivec3(floor(vec3(cell) + 0.5 + n * 0.7))); // from the middle of the cell, not the exact pixel, so a wall face is lit evenly
  // Neighbour cells meet by the ground's one edge rule (edgeLean), same material too, so each cell's colour drift fades into the next.
  // Texels per screen pixel from distance and slant (no derivatives: the ray walk differs per pixel).
  surfLodFrom(vec2(th * 32.0 * uRes.z / uRes.y / max(abs(dot(n, d)), 0.2)));
  vec3 col = surf(mat, wall, suv, cell), t0 = col; vec2 lean = edgeLean(fc, tx, ${SURFACE_MIX.cellBlend.toFixed(1)});
  if (lean.x + lean.y > 0.0) {
    ivec3 sa = ea * (fc.x < 0.5 ? -1 : 1), sb = eb * (fc.y < 0.5 ? -1 : 1);
    col = mix(mix(col, nextFace(cell, sa, n, dom, t0, wall, suv), lean.x), mix(nextFace(cell, sb, n, dom, t0, wall, suv), nextFace(cell, sa + sb, n, dom, t0, wall, suv), lean.x), lean.y);
  }
  col = surfPatches(col, w.xy + w.z * vec2(1.7, -1.3), th);
  // What has happened to this cell (the same matter states the sim's rules use), blended over its own surface.
  vec3 glow = vec3(0.0);
  col = blendStates(col, ivec2((slot % 32) * 64 + (cell.z - origin.z & 3) * 16 + (cell.x - origin.x), (slot / 32) * 64 + ((cell.z - origin.z) >> 2) * 16 + (cell.y - origin.y)), suv, open ? uRainWet : 0.0, 0.75 + 0.25 * sin(uTime * 40.0 + float(cell.x) * 1.7 + float(cell.y) * 2.3 + float(cell.z)), glow);
  surfaceOut(col, vec3(uTurn.x * n.x - uTurn.y * n.y, uTurn.y * n.x + uTurn.x * n.y, n.z), 1.0, surfShine);
  float f = min(0.97, 1.0 - exp(-th / uFogDist));
  o = vec4(col * glow * (1.0 - f) + uFog * f, 1.0);
  vec4 cp = uVP0 * vec4(d * th, 1.0); gl_FragDepth = (cp.z / cp.w) * 0.5 + 0.5;
}`;
