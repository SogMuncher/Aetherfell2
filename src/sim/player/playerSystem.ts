import type { Entity, SimContext, SimSystem } from '../../types';
import { unpackSpot } from '../../types';
import { composeSpell, isDisabled, moveFactor, stackWeight, thingDef, wornWeight } from '../../content';

const JUMP_SPEED = 7.2;
const STRIDE = 1.7;

/**
 * First-person control: walking, sprinting, swimming, jumping, gliding, carrying and throwing,
 * preparing a spell from the runebook, and poking at things (which becomes a use request for other systems).
 */
export const playerSystem: SimSystem = (ctx: SimContext) => {
  const { state, tiles, dt, content } = ctx;
  for (const id of Object.values(state.players)) {
    const e = state.entities.get(id);
    const p = e?.player;
    const a = e?.actor;
    if (!e || !p || !a || e.dead) continue;
    const def = thingDef(content, e.def);
    const input = p.input;
    if (p.cooldown > 0) p.cooldown--;
    if (input.prepare !== null) {
      // Runebook: the chosen runes become the spell you cast until you choose again.
      const runes = input.prepare;
      const unknown = runes.find((r) => !p.runes.includes(r));
      const made = runes.length ? composeSpell(content, runes) : null;
      if (unknown !== undefined) ctx.emit({ type: 'notice', player: e.id, text: `You do not know the ${content.runes[unknown]?.name ?? unknown} rune.` });
      else if (made && !made.ok) ctx.emit({ type: 'notice', player: e.id, text: made.problem });
      else {
        p.prepared = [...runes];
        ctx.emit({ type: 'spellPrepared', entity: e.id, spell: made ? made.spell.id : '' });
      }
    }

    if (p.downed > 0) {
      e.vel.x = 0;
      e.vel.y = 0;
      p.gliding = false;
      p.downed--;
      if (p.downed === 0) wake(ctx, e);
      continue;
    }

    e.angle = input.yaw;
    const cos = Math.cos(e.angle);
    const sin = Math.sin(e.angle);
    let mx = cos * input.forward - sin * input.strafe;
    let my = sin * input.forward + cos * input.strafe;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    const held = p.holding !== null ? state.entities.get(p.holding) : undefined;
    const heldDef = held ? thingDef(content, held.def) : null;
    const surf = tiles.waterLevel(e.pos.x, e.pos.y);
    const swimming = tiles.ground(e.pos.x, e.pos.y) < surf - 0.6 && e.z < surf;
    const carryLimit = 30 + p.stats.might * 4;
    const load = stackWeight(p.inventory) + wornWeight(content, e.worn) + (heldDef ? heldDef.body.mass * 0.25 : 0);
    let speed = (def.actor?.speed ?? 4) * (1 + (p.skills.athletics.level - 1) * 0.03);
    const winding = a.charge != null;
    const sprinting = input.sprint && p.stamina > 1 && len > 0.1 && !swimming && !winding;
    if (sprinting) speed *= 1.7;
    if (swimming) speed *= 0.5;
    if (a.guard) speed *= 0.5;
    if (winding) speed *= content.rules.combat.charge.slow;
    if (load > carryLimit) speed *= 0.55;
    speed *= moveFactor(content, e.status);

    // Gliding: hold jump while falling to open the glider. Wind carries you; fires below lift you.
    const glide = gliderOf(ctx, p.inventory);
    const wantGlide = !!glide && input.jumpHeld && !a.onGround && !swimming && (p.gliding || e.vz < 0) && !isDisabled(content, e.status);
    if (wantGlide !== p.gliding) {
      p.gliding = wantGlide;
      ctx.emit({ type: 'glide', entity: e.id, open: wantGlide });
    }
    if (p.gliding && glide) {
      const w = state.weather.wind;
      const tx = cos * glide.speed * Math.max(0.35, 1 + input.forward * 0.4) + w.x * 0.8;
      const ty = sin * glide.speed * Math.max(0.35, 1 + input.forward * 0.4) + w.y * 0.8;
      e.vel.x += (tx - e.vel.x) * 0.06;
      e.vel.y += (ty - e.vel.y) * 0.06;
      const lift = updraft(ctx, e);
      e.vz += (-glide.sink + lift - e.vz) * (lift > 0 ? 0.15 : 0.08);
    } else {
      const control = a.onGround || swimming ? 1 : 0.08;
      e.vel.x += (mx * speed - e.vel.x) * control;
      e.vel.y += (my * speed - e.vel.y) * control;
    }

    if (sprinting) p.stamina = Math.max(0, p.stamina - 18 * dt);
    else p.stamina = Math.min(p.maxStamina, p.stamina + (a.guard ? 4 : 14) * (winding ? content.rules.combat.charge.regen : 1) * dt);

    if (input.jump && a.onGround && p.stamina > 8 && !swimming) {
      e.vz = JUMP_SPEED;
      p.stamina -= 8;
      ctx.emit({ type: 'jump', entity: e.id });
    }

    if (a.onGround) {
      const moved = Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y);
      p.stride += moved;
      if (p.stride > STRIDE) {
        p.stride = 0;
        const tile = content.tiles[tiles.kind(e.pos.x, e.pos.y)];
        const surface = swimming ? 'water' : (content.materials[tile.material]?.sound ?? 'soft');
        ctx.emit({ type: 'footstep', entity: e.id, x: e.pos.x, y: e.pos.y, surface });
      }
    }

    // Grab / throw anything you can carry.
    if (input.grab && p.cooldown === 0) {
      p.cooldown = 4;
      if (held && heldDef) {
        const power = Math.max(4, 15 - heldDef.body.mass * 0.18) * (1 + p.stats.might * 0.04);
        held.heldBy = null;
        held.thrownBy = e.id;
        held.vel.x = cos * power * Math.cos(input.pitch * 0.9) + e.vel.x;
        held.vel.y = sin * power * Math.cos(input.pitch * 0.9) + e.vel.y;
        held.vz = 2.5 + Math.sin(input.pitch * 0.9) * power;
        p.holding = null;
        ctx.emit({ type: 'thrown', entity: held.id, x: held.pos.x, y: held.pos.y });
      } else {
        const target = pickInFront(ctx, e, 2.2, (o) => {
          const od = thingDef(content, o.def);
          return !!od.carry && od.body.mass <= 60 && o.heldBy === null;
        });
        if (target) {
          target.heldBy = e.id;
          p.holding = target.id;
        }
      }
    }
    if (held && held.dead) p.holding = null;

    if (input.interact && p.cooldown === 0) {
      p.cooldown = 4;
      const target = pickInFront(ctx, e, 2.6, (o) => {
        const od = thingDef(content, o.def);
        return !!od.talk || !!od.container || !!od.use || !!od.portal || !!o.item || (o.player?.downed ?? 0) > 0;
      });
      let tx = Math.floor(e.pos.x + cos * 1.2);
      let ty = Math.floor(e.pos.y + sin * 1.2);
      for (let s = 0.4; s <= 2.2; s += 0.3) {
        const x = Math.floor(e.pos.x + cos * s);
        const y = Math.floor(e.pos.y + sin * s);
        if (tiles.info(x, y).shape !== 'floor') {
          tx = x;
          ty = y;
          break;
        }
      }
      state.queues.use.push({ player: e.id, tileX: tx, tileY: ty, entity: target ? target.id : null });
    }
  }
};

