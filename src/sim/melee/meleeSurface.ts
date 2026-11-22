import type { Entity, SimContext, SwingState, WeaponStats } from '../../types';
import { GROUND_Z } from '../../types';
import { takeBlows } from '../../content';

/**
 * What is in the hands takes `loss` blows. Any item can be swung, so any item wears: when nothing
 * is left it breaks where it struck (its `onBreak` reaction: a flask splashes, a torch scatters fire).
 */
export function wearHeld(ctx: SimContext, e: Entity, loss: number, x: number, y: number): void {
  const a = e.actor;
  if (!a?.weapon || loss <= 0) return;
  const next = takeBlows(ctx.content, a.weapon, loss);
  if (!next) {
    ctx.breakItem(a.weapon, x, y, e.z + 1.1, e.id);
    ctx.emit({ type: 'equip', entity: e.id, item: null });
  }
  a.weapon = next;
}

/** Finds the first solid thing in the arc in front (wall, door, tree, boulder) and strikes it. */
export function strikeSurface(ctx: SimContext, e: Entity, sw: SwingState, w: WeaponStats, reach: number, skill: number): void {
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

  // Hard things wear what is in the hands down faster, and by how its edge meets them.
  const raw = hard * (surf.wear[w.kind] ?? 1) * (1 + frac * 0.6);
  const loss = Math.floor(raw) + (ctx.rng.chance(raw - Math.floor(raw)) ? 1 : 0);
  wearHeld(ctx, e, loss, hit.x, hit.y);
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
