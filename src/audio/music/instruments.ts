// The instrument table: every patch with the traits the band and the cues read (never instrument ids).
import type { Patch } from './synth';
import { anvil, bones, boom, chains, lowTom, ritualDrum, cluster, crash, drip, frameDrum, heartbeat, rise, scrape, shaker, snare, swell, taiko, timpani, whisper } from './patchesPercussion';
import { bell, celesta, glass, harp, kalimba, lute, pluckBass } from './patchesTuned';
import { cello, choir, drone, fiddle, flute, horn, ocarina, spiccato, strings, warmPad } from './patchesSustained';
import { boneFlute, bowedBass, darkPad, duduk, hurdyGurdy, lyre, monks, musicBox, warHorn, wraith } from './patchesDark';
import { bowl, clap, dulcimer, gong, marimba, organ, panpipe, pizzicato, reed, tambourine, tuba, woodblock } from './patchesExtra';

/**
 * tone: plays the pitch it is given. drum: unpitched hit. tuned: a drum that follows the chord root.
 * fx: a swoosh, boom or swell (pitch barely matters).
 */
export type InstrumentKind = 'tone' | 'drum' | 'tuned' | 'fx';

export interface Instrument {
  patch: Patch;
  kind: InstrumentKind;
  /** Rolls into the next section on the last beats of a phrase. */
  roll?: boolean;
}

const tone = (patch: Patch): Instrument => ({ patch, kind: 'tone' });
const drum = (patch: Patch, roll = false): Instrument => ({ patch, kind: 'drum', roll });
const fx = (patch: Patch): Instrument => ({ patch, kind: 'fx' });

export const INSTRUMENTS = {
  harp: tone(harp),
  lute: tone(lute),
  kalimba: tone(kalimba),
  celesta: tone(celesta),
  bell: tone(bell),
  glass: tone(glass),
  marimba: tone(marimba),
  dulcimer: tone(dulcimer),
  pizzicato: tone(pizzicato),
  flute: tone(flute),
  ocarina: tone(ocarina),
  panpipe: tone(panpipe),
  reed: tone(reed),
  fiddle: tone(fiddle),
  horn: tone(horn),
  tuba: tone(tuba),
  organ: tone(organ),
  strings: tone(strings),
  spiccato: tone(spiccato),
  choir: tone(choir),
  pluckBass: tone(pluckBass),
  cello: tone(cello),
  drone: tone(drone),
  warmPad: tone(warmPad),
  bowl: tone(bowl),
  cluster: tone(cluster),
  hurdyGurdy: tone(hurdyGurdy),
  duduk: tone(duduk),
  boneFlute: tone(boneFlute),
  wraith: tone(wraith),
  monks: tone(monks),
  musicBox: tone(musicBox),
  lyre: tone(lyre),
  warHorn: tone(warHorn),
  bowedBass: tone(bowedBass),
  darkPad: tone(darkPad),
  ritualDrum: drum(ritualDrum, true),
  lowTom: drum(lowTom),
  bones: drum(bones),
  chains: drum(chains),
  taiko: drum(taiko, true),
  timpani: { patch: timpani, kind: 'tuned', roll: true },
  frameDrum: drum(frameDrum),
  shaker: drum(shaker),
  tambourine: drum(tambourine),
  clap: drum(clap),
  woodblock: drum(woodblock),
  snare: drum(snare, true),
  heartbeat: drum(heartbeat),
  anvil: drum(anvil),
  gong: fx(gong),
  swell: fx(swell),
  crash: fx(crash),
  boom: fx(boom),
  scrape: fx(scrape),
  whisper: fx(whisper),
  drip: fx(drip),
  rise: fx(rise),
} satisfies Record<string, Instrument>;

export type InstrumentId = keyof typeof INSTRUMENTS;
