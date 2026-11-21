import type { EffectRequest, Entity, SimContext, SimSystem, SpellDef } from '../../types';
import { isDisabled, spellFor, spellKey, thingDef } from '../../content';

/**
 * Casting. The prepared spell is composed from runes (content/spellcraft.ts): a delivery (bolt,
 * cone, nova, self) plus effects for what it hits and where it bursts. This system only spends
 * mana, moves bolts and decides where things land.
 *
 * Travellers cast what is prepared in their runebook. Creatures cast through the very same code:
 * their brain's `cast` behaviour (sim/ai) asks for a spell written as a rune list (`wantCast`),
 * and anything with an aether pool (`actor.caster` in its definition) can spend it.
 */
export const magicSystem: SimSystem = (ctx: SimContext) => {
  const { state, dt, content } = ctx;
  for (const id of Object.values(state.players)) {
    const e = state.entities.get(id);
    const p = e?.player;
    if (!e || !p || e.dead) continue;
    p.mana = Math.min(p.maxMana, p.mana + (2.5 + p.stats.will * 0.25) * dt);
    if (!p.input.cast || p.downed > 0 || isDisabled(content, e.status)) continue;
    const def = spellFor(content, spellKey(p.prepared));
    if (!def) {
      ctx.emit({ type: 'notice', player: e.id, text: 'No spell prepared. Open your runebook (B).' });
      continue;
    }
    if (p.mana < def.cost) {
      ctx.emit({ type: 'fizzle', entity: e.id });
      continue;
    }
    p.mana -= def.cost;
    cast(ctx, e, def, p.input.pitch * 0.9, 1 + (p.skills.evocation.level - 1) * 0.08);
  }

  // Creatures that can cast: their aether refills, and a spell their brain asked for is let go.
  for (const e of state.entities.values()) {
    const a = e.actor;
    if (!a || e.player || e.dead) continue;
    const caster = thingDef(content, e.def).actor?.caster;
    if (!caster) continue;
    a.mana = Math.min(caster.mana, (a.mana ?? caster.mana) + caster.regen * dt);
    if ((a.castCooldown ?? 0) > 0) a.castCooldown = (a.castCooldown ?? 0) - 1;
    const want = a.wantCast;
    a.wantCast = null;
    if (!want || isDisabled(content, e.status) || (e.freeze ?? 0) > 0) continue;
    const def = spellFor(content, want);
    if (!def || (a.mana ?? 0) < def.cost) continue;
    a.mana = (a.mana ?? 0) - def.cost;
    // Aim at what it is fighting: up or down to the target's chest.
    const target = e.ai?.target != null ? state.entities.get(e.ai.target) : undefined;
    let pitch = 0;
    if (target) {
      const td = thingDef(content, target.def);
      const dist = Math.hypot(target.pos.x - e.pos.x, target.pos.y - e.pos.y) || 1;
      pitch = Math.atan2(target.z + td.body.height * 0.6 - (e.z + 1.45), dist);
    }
    cast(ctx, e, def, pitch, caster.power);
  }

  for (const e of state.entities.values()) {
    const pr = e.projectile;
    if (!pr || e.dead) continue;
    const def = spellFor(content, pr.spell);
    if (!def || def.delivery.type !== 'bolt') {
      e.dead = true;
      continue;
    }
    e.vz -= def.delivery.gravity * dt;
    pr.life--;
    let burst = pr.life <= 0;
    // Bolts burst on walls, trees and the ground — and on the cells of the 3D layer (a timber wall,
    // a thatched roof), checked also half a step back so a fast bolt cannot skip through a thin wall.
    if (!burst && (below(ctx, e.pos.x, e.pos.y, e.z) || e.z <= ctx.tiles.ground(e.pos.x, e.pos.y) || ctx.matter.cellAt(e.pos.x, e.pos.y, e.z) || ctx.matter.cellAt(e.pos.x - e.vel.x * dt * 0.5, e.pos.y - e.vel.y * dt * 0.5, e.z - e.vz * dt * 0.5))) burst = true;
    if (!burst && e.z <= ctx.tiles.waterLevel(e.pos.x, e.pos.y) && ctx.tiles.ground(e.pos.x, e.pos.y) < ctx.tiles.waterLevel(e.pos.x, e.pos.y)) burst = true;
    const owner = state.entities.get(pr.owner);
    if (!burst) {
      for (const o of ctx.query.near(e.pos.x, e.pos.y, 1.2)) {
        if (o.id === pr.owner || o.dead) continue;
        const od = thingDef(content, o.def);
        if (od.body.ghost || o.item) continue;
        if (e.z < o.z - 0.2 || e.z > o.z + od.body.height + 0.3) continue;
        if (Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y) > od.body.radius + 0.4) continue;
        if (owner) hitBody(ctx, owner, o, def, pr.power ?? 1, { x: e.pos.x - e.vel.x, y: e.pos.y - e.vel.y });
        burst = true;
        break;
      }
    }
    if (!burst) continue;
    e.dead = true;
    // Step back out of the wall so the effect lands on the near side.
    const bx = e.pos.x - e.vel.x * dt * 0.5;
    const by = e.pos.y - e.vel.y * dt * 0.5;
    ctx.emit({ type: 'spellBurst', spell: pr.spell, x: bx, y: by, z: e.z });
    if (def.burst.radius > 0 && def.burst.effects.length) {
      state.queues.effects.push({
        target: { kind: 'area', x: bx, y: by, z: e.z, radius: def.burst.radius },
        effects: def.burst.effects,
        source: pr.owner,
        from: { x: bx, y: by },
        scale: pr.power ?? 1,
        // A friendly spell passes through its caster's own side, whoever that is.
        spare: def.friendly ? owner?.faction : undefined,
      });
    }
  }
};

