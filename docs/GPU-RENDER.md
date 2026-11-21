# GPU rendering plan (WebGL2, one pipeline)

**Why:** terrain, sky/clouds and 3D structures are ~90% of CPU frame time (`scripts/frameProfile.ts`). Goal: ALL drawing on the GPU,
one pass list, one shared depth buffer, same retro look. Render stays read-only on sim state; sim never sees GPU types.
**Status:** stages 1-2 done, stage 3 (tile walls, billboards, light grid, particles, rain, held item) done. Switch: Video > 'Graphics engine' (Classic / Graphics card). F3 shows `gpu` ms.
Gaps: no sprites/creatures/trees, particles, held item, rain, water look, aurora; grit is a shader speckle, not the
material atlas yet; clouds use a shader noise, not the CPU pattern; structures are lit by sun + cover only (no torch/fire/wet/soot yet, stage 3 adds lights); tile-built villages and the underworld halls still draw only as coloured land/sky.

## Look is kept
- Render target = today's low-res size (`Viewport`, `AdaptiveRes` still pick the line count; the target is just resized). Shown with nearest scaling.
- Last pass = palette quantise + ordered dither + vignette (today's `post/`) as a fullscreen shader; colour levels, hurt/underwater tints stay uniforms.
- Surfaces use procedural textures from material data: `materials/textures.ts` paints each tile surface once into a **texture atlas** (CPU, cached), shaders only sample.
- No external art, no polygon models: held item stays a perspective-warped sprite quad.

## Data uploaded (render reads sim, copies into textures; sim untouched)
| Data | GPU form | Update |
| --- | --- | --- |
| Live chunk ground + water level + tile kind | R32F height tile + RG8 material/wet tile per 32x32 chunk, in one array texture | on `tileChanged` / chunk load only |
| Far land (LOD pyramid, `terrainLod.ts`) | coarser height/colour mips, same mesh path | when cache block built |
| 3D bricks (`state.volume`, 16^3) | 3D texture pages (shape byte + material byte), page table texture | on `volumeChanged` per brick |
| Sprites (creatures, props, items, tile billboards) | one RGBA atlas (+ palette-region mask for `@palette` fill) | when a sprite is first built |
| Lights (`lighting.ts` point lights) | uniform block, nearest N | per frame |
| Particles | one instanced quad buffer | per frame |

## Pass order (one depth buffer)
1. Sky dome: gradient, sun/moon/stars, ray-marched cloud slabs from `sky.ts` maths in a fragment shader (depth 1.0, far plane).
2. Terrain + water: near live chunks as a displaced grid (vertex shader fetches height); far LOD rings as coarser grids. Water = flat quad per level with depth fade, refraction-style dither.
3. Structures: brick pages ray-marched in a fragment shader over the bounding boxes of loaded bricks, writing `gl_FragDepth`.
4. Sprites: instanced billboards, discard on alpha (dithered), depth-tested, tinted by light + hit flash.
5. Particles, rain streaks: instanced additive/alpha quads, depth-tested no write.
6. Held item: sprite quad drawn with depth cleared (always on top), same lighting.
7. Fog + ambient air: depth-based fog in each shader (`1-exp(-d/fogDist)`, colour from `Env`); **air motes** (dust, pollen, ash) as particles in a camera-local box, count/colour/drift from data per biome and realm (`RealmDef`, biome tables), cheap depth cue.
8. Post: quantise/dither/vignette, then present. HTML HUD (`ui/`) stays DOM on top.

## Fallback
If WebGL2 is missing or context creation fails (headless checks, old browsers): `Renderer` keeps the existing CPU path until the final stage is verified; afterwards a small software fallback is NOT kept (WebGL2 is near-universal). Smokes that render headless use a stub; shader maths shared with CPU lives in plain TS so tests still run.

## Risks
- Precision: 7 km view needs log or reversed depth; spike uses plain 24-bit, to be proven at 7 km.
- Terrain look differs (column marcher vs mesh): LOD seams, tall trees (billboards) and slopes need tuning.
- Ray-marched structures cost fill rate at 360 lines; keep per-brick bounds and early exit.
- Re-uploads when chunks stream: budget per frame, ring-buffer pages.
- Guests/net: only reads replicated state, no change needed.
- Floating-point differences make GPU output non-deterministic vs CPU shots; art smokes need tolerance.

## Staged port (one PR each, CPU renderer kept until stage 4 passes)
1. Terrain + sky + post: `GpuRenderer` skeleton, chunk textures, LOD rings, clouds, fog, air motes, dither pass; setting switches old/new.
2. Structures: brick textures + ray-march, shared depth with terrain.
3. Sprites, particles, rain, held item: atlas, instanced quads, lighting uniforms.
4. Water + final fog/polish; make GPU the default, delete CPU raycasters, update docs/CODE-MAP.
Each stage: `tsc`, `artSmoke`/`skySmoke` equivalents, `frameProfile` ms before/after in the PR.

## Parity checklist (every Classic visual; all must be ticked before stage 4 deletes the CPU renderer)
Done = works on the GPU path. Sock's rule: procedural textures, lighting and effects must all carry over.
- [x] Low-res target, adaptive pixel size, colour levels, dither, vignette, hurt/underwater/downed tints
- [x] Depth fog; sky gradient, sun, moon, stars, cloud layers (shader noise, shapes differ), lightning flash
- [x] Terrain from LOD pyramid out to 7 km, changes (burns, frozen lakes) via LOD overlays
- [x] Procedural tile textures on near ground (stage 2 fix); far ground colour from LOD
- [x] 3D structures with shapes, material textures, sun/cover light; air motes
- [x] Terrain wet / soot / oil / fire glow shading and rain wetness (live cell state texture; Classic shows no wear on ground)
- [x] Cloud shadows on land (`cloudShadow.ts` grid as a texture); [x] aurora
- [x] Tile walls, posts, windows, doors as boxes from tile data (village/ruin buildings, `gpuTileBlocks.ts`)
- [x] Tile billboards (trees, bushes, rocks) near the eye; [x] canopy and far buildings raised from LOD (`lift`, `canopy`; treetops rise in with distance)
- [x] No pop-in at the edge of the real structures: buildings dissolve (dither) over the last 36 m of `GPU_STRUCT.range` while the ground raises the same buildings from `lift` over that band
- [x] Water look (sky-tinted, glints, flat light) and distant fire glow; [x] depth fade and river/lake heights come from the LOD block (same data as Classic), water colour matched
- [x] Structures show correctly from inside (changed bricks re-uploaded, new ones first; a brick whose box holds the eye is drawn as a full-screen cover with rays built from the pixel, because box walls next to the eye got clipped and walls vanished)
- [x] Structure cell state: wet, fire glow, oil sheen, soot (a state atlas beside the brick atlas); doors are shape cells so they re-upload like any change
- [x] Point lights: the CPU light grid is a texture used by land, tile walls, structures and sprites (torches, fire, spells, lamps)
- [x] Sprites: creatures, props, items, hit flash, palette fill, dither fade, depth-tested (art still built on the CPU)
- [x] Particles and spell looks from rune `look` data (CPU simulates, GPU draws); rain streaks, stops under roofs; [x] rain splashes (they are particles, drawn with the rest)
- [x] Held item (painted by `ViewModel` into a buffer, composited on top), swing/bob/shake
- [x] Underworld halls and the realm dark/fog look (checked: flagstones, torch-lit crates)
- [x] Guest/net view, saves unaffected (render stays read-only; `coopSmoke` passes)
- [x] Headless smokes (`artSmoke`, `skySmoke`, `coopSmoke`, `frameProfile`) still run
