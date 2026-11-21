import type { Patch } from './synth';
import { anvil, boom, cluster, crash, drip, frameDrum, heartbeat, rise, scrape, shaker, snare, swell, taiko, timpani, whisper } from './patchesPercussion';
import { bell, celesta, glass, harp, kalimba, lute, pluckBass } from './patchesTuned';
import { cello, choir, drone, fiddle, flute, horn, ocarina, spiccato, strings, warmPad } from './patchesSustained';


export const INSTRUMENTS = {
  harp,
  lute,
  kalimba,
  celesta,
  bell,
  glass,
  flute,
  ocarina,
  fiddle,
  horn,
  strings,
  spiccato,
  choir,
  pluckBass,
  cello,
  drone,
  warmPad,
  taiko,
  timpani,
  frameDrum,
  shaker,
  snare,
  swell,
  crash,
  boom,
  heartbeat,
  anvil,
  scrape,
  whisper,
  drip,
  cluster,
  rise,
} satisfies Record<string, Patch>;

export type InstrumentId = keyof typeof INSTRUMENTS;
