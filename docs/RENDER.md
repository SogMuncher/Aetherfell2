# Rendering (src/render, excluding ui/)

**Purpose:** retro first-person view of sim state, drawn only on the GPU (`gpu/`, docs/GPU-RENDER.md). Read-only on the sim.
**Never:** polygon models or external art; hand-drawn pictures or fixed colour lists in render code; write sim state;
allocate in hot loops. Look is **sprites + procedural textures**; perspective on held items is a sprite transform.

- `adaptiveRes.ts` lowers/raises the line count to hold the wished fps (setting 'Keep it smooth'; numbers in `ADAPTIVE`).
- `viewport.ts` low-res frame size scaled cleanly. `lighting.ts` gathers the lights (and a 1 m grid for the held item).
- `raycaster/` (CPU helpers the GPU reads): far cached LOD blocks (`terrainLod.ts`, `lodLooks.ts`, ~7 km), `tileBillboards.ts`,
  `cloudShadow.ts`, `camera.ts`. Clouds and ground mist follow the world's moisture (`airMoisture` in `content/skyField.ts`, set by `Simulation`; layer `wet`).
- LOD blocks of every level (incl. the 1 m one the GPU textured levels fade into) get changed tiles painted over them (`terrainLodPaint.paintChunk`); the GPU refills its fine levels when `lod.painted` moves.
- `materials/` paints surfaces into textures.
- Sky, air cells, clouds, mist, smoke, fog: **docs/RENDER-SKY.md**. Sprites, gear on bodies, held item: **docs/RENDER-SPRITES.md**.
- Shadows: the solid field (`gpuSolid.ts`) keeps each 3D cell's shape byte, and shadow rays test shaped cells against their real pieces (`SHAPE_SHADER`, shared with the structure pass), so roofs and slopes shade by their true shape. Sprite shadow cards mirror when the eye is on the light's side, so the shadow matches the drawn picture from both sides.
- Neighbour ground tiles and 3D cell faces (any kinds, same kind too) blend `SURFACE_MIX.blend` texels (5; 3D cells `cellBlend` 2) to either side of their edge by one shared GLSL rule `edgeLean` (gpuSurfaces.ts), each cell's colour drift fading into the next; centres stay pure. `surfPatches` adds soft world-space light/dark and warm/cool patches (`SURFACE_MIX.patch*`) on both.
- Surfaces are TEX = 16 texels a side, 16 to the metre on ground, tile walls and 3D cells. A surface (`content/surfaces.ts`) is a base colour plus layers, the reusable components; a layer that covers only some texels (speckle, lines, mortar, seams, patches) is its own region (atlas alpha), and the shader's `surf(..., key)` drifts each region's hue/richness/lightness per placed cell by the surface's `drift` (default `SURFACE_DRIFT`; packed in a row under the atlas). Randoms come from an integer hash of the cell (`surfRand`), never `sin`, so nothing bands far from the origin. A surface with `spin` turns/mirrors per cell; a layer's `turn` paints it crosswise; wave frequencies snap to whole waves per tile so every surface tiles. Far away the atlas mips (`SURFACE_MIX.lods`, picked per pixel by `surfLodFrom`) replace texels that would shimmer; near each switch the next mip fades in (`surfLodT`), so levels never meet in a line. Noise octaves and `noise`/`patches` cells stay 4 texels or finer (a tile-sized blob repeats per tile and reads as a grid or stripes; `validateContent` enforces it). The atlas height is padded to whole slots so every mip halves exactly (an odd height bled slots into each other on Windows GPUs: a line along every tile edge far off).
- Matter states (soot, wet, oil, frost, fire) are never drawn by swapping materials: `content/matterStates.ts` says how each blends (shade, cover colour or surface, glint, glow, rain), `gpu/gpuStates.ts` `blendStates` draws them on ground, tile walls and 3D cells; far land gets `stateLooks.tintFar`.
- `vfx/particles.ts` + `particleKinds.ts`: spell/effect looks come from rune `look` data.

## Add / change
- New creature/plant/prop look: one `ArtDef` entry (`content/looks.ts`, `forms.ts`, `smallForms.ts`, `props.ts` all feed `CONTENT.art`; colours in `palettes.ts`), no render code.
- New draw pass: read state + content only; keep per-frame work budgeted.

## Checks
`npm run check:boot` boots the bundle in a browser (not in CI; run it before reporting renderer or startup changes).
A new `Renderer` is made on every world swap (join, load): always `dispose()` the old one first.
`scripts/artSmoke.ts`, `skySmoke.ts`; `npx tsc --noEmit`.
