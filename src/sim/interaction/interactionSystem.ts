import type { Effect, Entity, SimContext, SimSystem, ThingDef } from '../../types';
import { GROUND_Z, countItem, packKey, removeItem, unpackSpot } from '../../types';
import { rainAt, rollLoot, thingDef } from '../../content';

const HEAT: readonly Effect[] = [{ type: 'heat', amount: 1 }];

/**
 * The world's own rules: fire grows, spreads (faster downwind and through oil), throws sparks on
 * the wind, chars walls and leaves ash; damp ground dries; rain soaks whoever is out in it; motes
 * drift and land; traps and campfires react to whatever touches them; doors open unless something
 * heavy is in the way; containers open (if you have the key) and spill their contents out.
 */
export const interactionSystem: SimSystem = (ctx: SimContext) => {
  const { state, tiles, rng, content } = ctx;
  const w = state.weather;
  const windSpeed = Math.hypot(w.wind.x, w.wind.y);
  const wux = windSpeed > 0 ? w.wind.x / windSpeed : 0;
  const wuy = windSpeed > 0 ? w.wind.y / windSpeed : 0;
  const heatSpot = (x: number, y: number, z: number): void => {
    state.queues.effects.push({ target: z === GROUND_Z ? { kind: 'tile', x, y } : { kind: 'cell', x, y, z }, effects: HEAT, source: null, from: null });
  };

  // Burning stuff — ground tiles and cells of the 3D layer alike: the same fuel, the same spread.
  const { matter } = ctx;
  const step = state.tick;
  let sparks = -1;
  // What a big fire throws up on the wind (sparks), from the rules.
  const rule = ctx.content.rules.fire;
  const mote = rule.mote;
  // Fires far from every player burn out but sleep: they no longer spread, throw sparks or scorch.
  const eyes: { x: number; y: number }[] = [];
  for (const id of Object.values(state.players)) {
    const p = state.entities.get(id);
    if (p) eyes.push(p.pos);
  }
  const sleep2 = rule.sleep * rule.sleep;
  const burning = matter.burning();
  for (const key of burning) {
    const { x, y, z } = unpackSpot(key);
    const ground = z === GROUND_Z;
    const inf = matter.info(x, y, z);
    const fire = matter.get('fire', x, y, z);
    if (!inf || fire <= 0) {
      if (fire > 0) matter.set('fire', x, y, z, 0);
      if (ground) state.burning.delete(packKey(x, y));
      continue;
    }
    const oil = matter.get('oil', x, y, z);
    const wet = matter.wetness(x, y, z);
    if (wet > 170 && rng.chance(0.08) && oil === 0) {
      matter.set('fire', x, y, z, 0);
      ctx.emit({ type: 'doused', x, y, z });
      continue;
    }
    // Oil burns first (fuel untouched), then the material's own fuel. Visible values only change on
    // the spot's spread beat so fires don't flood the network with tiny updates.
    const beat = (step + key) % rule.beat === 0;
    if (oil > 0) {
      if (beat) matter.set('oil', x, y, z, oil - 12);
    } else matter.set('fuel', x, y, z, matter.get('fuel', x, y, z) - 1);
    if (beat) matter.set('fire', x, y, z, Math.min(255, fire + (oil > 0 ? 24 : 12)));
    if (matter.get('fuel', x, y, z) <= 0 && matter.get('oil', x, y, z) <= 0) {
      matter.set('fire', x, y, z, 0);
      // Oil on bare stone burns off and leaves the stone alone (and sooty): only fuel is consumed.
      if (inf.flammability <= 0) {
        if (inf.shape === 'block') matter.set('soot', x, y, z, matter.get('soot', x, y, z) + 40);
        ctx.emit({ type: 'doused', x, y, z });
        continue;
      }
      matter.set('fuel', x, y, z, 0);
      matter.setKind(x, y, z, inf.burnsInto);
      // What burned leaves its soot on the solid stuff around it.
      matter.forNeighbours(x, y, z, (nx, ny, nz, w) => {
        if (w < 0.9) return;
        if (matter.info(nx, ny, nz)?.shape === 'block') matter.set('soot', nx, ny, nz, matter.get('soot', nx, ny, nz) + 70);
      });
      ctx.emit({ type: 'burntOut', x, y, z });
      continue;
    }
    // Spread every few ticks, staggered so fires do not pulse in lockstep.
    if (!beat) continue;
    const at = matter.place(x, y, z);
    if (eyes.length > 0 && !eyes.some((p) => (p.x - at.x) ** 2 + (p.y - at.y) ** 2 < sleep2)) continue;
    // A fire with little fuel left spreads less.
    const left = oil > 0 ? 1 : Math.max(rule.dying, Math.min(1, matter.get('fuel', x, y, z) / Math.max(1, inf.fuel)));
    const heat = Math.min(1, fire / 160) * (oil > 0 ? 2.2 : 1) * left;
    matter.forNeighbours(x, y, z, (nx, ny, nz, w) => {
      const n = matter.info(nx, ny, nz);
      if (!n) return;
      const nOil = matter.get('oil', nx, ny, nz);
      if (n.flammability <= 0 && nOil === 0) return;
      if (matter.get('fire', nx, ny, nz) > 0) return;
      const dx = nx - x;
      const dy = ny - y;
      const flat = Math.hypot(dx, dy);
      const along = flat > 0 ? (dx * wux + dy * wuy) / flat : 0;
      const windF = Math.max(0.12, 1 + along * windSpeed * 0.28);
      const p = (n.flammability + (nOil > 0 ? 0.9 : 0)) * rule.spread * heat * windF * w;
      if (rng.chance(p)) heatSpot(nx, ny, nz);
    });
    // Strong wind lifts burning motes far ahead of the fire front.
    if (fire > 120 && rng.chance(rule.spark.chance + windSpeed * rule.spark.wind)) {
      if (sparks < 0) {
        sparks = 0;
        for (const e of state.entities.values()) if (e.def === mote) sparks++;
      }
      if (sparks < rule.spark.max) {
        sparks++;
        ctx.spawn(mote, at.x, at.y, {
          z: at.z + 1.2,
          vel: { x: w.wind.x * 0.9 + rng.range(-1, 1), y: w.wind.y * 0.9 + rng.range(-1, 1) },
          vz: rng.range(2, 4.5),
        });
      }
    }
  }

  // Damp stuff dries out over time (not while it rains on it; under a roof it dries even in a storm).
  if (step % 20 === 0) {
    for (const key of matter.damp()) {
      const { x, y, z } = unpackSpot(key);
      const dry = rainAt(content.sky, w, x, y) > 0.2 && matter.exposed(x, y, z) ? 0 : 6;
      const v = matter.get('wet', x, y, z) - dry;
      matter.set('wet', x, y, z, v);
      if (v <= 0 && z === GROUND_Z) state.damp.delete(packKey(x, y));
    }
  }

  for (const e of state.entities.values()) {
    if (e.dead) continue;
    const def = thingDef(content, e.def);
    // Motes ride the wind and do their thing where they land.
    const m = def.mote;
    if (m) {
      e.vel.x += (w.wind.x * m.wind - e.vel.x) * 0.05;
      e.vel.y += (w.wind.y * m.wind - e.vel.y) * 0.05;
      e.vz -= 3 * ctx.dt;
      const cell = e.vz <= 0 ? matter.cellAt(e.pos.x, e.pos.y, e.z) : null;
      if (cell) {
        e.dead = true;
        state.queues.effects.push({ target: { kind: 'cell', x: cell.x, y: cell.y, z: cell.z }, effects: m.onLand, source: null, from: null });
      } else if (e.z <= tiles.ground(e.pos.x, e.pos.y)) {
        e.dead = true;
        state.queues.effects.push({ target: { kind: 'tile', x: e.pos.x, y: e.pos.y }, effects: m.onLand, source: null, from: null });
      } else if (e.age > m.life) e.dead = true;
    }
    if (def.use && e.cooldown > 0) e.cooldown--;
    // Traps and campfires: something heavy enough touching it sets it off, then it rests.
    const c = def.contact;
    if (c && e.heldBy === null) {
      if (e.cooldown > 0) {
        e.cooldown--;
        continue;
      }
      let triggered = false;
      for (const o of ctx.query.near(e.pos.x, e.pos.y, c.reach + 0.6)) {
        if (o === e || o.dead || o.heldBy !== null) continue;
        const od = thingDef(content, o.def);
        if (od.body.ghost || od.body.mass < c.minMass) continue;
        if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > c.reach + od.body.radius * 0.5) continue;
        if (Math.abs(o.z - e.z) > 0.6) continue;
        triggered = true;
        break;
      }
      if (triggered) {
        e.cooldown = c.cooldown;
        state.queues.effects.push({ target: { kind: 'area', x: e.pos.x, y: e.pos.y, z: e.z, radius: c.radius }, effects: c.effects, source: e.id, from: { x: e.pos.x, y: e.pos.y }, exclude: e.id });
        if (def.health === undefined && c.cooldown >= 30) ctx.emit({ type: 'trapSprung', entity: e.id, x: e.pos.x, y: e.pos.y });
      }
    }
  }

  // Interactions aimed at things and tiles.
  for (const u of state.queues.use) {
    const pl = state.entities.get(u.player);
    if (u.entity !== null) {
      const t = state.entities.get(u.entity);
      if (!t || !pl) continue;
      // Reviving a downed friend.
      if (t.player && t.player.downed > 0) {
        t.player.downed = 0;
        t.hp = Math.round(t.maxHp * 0.35);
        t.invuln = 40;
        ctx.emit({ type: 'notice', player: t.id, text: `${pl.player?.name ?? 'A friend'} pulled you back to your feet.` });
        ctx.emit({ type: 'journal', text: `${pl.player?.name ?? 'Someone'} revived ${t.player.name}.` });
        continue;
      }
      const tdef = thingDef(content, t.def);
      if (tdef.store && t.stored) {
        ctx.emit({ type: 'storeOpened', player: pl.id, entity: t.id });
        continue;
      }
      if (tdef.use) {
        if (t.cooldown > 0) {
          ctx.emit({ type: 'notice', player: pl.id, text: `You are not tired enough to use the ${tdef.name} again yet.` });
        } else {
          t.cooldown = tdef.use.cooldown;
          state.queues.effects.push({ target: { kind: 'entity', id: pl.id }, effects: tdef.use.effects, source: t.id, from: { x: t.pos.x, y: t.pos.y } });
          ctx.emit({ type: 'notice', player: pl.id, text: tdef.use.text });
        }
        continue;
      }
      if (tdef.portal) {
        usePortal(ctx, pl, t, tdef.portal);
        continue;
      }
      const cdef = tdef.container;
      if (!cdef || !t.container || t.container.opened) continue;
      if (t.container.locked && cdef.lock) {
        const inv = pl.actor?.inventory;
        if (!inv || countItem(inv, cdef.lock) === 0) {
          ctx.emit({ type: 'locked', entity: t.id, x: t.pos.x, y: t.pos.y });
          const keyName = content.items[cdef.lock]?.name.toLowerCase() ?? 'key';
          ctx.emit({ type: 'notice', player: pl.id, text: `It's locked. You need a ${keyName} — or something heavy enough to break it open.` });
          continue;
        }
        removeItem(inv, cdef.lock, 1);
        t.container.locked = false;
        ctx.emit({ type: 'unlocked', entity: t.id, x: t.pos.x, y: t.pos.y });
      }
      t.container.opened = true;
      ctx.emit({ type: 'containerOpened', entity: t.id, x: t.pos.x, y: t.pos.y });
      ctx.dropItems(t.pos.x, t.pos.y, t.z + 0.6, rollLoot(content, cdef.loot, rng));
      continue;
    }
    const inf = tiles.info(u.tileX, u.tileY);
    if (inf.shape !== 'door') continue;
    const open = tiles.door(u.tileX, u.tileY) > 128;
    if (open) {
      const blocker = ctx.query.near(u.tileX + 0.5, u.tileY + 0.5, 1.2).find((o) => {
        const od = thingDef(content, o.def);
        if (!(od.body.solid || od.carry) || od.body.ghost) return false;
        return Math.abs(o.pos.x - (u.tileX + 0.5)) < 0.5 + od.body.radius && Math.abs(o.pos.y - (u.tileY + 0.5)) < 0.5 + od.body.radius;
      });
      if (blocker) {
        ctx.emit({ type: 'doorJammed', x: u.tileX, y: u.tileY });
        continue;
      }
    }
    tiles.setDoor(u.tileX, u.tileY, open ? 0 : 255);
    ctx.emit({ type: 'doorToggled', x: u.tileX, y: u.tileY, open: !open });
  }
};

/**
 * A way into another realm. The whole party goes together or not at all: everyone must stand within the
 * realm's `gather` distance of it (so nobody is left behind in a place that is then set aside).
 */
function usePortal(ctx: SimContext, user: Entity, portal: Entity, way: NonNullable<ThingDef['portal']>): void {
  const { state, content } = ctx;
  if (state.queues.travel.length > 0) return;
  const gather = content.realms[state.realm]?.gather ?? 8;
  const away: string[] = [];
  for (const id of Object.values(state.players)) {
    const p = state.entities.get(id);
    if (!p?.player) continue;
    if (Math.hypot(p.pos.x - portal.pos.x, p.pos.y - portal.pos.y) > gather) away.push(p.player.name);
  }
  if (away.length > 0) {
    ctx.emit({ type: 'notice', player: user.id, text: `Wait for ${away.join(' and ')} — the whole party must be near to go together.` });
    return;
  }
  state.queues.travel.push({ to: way.to, x: portal.pos.x, y: portal.pos.y, by: user.id });
  ctx.emit({ type: 'notice', player: user.id, text: way.text });
}
