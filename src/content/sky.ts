import type { SkyDef } from '../types';

/**
 * The sky and the air. Each layer is a sheet of cloud at its own height and shape size, carried by the wind like all the air (clouds up high,
 * mist down low), written into the one grid of air cells (`air`), and covers more or less of the sky as the weather turns. Storm cells are the only clouds rain falls
 * from, so you can watch a shower coming and walk out from under it. A new kind of cloud or mist is a new entry here.
 * Sky colours, sun, moon, stars and aurora are here too. The land sits mostly 0..150 m with peaks to about 600 m, so the
 * low layers hang just over the hills and wrap the peaks; `wet` makes a layer gather over damp land.
 */
export const SKY: SkyDef = {
  layers: [
    // Wisps of ice far up, drawn out by the high wind.
    { name: 'cirrus', height: 3400, thickness: 120, tower: 0, billow: 0.4, scale: 1400, stretch: 4, cover: { base: 0.15, perCloud: 0.2, perRain: -0.1 }, softness: 0.35, detail: 3, tint: [255, 252, 246], belly: 0, opacity: 0.4, shadow: 0, seed: 11 },
    // A mackerel sky of small flat puffs.
    { name: 'altocumulus', height: 1500, thickness: 120, tower: 0.45, billow: 0.7, scale: 260, cover: { base: -0.05, perCloud: 0.4, perRain: 0.1 }, softness: 0.12, detail: 4, tint: [238, 236, 234], belly: 0.15, opacity: 0.8, shadow: 0.25, seed: 23 },
    // Fair-weather heaps a few hundred metres across with sky between: bright tops, flat dark bases.
    { name: 'cumulus', height: 300, thickness: 280, wet: 0.5, tower: 0.9, billow: 1, scale: 340, cover: { base: 0.08, perCloud: 0.4, perRain: 0.15 }, softness: 0.09, detail: 5, tint: [250, 250, 248], belly: 0.3, opacity: 1, shadow: 0.45, seed: 37 },
    // Storm cells: dark-bellied towers. Rain falls only under these.
    { name: 'storm', height: 240, thickness: 1100, wet: 0.4, tower: 0.95, billow: 0.8, scale: 1100, cover: { base: -0.3, perCloud: 0.15, perRain: 0.9 }, softness: 0.18, detail: 4, tint: [214, 216, 224], belly: 0.62, opacity: 1, shadow: 0.7, rain: true, seed: 53 },
    // Low ragged cloud round the hills and upper slopes, so a high peak stands in it or above it: it gathers over wet land, so valleys and marshes go grey and dry steppe stays bright.
    { name: 'stratus', height: 220, thickness: 300, tower: 0.3, billow: 0.6, scale: 520, cover: { base: -0.05, perCloud: 0.4, perRain: 0.3 }, softness: 0.2, detail: 4, tint: [226, 228, 232], belly: 0.35, opacity: 0.85, shadow: 0.3, wet: 1, seed: 71 },
    // Ground mist: a thin sheet lying in the low wet places (lakes, marsh hollows); standing in it fogs the view.
    { name: 'mist', height: 4, thickness: 40, tower: 0.2, billow: 0.6, scale: 220, cover: { base: 0.05, perCloud: 0.25, perRain: 0.35 }, softness: 0.3, detail: 3, tint: [214, 218, 224], belly: 0.1, opacity: 0.5, shadow: 0, wet: 1, seed: 89 },
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
  air: { cell: 1, count: 96, tall: 32, lod: 18, ext: 0.05, budget: 5000, rush: 3, refresh: 8, change: 0.02, blend: 2 },
  smoke: { cell: 1, count: 64, tall: 48, step: 0.1, rise: 0.8, spread: 0.006, fade: 0.03, ext: 1, colour: [52, 50, 48] },
};
