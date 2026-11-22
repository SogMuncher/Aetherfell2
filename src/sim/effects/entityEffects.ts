import { type ArmourStats, type Effect, type EffectRequest, type Entity, GROUND_Z, type MaterialDef, type ReactionDef, type SimContext } from '../../types';
import { applyToSpot } from './spotEffects';
import { gearEffect, itemDef, pickRegion, rollLoot, thingDef, withWear } from '../../content';


export const DOWNED_TICKS = 20 * 30;
export const PHYSICAL = new Set(['cut', 'blunt', 'pierce', 'fall']);

// ---------------------------------------------------------------------------------------------
// Bodies

export function applyToEntity(ctx: SimContext, e: Entity, r: EffectRequest): void {
  if (e.dead || r.exclude === e.id) return;
  if (r.spare !== undefined && e.faction === r.spare) return;
  const { state, content } = ctx;
  const { combat, reactions } = content.rules;
  const def = thingDef(content, e.def);
  if (def.body.ghost) return;
  const mat = content.materials[def.material];
  const src = r.source !== null ? state.entities.get(r.source) : undefined;
  const downed = (e.player?.downed ?? 0) > 0;
  const scale = r.scale ?? 1;

  // 1. Guard and parry: only a melee blow coming from in front can be caught.
  let mult = 1;
  let blocked = false;
  let parried = false;
  if (r.swing) {
    if (e.invuln > 0 && r.source !== e.id) return;
    const a = e.actor;
    if (a?.guard && src && facing(e, src.pos.x, src.pos.y)) {
      if (state.tick - a.guardSince <= 4) {
        parried = true;
        addStatus(ctx, src, combat.parry.status, combat.parry.ticks);
        src.vel.x += Math.cos(e.angle) * combat.parry.shove;
        src.vel.y += Math.sin(e.angle) * combat.parry.shove;
      } else {
        blocked = true;
        mult = combat.block.damage;
        // A wound-up blow batters a guard down: the longer it was charged, the longer the blocker reels.
        addStatus(ctx, e, combat.block.status, combat.block.ticks + Math.round((r.charge ?? 0) * combat.charge.guardBreak));
        if (e.player) e.player.stamina = Math.max(0, e.player.stamina - combat.block.stamina);
      }
    }
  }

  // Armour: each request's blow lands on one part of the body (by how much of the fight lands there,
  // leaning with the way it was swung); whatever is worn there turns it, and wears.
  let guard: Guard | null | undefined;
  const piece = (): Guard | null => {
    if (guard !== undefined) return guard;
    guard = null;
    const regions = def.wears;
    if (!e.worn || !regions || Object.keys(e.worn).length === 0) return null;
    const region = pickRegion(content.gear, regions, r.swing ?? null, ctx.rng);
    const id = region ? e.worn[region] : undefined;
    const armour = id ? itemDef(content, id)?.armour : undefined;
    if (region && id && armour) guard = { region, id, armour };
    return guard;
  };

  // 2 + 3. Material reactions and statuses.
  let dmg = 0;
  let hurt = false;
  for (const eff of r.effects) {
    if (parried) break;
    switch (eff.type) {
      case 'damage': {
        // God mode (a debug cheat) shrugs off every kind of harm.
        if (!def.health || downed || e.player?.cheats?.god) break;
        hurt = true;
        const g = piece();
        const raw = eff.amount * scale * mult * (mat?.resist[eff.kind] ?? 1) * (g?.armour.resist[eff.kind] ?? 1);
        let d = raw;
        if (PHYSICAL.has(eff.kind)) d -= (def.health.armor + (g ? g.armour.armor * gearEffect(content.gear, g.armour) : 0)) * (1 - (eff.pierce ?? 0));
        if (raw > 0) {
          dmg += Math.max(1, Math.round(d));
          if (g) guard = wearDown(ctx, e, g, raw);
        }
        break;
      }
      case 'heal':
        if (!downed) e.hp = Math.min(e.maxHp, e.hp + eff.amount * scale);
        break;
      case 'restore':
        if (e.player) {
          if (eff.stat === 'mana') e.player.mana = Math.min(e.player.maxMana, e.player.mana + eff.amount * scale);
          else e.player.stamina = Math.min(e.player.maxStamina, e.player.stamina + eff.amount * scale);
        }
        break;
      case 'status':
        addStatus(ctx, e, eff.id, Math.round(eff.ticks * scale));
        break;
      case 'cure':
        for (const id of Object.keys(e.status)) if (content.statuses[id]?.tags.includes(eff.tag)) delete e.status[id];
        break;
      case 'push': {
        if (!r.from || e.heldBy !== null || def.body.anchored) break;
        const dx = e.pos.x - r.from.x;
        const dy = e.pos.y - r.from.y;
        const d = Math.hypot(dx, dy) || 1;
        const k = (eff.force * scale * (blocked ? 0.4 : 1)) / Math.max(0.5, def.body.mass / 50);
        // A shove can have its own direction (a sweep throws sideways).
        const ux = eff.angle !== undefined ? Math.cos(eff.angle) : dx / d;
        const uy = eff.angle !== undefined ? Math.sin(eff.angle) : dy / d;
        if (e.actor) {
          // Someone steering themselves would shrug a plain shove off at once: it rides along as knockback and fades.
          const kb = e.kb ?? { x: 0, y: 0 };
          kb.x += ux * k;
          kb.y += uy * k;
          e.kb = kb;
        } else {
          e.vel.x += ux * k;
          e.vel.y += uy * k;
        }
        if (eff.lift) e.vz += (eff.lift * scale) / Math.max(0.5, def.body.mass / 50);
        break;
      }
      case 'heat':
      case 'soak':
      case 'chill':
        react(ctx, e, reactions[eff.type], eff.amount, scale, mat);
        break;
      case 'coat':
        applyToSpot(ctx, Math.floor(e.pos.x), Math.floor(e.pos.y), GROUND_Z, { ...r, effects: [eff] });
        break;
      case 'spawn':
        for (let i = 0; i < eff.count; i++) ctx.spawn(eff.thing, e.pos.x, e.pos.y, { z: e.z + 0.5, prevZ: e.z + 0.5 });
        break;
    }
  }

  if (e.actor && src && src !== e) e.actor.lastAttacker = src.id;
  const killed = dmg > 0 && e.hp - dmg <= 0;
  // Hitstop: a solid blow holds both bodies still for a moment (longer for a harder or wound-up one, a parry or a kill).
  let hold = 0;
  if (r.swing) {
    const hs = combat.hitstop;
    if (parried) hold = hs.parried;
    else if (blocked) hold = hs.blocked;
    else if (dmg > 0) hold = Math.min(hs.max, Math.round(hs.base + dmg * hs.perDamage + hs.charged * (r.charge ?? 0))) + (killed ? hs.kill : 0);
    if (hold > 0) {
      e.freeze = Math.max(e.freeze ?? 0, hold);
      if (src && src !== e && src.actor) src.freeze = Math.max(src.freeze ?? 0, hold);
    }
  }
  if (hurt || r.swing) {
    ctx.emit({
      type: 'hit',
      target: e.id,
      source: r.source ?? -1,
      damage: dmg,
      blocked,
      parried,
      x: e.pos.x,
      y: e.pos.y,
      z: e.z + def.body.height * 0.6,
      ...(r.swing ? { dir: r.swing, power: r.charge ?? 0, hold, killed } : {}),
    });
  }
  if (dmg <= 0) return;
  e.hp -= dmg;
  if (dmg >= combat.heavyHit.damage && e.actor) addStatus(ctx, e, combat.heavyHit.status, combat.heavyHit.ticks);
  // Hitstun: whoever takes a clean blow flinches (more for a hard, wound-up or chopping one), which also breaks their own swing.
  if (r.swing && !blocked && !parried && e.actor && !killed) {
    const hu = combat.hitstun;
    const ticks = Math.min(hu.max, hu.base + dmg * hu.perDamage + combat.swings[r.swing].stun + hu.charged * (r.charge ?? 0));
    addStatus(ctx, e, hu.status, Math.round(ticks));
  }
  e.invuln = Math.max(e.invuln, 2);
  // 4. Death or destruction.
  if (e.hp <= 0) destroy(ctx, e, src ?? null);
}

