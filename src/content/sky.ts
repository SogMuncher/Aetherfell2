import type { SkyDef } from '../types';

/**
 * The sky. Each cloud layer is a sheet of drifting shapes at its own height, size and speed, and
 * covers more or less of the sky as the weather turns. Storm cells are the only clouds rain falls
 * from, so you can watch a shower coming and walk out from under it. A new kind of cloud is a new
 * entry here. Sky colours, sun, moon, stars and aurora are here too.
 */
export const SKY: SkyDef = {
  layers: [
    // Wisps of ice far up, drawn out by the high wind.
    { name: 'cirrus', height: 7000, thickness: 220, tower: 0, billow: 0.4, scale: 2600, stretch: 4, speed: 2.2, cover: { base: 0.18, perCloud: 0.25, perRain: -0.1 }, softness: 0.35, detail: 2, tint: [255, 252, 246], belly: 0, opacity: 0.45, shadow: 0, seed: 11 },
    // A mackerel sky of small flat puffs.
    { name: 'altocumulus', height: 3200, thickness: 420, tower: 0.45, billow: 0.7, scale: 700, speed: 1.4, cover: { base: -0.05, perCloud: 0.45, perRain: 0.1 }, softness: 0.12, detail: 4, tint: [238, 236, 234], belly: 0.15, opacity: 0.85, shadow: 0.25, seed: 23 },
    // Fair-weather heaps: bright tops, soft edges.
    { name: 'cumulus', height: 1250, thickness: 1000, tower: 0.9, billow: 1, scale: 1100, speed: 1, cover: { base: 0.12, perCloud: 0.45, perRain: 0.15 }, softness: 0.09, detail: 5, tint: [250, 250, 248], belly: 0.3, opacity: 1, shadow: 0.45, seed: 37 },
    // Storm cells: dark-bellied towers. Rain falls only under these.
    { name: 'storm', height: 900, thickness: 2300, tower: 0.95, billow: 0.8, scale: 3400, speed: 0.7, cover: { base: -0.3, perCloud: 0.15, perRain: 0.95 }, softness: 0.18, detail: 3, tint: [214, 216, 224], belly: 0.62, opacity: 1, shadow: 0.7, rain: true, seed: 53 },
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
  cloudRange: 30000,
};
