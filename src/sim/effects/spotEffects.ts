import { type DamageKind, type Effect, type EffectRequest, GROUND_Z, type SimContext, packKey, unpackSpot } from '../../types';

/** Frozen tiles (ice from a frost rune) last this long (plus a little randomness). */
export const ICE_TICKS = 20 * 50;

/** Blunt and magical force batters structures even without a swing (a bursting barrel, a thunder rune). */
export function batters(e: Effect): boolean {
  return e.type === 'damage' && (e.kind === 'blunt' || e.kind === 'magic');
}

export function touchesMatter(e: Effect): boolean {
  return e.type === 'heat' || e.type === 'soak' || e.type === 'chill' || e.type === 'coat' || e.type === 'push' || batters(e);
}

// ---------------------------------------------------------------------------------------------
// Matter: a spot of ground or a cell of the 3D layer, one set of rules for both

export function applyToSpot(ctx: SimContext, x: number, y: number, z: number, r: EffectRequest): void {
  const { matter, tiles, state } = ctx;
  const inf = matter.info(x, y, z);
  if (!inf) return;
  const ground = z === GROUND_Z;
  const scale = r.scale ?? 1;
  for (const eff of r.effects) {
    switch (eff.type) {
      case 'heat': {
        if (ground && inf.meltsInto !== undefined) {
          melt(ctx, x, y);
          break;
        }
        ignite(ctx, x, y, z, eff.amount * scale);
        break;
      }
      case 'soak': {
        if (matter.get('fire', x, y, z) > 0) {
          matter.set('fire', x, y, z, 0);
          ctx.emit({ type: 'doused', x, y, z });
        }
        if (inf.liquid) break;
        matter.set('wet', x, y, z, Math.max(matter.get('wet', x, y, z), Math.min(255, Math.round(255 * eff.amount * scale))));
        break;
      }
      case 'chill': {
        if (matter.get('fire', x, y, z) > 0) {
          matter.set('fire', x, y, z, 0);
          ctx.emit({ type: 'doused', x, y, z });
        }
        if (ground && (inf.freezesInto !== undefined || inf.meltsInto !== undefined)) {
          if (inf.freezesInto !== undefined) {
            tiles.setKind(x, y, inf.freezesInto);
            ctx.emit({ type: 'froze', x, y });
          }
          state.thaw.set(packKey(x, y), state.tick + Math.round((ICE_TICKS + ctx.rng.int(200)) * Math.min(2, eff.amount * scale)));
        }
        break;
      }
      case 'coat': {
        if (inf.liquid) break;
        matter.set('oil', x, y, z, Math.min(255, matter.get('oil', x, y, z) + Math.round(eff.amount * scale * 40)));
        break;
      }
      case 'push': {
        // Shoving burning stuff throws the flames further along.
        if (!r.from || matter.get('fire', x, y, z) <= 0) break;
        const dx = x + 0.5 - r.from.x;
        const dy = y + 0.5 - r.from.y;
        const d = Math.hypot(dx, dy) || 1;
        ignite(ctx, Math.floor(x + 0.5 + (dx / d) * 1.5), Math.floor(y + 0.5 + (dy / d) * 1.5), z, 1);
        ignite(ctx, Math.floor(x + 0.5 + (dx / d) * 2.5), Math.floor(y + 0.5 + (dy / d) * 2.5), z, 1);
        break;
      }
      case 'spawn':
        for (let i = 0; i < eff.count; i++) {
          const sz = ground ? tiles.ground(x + 0.5, y + 0.5) : z + 1;
          ctx.spawn(eff.thing, x + 0.5, y + 0.5, { z: sz, prevZ: sz });
        }
        break;
      case 'damage':
        // Blows and battering break things (a door has a tile's worth of wood to get through).
        if (r.swing || batters(eff)) strikeSpot(ctx, x, y, z, eff.amount * scale, eff.kind);
        break;
      default:
        break;
    }
  }
}

/** Force lands on something that can be broken: wear builds up until it gives way. */
export function strikeSpot(ctx: SimContext, x: number, y: number, z: number, amount: number, kind: DamageKind): void {
  const { matter, content } = ctx;
  const inf = matter.info(x, y, z);
  if (!inf || inf.durability === undefined || inf.breaksInto === undefined) return;
  const d = amount * (content.materials[inf.material]?.resist[kind] ?? 1);
  if (d <= 0) return;
  const total = matter.get('wear', x, y, z) + d;
  if (total < inf.durability) {
    matter.set('wear', x, y, z, total);
    return;
  }
  matter.set('wear', x, y, z, 0);
  matter.setKind(x, y, z, inf.breaksInto);
  if (z === GROUND_Z) ctx.tiles.setDoor(x, y, 0);
  ctx.emit({ type: 'tileBroken', x, y, z, tile: inf.code });
}

/** Wear from blows mends a little as time goes by — on the ground and in the walls alike. */
export function mendWear(ctx: SimContext): void {
  const { state, matter } = ctx;
  if (state.tick % 20 !== 0) return;
  const by = ctx.content.rules.combat.surface.mend;
  for (const key of matter.worn()) {
    const { x, y, z } = unpackSpot(key);
    const w = matter.get('wear', x, y, z);
    matter.set('wear', x, y, z, w - by <= 0 ? 0 : w - by);
  }
}

/** Fire needs fuel (or oil) and dryness, wherever it is. Amount below 1 is a chance. */
export function ignite(ctx: SimContext, x: number, y: number, z: number, amount: number): boolean {
  const { state, matter } = ctx;
  if (matter.count().burning >= ctx.content.rules.fire.max) return false;
  const inf = matter.info(x, y, z);
  if (!inf) return false;
  if (matter.get('fire', x, y, z) > 0) return false;
  const oil = matter.get('oil', x, y, z);
  if (inf.liquid) return false;
  if (inf.flammability <= 0 && oil === 0) return false;
  if (matter.get('fuel', x, y, z) <= 0 && oil === 0) return false;
  // Rain and puddles put fire out; a roof keeps the rain (but not the damp already in the wood).
  if (matter.wetness(x, y, z) > (oil > 0 ? 230 : 140)) return false;
  if (amount < 1 && !ctx.rng.chance(amount)) return false;
  matter.set('fire', x, y, z, oil > 0 ? 200 : 110);
  ctx.emit({ type: 'ignited', x, y, z });
  void state;
  return true;
}

export function melt(ctx: SimContext, x: number, y: number): void {
  const into = ctx.tiles.info(x, y).meltsInto;
  if (into !== undefined) ctx.tiles.setKind(x, y, into);
  ctx.state.thaw.delete(packKey(x, y));
  ctx.emit({ type: 'thawed', x, y });
}

export function thaw(ctx: SimContext): void {
  const { state } = ctx;
  if (state.thaw.size === 0 || state.tick % 10 !== 0) return;
  for (const [key, at] of state.thaw) {
    if (at > state.tick) continue;
    const x = Math.floor(key / 2097152) - 1048576;
    const y = (key % 2097152) - 1048576;
    if (ctx.tiles.info(x, y).meltsInto !== undefined) melt(ctx, x, y);
    else state.thaw.delete(key);
  }
}
