// How people sound and what they blurt out: a voice as ranges each person picks from, and bark lines keyed by moments
/** A range [low, high]; each person gets one fixed value in it (picked from their entity id). */
export type VoiceSpan = readonly [number, number];

/**
 * A speaking voice (people, goblins, anything that talks). One synth (audio/sfx/speech.ts) reads it: the words of a
 * line become syllables of vowels and consonants, sung at this pitch and pace with this tone.
 */
export interface VoiceDef {
  /** Speaking pitch in Hz (90 a deep man, 220 a high voice). */
  pitch: VoiceSpan;
  /** Syllables a second. */
  pace: VoiceSpan;
  /** How much the pitch wanders over a sentence: 0 flat and dull, 1 sing-song. */
  lilt: VoiceSpan;
  /** Breath in the voice, 0..1 (a whisper at 1). */
  breath: VoiceSpan;
  /** Rasp and gravel, 0..1. */
  rasp: VoiceSpan;
  /** Size of the throat and mouth: 1 an average adult; bigger is darker and hollower, smaller is brighter. */
  throat: VoiceSpan;
  /** Talking through the nose, 0..1. */
  nasal?: VoiceSpan;
}

/** A thing that talks: its voice, and the set of bark lines (`Content.barks`) it reacts with, if any. */
export interface SpeechDef {
  voice: VoiceDef;
  barks?: string;
}

/**
 * Bark lines of one kind of speaker, by moment. A moment is an event word ('hurt', 'kill', 'fire', 'rain', 'loot',
 * 'greet', 'hired', 'dismissed', 'allyDied', 'deathNear', 'thunder', 'magic', 'throw', 'lowHealth', 'idle', 'idleNight'),
 * 'do.<behaviour>' when the brain picks that behaviour (do.flee, do.hunt, do.follow...), 'go.<place word>' when a
 * routine sends them somewhere (go.home, go.square, go.tavern, go.work for any other) or 'status.<id>' when a status
 * takes hold. Lines may say {name} (their own), {foe} (what they fight), {place} (where they go) and {who} (the one they react to).
 */
export type BarkSet = Readonly<Record<string, readonly string[]>>;

/** How often each moment is spoken: chance 0..1 it is said when it happens (default `BarkRules.chance`). */
export interface BarkRules {
  /** Seconds a speaker stays quiet after a bark. */
  quiet: number;
  /** Only speakers within this many metres of a traveller bark (nobody else would hear). */
  heard: number;
  /** Reactions to something seen (a death, a fire, loot) reach this far. */
  sees: number;
  chance: number;
  /** Chance per moment where it differs from `chance`. */
  odds: Readonly<Record<string, number>>;
}
