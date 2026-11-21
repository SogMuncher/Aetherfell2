import type { Entity, SimContext, SimSystem, SwingDir, SwingState, WeaponStats } from '../../types';
import { GROUND_Z } from '../../types';
import { isDisabled, thingDef, weaponStats } from '../../content';

/** How hard a shove of weight 1 pushes, in m/s (the weapon's own push and the swing's knock scale it). */
const KNOCK = 4.6;

/**
 * Swings, from the first press to the last tick of recovery.
 *
 *   hold the button   → a blow is wound up: stamina drains, strength builds up to full
 *   let go            → the direction (from the mouse) is chosen and the swing is launched
 *   the swing lands   → bodies in the arc are hit, or else the wall, door or tree in front is struck
 *   hit, blocked      → hitstop freezes both for a moment (effects/ sets `freeze`, handled here by
 *                       holding the swing still)
 *
 * What each direction does (reach, arc, damage, where it throws foes, hitstun) and how charging
 * scales a blow is data: content/rules.ts, `combat`. Creatures use the very same machinery: the AI
 * asks for a swing (and how long to wind it up) and this system carries it out.
 * Produces effect requests; the effects system does the hurting.
 */
export const meleeSystem: SimSystem = (ctx: SimContext) => {
  const { state, content } = ctx;
  const rules = content.rules.combat;
  const ch = rules.charge;
  for (const e of state.entities.values()) {
    const a = e.actor;
    if (!a || e.dead) continue;
    const p = e.player;
    const disabled = isDisabled(content, e.status) || (p !== undefined && (p.downed > 0 || p.gliding));
    const weapon = weaponStats(content, thingDef(content, e.def), a.weapon);

    // Intent: players from input, everyone else from their controller.
    let held = false;
    let pressed = false;
    let guard = false;
    let aim: SwingDir = 'thrust';
    let want: SwingDir | null = null;
    if (p) {
      held = p.input.attack;
      pressed = held && !p.prevAttack;
      p.prevAttack = held;
      guard = p.input.block && p.holding === null;
      aim = allowed(rules.swings, weapon, p.input.swingDir);
    } else {
      want = a.wantSwing;
      guard = a.wantGuard;
      a.wantSwing = null;
    }
    if (disabled) {
      a.swing = null;
      a.charge = null;
      guard = false;
    }
    // Raising a guard drops a blow being wound up.
    if (guard && a.charge) a.charge = null;

    if (guard && !a.swing) {
      if (a.guard === null) a.guardSince = state.tick;
      a.guard = 'thrust';
    } else {
      a.guard = null;
    }

    // Hitstop: a solid blow holds both bodies still; the swing waits where it is.
    if ((e.freeze ?? 0) > 0) continue;

    // Begin winding a blow up.
    if (!a.swing && !a.charge && !disabled) {
      if (p) {
        if (pressed && p.holding === null && !guard && (p.stamina >= ch.begin || p.cheats?.endless)) {
          a.charge = { dir: aim, t: 0, hold: 0, full: false };
          ctx.emit({ type: 'charge', entity: e.id, stage: 'start', x: e.pos.x, y: e.pos.y });
        }
      } else if (want) {
        a.charge = { dir: allowed(rules.swings, weapon, want), t: 0, hold: Math.max(0, Math.round(a.wantCharge ?? 0)), full: false };
        if (a.charge.hold > 0) ctx.emit({ type: 'charge', entity: e.id, stage: 'start', x: e.pos.x, y: e.pos.y });
      }
    }
    if (!p) a.wantCharge = 0;

    // Winding up.
    const c = a.charge;
    if (c && !a.swing) {
      let release = false;
      if (p) {
        c.dir = aim;
        if (held) {
          if (c.t >= ch.tap) p.stamina = Math.max(0, p.stamina - ch.stamina);
          c.t++;
          if (p.stamina <= 0 && c.t > ch.tap) release = true;
        } else {
          release = true;
        }
      } else if (c.t >= c.hold) {
        release = true;
      } else {
        c.t++;
      }
      if (!c.full && c.t >= ch.full) {
        c.full = true;
        ctx.emit({ type: 'charge', entity: e.id, stage: 'full', x: e.pos.x, y: e.pos.y });
      }
      if (release) launch(ctx, e, c.dir, c.t, weapon);
    }

    const sw = a.swing;
    if (!sw) continue;
    sw.t++;
    if (!sw.struck && sw.t >= sw.strikeAt) {
      sw.struck = true;
      strike(ctx, e, sw);
    }
    if (sw.t >= sw.recover) a.swing = null;
  }
};

/** The direction the weapon can actually swing nearest to the one asked for. */
export function allowed(swings: Record<SwingDir, { else: SwingDir[] }>, w: WeaponStats | null, want: SwingDir): SwingDir {
  const ok = w?.swings;
  if (!ok || ok.length === 0 || ok.includes(want)) return want;
  for (const d of swings[want].else) if (ok.includes(d)) return d;
  return ok[0] ?? want;
}

