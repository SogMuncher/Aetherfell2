// Makes a craft: its hull cells written into a quiet corner of the 3D layer and its fittings set aboard
import type { Entity, SimContext, ThingId } from '../../types';
import { shapeByte } from '../../types';
import { shapeId } from '../../content/shapes';
import { tileCode } from '../../content/tiles';
import { thingDef } from '../../content';

/** Builds a craft of this kind at a world spot, facing `yaw`. Its cells live at the dock (rules.crafts) and fly as one frame. */
export function buildCraft(ctx: SimContext, thing: ThingId, x: number, y: number, z: number, yaw: number): Entity | null {
  const cd = thingDef(ctx.content, thing).craft;
  if (!cd) return null;
  const e = ctx.spawn(thing, x, y, { z, prevZ: z, angle: yaw });
  const { dock, spacing } = ctx.content.rules.crafts;
  const a = { x: dock.x + (e.id % 64) * spacing, y: dock.y, z: dock.z };
  e.craft = { anchor: a, vel: { x: 0, y: 0 }, vz: 0, spin: 0, prevYaw: yaw, goal: null };
  const vol = ctx.state.volume;
  for (let cx = 0; cx < cd.size[0]; cx++) for (let cy = 0; cy < cd.size[1]; cy++) for (let cz = 0; cz < cd.size[2]; cz++) vol.set(a.x + cx, a.y + cy, a.z + cz, 0, 0);
  for (const b of cd.hull) {
    const shape = b.shape ? shapeByte(shapeId(b.shape), b.rot ?? 0) : 0;
    const mat = b.shape && b.mat ? tileCode(b.mat) : 0;
    const every = b.every ?? 1;
    for (let cx = b.from[0]; cx < b.to[0]; cx++) {
      for (let cy = b.from[1]; cy < b.to[1]; cy++) {
        if ((cx - b.from[0]) % every || (cy - b.from[1]) % every) continue;
        for (let cz = b.from[2]; cz < b.to[2]; cz++) vol.set(a.x + cx, a.y + cy, a.z + cz, shape, mat);
      }
    }
  }
  for (const f of cd.fittings) {
    const o = ctx.spawn(f.thing, x, y, { z });
    o.ride = { craft: e.id, x: f.at[0], y: f.at[1], z: f.at[2], face: f.face ?? 0 };
  }
  return e;
}

