import type { ItemDef, ItemId } from '../../types';
import { CONTENT, itemDef } from '../../content';
import { pack } from '../color';
import { ITEM_ART, itemWorldSize, paintItem } from './itemArt';

export interface Sprite {
  w: number;
  h: number;
  px: Uint32Array;
  /** Size in metres when drawn in the world. */
  worldW: number;
  worldH: number;
  /**
   * Colour regions, when the picture has them: per pixel, which region (1..) it belongs to, or 0
   * for its own colour in `px`. The drawer fills region pixels from the individual's colours.
   */
  regions?: Uint8Array;
  /** Brightness of each region pixel (SHADE_ONE = as is), so lighting and texture survive recolouring. */
  shade?: Uint8Array;
}

/**
 * Nothing in the world is a hand-drawn picture any more: creatures (people too) are built from
 * their looks (content/looks.ts, bodyArt.ts), and trees, rocks, barrels, chests, torches and every
 * other object grow from their forms (content/forms.ts and content/props.ts, formArt.ts). What is
 * left here is the item picture cache (itemArt.ts paints them from their definitions) and a loud
 * checkerboard for a sprite name nothing defines, so a typo shows up at once.
 */

let missing: Sprite | null = null;
/** Magenta checks: drawn for a sprite name that is neither a look nor a form. */
export function missingSprite(): Sprite {
  if (missing) return missing;
  const px = new Uint32Array(64);
  for (let i = 0; i < 64; i++) px[i] = ((i & 7) + (i >> 3)) % 2 === 0 ? pack(220, 60, 200) : pack(30, 30, 30);
  missing = { w: 8, h: 8, px, worldW: 0.5, worldH: 0.5 };
  return missing;
}

/** Loose items in the world use the same picture as in the bag, so what you throw is what lands. */
function item(def: ItemDef | undefined): Sprite {
  const size = itemWorldSize(def);
  return { w: ITEM_ART, h: ITEM_ART, px: paintItem(def), worldW: size, worldH: size };
}

const items = new Map<ItemId, Sprite>();

export function itemSprite(id: ItemId): Sprite {
  let s = items.get(id);
  if (!s) {
    s = item(itemDef(CONTENT, id));
    items.set(id, s);
  }
  return s;
}
