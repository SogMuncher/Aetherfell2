import type { Entity, FormDef } from '../../types';
import { rhash } from '../color';
import { sideFrom, type Projection } from '../raycaster/camera';
import { FormBank, formColours, formVariants } from './formArt';
import { VIEW_DIRS } from './bodyArt';
import type { Sprite } from './sprites';

interface Placed {
  colours: Uint32Array;
  form: FormDef;
  last: number;
}

/**
 * Props (barrels, crates, chests, urns, torches, campfires, trap plates) are grown from forms
 * like trees and rocks (content/props.ts), so every barrel is its own barrel: one of a few shapes,
 * turned its own way, in its own wood and hoop colours. Which side you see follows the camera.
 */
export class PropSprites {
  private banks = new Map<string, FormBank>();
  private placed = new Map<number, Placed>();
  private lastPrune = 0;

  pick(e: Entity, formId: string, form: FormDef, p: Projection, time: number): { sprite: Sprite; colours: Uint32Array } {
    const hand = -p.RY * p.FX + p.RX * p.FY < 0 ? -1 : 1;
    const variant = Math.floor(rhash(e.id, 1, 211) * formVariants(form));
    const key = `${formId}|${variant}|${hand}`;
    let bank = this.banks.get(key);
    if (!bank) {
      if (this.banks.size > 600) this.banks.clear();
      bank = new FormBank(form, variant * 7919 + formId.length * 131 + formId.charCodeAt(0), hand);
      this.banks.set(key, bank);
    }
    let pl = this.placed.get(e.id);
    // A chest that opens changes form: it keeps its colours only if the regions are the same.
    if (!pl || pl.form !== form) {
      pl = { colours: formColours(form, e.id * 31 + 7), form, last: time };
      this.placed.set(e.id, pl);
    }
    pl.last = time;
    let dir = 0;
    if (bank.nviews > 1) {
      // Each prop sits at its own angle; the side seen is that angle against the camera's right.
      const a = e.angle + rhash(e.id, 2, 211) * Math.PI * 2;
      const { rx, ry } = sideFrom(p, e.pos.x, e.pos.y);
      const rf = rx * Math.cos(a) + ry * Math.sin(a);
      const rs = -rx * Math.sin(a) + ry * Math.cos(a);
      dir = Math.round((Math.atan2(rs, rf) / (Math.PI * 2)) * VIEW_DIRS);
    }
    if (time - this.lastPrune > 5) {
      this.lastPrune = time;
      for (const [id, q] of this.placed) if (time - q.last > 10) this.placed.delete(id);
    }
    return { sprite: bank.sprite(dir), colours: pl.colours };
  }
}