/** Lets a spell go from this caster: a cone, a ring, a ward on itself or a bolt flying out along `pitch`. */
function cast(ctx: SimContext, e: Entity, def: SpellDef, pitch: number, skill: number): void {
  ctx.emit({ type: 'spellCast', entity: e.id, spell: def.id, x: e.pos.x, y: e.pos.y });
  const power = skill * def.power;
  const d = def.delivery;
  if (d.type === 'cone') cone(ctx, e, def, d.range * skill, d.width, power);
  else if (d.type === 'self') hitBody(ctx, e, e, def, power);
  else if (d.type === 'nova') nova(ctx, e, def, d.radius * Math.sqrt(skill), power);
  else {
    const cos = Math.cos(e.angle);
    const sin = Math.sin(e.angle);
    const hs = Math.cos(pitch) * d.speed;
    ctx.spawn('bolt', e.pos.x + cos * 0.6, e.pos.y + sin * 0.6, {
      z: e.z + 1.45,
      prevZ: e.z + 1.45,
      vel: { x: cos * hs, y: sin * hs },
      vz: Math.sin(pitch) * d.speed + (d.gravity > 0 ? 2 : 0),
      projectile: { owner: e.id, spell: def.id, life: d.life, power },
      angle: e.angle,
    });
  }
}

function hitBody(ctx: SimContext, caster: Entity, target: Entity, def: SpellDef, scale: number, from?: { x: number; y: number }): void {
  if (def.friendly && caster !== target && caster.faction === target.faction) return;
  const req: EffectRequest = {
    target: { kind: 'entity', id: target.id },
    effects: def.hit,
    source: caster.id,
    from: from ?? { x: caster.pos.x, y: caster.pos.y },
    scale,
  };
  ctx.state.queues.effects.push(req);
}

function cone(ctx: SimContext, e: Entity, def: SpellDef, range: number, width: number, power: number): void {
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  for (const o of ctx.query.near(e.pos.x, e.pos.y, range)) {
    if (o === e || o.dead || o.heldBy !== null) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy) || 1;
    if ((dx * cos + dy * sin) / d < width) continue;
    hitBody(ctx, e, o, def, (1 - d / range) * power);
  }
  // Tiles in the cone get the burst effects (Gust fans flames downwind).
  if (!def.burst.effects.length) return;
  for (let s = 1.5; s < range; s += 1) {
    for (let w = -s * 0.5; w <= s * 0.5; w += 1) {
      const x = e.pos.x + cos * s - sin * w;
      const y = e.pos.y + sin * s + cos * w;
      ctx.state.queues.effects.push({ target: { kind: 'tile', x, y }, effects: def.burst.effects, source: e.id, from: { x: e.pos.x, y: e.pos.y }, scale: power });
    }
  }
}

/** A ring bursting out around the caster: every body inside gets the hit, the ground gets the burst. */
function nova(ctx: SimContext, e: Entity, def: SpellDef, radius: number, power: number): void {
  for (const o of ctx.query.near(e.pos.x, e.pos.y, radius)) {
    if (o === e || o.dead || o.heldBy !== null) continue;
    const d = Math.hypot(o.pos.x - e.pos.x, o.pos.y - e.pos.y);
    hitBody(ctx, e, o, def, power * (1 - (d / radius) * 0.5));
  }
  if (!def.burst.effects.length) return;
  ctx.state.queues.effects.push({
    target: { kind: 'area', x: e.pos.x, y: e.pos.y, z: e.z, radius },
    effects: def.burst.effects,
    source: e.id,
    from: { x: e.pos.x, y: e.pos.y },
    scale: power,
    exclude: e.id,
    spare: def.friendly ? e.faction : undefined,
  });
}

/** True when a solid thing here (tree, rock, wall) reaches up to height z. Things with no height block at any height. */
function below(ctx: SimContext, x: number, y: number, z: number): boolean {
  if (!ctx.tiles.blocked(x, y)) return false;
  const h = ctx.tiles.info(x, y).height;
  return h <= 0 || z <= ctx.tiles.ground(x, y) + h;
}
