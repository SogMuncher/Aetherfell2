# Audio (src/audio): all sound is made at runtime

**Purpose:** react to sim events and state with WebAudio. No sample files. Never writes sim state.
**Never:** hard-code a sound per creature/spell id. Sounds derive from traits (material sound class, body, brain, effects).

- `engine.ts`: oscillator + filtered noise + envelope, through reverb and limiter. `gameAudio.ts` `GameAudio`: listens to
  events (music hookup; `bodySounds.ts` + `worldSounds.ts` play each event's effect; `craftSounds.ts` = airship hum,
  rigging wind and creaks by speed, lever notches, `station`/`call`/`answer` events). Aboard, signal `voyage` picks the
  `voyage` style (the world theme, easy and warm). `ambience.ts`: the ambient bed + one-shots from `ambientSounds.ts` (data:
  each sound is `where: 'sky'|'deep'`, day/night, needs trees/water/wind/dry…). Sky sounds, wind, rain and thunder only play
  in a realm with `sky`; the deep has cave air, drips, rumbles, moans.
- `sfx/`: `materials.ts` (strikes/steps per sound class), `voices.ts` (from body/brain), `spells.ts` (from effects),
  `vary.ts` (variation).
- `music/`: `signals.ts` + `signalProbes.ts` (state/events -> 0..1 mood signals), styles as data
  (`styleTypes.ts` incl. meters 2/4..12/8, `stylesDay|Places|Danger.ts`, `styles.ts` collects + picks), `conductor.ts`
  (clock, style changes, tempo glide), `band.ts` (plays layers), `composer.ts`, `theory.ts`, `mixer.ts`,
  `synth.ts` + `instruments.ts` (patch + kind trait) + `patches*.ts` (`patchesDark.ts`: hurdy-gurdy, duduk, bone flute,
  wraith, monks, music box, lyre, war horn, bowed bass, dark pad), `patchesDrones.ts` (wind, hollow wind, low choir).
- Drones (`role: 'drone'`) follow the chords: each chord change may bring one (layer `chance`), on the root or voice-led
  with `voices`, swelling in and fading out. Melody layers with `harmony` sometimes add a third/sixth below.
- Pace: wilderness styles are slow and sparse; `rest` + `silence` (chance a rest is a long stretch of no music, only
  ambience). Towns and fights are fullest. Battle's base is drums + low strings; leads are left to the reactions.
- Reactive layer (all data): `modulators.ts` (each signal nudges tempo/energy/brightness), `cues.ts` (stingers,
  style `enter`/`leave` cues, event cues; `@role` voices = the current style's instrument, `@lead` = one of the style's `leads`, `forms` = alternative takes),
  `reactions.ts` (event -> cue), `cuePlayer.ts` (lands cues on the next step/eighth/beat/bar in key).
- Reaction language: non-`stinger` cues use only `REACTION_KIT` (the style's own roles + bells), never drums/noise, so
  they never clash with sfx; events with strong sfx (spells, traps, breakage, thunder) get no reaction. One reaction at
  a time (the next waits its turn on the grid); the band's layer in that role steps aside; each playing is varied
  (form, lead, shift, octave, rhythm, bell swap). Tension (`chaos.ts` `TENSION`): every reaction adds some, from any level it falls
  in a straight line to zero over 3 s, and reactions climb that many scale steps; while it rises, each answer is
  lifted until its average pitch is above the last one, so forms/chords/voices can never make a climb step down.
- `chaos.ts` (data): every chance is capped below 1 (`MusicRng.chance`), so any note, layer or reaction can go missing;
  per bar a rogue instrument, a tempo lurch or a short bar may happen.
- Console: `aetherfellMusic.status()`, `.cue('parry')`.

## Add / change
- New mood: one entry in a styles table (affinity + energy from signals). New instrument: a patch + `INSTRUMENTS` entry.
- New event sound: a cue in `cues.ts` + one rule in `reactions.ts`. New stimulus dial: a line in `modulators.ts`.
- New sound class: add to `SoundClass` and the material data; sfx picks it up.

## Checks
`scripts/musicSmoke.ts` (grid, event->cue, tension, dials, names, ambience sky/deep); listen in `npm run dev`.
