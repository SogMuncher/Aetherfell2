# GPU rendering (WebGL2, the only renderer)

**What:** ALL drawing on the GPU, one pass list, one shared depth buffer, retro look. Render stays read-only on sim state;
sim never sees GPU types. The old CPU (Classic) renderer is gone. F3 shows `gpu` ms.

## Look is kept
- Render target = the low-res size (`Viewport`, `AdaptiveRes` pick the line count). Shown with nearest scaling.
- Last pass = palette quantise + ordered dither + vignette as a fullscreen shader (`gpuPost.ts`); colour levels, hurt/underwater tints stay uniforms.
- Surfaces use procedural textures from material data: `materials/textures.ts` paints each tile surface once into a **texture atlas** (CPU, cached), shaders only sample.
- No external art, no polygon models: held item stays a perspective-warped sprite quad.

## Data uploaded (render reads sim, copies into textures; sim untouched)
| Data | GPU form | Update |
| --- | --- | --- |
| Live chunk ground + water level + tile kind | R32F height tile + RG8 material/wet tile per 32x32 chunk, in one array texture | on `tileChanged` / chunk load only |
| Far land (LOD pyramid, `terrainLod.ts`) | coarser height/colour mips, same mesh path | when cache block built |
| 3D bricks (`state.volume`, 16^3) | 3D texture pages (shape byte + material byte), page table texture | on `volumeChanged` per brick |
| Sprites (creatures, props, items, tile billboards) | one RGBA atlas (+ palette-region mask for `@palette` fill) | when a sprite is first built |
| Lights (`LightMap.lights`: thing/spell/held light, realm lamp, `fire` state light) | RGBA32F list per 4 m square, nearest 16 | per frame |
| What blocks light (tile walls, closed doors, 3D cells, ground heights) | 96x96x48 m R8 solid field + height grid (`gpuSolid.ts`) | on a step / 3D change / every 12 frames |
| Particles | one instanced quad buffer | per frame |

## Pass order (one depth buffer)
1. Sky dome: gradient, sun/moon/stars, ray-marched cloud slabs (depth 1.0, far plane).
2. Terrain + water: near live chunks as a displaced grid (vertex shader fetches height); far LOD rings as coarser grids. Water = flat quad per level with depth fade, refraction-style dither.
3. Structures: brick pages ray-marched in a fragment shader over the bounding boxes of loaded bricks, writing `gl_FragDepth`.
4. Sprites: instanced billboards, discard on alpha (dithered), depth-tested, tinted by light + hit flash.
5. Particles, rain streaks: instanced additive/alpha quads, depth-tested no write.
6. Held item: sprite quad drawn with depth cleared (always on top), same lighting.
7. Fog + ambient air: depth-based fog in each shader (`1-exp(-d/fogDist)`, colour from `Env`); **air motes** (dust, pollen, ash) as particles in a camera-local box, count/colour/drift from data per biome and realm (`RealmDef`, biome tables), cheap depth cue.
8. Post: quantise/dither/vignette, then present. HTML HUD (`ui/`) stays DOM on top.

## Fallback
If WebGL2 is missing, nothing is drawn and the console says the game needs WebGL2.

## Risks
- Precision: 7 km view needs log or reversed depth; spike uses plain 24-bit, to be proven at 7 km.
- Terrain look differs (column marcher vs mesh): LOD seams, tall trees (billboards) and slopes need tuning.
- Ray-marched structures cost fill rate at 360 lines; keep per-brick bounds and early exit.
- Re-uploads when chunks stream: budget per frame, ring-buffer pages.
- Guests/net: only reads replicated state, no change needed.

## What it draws
- Low-res target, adaptive pixel size, colour levels, dither, vignette, hurt/underwater/downed tints
- Depth fog; sky gradient, sun, moon, stars, cloud layers (shader noise, shapes differ), lightning flash
- Terrain from LOD pyramid out to 7 km, changes (burns, frozen lakes) via LOD overlays
- Procedural tile textures on near ground (stage 2 fix); far ground colour from LOD
- 3D structures with shapes, material textures, sun/cover light; air motes
- Terrain wet / soot / oil / fire glow shading and rain wetness (live cell state texture)
- Cloud shadows on land (`cloudShadow.ts` grid as a texture); aurora
- Tile walls, posts, windows, doors as boxes from tile data (village/ruin buildings, `gpuTileBlocks.ts`)
- Tile billboards (trees, bushes, rocks) near the eye; canopy and far buildings raised from LOD (`lift`, `canopy`; treetops rise in with distance)
- Clouds and mist: one grid of air cells every sky layer writes into (`render/airCells.ts`), LOD levels out to 40 km, walked per pixel nearest first, outside faces shaded, cut at the nearest surface (`gpuClouds.ts`); standing in cloud or mist fogs the view (`env.ts`, same rule)
- No pop-in at the edge of the real structures: buildings dissolve (dither) over the last 36 m of `GPU_STRUCT.range` while the ground raises the same buildings from `lift` over that band
- Water look (sky-tinted, glints, flat light) and distant fire glow; depth fade and river/lake heights come from the LOD block
- Structures show correctly from inside (changed bricks re-uploaded, new ones first; a brick whose box holds the eye is drawn as a full-screen cover with rays built from the pixel, because box walls next to the eye got clipped and walls vanished)
- Structure cell state: wet, fire glow, oil sheen, soot (a state atlas beside the brick atlas); doors are shape cells so they re-upload like any change
- Point lights: the CPU light grid is a texture used by land, tile walls, structures and sprites (torches, fire, spells, lamps)
- **One per-pixel ray-traced light** (`gpuLight.ts`) lights EVERY pixel (land, walls, buildings, sprites): solid passes write only albedo/normal (`SURFACE_OUT`) plus glow and fog. Per pixel: a sky ray up (roof = indoor ambient) + 4 short ambient-occlusion rays; the sun/moon ray through the near solid field incl. every sprite as a card of its own shape (`gpuCasters.ts`), then over two terrain height levels with canopy and far buildings (`gpuFarShade.ts`, also cloud shade); the nearest N point lights (setting *Lights per pixel*) with a shadow ray each. Same cost per pixel near or far (every ray has a step cap; each step is one solid fetch, one filtered ground fetch, and a caster column fetch that rejects by height band). A sprite pixel carries its billboard number (`spriteOut`) so it never shades itself, while its shadow still reaches its feet. No bounce light yet.
- Sprites: creatures, props, items, hit flash, palette fill, dither fade, depth-tested (art still built on the CPU)
- Particles and spell looks from rune `look` data (CPU simulates, GPU draws); rain streaks, stops under roofs; rain splashes (they are particles, drawn with the rest)
- Held item (painted by `ViewModel` into a buffer, composited on top), swing/bob/shake
- Underworld halls and the realm dark/fog look (checked: flagstones, torch-lit crates)
- Guest/net view, saves unaffected (render stays read-only; `coopSmoke` passes)
- Headless smokes (`artSmoke`, `skySmoke`, `coopSmoke`) run without a GPU; `check:boot` boots the GPU path in a browser
