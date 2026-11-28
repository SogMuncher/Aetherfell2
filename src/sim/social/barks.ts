// Barks: talkers blurt out a line when their brain changes plan or something happens to or near them (lines are data)
import type { Content, Entity, SimContext, SimSystem } from '../../types';
import { fillText, hauntNow, isCreature, isDark, isFollower, thingDef } from '../../content';

/**
 * One generic system for every talker (a thing with `speech.barks`): the moment word ('hurt', 'do.flee', 'go.home',
 * 'fire'...) picks a line from its bark set (content/barks*.ts) and it is said as an ordinary 'say' (a bubble over the
 * head and the speaker's own voice). Moments come from this tick's events (blows, deaths, fire, thunder, spells,
 * statuses) and, once a second per talker, from its own state: the behaviour its brain is on, where its routine sends
 * it, joining or leaving the party, loot lying near, a traveller close by, idle chatter. Only talkers a traveller could
 * hear bark, each keeps quiet a while after speaking, and each moment has its own odds, so a town murmurs but never chatters.
 */
export const barkSystem: SimSystem = (ctx: SimContext) => {
  const { state, content } = ctx;
  const R = content.barkRules;
  const travellers: Entity[] = [];
  for (const e of state.entities.values()) if (e.player && !e.dead) travellers.push(e);
  if (travellers.length === 0) return;
  const near = (x: number, y: number, r: number): boolean => travellers.some((p) => (p.pos.x - x) ** 2 + (p.pos.y - y) ** 2 < r * r);
  const say = (e: Entity | undefined, moment: string, who?: Entity): boolean => (e ? bark(ctx, e, moment, who, near) : false);
  // Everyone who saw it (one at most speaks up: the first who has a line and passes the odds).
  const around = (x: number, y: number, moment: (e: Entity) => string | null, who?: Entity): void => {
    for (const e of ctx.query.near(x, y, R.sees)) {
      const m = moment(e);
      if (m && say(e, m, who)) return;
    }
  };
  const lastBlow = new Map<number, number>();
  for (const ev of ctx.heard) {
    switch (ev.type) {
      case 'hit': {
        lastBlow.set(ev.target, ev.source);
        const t = state.entities.get(ev.target);
        if (!t || t.dead) break;
        const low = t.hp < (thingDef(content, t.def).health?.hp ?? 1) * 0.3;
        say(t, ev.parried || ev.blocked ? 'block' : low ? 'lowHealth' : 'hurt', state.entities.get(ev.source));
        break;
      }
      case 'death': {
        const dead = state.entities.get(ev.entity);
        const killer = lastBlow.get(ev.entity);
        if (!dead?.actor) break;
        if (killer !== undefined && say(state.entities.get(killer), 'kill', dead)) break;
        around(ev.x, ev.y, (e) => (e.id === ev.entity ? null : e.faction === dead.faction ? 'allyDied' : 'deathNear'), dead);
        break;
      }
      case 'ignited':
        around(ev.x, ev.y, () => 'fire');
        break;
      case 'spellCast':
        around(ev.x, ev.y, (e) => (e.id === ev.entity ? null : 'magic'), state.entities.get(ev.entity));
        break;
      case 'propBroken':
        around(ev.x, ev.y, () => 'broke');
        break;
      case 'thunder':
        for (const p of travellers) around(p.pos.x, p.pos.y, () => 'thunder');
        break;
      case 'weatherShift':
        if (ev.rain > 0.35 && content.realms[state.realm]?.sky !== false) {
          for (const p of travellers) around(p.pos.x, p.pos.y, (e) => (state.volume.openSky(e.pos.x, e.pos.y, e.z + 1.8) ? 'rain' : null));
        }
        break;
      case 'thrown':
        say(state.entities.get(ev.entity), 'throw');
        break;
      case 'statusOn':
        say(state.entities.get(ev.entity), `status.${ev.status}`);
        break;
      case 'locked':
      case 'doorJammed':
        if ('entity' in ev) say(state.entities.get(ev.entity), 'locked');
        break;
      default:
        break;
    }
  }
  // Once a second each talker looks at its own plan.
  const night = isDark(content, state.realm, state.weather.time);
  for (const e of state.entities.values()) {
    if ((state.tick + e.id) % 20 !== 0 || e.dead || !isCreature(e) || !barksOf(content, e) || !near(e.pos.x, e.pos.y, R.heard)) continue;
    const follower = isFollower(content, e);
    const doing = e.ai.doing ?? '';
    const place = e.ai.doing === 'routine' ? hauntNow(content, state.weather, e) : '';
    // First seen: what it is already doing is no news.
    const b = (e.ai.bark ??= { at: -1e9, doing, place, follower, loot: -1, greet: -1e9 });
    const foe = e.ai.target !== null ? state.entities.get(e.ai.target) : undefined;
    if (follower !== b.follower) {
      b.follower = follower;
      say(e, follower ? 'hired' : 'dismissed');
    } else if (doing !== b.doing) {
      b.doing = doing;
      if (doing) say(e, `do.${doing}`, foe);
    } else if (place !== b.place) {
      b.place = place;
      if (place) say(e, `go.${place}`) || say(e, place === 'home' ? '' : 'go.work');
    } else if (!foe) {
      const loot = ctx.query.near(e.pos.x, e.pos.y, 5).find((o) => o.item && o.heldBy === null && o.id !== b.loot);
      const p = travellers.find((t) => (t.pos.x - e.pos.x) ** 2 + (t.pos.y - e.pos.y) ** 2 < 16);
      if (loot) {
        b.loot = loot.id;
        say(e, 'loot');
      } else if (p && state.tick - b.greet > 1200) {
        b.greet = state.tick;
        say(e, night && linesFor(content, e, 'greetNight') ? 'greetNight' : 'greet', p);
      } else if (e.ai.mode === 'idle' || e.ai.mode === 'wander') say(e, night && linesFor(content, e, 'idleNight') ? 'idleNight' : 'idle');
    }
  }
};

