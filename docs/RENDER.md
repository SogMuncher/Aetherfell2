# Rendering (src/render, excluding ui/)

**Purpose:** retro first-person view of sim state: pixel buffer, voxel-space terrain, sprites. Read-only on the sim.
**Never:** polygon models or external art; hand-drawn pictures or fixed colour lists in render code; write sim state;
allocate in hot loops. Look is **sprites + procedural textures**; perspective on held items is a sprite transform.

- `adaptiveRes.ts` lowers/raises the line count to hold the wished fps (setting 'Keep it smooth'; numbers in `ADAPTIVE`). `scripts/frameProfile.ts` prints ms per pass headless.
- `viewport.ts` low-res buffer scaled cleanly. `post/` palette quantise, dither, vignette. `lighting.ts` ambient + point lights.
- `raycaster/`: `terrainRenderer.ts` column marcher (near live tiles, far cached LOD blocks: `terrainLod.ts`,
  `lodLooks.ts`, ~7 km), `volumeRenderer.ts` ray casts 3D-layer bricks, `tileBillboards.ts`, `sky.ts` (ray-marched clouds,
  sun, stars), `cloudShadow.ts`, `camera.ts`. Clouds and ground mist follow the world's moisture (`airMoisture` in `content/skyField.ts`, set by `Simulation`; layer `wet`).
- The air is ONE grid of cells (`airCells.ts`, sizes in `SkyDef.air`): every sky layer (cloud, mist) writes into it through `airColumn` (content/skyField.ts), the same rule rain, cloud shade and in-cloud fog read. Levels double in width every `air.lod` cells of distance (height stops at the layers' band / `tall`, so far cells are wide flat clumps); cells are stored wrapped, so moving fills only the new ones; far levels refresh less often. The GPU walks the cells nearest first (one pass, right order) and shades only a cloud's outside faces (no seams inside). A new cloud/mist kind is a new layer in `content/sky.ts`, nothing else.
- Fog (`env.ts`): the fog colour is the sky's horizon colour, or the cloud you stand in (shorter sight, cloud colour); clouds use `Env.cloudLit` (same light as the overcast sky) and haze over `fogDist × sky.haze`. Classic is no longer maintained.
- LOD blocks of every level (incl. the 1 m one the GPU textured levels fade into) get changed tiles painted over them (`terrainLodPaint.paintChunk`); the GPU refills its fine levels when `lod.painted` moves.
- `materials/` paints surfaces into textures.
- Matter states (soot, wet, oil, frost, fire) are never drawn by swapping materials: `content/matterStates.ts` says how each blends (shade, cover colour or surface, glint, glow, rain), `gpu/gpuStates.ts` `blendStates` draws them on ground, tile walls and 3D cells; far land gets `stateLooks.tintFar`. Classic is unsupported and does not show new states.
- `entities/`: creatures posed from parts (`bodyArt.ts`, `bodyMath.ts`, `bodyPaint.ts`, `creatures.ts`), objects grown
  from forms (`formArt.ts`, `props.ts`), items (`itemArt.ts`: one picture per item, never mirrored, from `look.parts` in `itemParts.ts`/`itemPlates.ts`; edges on the left), billboards (`spriteRenderer.ts`). Colour regions are filled from
  palettes at draw time (`palette.ts`). Missing sprite = magenta checks, never a crash.
- `vfx/particles.ts` + `particleKinds.ts`: spell/effect looks come from rune `look` data.
- Held item: `entities/viewModel.ts` and `mesh.ts` (being replaced by sprites in another thread; do not extend).
- Blow effects (sparks, dust, blood, embers) are world motes from `vfx/particles.ts`, chosen by material and weapon data; the held item only kicks.

- GPU port is planned: `docs/GPU-RENDER.md` (stage 1 in `gpu/`, setting 'Graphics engine').

## Add / change
- New creature/plant/prop look: data (`content/looks.ts`, `forms.ts`, `props.ts`, `palettes.ts`), no render code.
- New draw pass: read state + content only; keep per-frame work budgeted.

## Checks
`npm run check:boot` boots the bundle in a browser (not in CI; run it before reporting renderer or startup changes).
A new `Renderer` is made on every world swap (join, load): always `dispose()` the old one first.
`scripts/artSmoke.ts`, `skySmoke.ts`; `npx tsc --noEmit`.

Sprite views (8-way creatures, props) and left/right facing are picked from where the camera STANDS relative to the thing (`sideFrom` in raycaster/camera.ts), never from where it is turned. Each billboard quad also turns to face the camera's position (gpuSprites VS), so turning or tilting the view never swings it round.