/** How wound up a blow held for `t` ticks is, 0 (a tap) .. 1 (full strength). */
export function chargeFraction(ctx: SimContext, t: number): number {
  const ch = ctx.content.rules.combat.charge;
  if (t <= ch.tap) return 0;
  return Math.min(1, (t - ch.tap) / Math.max(1, ch.full - ch.tap));
}

/** Lets a wound-up blow go: sets the swing in motion. A quick tap still has most of its windup ahead; a charged blow snaps out. */
function launch(ctx: SimContext, e: Entity, dir: SwingDir, held: number, weapon: WeaponStats | null): void {
  const a = e.actor;
  if (!a) return;
  const rules = ctx.content.rules.combat;
  const sh = rules.swings[dir];
  const frac = chargeFraction(ctx, held);
  const slow = weapon?.speed ?? 1;
  const strikeAt = frac > 0 ? Math.max(1, rules.charge.snap) : Math.max(1, Math.round(sh.windup * slow) - held);
  const recover = strikeAt + Math.round(sh.recover * slow * (1 + frac * 0.35));
  const p = e.player;
  if (p && !p.cheats?.endless) p.stamina = Math.max(0, p.stamina - sh.stamina * (1 + frac * 0.5));
  a.charge = null;
  a.swing = { dir, t: 0, strikeAt, recover, struck: false, power: frac };
  ctx.emit({ type: 'swing', entity: e.id, dir, x: e.pos.x, y: e.pos.y, power: frac });
}

/** Whether a swing may hit this body: not itself, nobody carried, nothing without health, not a friend. */
function hittable(ctx: SimContext, e: Entity, o: Entity): boolean {
  if (o === e || o.dead || o.heldBy !== null) return false;
  const od = thingDef(ctx.content, o.def);
  if (!od.health || od.body.ghost) return false;
  // Sides spare their own unless the faction does not mind (wild animals).
  if (e.faction === o.faction && !ctx.content.factions[e.faction]?.friendlyFire) return false;
  return true;
}

function strike(ctx: SimContext, e: Entity, sw: SwingState): void {
  const a = e.actor;
  if (!a) return;
  const { content } = ctx;
  const rules = content.rules.combat;
  const w = weaponStats(content, thingDef(content, e.def), a.weapon);
  if (!w) return;
  const sh = rules.swings[sw.dir];
  const frac = sw.power;
  const reach = w.reach * sh.reach * (1 + frac * (rules.charge.reach - 1));
  const might = e.player?.stats.might ?? 4;
  const blade = e.player?.skills.blade.level ?? 1;
  const worn = a.weapon !== null && a.wear <= 0;
  const skill = (1 + might * 0.04 + (blade - 1) * 0.06) * (worn ? 0.4 : 1) * (1 + frac * (rules.charge.damage - 1));
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  // Which way "to the right" is from where this one faces; a left sweep throws foes to the left.
  const side = sw.dir === 'left' ? -1 : sw.dir === 'right' ? 1 : 0;

  const caught: { o: Entity; d: number; dx: number; dy: number }[] = [];
  for (const o of ctx.query.near(e.pos.x, e.pos.y, reach + 1)) {
    if (!hittable(ctx, e, o)) continue;
    const od = thingDef(content, o.def);
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + od.body.radius) continue;
    let da = Math.atan2(dy, dx) - e.angle;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > sh.arc) continue;
    if (Math.abs(o.z - e.z) > 1.6) continue;
    caught.push({ o, d, dx, dy });
  }
  caught.sort((x, y) => x.d - y.d);
  let landed = 0;
  for (const { o, d, dx, dy } of caught) {
    if (landed >= sh.targets) break;
    const ux = dx / (d || 1);
    const uy = dy / (d || 1);
    // Away from you, plus along the sweep: that is where the blow throws them.
    const kx = ux * sh.knock.along + -sin * side * sh.knock.side;
    const ky = uy * sh.knock.along + cos * side * sh.knock.side;
    const mag = Math.hypot(kx, ky);
    const force = KNOCK * w.push * mag * (1 + frac * (rules.charge.push - 1));
    ctx.state.queues.effects.push({
      target: { kind: 'entity', id: o.id },
      // The blow itself, then whatever else the weapon carries (venom, frost, fire…).
      effects: [
        { type: 'damage', amount: w.damage, kind: w.kind, pierce: sh.pierce },
        { type: 'push', force, lift: sh.knock.lift + frac * 1.6, angle: mag > 0.001 ? Math.atan2(ky, kx) : undefined },
        ...(w.effects ?? []),
      ],
      scale: sh.damage * skill * (0.9 + ctx.rng.next() * 0.2),
      source: e.id,
      from: { x: e.pos.x, y: e.pos.y },
      swing: sw.dir,
      charge: frac,
    });
    landed++;
  }
  if (landed > 0 && a.weapon !== null && a.wear > 0) {
    a.wear = Math.max(0, a.wear - landed);
    if (a.wear === 0 && e.player) ctx.emit({ type: 'notice', player: e.id, text: `Your ${w.name.toLowerCase()} is worn blunt.` });
  }
  // Nobody there: what is in front of you? A wall, a door, a tree…
  if (landed === 0) strikeSurface(ctx, e, sw, w, reach, skill);
}