function gliderOf(ctx: SimContext, inv: readonly { id: string }[]): { sink: number; speed: number } | null {
  for (const s of inv) {
    const g = ctx.content.items[s.id]?.glide;
    if (g) return g;
  }
  return null;
}

/** Rising heat: burning ground below (within ~25 m) pushes a glider up. */
function updraft(ctx: SimContext, e: Entity): number {
  const { tiles } = ctx;
  const g = tiles.ground(e.pos.x, e.pos.y);
  const height = e.z - g;
  if (height > 28) return 0;
  let heat = 0;
  for (let j = -3; j <= 3; j++) {
    for (let i = -3; i <= 3; i++) {
      const f = tiles.fire(e.pos.x + i, e.pos.y + j);
      if (f > 0) heat += f / 255;
    }
  }
  // Burning roofs and walls throw heat up too.
  for (const key of ctx.state.volume.burningCells) {
    const c = unpackSpot(key);
    if (Math.abs(c.x + 0.5 - e.pos.x) <= 3.5 && Math.abs(c.y + 0.5 - e.pos.y) <= 3.5 && c.z <= e.z) heat += ctx.state.volume.cellGet('fire', c.x, c.y, c.z) / 255;
  }
  return Math.min(9, heat * 1.4) * (1 - height / 28);
}

function wake(ctx: SimContext, e: Entity): void {
  const p = e.player;
  if (!p) return;
  e.pos.x = p.respawn.x;
  e.pos.y = p.respawn.y;
  e.prev.x = e.pos.x;
  e.prev.y = e.pos.y;
  e.z = ctx.tiles.ground(e.pos.x, e.pos.y) + 1;
  e.hp = Math.round(e.maxHp * 0.6);
  e.status = {};
  ctx.emit({ type: 'notice', player: e.id, text: 'You wake by the road, aching but alive.' });
}

function pickInFront(ctx: SimContext, e: Entity, reach: number, ok: (o: Entity) => boolean): Entity | null {
  let best: Entity | null = null;
  let bestScore = Infinity;
  for (const o of ctx.query.near(e.pos.x, e.pos.y, reach + 0.5)) {
    if (o === e || o.dead || !ok(o)) continue;
    // Not through a floor or ceiling: things a storey up or down are out of reach.
    if (Math.abs(o.z - e.z) > 2) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + thingDef(ctx.content, o.def).body.radius) continue;
    let da = Math.atan2(dy, dx) - e.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > 0.75 && d > 0.8) continue;
    const score = d + Math.abs(da) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return best;
}
