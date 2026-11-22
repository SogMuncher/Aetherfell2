// What bodies get from what they stand in or on: one data-driven pass over ground tiles and 3D cells alike
import { type Entity, GROUND_Z, type SimContext, type TouchDef } from '../../types';
import { rainAt, thingDef } from '../../content';

/**
 * Every body takes its turn: the spot under its feet is the 3D cell it stands on, or the ground tile when
 * it is down on the ground. Each row of content.rules.touch reads one thing about that spot (its fire,
 * wetness, how deep the water is, rain from open sky) and, past the row's minimum, queues the row's
 * effects on the body. So a burning floor upstairs, a flooded cave and a burning field all work the same.
 */
export function touchBodies(ctx: SimContext): void {
  const { state, content } = ctx;
  const rows = content.rules.touch;
  for (const e of state.entities.values()) {
    if (e.dead || e.heldBy !== null) continue;
    let spot: { x: number; y: number; z: number } | null | undefined;
    for (const row of rows) {
      if (state.tick % row.every !== e.id % row.every) continue;
      const def = thingDef(content, e.def);
      if (def.body.ghost || def.mote) break;
      if (spot === undefined) spot = underfoot(ctx, e);
      const v = amount(ctx, e, spot, row);
      if (v < row.min) continue;
      const r = { target: { kind: 'entity' as const, id: e.id }, effects: row.effects, source: null, from: null };
      state.queues.effects.push(row.scaled ? { ...r, scale: v } : r);
    }
  }
}

/** The cell it stands on, the ground tile if it is down on the ground, or nothing (in the air). */
function underfoot(ctx: SimContext, e: Entity): { x: number; y: number; z: number } | null {
  const cell = ctx.matter.cellAt(e.pos.x, e.pos.y, e.z - 0.05);
  if (cell) return cell;
  if (e.z < ctx.tiles.ground(e.pos.x, e.pos.y) + 1.2) return { x: Math.floor(e.pos.x), y: Math.floor(e.pos.y), z: GROUND_Z };
  return null;
}

function amount(ctx: SimContext, e: Entity, spot: { x: number; y: number; z: number } | null, row: TouchDef): number {
  const { tiles, matter, state } = ctx;
  if (row.from === 'rain') {
    return state.volume.openSky(e.pos.x, e.pos.y, e.z + 1) ? rainAt(ctx.content.sky, state.weather, e.pos.x, e.pos.y) : 0;
  }
  if (row.from === 'water') {
    // Wading: water standing above the ground here (not ice), or a cell of liquid.
    if (spot && spot.z !== GROUND_Z) return matter.info(spot.x, spot.y, spot.z)?.liquid ? 1 : 0;
    const surf = tiles.waterLevel(e.pos.x, e.pos.y);
    const info = tiles.info(e.pos.x, e.pos.y);
    if (info.level && !info.liquid) return 0;
    return e.z < surf + 0.2 ? surf - tiles.ground(e.pos.x, e.pos.y) : 0;
  }
  if (!spot) return 0;
  return matter.get(row.from, spot.x, spot.y, spot.z);
}
