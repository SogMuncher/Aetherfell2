// An item's bag picture as a card a body holds: where its grip is and which way it points on the picture
import { CONTENT, itemDef } from '../../content';
import { ITEM_ART, itemRecipe } from './itemArt';
import type { CardPic } from './paintFinish';
import { itemSprite } from './sprites';

const cards = new Map<string, CardPic>();

/**
 * Bodies hold exactly what the bag shows. The picture's long axis is its recipe's lean (weapons lie
 * corner to corner); it is gripped `GEAR.hand.hold.grip` of the way from its foot to its tip, on the
 * middle line of its painted pixels, so any item, from a sword to a jug, finds its own handle.
 */
export function itemCard(id: string): CardPic | undefined {
  const hit = cards.get(id);
  if (hit) return hit;
  const def = itemDef(CONTENT, id);
  if (!def) return undefined;
  const sprite = itemSprite(id);
  const n = ITEM_ART;
  const t = ((itemRecipe(def).art.tilt ?? 0) * Math.PI) / 180;
  const ux = Math.sin(t);
  const uy = -Math.cos(t);
  let lo = Infinity;
  let hi = -Infinity;
  let side = 0;
  let count = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!sprite.px[y * n + x]) continue;
      const along = (x + 0.5) * ux + (y + 0.5) * uy;
      lo = Math.min(lo, along);
      hi = Math.max(hi, along);
      side += -(x + 0.5) * uy + (y + 0.5) * ux;
      count++;
    }
  }
  if (!count) return undefined;
  const hold = CONTENT.gear.hand.hold;
  const g = lo + (hi - lo) * hold.grip;
  const m = side / count;
  const card: CardPic = { px: sprite.px, n, size: sprite.worldW * hold.length, grip: [g * ux - m * uy, g * uy + m * ux], axis: [ux, uy] };
  if (cards.size > 300) cards.clear();
  cards.set(id, card);
  return card;
}
