// Sounds of bodies and blows: steps, swings, strikes, hits, deaths, voices, spells, traps, frost, breakage, gear (split from gameAudio.ts)
import type { DamageKind, SimEvent, SimState } from '../types';
import { TILES } from '../content/tiles';
import { CONTENT, itemDef, thingDef, spellFor } from '../content';
import { burstSpell, castSpell, effectBurst, fatigue, individual, jit, rnd, runeMotif, speak, speciesVoice, step, strike, swing } from './sfx';

import type { GameAudio } from './gameAudio';

/** Plays this event's sound if it is one of these; false when it is not. */
export function bodySounds(a: GameAudio, ev: SimEvent, state: SimState, localId: number | null): boolean {
  const e = a.e;
  if (!e) return false;
  const t = e.now;
  switch (ev.type) {
    case 'footstep': {
      const out = a.at(ev.x, ev.y, 30);
      if (!out) break;
      const ent = state.entities.get(ev.entity);
      const mass = ent ? thingDef(CONTENT, ent.def).body.mass : 70;
      const foot: 0 | 1 = a.foot.get(ev.entity) === 1 ? 0 : 1;
      a.foot.set(ev.entity, foot);
      if (a.foot.size > 512) a.foot.clear();
      const wet = a.tiles ? Math.max(a.tiles.wet(ev.x, ev.y), state.weather.rain * 0.6) : state.weather.rain * 0.6;
      step(e, out, t, ev.surface, { level: ev.entity === localId ? 0.09 : 0.06, mass, wet, foot });
      break;
    }
    case 'swing': {
      const out = a.at(ev.x, ev.y, 30);
      if (!out) break;
      const ent = state.entities.get(ev.entity);
      const w = a.weaponOf(ent);
      const mine = ent?.player !== undefined;
      // A wound-up blow is a deeper, louder whoosh.
      swing(e, out, t, { reach: (w?.reach ?? 1.4) * (1 + ev.power * 0.5), speed: (w?.speed ?? 1) * (1 - ev.power * 0.35), level: (mine ? 0.14 : 0.08) * (1 + ev.power * 0.8) });
      break;
    }
    case 'charge': {
      const out = a.at(ev.x, ev.y, 25);
      if (!out) break;
      const ent = state.entities.get(ev.entity);
      const spell = ent?.ai?.cast ? spellFor(CONTENT, ent.ai.cast.spell) : null;
      if (spell && ent?.ai?.cast) {
        // A caster gathering a spell hums the spell's own notes, quietly.
        if (ev.stage === 'start') runeMotif(e, out, t, CONTENT, ent.ai.cast.spell.split('+'), a.keyRoot, 0.025);
      } else if (ev.stage === 'full') {
        // Fully wound: a bright creak of strain.
        e.tone(out, 'triangle', jit(520, 0.1), t, 0.1, 0.03, { from: 300, glide: 0.08, attack: 0.01 });
      } else if (ev.entity === localId) {
        e.burst(out, t, 0.12, 0.03, 'bandpass', jit(240, 0.15), { q: 2, to: 420, attack: 0.05 });
      }
      break;
    }
    case 'strike': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const m = CONTENT.materials[ev.material];
      const n = a.recent.hit(`strike:${Math.floor(ev.x)},${Math.floor(ev.y)}`, t, 0.3);
      const strength = Math.min(1, 0.35 + ev.power * 0.55) * fatigue(n);
      // The sound of the thing struck, by what it is made of; hard things add a ring on edges.
      strike(e, out, t, m?.sound ?? 'stone', { strength, mass: 120 + (m?.hardness ?? 0.3) * 400, weapon: ev.weapon });
      if ((m?.hardness ?? 0) >= CONTENT.rules.combat.surface.spark && ev.weapon !== 'blunt') strike(e, out, t + 0.01, 'metal', { strength: strength * 0.5, mass: 8, weapon: 'cut' });
      break;
    }
    case 'tileBroken': {
      const out = a.at(ev.x + 0.5, ev.y + 0.5);
      if (!out) break;
      const mat = CONTENT.materials[TILES[ev.tile]?.material ?? 'wood'];
      strike(e, out, t, mat?.sound ?? 'wood', { strength: 1, mass: 200, breaks: true });
      break;
    }
    case 'hit': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const target = state.entities.get(ev.target);
      const source = state.entities.get(ev.source);
      const tdef = target ? thingDef(CONTENT, target.def) : null;
      // Only melee blows carry a weapon sound; spells and falls already have their own.
      const near = source && target ? Math.hypot(source.pos.x - target.pos.x, source.pos.y - target.pos.y) < 4 : false;
      const kind: DamageKind | undefined = near ? a.weaponOf(source)?.kind : undefined;
      const n = a.recent.hit('hit', t, 0.4);
      const strength = Math.min(1, ev.damage / 20 + 0.2 + (ev.power ?? 0) * 0.25) * fatigue(n);
      if (ev.parried) {
        // Steel on steel: a bright ring, never quite the same twice.
        strike(e, out, t, 'metal', { strength: 0.9, mass: 20, weapon: 'cut' });
      } else if (ev.blocked) {
        strike(e, out, t, 'wood', { strength: 0.5, mass: 30, weapon: kind });
      } else {
        strike(e, out, t, a.soundOf(target), { strength, mass: tdef?.body.mass ?? 40, weapon: kind });
        // Living things cry out when hurt (not every time, or a fight turns into a choir).
        if (target && (target.actor || tdef?.brain) && Math.random() < (ev.target === localId ? 0.5 : 0.75)) {
          a.say(target, 'hurt', ev.target === localId ? 0.6 : 1);
        }
      }
      break;
    }
    case 'death': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const v = speciesVoice(CONTENT, ev.def, thingDef(CONTENT, ev.def));
      if (v) speak(e, out, t, individual(v, ev.entity), 'death', 1);
      if (v) e.burst(out, t + jit(0.05, 0.4), jit(0.3, 0.2), 0.12, 'lowpass', jit(220, 0.15));
      break;
    }
    case 'growl':
      a.say(state.entities.get(ev.entity), 'growl', 1, 40);
      break;
    case 'spellCast': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const spell = spellFor(CONTENT, ev.spell);
      if (spell) castSpell(e, out, t, CONTENT, spell, a.keyRoot);
      break;
    }
    case 'spellBurst': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const spell = spellFor(CONTENT, ev.spell);
      if (spell) burstSpell(e, out, t, CONTENT, spell);
      break;
    }
    case 'trapSprung': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      // The click of the plate, then whatever the trap does (its effects, like a spell's burst).
      const trap = state.entities.get(ev.entity);
      const def = trap ? thingDef(CONTENT, trap.def) : null;
      strike(e, out, t, a.soundOf(trap), { strength: 0.4, mass: 5, weapon: 'pierce' });
      if (def?.contact) effectBurst(e, out, t + jit(0.06, 0.3), CONTENT, def.contact.effects, def.contact.radius);
      else e.burst(out, t + 0.06, jit(1.1, 0.15), 0.4, 'lowpass', jit(600, 0.15), { to: 140, attack: 0.04 });
      break;
    }
    case 'froze': {
      const out = Math.random() < 0.15 ? a.at(ev.x + 0.5, ev.y + 0.5, 40) : null;
      if (out) e.burst(out, t + rnd(0, 0.3), 0.04, 0.08, 'highpass', rnd(3000, 5000), { q: 2 });
      break;
    }
    case 'thawed': {
      const out = Math.random() < 0.2 ? a.at(ev.x + 0.5, ev.y + 0.5, 30) : null;
      if (out) e.tone(out, 'sine', rnd(900, 1500), t, 0.08, 0.03, { to: rnd(500, 700) });
      break;
    }
    case 'shatter': {
      const out = a.at(ev.x, ev.y);
      if (!out) break;
      const ent = state.entities.get(ev.entity);
      strike(e, out, t, ent ? a.soundOf(ent) : 'glass', { strength: 1, mass: ent ? thingDef(CONTENT, ent.def).body.mass : 10, breaks: true });
      break;
    }
    case 'itemBroke': {
      const out = a.at(ev.x, ev.y);
      const it = itemDef(CONTENT, ev.item);
      if (out) strike(e, out, t, CONTENT.materials[it?.material ?? '']?.sound ?? 'glass', { strength: 1, mass: (it?.weight ?? 1) * 10, breaks: true });
      break;
    }
    case 'glide':
      if (ev.entity === localId && ev.open) {
        e.burst(e.sfx, t, jit(0.25, 0.15), 0.12, 'bandpass', jit(700, 0.12), { q: 1.5, to: jit(300, 0.15) });
        e.burst(e.sfx, t + jit(0.08, 0.3), jit(0.2, 0.15), 0.08, 'bandpass', jit(500, 0.12), { q: 1.5 });
      }
      break;
    case 'locked': {
      const out = a.at(ev.x, ev.y, 20);
      if (out) for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) e.burst(out, t + i * jit(0.07, 0.3), 0.04, jit(0.12, 0.2), 'bandpass', rnd(1800, 2400), { q: 4 });
      break;
    }
    case 'unlocked': {
      const out = a.at(ev.x, ev.y, 20);
      if (!out) break;
      e.burst(out, t, 0.05, 0.16, 'bandpass', jit(1500, 0.1), { q: 3 });
      const f = jit(440, 0.05);
      e.tone(out, 'triangle', f, t + jit(0.12, 0.2), 0.3, 0.05, { to: f * 1.5 });
      break;
    }
    case 'equip':
      if (ev.entity === localId) e.burst(e.sfx, t, jit(0.35, 0.15), 0.08, 'bandpass', jit(3000, 0.1), { q: 2, to: jit(5000, 0.1) });
      break;
    case 'armour': {
      // Buckles and plate: a hard piece clinks, cloth and hide rustle; a piece that breaks clatters.
      const ent = state.entities.get(ev.entity);
      const out = ent ? a.at(ent.pos.x, ent.pos.y, 20) : null;
      if (!out) break;
      const hard = ((ev.item ? itemDef(CONTENT, ev.item)?.look?.plate : undefined) ?? (ev.broke ? 1 : 0)) > 0.5;
      if (ev.broke) strike(e, out, t, 'metal', { strength: 0.5, mass: 2 });
      else strike(e, out, t, hard ? 'metal' : 'soft', { strength: ev.entity === localId ? 0.3 : 0.15, mass: hard ? 1 : 0.3 });
      break;
    }
    default:
      return false;
  }
  return true;
}
