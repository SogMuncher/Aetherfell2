// Music checks (no WebAudio needed): cues land on the beat in the key, events pick the right cue, combos climb,
// the mood dials move tempo/brightness, and every style, cue and meter names things that exist.
import { check, failures } from './smokeKit';
import { CUE_TABLE, REACTION_KIT } from '../src/audio/music/cues';
import type { Voice } from '../src/audio/music/cues';
import { CuePlayer, gridTime } from '../src/audio/music/cuePlayer';
import type { GridClock } from '../src/audio/music/cuePlayer';
import { reactionFor, REACTIONS } from '../src/audio/music/reactions';
import { dials } from '../src/audio/music/modulators';
import { INSTRUMENTS } from '../src/audio/music/instruments';
import type { InstrumentId } from '../src/audio/music/instruments';
import { METERS, STYLES, STYLE_IDS } from '../src/audio/music/styles';
import { MoodTracker, emptySignals } from '../src/audio/music/signals';
import { compose } from '../src/audio/music/composer';
import { MusicRng } from '../src/audio/music/theory';
import type { Band, BarPlan, Beat } from '../src/audio/music/band';
import type { Channel } from '../src/audio/music/mixer';
import type { SimEvent } from '../src/types';

// --- Grid --------------------------------------------------------------------------------------
const four: GridClock = { now: 10, next: 10.1, step: 3, stepDur: 0.1, meter: METERS.four };
const tBeat = gridTime('beat', four);
check('beat cue waits for the next beat', Math.abs(tBeat - 10.2) < 1e-9, `${tBeat}`);
check('step cue lands on the very next sixteenth', Math.abs(gridTime('step', four) - 10.1) < 1e-9);
check('eighth cue lands on an even step', Math.abs(gridTime('eighth', four) - 10.2) < 1e-9);
check('bar cue waits for the downbeat', Math.abs(gridTime('bar', four) - (10.1 + 13 * 0.1)) < 1e-9);
// Steps already scheduled ahead of now still count (tight response).
const ahead: GridClock = { now: 10, next: 10.3, step: 6, stepDur: 0.1, meter: METERS.seven };
check('cue can land on a step already queued', Math.abs(gridTime('step', ahead) - 10.1) < 1e-9, `${gridTime('step', ahead)}`);
check('beats follow an odd meter (7/8 beat on step 4)', Math.abs(gridTime('beat', ahead) - 10.1) < 1e-9);

// --- Event -> cue --------------------------------------------------------------------------------
const near = (): boolean => true;
const hit = (o: Partial<Extract<SimEvent, { type: 'hit' }>>): SimEvent => ({ type: 'hit', target: 2, source: 1, damage: 3, blocked: false, parried: false, x: 0, y: 0, z: 0, ...o });
check('my hit plays strike', reactionFor(hit({}), 1, near) === 'strike');
check('a wound-up hit plays the heavy strike', reactionFor(hit({ power: 0.9 }), 1, near) === 'strikeHeavy');
check('my killing blow plays kill', reactionFor(hit({ killed: true }), 1, near) === 'kill');
check('parrying a blow plays parry', reactionFor(hit({ source: 2, target: 1, parried: true }), 1, near) === 'parry');
check('getting hurt plays hurt', reactionFor(hit({ source: 2, target: 1 }), 1, near) === 'hurt');
check("other people's fights play nothing", reactionFor(hit({ source: 5, target: 6 }), 1, near) === null);
check('unknown events are ignored', reactionFor({ type: 'journal', text: 'x' }, 1, near) === null);

// --- Every name exists -------------------------------------------------------------------------
const problems: string[] = [];
const voiceOk = (v: Voice): boolean => (v.startsWith('@') ? true : v in INSTRUMENTS);
for (const [id, cue] of Object.entries(CUE_TABLE)) {
  for (const n of cue.notes) {
    if (!voiceOk(n.voice)) problems.push(`${id}: ${n.voice}`);
    if (n.or && !(n.or in INSTRUMENTS)) problems.push(`${id}: ${n.or}`);
  }
  if (cue.alt && !CUE_TABLE[cue.alt.cue]) problems.push(`${id}: alt ${cue.alt.cue}`);
}
for (const id of STYLE_IDS) {
  const d = STYLES[id];
  for (const c of [d.enter, d.leave]) if (c && !CUE_TABLE[c]) problems.push(`${id}: cue ${c}`);
  for (const l of d.layers) if (!(l.instrument in INSTRUMENTS)) problems.push(`${id}: ${l.instrument}`);
  for (const m of d.meters) if (!METERS[m]) problems.push(`${id}: meter ${m}`);
}
for (const [id, m] of Object.entries(METERS)) if ([...m.beats, ...m.accents].some((b) => b >= m.steps)) problems.push(`meter ${id}`);
check('cues, styles and meters name real instruments/cues', problems.length === 0, problems.join('; '));
const reacted = Object.keys(REACTIONS).length;
check('many kinds of event get a musical answer', reacted >= 15, `${reacted}`);
const offKit = Object.entries(CUE_TABLE).filter(([, c]) => !c.stinger && c.notes.some((n) => !REACTION_KIT.includes(n.voice))).map(([id]) => id);
check('reactions speak one language: the band plus bells, never drums or noise', offKit.length === 0, offKit.join(', '));
check('casting a spell leaves the music alone (it has its own sound)', reactionFor({ type: 'spellCast', entity: 1 } as unknown as SimEvent, 1, near) === null);
const capped = new MusicRng(3);
let misses = 0;
for (let k = 0; k < 4000; k++) if (!capped.chance(1)) misses++;
check('nothing in the music is ever certain', misses > 10 && misses < 200, `${misses}`);
const used = new Set<string>(STYLE_IDS.flatMap((id) => STYLES[id].layers.map((l) => l.instrument)));
for (const c of Object.values(CUE_TABLE)) for (const n of c.notes) used.add(n.voice);
const unused = (Object.keys(INSTRUMENTS) as InstrumentId[]).filter((i) => !used.has(i));
check('every instrument is played somewhere', unused.length === 0, unused.join(', '));

