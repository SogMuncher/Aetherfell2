import type { Entity, SpatialQuery } from '../../types';
import { packKey } from '../../types';

const CELL = 4;

/** Uniform grid of entities, rebuilt once per tick. Answers "what is near here?" cheaply. */
export class SpatialHash implements SpatialQuery {
  private cells = new Map<number, Entity[]>();

  rebuild(entities: Iterable<Entity>): void {
    this.cells.clear();
    for (const e of entities) {
      if (e.dead) continue;
      const k = packKey(Math.floor(e.pos.x / CELL), Math.floor(e.pos.y / CELL));
      const list = this.cells.get(k);
      if (list) list.push(e);
      else this.cells.set(k, [e]);
    }
  }

  near(x: number, y: number, r: number): Entity[] {
    const out: Entity[] = [];
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL);
    const y1 = Math.floor((y + r) / CELL);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.cells.get(packKey(cx, cy));
        if (!list) continue;
        for (const e of list) {
          const dx = e.pos.x - x;
          const dy = e.pos.y - y;
          if (dx * dx + dy * dy <= r2 && !e.dead) out.push(e);
        }
      }
    }
    return out;
  }
}