/** Finds the first solid thing in the arc in front (wall, door, tree, boulder) and strikes it. */
function strikeSurface(ctx: SimContext, e: Entity, sw: SwingState, w: WeaponStats, reach: number, skill: number): void {
  const a = e.actor;
  if (!a) return;
  const { content, tiles } = ctx;
  const rules = content.rules.combat;
  const sh = rules.swings[sw.dir];
  const frac = sw.power;
  const offsets = [0, -0.5, 0.5, -1, 1];
  let hit: { x: number; y: number; tx: number; ty: number; tz: number } | null = null;
  for (let s = 0.45; s <= reach + 0.35 && !hit; s += 0.3) {
    for (const k of offsets) {
      const ang = e.angle + k * sh.arc * 0.7;
      const x = e.pos.x + Math.cos(ang) * s;
      const y = e.pos.y + Math.sin(ang) * s;
      // Walls, floors and roofs of the 3D layer are struck at chest and knee height.
      const cell = ctx.matter.cellAt(x, y, e.z + 1.1) ?? ctx.matter.cellAt(x, y, e.z + 0.45);
      if (cell) {
        hit = { x, y, tx: cell.x, ty: cell.y, tz: cell.z };
        break;
      }
      if (!tiles.blocked(x, y)) continue;
      const inf = tiles.info(x, y);
      if (inf.shape === 'floor') continue;
      // Low things (a log, a stump) are below the swing unless you are on top of them.
      if (inf.height > 0 && tiles.ground(x, y) + inf.height < e.z + 0.5) continue;
      hit = { x, y, tx: Math.floor(x), ty: Math.floor(y), tz: GROUND_Z };
      break;
    }
  }
  if (!hit) return;
  const inf = ctx.matter.info(hit.tx, hit.ty, hit.tz);
  if (!inf) return;
  const mat = content.materials[inf.material];
  const hard = mat?.hardness ?? 0.2;
  const surf = rules.surface;
  // Blunt weapons jar less than edges on hard things; a wound-up blow jars more.
  const jar = hard * (w.kind === 'blunt' ? 0.8 : 1) * (1 + frac * 0.3);
  const recoil = jar >= surf.recoil.hardness;
  ctx.emit({ type: 'strike', x: hit.x, y: hit.y, z: e.z + 1.1, tile: inf.code, material: inf.material, weapon: w.kind, power: frac, recoil });

  // Hard things wear a weapon down faster, and by how its edge meets them.
  if (a.weapon !== null && a.wear > 0) {
    const raw = hard * (surf.wear[w.kind] ?? 1) * (1 + frac * 0.6);
    let loss = Math.floor(raw);
    if (ctx.rng.chance(raw - loss)) loss++;
    if (loss > 0) {
      a.wear = Math.max(0, a.wear - loss);
      if (a.wear === 0 && e.player) ctx.emit({ type: 'notice', player: e.id, text: `Your ${w.name.toLowerCase()} is worn blunt.` });
    }
  }
  // Things that can be broken (doors, fences, a haystack) take the damage; the effects system decides when they give.
  if (inf.durability !== undefined && inf.breaksInto !== undefined) {
    ctx.state.queues.effects.push({
      target: hit.tz === GROUND_Z ? { kind: 'tile', x: hit.tx, y: hit.ty } : { kind: 'cell', x: hit.tx, y: hit.ty, z: hit.tz },
      effects: [{ type: 'damage', amount: w.damage * sh.breaking, kind: w.kind }],
      scale: skill,
      source: e.id,
      from: { x: e.pos.x, y: e.pos.y },
      swing: sw.dir,
      charge: frac,
    });
  }
  // The blow lands with a thunk; on hard ground it kicks back through the arm.
  e.freeze = Math.max(e.freeze ?? 0, 1 + (hard > 0.4 ? 1 : 0) + (recoil ? surf.recoil.hold : 0));
  if (recoil) {
    const k = e.kb ?? { x: 0, y: 0 };
    k.x -= Math.cos(e.angle) * surf.recoil.push;
    k.y -= Math.sin(e.angle) * surf.recoil.push;
    e.kb = k;
    ctx.state.queues.effects.push({
      target: { kind: 'entity', id: e.id },
      effects: [{ type: 'status', id: rules.hitstun.status, ticks: surf.recoil.stun }],
      source: null,
      from: null,
    });
  }
}
