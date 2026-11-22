import type { ItemId, SimContext } from '../types';
import { breakOf, itemDef } from '../content';

/**
 * One rule for every item that breaks, wherever it breaks (in the hands, or flying into
 * something): its `onBreak` burst lands on the spot as effects (a flask splashes, a torch scatters
 * fire), and what it breaks into tumbles out. Wired into the context as `ctx.breakItem`.
 */
export function breakItem(ctx: SimContext, item: ItemId, x: number, y: number, z: number, by: number | null): void {
  const b = breakOf(ctx.content, item);
  if (b.effects?.length) {
    ctx.state.queues.effects.push({ target: { kind: 'area', x, y, z, radius: b.radius ?? 1 }, effects: b.effects, source: by, from: { x, y } });
  }
  if (b.into) ctx.dropItems(x, y, z, [{ id: b.into, count: 1 }]);
  ctx.emit({ type: 'itemBroke', item, x, y, z });
  const who = by !== null ? ctx.state.entities.get(by) : undefined;
  if (who?.player) ctx.emit({ type: 'notice', player: who.id, text: `The ${(itemDef(ctx.content, item)?.name ?? 'thing').toLowerCase()} breaks!` });
}
