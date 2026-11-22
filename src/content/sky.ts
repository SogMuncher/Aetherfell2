import type { SkyDef } from '../types';

/**
 * The sky and the air. Each layer is a sheet of drifting air cells at its own height, cell size and speed (clouds up high,
 * mist down low), and covers more or less of the sky as the weather turns. Storm cells are the only clouds rain falls
 * from, so you can watch a shower coming and walk out from under it. A new kind of cloud or mist is a new entry here.
 * Sky colours, sun, moon, stars and aurora are here too. The land sits mostly 0..150 m with peaks to about 600 m, so the
 * low layers hang just over the hills and wrap the peaks; `wet` makes a layer gather over damp land.
 */
export const SKY: SkyDef = {
  layers: [
    // Wisps of ice far up, drawn out by the high wind.
    { name: 'cirrus', height: 3400, thickness: 140, tower: 0, billow: 0.4, scale: 2600, stretch: 4, speed: 2.2, cover: { base: 0.18, perCloud: 0.25, perRain: -0.1 }, softness: 0.35, detail: 2, tint: [255, 252, 246], belly: 0, opacity: 0.45, shadow: 0, seed: 11, cell: 120 },
    // A mackerel sky of small flat puffs.
    { name: 'altocumulus', height: 1500, thickness: 160, tower: 0.45, billow: 0.7, scale: 700, speed: 1.4, cover: { base: -0.05, perCloud: 0.45, perRain: 0.1 }, softness: 0.12, detail: 4, tint: [238, 236, 234], belly: 0.15, opacity: 0.85, shadow: 0.25, seed: 23, cell: 60 },
    // Fair-weather heaps: bright tops, flat dark bases, stacked from blocks.
    { name: 'cumulus', height: 300, thickness: 520, wet: 0.5, tower: 0.9, billow: 1, scale: 1100, speed: 1, cover: { base: 0.12, perCloud: 0.45, perRain: 0.15 }, softness: 0.09, detail: 5, tint: [250, 250, 248], belly: 0.3, opacity: 1, shadow: 0.45, seed: 37, cell: 40 },
    // Storm cells: dark-bellied towers. Rain falls only under these.
    { name: 'storm', height: 240, thickness: 1300, wet: 0.4, tower: 0.95, billow: 0.8, scale: 3400, speed: 0.7, cover: { base: -0.3, perCloud: 0.15, perRain: 0.95 }, softness: 0.18, detail: 3, tint: [214, 216, 224], belly: 0.62, opacity: 1, shadow: 0.7, rain: true, seed: 53, cell: 80 },
    // Low hanging cloud round the hills and upper slopes, so a high peak stands in it or above it: it gathers over wet land, so valleys and marshes go grey and dry steppe stays bright.
    { name: 'stratus', height: 160, thickness: 360, tower: 0.15, billow: 0.5, scale: 1500, speed: 0.8, cover: { base: 0, perCloud: 0.55, perRain: 0.3 }, softness: 0.22, detail: 3, tint: [226, 228, 232], belly: 0.35, opacity: 0.9, shadow: 0.3, wet: 1, seed: 71, cell: 40 },
    // Ground mist: a thin sheet of small cells lying in the low wet places (lakes, rivers, marsh hollows); standing in it fogs the view.
    { name: 'mist', height: 4, thickness: 48, tower: 0.2, billow: 0.6, scale: 420, speed: 0.3, cover: { base: 0.05, perCloud: 0.25, perRain: 0.35 }, softness: 0.3, detail: 2, tint: [214, 218, 224], belly: 0.1, opacity: 0.55, shadow: 0, wet: 1, seed: 89, cell: 12 },
  ],
  colours: {
    zenith: { night: [8, 10, 26], day: [62, 110, 196], dusk: [86, 60, 108] },
    horizon: { night: [20, 24, 48], day: [178, 204, 228], dusk: [236, 146, 92] },
    overcast: [154, 162, 178],
  },
  sun: { size: 0.045, glow: [120, 80, 30], disc: [255, 240, 200] },
  moon: { size: 0.03, colour: [210, 214, 226], halo: [120, 130, 160] },
  stars: { density: 0.0035 },
  aurora: { colour: [40, 190, 120], edge: [0, 0, 60] },
  cloudRange: 40000,
  haze: 6,
  cells: { perShape: 32, count: 64, slices: 16, budget: 8000, refresh: 10, lod: 20 },
};