export function facing(e: Entity, x: number, y: number): boolean {
  let da = Math.atan2(y - e.pos.y, x - e.pos.x) - e.angle;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  return Math.abs(da) < 1.1;
}

/** Heat, water or cold on a body: the status the rules say it brings, scaled by the amount. */
export function react(ctx: SimContext, e: Entity, r: ReactionDef, amount: number, scale: number, mat: MaterialDef | undefined): void {
  if (r.byFlammability) {
    const chance = amount * scale * (mat?.flammability ?? 0);
    if (chance > 0 && ctx.rng.chance(Math.min(1, chance))) addStatus(ctx, e, r.status, mat?.burnTicks ?? r.ticks);
    return;
  }
  const longer = r.longerWhile && e.status[r.longerWhile.status] ? r.longerWhile.factor : 1;
  addStatus(ctx, e, r.status, Math.round(r.ticks * amount * scale * longer));
  const f = r.freezes;
  if (f && (e.status[f.while] ?? 0) > 0) addStatus(ctx, e, f.status, Math.round(f.ticks * amount * scale));
}

/** Applies a status, honouring what it cancels and what blocks it. */
export function addStatus(ctx: SimContext, e: Entity, id: string, ticks: number): void {
  const def = ctx.content.statuses[id];
  if (!def || ticks <= 0) return;
  for (const b of def.blockedBy) if ((e.status[b] ?? 0) > 0) return;
  for (const c of def.cancels) delete e.status[c];
  const had = (e.status[id] ?? 0) > 0;
  e.status[id] = Math.max(e.status[id] ?? 0, ticks);
  if (!had) ctx.emit({ type: 'statusOn', entity: e.id, status: id });
}

