import { type ReadonlyTiles, type SimState, unpackKey, unpackSpot } from '../../types';
import { CONTENT } from '../../content';

/** Where fire's motes go: the particle system draws them from the palette in the fire rules. */
export interface FireSink {
  fire(kind: 'flame' | 'smoke' | 'ember', x: number, y: number, z: number, vx: number, vy: number, vz: number, heat: number, size: number): void;
}

/**
 * Feeds flames, smoke and embers for burning ground and 3D cells near the eye. The whole view shares
 * one flame budget (rules.fire.vfx.budget per second), so a wildfire costs no more to draw than a bonfire.
 */
export function emitFire(out: FireSink, state: SimState, tiles: ReadonlyTiles, camX: number, camY: number, dt: number): void {
  const v = CONTENT.rules.fire.vfx;
  const r2 = v.range * v.range;
  const wind = state.weather.wind;
  const spots: { x: number; y: number; z: number; f: number; tall: number }[] = [];
  for (const key of state.burning) {
    const { x, y } = unpackKey(key);
    if ((x - camX) ** 2 + (y - camY) ** 2 > r2) continue;
    const inf = tiles.info(x, y);
    // Flames climb what is burning: up to 4 m on a tree, 2.5 m on a wall, low on open ground.
    const tall = inf.shape === 'block' ? 2.5 : Math.min(4, Math.max(0.6, inf.height));
    spots.push({ x, y, z: Math.max(0, tiles.ground(x + 0.5, y + 0.5)), f: tiles.fire(x, y) / 255, tall });
  }
  for (const key of state.volume.burningCells) {
    const c = unpackSpot(key);
    const { x, y, z } = state.volume.placeOf(c.x, c.y, c.z);
    if ((x - camX) ** 2 + (y - camY) ** 2 > r2) continue;
    spots.push({ x: x - 0.5, y: y - 0.5, z: z - 0.5, f: state.volume.cellGet('fire', c.x, c.y, c.z) / 255, tall: 0.9 });
  }
  if (spots.length === 0) return;
  // Share the budget: nearest-first isn't needed, a fair thinning is.
  const scale = Math.min(1, (v.budget / v.flame) / spots.length);
  for (const s of spots) {
    const base = s.z;
    if (Math.random() < dt * v.flame * scale * (0.5 + s.f)) {
      out.fire('flame', s.x + Math.random(), s.y + Math.random(), base + Math.random() * s.tall * 0.6, wind.x * 0.15, wind.y * 0.15, 1 + Math.random() * 1.4 * (0.5 + s.f), s.f, 0.16 + s.tall * 0.03);
    }
    if (Math.random() < dt * v.smokeRate * scale) {
      out.fire('smoke', s.x + Math.random(), s.y + Math.random(), base + s.tall + 0.4, wind.x * 0.4, wind.y * 0.4, 1, s.f, 0.3);
    }
    if (Math.random() < dt * v.ember * scale) {
      out.fire('ember', s.x + Math.random(), s.y + Math.random(), base + s.tall * 0.5, wind.x * 0.6 + (Math.random() - 0.5), wind.y * 0.6 + (Math.random() - 0.5), 2 + Math.random() * 2.5, s.f, 0.05);
    }
  }
}
