# Audio (src/audio): all sound is made at runtime

**Purpose:** react to sim events and state with WebAudio. No sample files. Never writes sim state.
**Never:** hard-code a sound per creature/spell id. Sounds derive from traits (material sound class, body, brain, effects).

- `engine.ts`: oscillator + filtered noise + envelope, through reverb and limiter. `gameAudio.ts` `GameAudio`: listens to
  events, owns layers (ambience, steps, voices, spells, music hookup).
- `sfx/`: `materials.ts` (strikes/steps per sound class), `voices.ts` (from body/brain), `spells.ts` (from effects),
  `vary.ts` (variation).
- `music/`: `signals.ts` + `signalProbes.ts` (state/events -> 0..1 mood signals), styles as data
  (`styleTypes.ts` incl. meters 2/4..12/8, `stylesDay|Places|Danger.ts`, `styles.ts` collects + picks), `conductor.ts`
  (clock, style changes, tempo glide), `band.ts` (plays layers), `composer.ts`, `theory.ts`, `mixer.ts`,
  `synth.ts` + `instruments.ts` (patch + kind trait) + `patches*.ts`.
- Reactive layer (all data): `modulators.ts` (each signal nudges tempo/energy/brightness), `cues.ts` (stingers,
  style `enter`/`leave` cues, event cues; `@role` voices = the current style's instrument, `climb` = combos rise),
  `reactions.ts` (event -> cue), `cuePlayer.ts` (lands cues on the next step/eighth/beat/bar in key).
- Console: `aetherfellMusic.status()`, `.cue('parry')`.

## Add / change
- New mood: one entry in a styles table (affinity + energy from signals). New instrument: a patch + `INSTRUMENTS` entry.
- New event sound: a cue in `cues.ts` + one rule in `reactions.ts`. New stimulus dial: a line in `modulators.ts`.
- New sound class: add to `SoundClass` and the material data; sfx picks it up.

## Checks
`scripts/musicSmoke.ts` (grid, event->cue, combos, dials, names); listen in `npm run dev`.
