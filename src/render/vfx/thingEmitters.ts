// Motes things give off every frame: flames on what burns with firelight, smoke and trails, a held torch, burning and chilled bodies, bolts
import type { BurstDef, Entity, SimState, SpellLook } from '../../types';
import { CONTENT, heldLight, spellFor, thingDef } from '../../content';
import { fx } from './particleKinds';

/** Where the motes go (the particle system). */
export interface MoteSink {
  one(d: BurstDef, x: number, y: number, z: number, vx: number, vy: number, vz: number, lifeMul?: number, sizeMul?: number): void;
  spellTrail(look: SpellLook, id: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, dt: number): void;
}

/** 1, or with a `pace` the share of it that the speed of the craft this thing is fitted to reaches (a propeller's trail). */
function pace(state: SimState, e: Entity, at: number | undefined): number {
  if (!at) return 1;
  const c = e.ride ? state.entities.get(e.ride.craft)?.craft : undefined;
  return c ? Math.min(1, Math.hypot(c.vel.x, c.vel.y) / at) : 0;
}

/** Feeds the motes of every thing near the eye. */
export function emitThings(out: MoteSink, state: SimState, camX: number, camY: number, dt: number): void {
  const wind = state.weather.wind;
  for (const e of state.entities.values()) {
    const dx = e.pos.x - camX;
    const dy = e.pos.y - camY;
    if (dx * dx + dy * dy > 80 * 80) continue;
    const d = thingDef(CONTENT, e.def);
    // Anything that gives off firelight (torches, campfires) has a flame on top.
    if (d.light && d.light.flame !== false && !d.body.ghost && Math.random() < dt * (d.body.radius > 0.3 ? 40 : 20)) {
      const w = d.body.radius > 0.3 ? 0.5 : 0.12;
      // A flame in a wall bracket leans out into the room a little.
      const lean = d.mount ? 0.1 : 0;
      out.one(fx('torchFlame'), e.pos.x + Math.cos(e.angle) * lean + (Math.random() - 0.5) * w, e.pos.y + Math.sin(e.angle) * lean + (Math.random() - 0.5) * w, e.z + d.body.height * (d.body.radius > 0.3 ? 0.3 : 1) + 0.05, wind.x * 0.05, wind.y * 0.05, 0.8 + Math.random() * 0.6, 1, d.body.radius > 0.3 ? 1.7 : 1);
    }
    // Fires that smoke (hearths, campfires) send it up from their vent, when near enough to see.
    if (d.smoke && dx * dx + dy * dy < 45 * 45 && Math.random() < dt * d.smoke.rate * pace(state, e, d.smoke.pace)) {
      const r = d.smoke.spread ?? 0.15;
      out.one(fx(d.smoke.fx ?? 'tileSmoke'), e.pos.x + (Math.random() - 0.5) * 2 * r, e.pos.y + (Math.random() - 0.5) * 2 * r, e.z + d.smoke.rise + (Math.random() - 0.5) * 2 * r, wind.x * 0.4, wind.y * 0.4, 1.0, 0.75 + Math.random() * 0.5);
    }
    // A torch in someone's hand burns at the end of their arm (your own is drawn with the view model).
    const held = d.actor ? heldLight(CONTENT, e) : undefined;
    if (held?.flame && dx * dx + dy * dy > 0.5 && Math.random() < dt * 22) {
      const c = Math.cos(e.angle);
      const sn = Math.sin(e.angle);
      out.one(fx('torchFlame'), e.pos.x + c * 0.5 - sn * 0.2 + (Math.random() - 0.5) * 0.1, e.pos.y + sn * 0.5 + c * 0.2 + (Math.random() - 0.5) * 0.1, e.z + d.body.height * 0.75, wind.x * 0.05, wind.y * 0.05, 0.8 + Math.random() * 0.6);
    }
    if ((e.status.burning ?? 0) > 0 && Math.random() < dt * 18) {
      out.one(fx('burningBody'), e.pos.x + (Math.random() - 0.5) * d.body.radius * 2, e.pos.y + (Math.random() - 0.5) * d.body.radius * 2, e.z + Math.random() * d.body.height, 0, 0, 1.5);
    }
    if ((e.status.chilled ?? 0) > 0 && Math.random() < dt * 6) {
      out.one(fx('chilledBody'), e.pos.x + (Math.random() - 0.5) * d.body.radius * 2, e.pos.y + (Math.random() - 0.5) * d.body.radius * 2, e.z + Math.random() * d.body.height, 0, 0, -0.3);
    }
    if (e.projectile) {
      const sd = spellFor(CONTENT, e.projectile.spell);
      if (sd) out.spellTrail(sd.look, e.id, e.pos.x, e.pos.y, e.z, e.vel.x, e.vel.y, e.vz, dt);
    }
    if (d.mote) {
      out.one(fx('ember'), e.pos.x, e.pos.y, e.z, 0, 0, 0);
    }
  }
}
