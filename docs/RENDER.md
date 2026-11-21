# Rendering (src/render, excluding ui/)

**Purpose:** retro first-person view of sim state: pixel buffer, voxel-space terrain, sprites. Read-only on the sim.
**Never:** polygon models or external art; hand-drawn pictures or fixed colour lists in render code; write sim state;
allocate in hot loops. Look is **sprites + procedural textures**; perspective on held items is a sprite transform.

- `adaptiveRes.ts` lowers/raises the line count to hold the wished fps (setting 'Keep it smooth'; numbers in `ADAPTIVE`). `scripts/frameProfile.ts` prints ms per pass headless.
- `viewport.ts` low-res buffer scaled cleanly. `post/` palette quantise, dither, vignette. `lighting.ts` ambient + point lights.
- `raycaster/`: `terrainRenderer.ts` column marcher (near live tiles, far cached LOD blocks: `terrainLod.ts`,
  `lodLooks.ts`, ~7 km), `volumeRenderer.ts` ray casts 3D-layer bricks, `tileBillboards.ts`, `sky.ts` (ray-marched clouds,
  sun, stars), `cloudShadow.ts`, `camera.ts`.
- `materials/` paints surfaces into textures; wet/soot/wear shading.
- `entities/`: creatures posed from parts (`bodyArt.ts`, `bodyMath.ts`, `bodyPaint.ts`, `creatures.ts`), objects grown
  from forms (`formArt.ts`, `props.ts`), items (`itemArt.ts`), billboards (`spriteRenderer.ts`). Colour regions are filled from
  palettes at draw time (`palette.ts`). Missing sprite = magenta checks, never a crash.
- `vfx/particles.ts` + `particleKinds.ts`: spell/effect looks come from rune `look` data.
- Held item: `entities/viewModel.ts` and `mesh.ts` (being replaced by sprites in another thread; do not extend).

- GPU port is planned: `docs/GPU-RENDER.md` (spike in `gpu/gpuSpike.ts`).

## Add / change
- New creature/plant/prop look: data (`content/looks.ts`, `forms.ts`, `props.ts`, `palettes.ts`), no render code.
- New draw pass: read state + content only; keep per-frame work budgeted.

## Checks
`scripts/artSmoke.ts`, `skySmoke.ts`; `npx tsc --noEmit`.
