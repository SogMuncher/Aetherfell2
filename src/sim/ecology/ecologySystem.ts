import type { Entity, SimContext, SimSystem } from '../../types';
import { CHUNK_SIZE, TICK_RATE, unpackKey } from '../../types';
import { isDark, thingDef } from '../../content';


/**
 * The living world: wildlife comes and goes around the party according to habitat and time of
 * day, and factions remember what the party did. (Daily routines are a brain behaviour: sim/ai.)
 */
export const ecologySystem: SimSystem = (ctx: SimContext) => {
  const { state, rng, tiles } = ctx;
  const t = state.weather.time;
  // Under rock it is always dark: no sun to keep the dangerous things away.
  const night = isDark(ctx.content, state.realm, t);
  if (state.tick % 20 === 0) changeOverTime(ctx);

  // Faction memory: a faction resents whoever kills its own, and warms to whoever kills its enemies.
  for (const k of state.queues.kills) {
    const killer = state.entities.get(k.killer);
    const victim = thingDef(ctx.content, k.def);
    if (!killer || !victim.faction || killer.faction === victim.faction) continue;
    for (const [f, feels] of Object.entries(state.factions)) {
      if (f === killer.faction) continue;
      const toVictim = f === victim.faction ? 1 : (feels[victim.faction] ?? 0);
      const before = feels[killer.faction] ?? 0;
      if (f === victim.faction) feels[killer.faction] = Math.max(-1, before - 0.6);
      else if (toVictim < -0.5) feels[killer.faction] = Math.min(1, before + 0.03);
    }
    if (victim.talk && killer.player) ctx.emit({ type: 'journal', text: 'Word of the killing will spread. Villagers will not forget.' });
  }
  // Hitting someone who can talk sours their whole faction a little.
  for (const e of state.entities.values()) {
    if (!e.npc || !e.actor || e.actor.lastAttacker === null || e.invuln !== 1) continue;
    const att = state.entities.get(e.actor.lastAttacker);
    const feels = state.factions[e.faction];
    if (att && feels && att.faction !== e.faction) feels[att.faction] = Math.max(-1, (feels[att.faction] ?? 0) - 0.08);
  }

  if (state.tick % 40 !== 0) return;
  const players = Object.values(state.players)
    .map((id) => state.entities.get(id))
    .filter((e): e is Entity => !!e);
  if (!players.length) return;

  // Things that wander off when nobody is around. What belongs to a place stays while anyone is near
  // it (rules.sites.keep reaches further than the distance places are filled at).
  for (const e of state.entities.values()) {
    const own = thingDef(ctx.content, e.def).despawn;
    if (own === undefined || e.heldBy !== null) continue;
    const range = e.site !== undefined ? Math.max(own, ctx.content.rules.sites.keep) : own;
    if (!players.some((p) => Math.hypot(p.pos.x - e.pos.x, p.pos.y - e.pos.y) < range)) e.dead = true;
  }

  for (const p of players) {
    for (const h of ctx.content.habitats) {
      if ((h.realm ?? 'overworld') !== state.realm) continue;
      const cap = night ? h.night : h.day;
      let count = 0;
      for (const o of ctx.query.near(p.pos.x, p.pos.y, 70)) if (o.def === h.thing) count++;
      if (count >= cap) continue;
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(45, 65);
      const x = p.pos.x + Math.cos(a) * d;
      const y = p.pos.y + Math.sin(a) * d;
      const kind = tiles.kind(x, y);
      if (!h.tiles.includes(kind) || tiles.ground(x, y) < 0.5) continue;
      const [lo, hi] = night ? h.nightGroup : h.group;
      const pack = lo + rng.int(hi - lo + 1);
      for (let i = 0; i < pack; i++) {
        const sx = x + rng.range(-2, 2);
        const sy = y + rng.range(-2, 2);
        if (tiles.blocked(sx, sy)) continue;
        const z = tiles.ground(sx, sy);
        ctx.spawn(h.thing, sx, sy, { z, prevZ: z });
      }
    }
  }
};

/**
 * Tiles that change by themselves (content/tiles.ts `later`): ash greens over, a charred trunk
 * falls. A tile waits while it burns, while the ground is not as dry or wet as it needs, and while
 * nobody is near enough to have its patch of world loaded.
 */
function changeOverTime(ctx: SimContext): void {
  const { state, tiles } = ctx;
  if (state.later.size === 0) return;
  const retry = state.tick + 60 * TICK_RATE;
  let done = 0;
  for (const [key, at] of state.later) {
    if (at > state.tick) continue;
    const { x, y } = unpackKey(key);
    if (!tiles.peekChunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE))) continue;
    const later = tiles.info(x, y).later;
    if (!later) {
      state.later.delete(key);
      continue;
    }
    const wet = tiles.wet(x, y) > 40 || state.weather.wetness > 0.5;
    if (tiles.fire(x, y) > 0 || (later.needs === 'dry' && wet) || (later.needs === 'wet' && !wet)) {
      state.later.set(key, retry);
      continue;
    }
    tiles.setKind(x, y, later.into);
    if (++done >= 200) break;
  }
}