/** The piece of armour a blow landed on. */
export interface Guard {
  region: string;
  id: string;
  armour: ArmourStats;
}

/** A piece that turned a blow wears: heavy blows wear it more; at nothing left it breaks. Returns the piece as it is now (null if gone). */
export function wearDown(ctx: SimContext, e: Entity, g: Guard, harm: number): Guard | null {
  const { content } = ctx;
  const left = g.armour.wear - (1 + Math.floor(harm / content.gear.rules.heavyBlow));
  if (!e.worn) return null;
  if (left <= 0) {
    delete e.worn[g.region];
    ctx.emit({ type: 'armour', entity: e.id, region: g.region, item: null, broke: true });
    if (e.player) ctx.emit({ type: 'notice', player: e.id, text: `Your ${(itemDef(content, g.id)?.name ?? 'armour').toLowerCase()} gives way and falls apart!` });
    return null;
  }
  const id = withWear(content.gear, g.id, left);
  e.worn[g.region] = id;
  const armour = itemDef(content, id)?.armour;
  return armour ? { region: g.region, id, armour } : null;
}

export function destroy(ctx: SimContext, e: Entity, src: Entity | null): void {
  const { state, content } = ctx;
  const def = thingDef(content, e.def);
  if (e.player) {
    e.hp = 0;
    e.player.downed = DOWNED_TICKS;
    e.player.gliding = false;
    if (e.player.holding !== null) {
      const held = state.entities.get(e.player.holding);
      if (held) held.heldBy = null;
      e.player.holding = null;
    }
    ctx.emit({ type: 'notice', player: e.id, text: 'You are down! A friend can revive you (E), or you will wake at the road.' });
    ctx.emit({ type: 'journal', text: `${e.player.name} was struck down.` });
    return;
  }
  e.dead = true;
  ctx.emit({ type: 'death', entity: e.id, def: e.def, x: e.pos.x, y: e.pos.y });
  if (!e.actor) ctx.emit({ type: 'propBroken', def: e.def, x: e.pos.x, y: e.pos.y });
  // Thrown things credit whoever threw them.
  const killer = src ? (src.thrownBy ?? src.id) : -1;
  state.queues.kills.push({ killer, def: e.def });
  const od = def.onDestroy;
  const area = (radius: number, effects: readonly Effect[]): void => {
    state.queues.effects.push({ target: { kind: 'area', x: e.pos.x, y: e.pos.y, z: e.z, radius }, effects, source: src?.id ?? null, from: { x: e.pos.x, y: e.pos.y }, exclude: e.id });
  };
  if (od?.effects?.length) area(od.radius ?? 1, od.effects);
  // Whatever was burning leaves its fire behind (an oil barrel bursts into a pool of flame).
  if ((e.status.burning ?? 0) > 0) area(1.2, [{ type: 'heat', amount: 1 }]);
  const drops = od?.loot ? rollLoot(content, od.loot, ctx.rng) : [];
  if (def.container && e.container && !e.container.opened) drops.push(...rollLoot(content, def.container.loot, ctx.rng));
  // Whatever it wore may be found on it.
  if (e.worn) for (const id of Object.values(e.worn)) if (ctx.rng.chance(content.gear.rules.dropChance)) drops.push({ id, count: 1 });
  if (drops.length) ctx.dropItems(e.pos.x, e.pos.y, e.z + 0.5, drops);
}