function barksOf(c: Content, e: Entity): string | undefined {
  return thingDef(c, e.def).speech?.barks;
}

function linesFor(c: Content, e: Entity, moment: string): readonly string[] | undefined {
  const set = barksOf(c, e);
  const l = set ? c.barks[set]?.[moment] : undefined;
  return l && l.length > 0 ? l : undefined;
}

/** Says a line for this moment if the speaker has one, is heard, has been quiet long enough and the odds allow. */
function bark(ctx: SimContext, e: Entity, moment: string, who: Entity | undefined, heard: (x: number, y: number, r: number) => boolean): boolean {
  const { state, content } = ctx;
  const R = content.barkRules;
  if (e.player || e.dead || !e.ai || !moment) return false;
  const lines = linesFor(content, e, moment);
  if (!lines || !heard(e.pos.x, e.pos.y, R.heard)) return false;
  const b = (e.ai.bark ??= { at: -1e9, doing: e.ai.doing ?? '', place: '', follower: isFollower(content, e), loot: -1, greet: -1e9 });
  if (state.tick - b.at < R.quiet / ctx.dt) return false;
  // Its own dice from the tick, the speaker and the moment: words never shift the world's shared randomness.
  const roll = (k: number): number => {
    let h = Math.imul(state.tick ^ Math.imul(e.id, 0x9e3779b1) ^ Math.imul(moment.length + k, 0x85ebca6b), 0xc2b2ae35);
    h ^= h >>> 15;
    h = Math.imul(h, 0x27d4eb2f);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
  if (roll(moment.charCodeAt(0)) >= (R.odds[moment] ?? R.chance)) return false;
  b.at = state.tick;
  const text = fillText(lines[Math.floor(roll(7) * lines.length)] ?? '', {
    name: e.npc?.name ?? thingDef(content, e.def).name,
    foe: nameOf(content, e.ai.target !== null ? state.entities.get(e.ai.target) : who),
    who: nameOf(content, who),
    place: placeName(content, b.place),
  });
  ctx.emit({ type: 'say', speaker: e.id, text });
  return true;
}

function nameOf(c: Content, e: Entity | undefined): string {
  if (!e) return 'you';
  return e.player?.name ?? e.npc?.name ?? thingDef(c, e.def).name;
}

/** A place word as words: 'the square', 'the fields', 'the tavern'. */
function placeName(c: Content, word: string): string {
  if (word === 'home' || word === '') return 'home';
  if (word === 'square') return 'the square';
  if (word === 'edge') return 'the fields';
  return `the ${(c.structures[word]?.name ?? word).toLowerCase()}`;
}
