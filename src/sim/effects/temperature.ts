import { GROUND_Z, type SimContext, unpackSpot } from '../../types';
import { ignite } from './spotEffects';

/**
 * Temperature of matter: one number per spot (ground tile or 3D cell), degrees above or below its surroundings, kept only
 * while it is not 0 (`ctx.matter` field `temp`, numbers in `rules.temperature`). Heat and cold never name a source: a
 * torch, a fire bolt, a burning neighbour or a frost rune only add or take degrees, and the spot reacts by its own state.
 * Heat melts frost and boils off damp before it warms; warm enough, fuel burns; cold enough, water and damp freeze.
 */

/** Adds `degrees` (negative = cold) to a spot, then lets it react. */
export function warm(ctx: SimContext, x: number, y: number, z: number, degrees: number): void {
  const { matter } = ctx;
  const inf = matter.info(x, y, z);
  if (!inf) return;
  const rule = ctx.content.rules.temperature;
  let d = degrees;
  let t = matter.get('temp', x, y, z);
  if (d > 0) {
    // Heat first lifts a cold spot back to its surroundings, then melts its frost and dries its damp; the rest warms it.
    if (t < 0) {
      const up = Math.min(-t, d);
      t += up;
      d -= up;
    }
    const frost = matter.get('frost', x, y, z);
    if (frost > 0) {
      const m = Math.min(frost, d * rule.meltPerDegree);
      thawSpot(ctx, x, y, z, m);
      d -= m / rule.meltPerDegree;
    }
    const wet = inf.liquid ? 0 : matter.get('wet', x, y, z);
    if (wet > 0 && d > 0) {
      const m = Math.min(wet, d * rule.dryPerDegree);
      matter.set('wet', x, y, z, Math.round(wet - m));
      d -= m / rule.dryPerDegree;
    }
  }
  matter.set('temp', x, y, z, Math.max(-rule.limit, Math.min(rule.limit, Math.round(t + d))));
  settle(ctx, x, y, z);
}

/** What a spot does at its temperature: burn, freeze, or thaw back. */
function settle(ctx: SimContext, x: number, y: number, z: number): void {
  const { matter } = ctx;
  const inf = matter.info(x, y, z);
  if (!inf) return;
  const rule = ctx.content.rules.temperature;
  const t = matter.get('temp', x, y, z);
  if (t >= rule.burns) ignite(ctx, x, y, z, 1);
  if (t <= rule.freezes) {
    // Water turns to ice (a material you can walk on); anything else keeps its material and its damp freezes over it.
    if (inf.freezesInto !== undefined) {
      matter.setKind(x, y, z, inf.freezesInto);
      ctx.emit({ type: 'froze', x, y, z });
      return;
    }
    if (inf.meltsInto !== undefined || inf.liquid) return;
    const wet = matter.wetness(x, y, z) - matter.get('frost', x, y, z);
    if (wet < ctx.content.rules.frost.wetNeeded) return;
    matter.set('frost', x, y, z, Math.min(255, matter.get('frost', x, y, z) + wet));
    matter.set('wet', x, y, z, 0);
    ctx.emit({ type: 'froze', x, y, z });
    return;
  }
  if (t < rule.thaws) return;
  if (matter.get('frost', x, y, z) > 0) thawSpot(ctx, x, y, z, ctx.content.rules.frost.fade);
  if (inf.meltsInto !== undefined) melt(ctx, x, y, z);
}

/** Warm and cold spots settle back toward their surroundings, reacting as they pass each mark. */
export function settleTemperatures(ctx: SimContext): void {
  const { state, matter } = ctx;
  const rule = ctx.content.rules.temperature;
  if (state.temp.size === 0 || state.tick % rule.every !== 0) return;
  for (const key of matter.warm()) {
    const { x, y, z } = unpackSpot(key);
    if (!matter.info(x, y, z)) {
      state.temp.delete(key);
      continue;
    }
    const t = matter.get('temp', x, y, z);
    const next = t > 0 ? Math.max(0, t - rule.relax) : Math.min(0, t + rule.relax);
    // Keep the spot (at 0) while it still has frost or ice to give back.
    state.temp.set(key, next);
    settle(ctx, x, y, z);
    if (next === 0 && matter.get('frost', x, y, z) === 0 && matter.info(x, y, z)?.meltsInto === undefined) state.temp.delete(key);
  }
}

/** Ice (a material) melts back into what it froze from. */
export function melt(ctx: SimContext, x: number, y: number, z: number = GROUND_Z): void {
  const into = ctx.matter.info(x, y, z)?.meltsInto;
  if (into !== undefined) ctx.matter.setKind(x, y, z, into);
  ctx.emit({ type: 'thawed', x, y, z });
}

/** Up to `amount` of a spot's frost turns back into the wet it froze from; the stuff beneath was never changed. */
export function thawSpot(ctx: SimContext, x: number, y: number, z: number, amount: number): void {
  const { matter } = ctx;
  const f = matter.get('frost', x, y, z);
  const d = Math.round(Math.min(f, amount));
  matter.set('frost', x, y, z, f - d);
  if (!matter.info(x, y, z)?.liquid) matter.set('wet', x, y, z, Math.min(255, matter.get('wet', x, y, z) + d));
  if (f - d > 0) return;
  ctx.emit({ type: 'thawed', x, y, z });
}
