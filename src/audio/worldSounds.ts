// Sounds of things in the world: statuses, doors, throws, impacts, fire, water, jumps, pickups, chests, speech, thunder (split from gameAudio.ts)
import type { SimEvent, SimState } from '../types';
import { CONTENT, itemDef, thingDef, spellFor } from '../content';
import { fatigue, jit, murmur, rnd, runeMotif, statusOn, step, strike, swing } from './sfx';

import type { GameAudio } from './gameAudio';

/** Plays this event's sound if it is one of these; false when it is not. */
export function worldSounds(a: GameAudio, ev: SimEvent, state: SimState, localId: number | null): boolean {
  const e = a.e;
  if (!e) return false;
  const t = e.now;
  switch (ev.type) {
    case 'statusOn': {
      const def = CONTENT.statuses[ev.status];
      if (!def) break;
      if (ev.entity === localId) statusOn(e, e.sfx, t, CONTENT, def, 1);
      else {
        const ent = state.entities.get(ev.entity);
        const out = ent ? a.at(ent.pos.x, ent.pos.y, 20) : null;
        if (out) statusOn(e, out, t, CONTENT, def, 0.5);
      }
      break;
    }
    case 'fizzle':
      if (ev.entity === localId) {
        const f = jit(180, 0.08);
        e.tone(e.sfx, 'square', f, t, jit(0.18, 0.15), 0.04, { to: f * 0.5 });
        e.burst(e.sfx, t, 0.12, 0.03, 'bandpass', jit(900, 0.2), { q: 2, to: 300 });
      }
      break;
    case 'spellPrepared':
      // The runes settle into place, each singing its own note: every spell has its own little tune.
      if (ev.entity === localId) runeMotif(e, e.sfx, t, CONTENT, spellFor(CONTENT, ev.spell)?.runes ?? [], a.keyRoot, 0.035);
      break;
    case 'runeLearned':
      // The music engine plays an in-key shimmer for a.
      break;
    case 'doorToggled': {
      const out = a.at(ev.x + 0.5, ev.y + 0.5);
      if (!out) break;
      // A creak of the hinge (pitch and length differ every time), then the door meeting its frame.
      const cls = a.tiles ? CONTENT.materials[a.tiles.info(ev.x, ev.y).material]?.sound ?? 'wood' : 'wood';
      const f = jit(ev.open ? 210 : 260, 0.12);
      const dur = jit(0.5, 0.2);
      e.tone(out, 'sawtooth', f, t, dur, 0.04, { to: f * (ev.open ? rnd(1.25, 1.5) : rnd(0.6, 0.75)), vibrato: rnd(0.03, 0.07), vibratoRate: rnd(10, 18), band: { freq: jit(900, 0.2), q: 2 } });
      strike(e, out, t + dur * 0.85, cls, { strength: ev.open ? 0.3 : 0.6, mass: 40 });
      break;
    }
    case 'doorJammed': {
      const out = a.at(ev.x + 0.5, ev.y + 0.5);
      if (out) strike(e, out, t, a.tiles ? CONTENT.materials[a.tiles.info(ev.x, ev.y).material]?.sound ?? 'wood' : 'wood', { strength: 0.8, mass: 60, weapon: 'blunt' });
      break;
    }
    case 'thrown': {
      const out = a.at(ev.x, ev.y, 30);
      const ent = state.entities.get(ev.entity);
      const mass = ent ? thingDef(CONTENT, ent.def).body.mass : 5;
      // Heavier things leave the hands with a deeper, slower whoosh.
      if (out) swing(e, out, t, { reach: 2, speed: Math.min(1.5, Math.max(0.5, Math.pow(10 / Math.max(0.5, mass), 0.25))), level: 0.1 });
      break;
    }
    case 'impact': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const ent = state.entities.get(ev.entity);
      const n = a.recent.hit(`impact:${ev.entity}`, t, 0.5);
      strike(e, out, t, a.soundOf(ent), { strength: ev.strength * fatigue(n), mass: ent ? thingDef(CONTENT, ent.def).body.mass : 30 });
      break;
    }
    case 'propBroken': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const def = thingDef(CONTENT, ev.def);
      strike(e, out, t, CONTENT.materials[def.material]?.sound ?? 'wood', { strength: 1, mass: def.body.mass, breaks: true });
      break;
    }
    case 'ignited': {
      const out = a.fireShot(t) ? a.at(ev.x + 0.5, ev.y + 0.5, 40) : null;
      if (out && Math.random() < 0.3) e.burst(out, t, jit(0.6, 0.25), jit(0.12, 0.2), 'lowpass', jit(300, 0.2), { to: jit(1200, 0.2), attack: 0.05 });
      break;
    }
    case 'doused': {
      const out = a.fireShot(t) ? a.at(ev.x + 0.5, ev.y + 0.5, 30) : null;
      if (out && Math.random() < 0.4) e.burst(out, t, jit(0.8, 0.25), jit(0.1, 0.2), 'highpass', jit(3000, 0.15), { to: jit(1800, 0.15), attack: 0.02 });
      break;
    }
    case 'splash': {
      const out = a.at(ev.x, ev.y, 40);
      if (!out) break;
      e.burst(out, t, jit(0.3 + ev.size * 0.4, 0.15), 0.14 + ev.size * 0.15, 'bandpass', jit(900, 0.12) / (0.8 + ev.size * 0.4), { q: 0.8, to: jit(250, 0.15) });
      for (let i = 2 + Math.floor(Math.random() * (3 + ev.size * 4)); i > 0; i--) e.tone(out, 'sine', rnd(600, 1400), t + rnd(0.05, 0.3 + ev.size * 0.2), 0.06, 0.03, { to: rnd(1600, 2400) });
      break;
    }
    case 'jump':
      if (ev.entity === localId) e.burst(e.sfx, t, jit(0.08, 0.2), 0.04, 'lowpass', jit(400, 0.15));
      break;
    case 'land': {
      if (ev.entity !== localId) break;
      // Landing sounds like the ground you land on, harder the faster you fall.
      const me = state.entities.get(ev.entity);
      const cls = me && a.tiles ? CONTENT.materials[a.tiles.info(me.pos.x, me.pos.y).material]?.sound ?? 'soft' : 'soft';
      e.burst(e.sfx, t, jit(0.15, 0.15), Math.min(0.25, ev.speed * 0.015), 'lowpass', jit(260, 0.12));
      step(e, e.sfx, t, cls, { level: Math.min(0.18, ev.speed * 0.012), mass: 70, wet: 0, foot: 0 });
      break;
    }
    case 'pickup':
      if (ev.player === localId) {
        const item = itemDef(CONTENT, ev.item);
        if (item?.category === 'currency') {
          // Coins: a little clink per coin, up to a handful.
          for (let i = Math.min(6, Math.max(2, ev.count)); i > 0; i--) strike(e, e.sfx, t + rnd(0, 0.12), 'metal', { strength: rnd(0.15, 0.3), mass: 0.3 });
        } else {
          // Light things chime higher than heavy ones; the interval wanders a little.
          const f = jit(988, 0.04) * Math.min(1.3, Math.max(0.7, Math.pow(1 / Math.max(0.05, item?.weight ?? 1), 0.1)));
          e.tone(e.sfx, 'triangle', f, t, 0.25, 0.06);
          e.tone(e.sfx, 'triangle', f * (Math.random() < 0.7 ? 1.335 : 1.5), t + jit(0.07, 0.2), 0.35, 0.05);
        }
      }
      break;
    case 'containerOpened': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const box = state.entities.get(ev.entity);
      const f = jit(160, 0.12);
      e.tone(out, 'sawtooth', f, t, jit(0.5, 0.2), 0.03, { to: f * rnd(1.35, 1.65), vibrato: rnd(0.03, 0.05), vibratoRate: rnd(9, 13), band: { freq: jit(800, 0.2), q: 2 } });
      strike(e, out, t + 0.02, a.soundOf(box), { strength: 0.3, mass: 60 });
      // A small rising chord in the key the music is in.
      const root = 392 * Math.pow(2, a.keyRoot / 12);
      [1, 1.26, 1.5, 2].slice(0, 3 + Math.floor(Math.random() * 2)).forEach((m, i) => e.tone(out, 'sine', root * m * 2, t + 0.3 + i * jit(0.09, 0.2), 0.8, 0.05));
      break;
    }
    case 'discovered':
    case 'skillUp':
      // Fanfares come from the music engine, in the key of whatever is playing.
      break;
    case 'say': {
      const sp = state.entities.get(ev.speaker);
      if (!sp) break;
      const out = a.at(sp.pos.x, sp.pos.y, 25);
      const v = a.voiceOf(sp);
      if (out && v) murmur(e, out, t, v, ev.text, 1);
      break;
    }
    case 'thunder': {
      // Thunder belongs to the sky: nobody hears it deep below.
      if (CONTENT.realms[state.realm]?.sky === false) break;
      const w = a.where(ev.x, ev.y);
      const delay = Math.min(3, w.d / 340);
      // A crack, then a roll that rumbles on for a while; far strikes lose their crack.
      const near = Math.max(0, 1 - w.d / 600);
      e.burst(e.amb, t + delay, jit(3.5, 0.3), 0.32, 'lowpass', jit(160, 0.2), { attack: 0.05, to: 60 });
      if (near > 0) e.burst(e.amb, t + delay, jit(0.4, 0.3), 0.2 * near, 'lowpass', jit(900, 0.2), { to: 200 });
      for (let i = Math.floor(rnd(1, 4)); i > 0; i--) e.burst(e.amb, t + delay + rnd(0.4, 2.5), jit(1.2, 0.3), rnd(0.08, 0.18), 'lowpass', rnd(90, 180), { attack: 0.2, to: 50 });
      break;
    }
    default:
      return false;
  }
  return true;
}
