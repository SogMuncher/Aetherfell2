// Makes a craft: its hull cells written into a quiet corner of the 3D layer and its fittings set aboard
import type { Entity, SimContext, ThingId } from '../../types';
import { shapeByte } from '../../types';
import { shapeId } from '../../content/shapes';
import { tileCode } from '../../content/tiles';
import { thingDef } from '../../content';
import { aboard } from './craftMotion';

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
    const k = b.fine ? 2 : 1;
    const put = b.fine ? (cx: number, cy: number, cz: number): unknown => vol.setFine(a.x * 2 + cx, a.y * 2 + cy, a.z * 2 + cz, shape, mat) : (cx: number, cy: number, cz: number): unknown => vol.set(a.x + cx, a.y + cy, a.z + cz, shape, mat);
    const [x0, y0, z0] = b.from.map((v) => Math.round(v * k));
    const [x1, y1, z1] = b.to.map((v) => Math.round(v * k));
    for (let cx = x0 ?? 0; cx < (x1 ?? 0); cx++) {
      for (let cy = y0 ?? 0; cy < (y1 ?? 0); cy++) {
        if ((cx - (x0 ?? 0)) % every || (cy - (y0 ?? 0)) % every) continue;
        for (let cz = z0 ?? 0; cz < (z1 ?? 0); cz++) put(cx, cy, cz);
      }
    }
  }
  for (const f of cd.fittings) {
    const at = aboard(e, cd, f.at[0], f.at[1]);
    const o = ctx.spawn(f.thing, at.x, at.y, { z: z + f.at[2], prevZ: z + f.at[2], angle: yaw + (f.face ?? 0) });
    // Loose things lie aboard and ride along like anyone on deck; the rest are fixed in place.
    if (!f.loose) o.ride = { craft: e.id, x: f.at[0], y: f.at[1], z: f.at[2], face: f.face ?? 0 };
    if (f.tie) o.tether = { craft: e.id, x: f.tie[0], y: f.tie[1], z: f.tie[2], len: thingDef(ctx.content, f.thing).chain ?? 10 };
    if (o.control && f.fill) o.control.v = f.fill;
  }
  return e;
}

