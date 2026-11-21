# Audio (src/audio): all sound is made at runtime

**Purpose:** react to sim events and state with WebAudio. No sample files. Never writes sim state.
**Never:** hard-code a sound per creature/spell id. Sounds derive from traits (material sound class, body, brain, effects).

- `engine.ts`: oscillator + filtered noise + envelope, through reverb and limiter. `gameAudio.ts` `GameAudio`: listens to
  events, owns layers (ambience, steps, voices, spells, music hookup).
- `sfx/`: `materials.ts` (strikes/steps per sound class), `voices.ts` (from body/brain), `spells.ts` (from effects),
  `vary.ts` (variation).
- `music/`: `signals.ts` + `signalProbes.ts` (state/events -> 0..1 mood signals), styles as data
  (`styleTypes.ts`, `stylesDay|Places|Danger.ts`, `styles.ts` collects), `conductor.ts` (blends styles),
  `composer.ts`, `theory.ts`, `mixer.ts`, `synth.ts` + `instruments.ts` + `patches*.ts`.
- Console: `aetherfellMusic.status()`.

## Add / change
- New mood: one entry in a styles table (affinity + energy from signals). New instrument: a patch + `INSTRUMENTS` entry.
- New sound class: add to `SoundClass` and the material data; sfx picks it up.

## Checks
`scripts/mechanicsSmoke.ts` covers events; listen in `npm run dev`.