// --- Mood dials ----------------------------------------------------------------------------------
const calm = dials(emptySignals());
const run = dials({ ...emptySignals(), speed: 1 });
const night = dials({ ...emptySignals(), night: 1 });
check('nothing going on leaves the music as written', calm.tempo === 1 && calm.energy === 0 && calm.tone === 1);
check('running speeds the music up and adds energy', run.tempo > 1.05 && run.energy > 0);
check('night slows and darkens the music', night.tempo < 1 && night.tone < 1);

// --- A cue in the band ----------------------------------------------------------------------------
const notes: { inst: string; t: number; midi: number }[] = [];
const fakeBand = { play: (inst: string, _ch: Channel, t: number, midi: number) => void notes.push({ inst, t, midi }) } as unknown as Band;
const mood = new MoodTracker();
const steady = new (class extends MusicRng {
  override next(): number {
    return 0.4;
  }
})(1);
const player = new CuePlayer(fakeBand, { input: null, target: 1, echo: null } as unknown as Channel, mood, steady);
const sec = compose(new MusicRng(7), { style: 'battle', def: STYLES.battle, kind: 'main', prev: null, theme: [] });
const plan: BarPlan = { t: 0, chord: sec.chordAt[0] ?? { degree: 0, color: 'triad', bars: 1 }, energy: 1, active: sec.def.layers.map(() => true), melodyRests: false, last: false };
const beat: Beat = { sec, plan, bar: 0, step: 3, channel: () => ({ input: null, target: 1, echo: null }) as unknown as Channel };
const clock: GridClock = { now: 10, next: 10.1, step: 3, stepDur: 0.1, meter: sec.meter };
const scale = new Set(sec.mode.map((s) => (s + sec.key) % 12));
player.play('parry', beat, clock, []);
check('a parry sounds right away', notes.length > 0 && Math.min(...notes.map((n) => n.t)) >= 10 && Math.min(...notes.map((n) => n.t)) < 10.2);
const tones = notes.filter((n) => INSTRUMENTS[n.inst as InstrumentId].kind === 'tone');
check('its notes are in the key', tones.length > 0 && tones.every((n) => scale.has(((n.midi % 12) + 12) % 12)));
check('the parry uses the battle band (its horn melody)', notes.some((n) => n.inst === 'horn'));
check('the same cue cools down', !player.play('parry', beat, clock, []));
const top = (id: string, now: number): number => {
  notes.length = 0;
  player.play(id, beat, { ...clock, now }, []);
  return notes[notes.length - 1]?.midi ?? 0; // the melody note that tops the answer
};
const first = top('strike', 20);
const second = top('strike', 20.5);
const third = top('strike', 21);
check('a combo of hits climbs higher', second > first && third > second, `${first} ${second} ${third}`);
check('the band steps aside while a reaction plays its part', player.quiet('melody', Math.max(...notes.map((n) => n.t))));
notes.length = 0;
player.play('block', beat, { ...clock, now: 21.01 }, []);
const strikeEnd = 21.1 + 0.3;
check('reactions take turns instead of piling up', notes.length > 0 && Math.min(...notes.map((n) => n.t)) >= strikeEnd - 0.11, `${notes.map((n) => n.t).join(' ')}`);
const varied = new CuePlayer(fakeBand, { input: null, target: 1, echo: null } as unknown as Channel, mood, new MusicRng(11));
const takes = new Set<string>();
for (let k = 0; k < 12; k++) {
  notes.length = 0;
  varied.play('strike', beat, { ...clock, now: 100 + k * 10 }, []);
  takes.add(notes.map((n) => `${n.inst}${n.midi}@${Math.round((n.t % 10) * 100)}`).join(','));
}
check('spaced-out hits never sound quite the same', takes.size >= 6, `${takes.size}`);
notes.length = 0;
const fresh = new CuePlayer(fakeBand, { input: null, target: 1, echo: null } as unknown as Channel, mood, steady);
fresh.play('relief', beat, clock, []);
const reliefHorn = notes.some((n) => n.inst === 'horn');
mood.feed('triumph', 1, 10);
for (let k = 0; k < 20; k++) mood.update(0.5);
notes.length = 0;
fresh.play('relief', beat, { ...clock, now: 30 }, []);
check('a fight that ends in victory gets the brass fanfare, not the quiet relief', !reliefHorn && notes.some((n) => n.inst === 'horn'));

if (failures()) throw new Error(`${failures()} music check(s) failed`);
