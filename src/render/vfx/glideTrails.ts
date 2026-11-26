// Light trails behind open gliders: a line of glowing motes left hanging in the air from each wingtip (the glider's `trail`)
import type { Entity, SimState } from '../../types';
import { CONTENT, wornGlider } from '../../content';
import { fx } from './particleKinds';
import type { MoteSink } from './thingEmitters';

/** All numbers live here, in metres: wingtips out to the side and above the feet, and the gap between motes. */
const TRAIL = { side: 1.6, up: 2.4, gap: 0.2, most: 60, jump: 10, range: 90 } as const;

/** Where each glider's wingtips were when motes were last laid. */
const last = new Map<number, { lx: number; ly: number; rx: number; ry: number; z: number }>();

/** Lays motes along the path each open glider's wingtips took since the last frame, so the trail stays an unbroken line. */
export function emitGlideTrails(out: MoteSink, state: SimState, camX: number, camY: number): void {
  for (const [id] of last) if (!state.entities.get(id)?.player?.gliding) last.delete(id);
  for (const e of state.entities.values()) {
    if (!e.player?.gliding) continue;
    const trail = wornGlider(CONTENT, e)?.glide?.trail;
    if (!trail || Math.hypot(e.pos.x - camX, e.pos.y - camY) > TRAIL.range) continue;
    lay(out, e, trail);
  }
}

function lay(out: MoteSink, e: Entity, trail: string): void {
  const sx = -Math.sin(e.angle) * TRAIL.side;
  const sy = Math.cos(e.angle) * TRAIL.side;
  const now = { lx: e.pos.x - sx, ly: e.pos.y - sy, rx: e.pos.x + sx, ry: e.pos.y + sy, z: e.z + TRAIL.up };
  const was = last.get(e.id);
  last.set(e.id, now);
  if (!was) return;
  const d = Math.hypot(now.lx - was.lx, now.ly - was.ly, now.z - was.z);
  if (d < TRAIL.gap || d > TRAIL.jump) {
    if (d < TRAIL.gap) last.set(e.id, was);
    return;
  }
  const look = fx(trail);
  const n = Math.min(TRAIL.most, Math.floor(d / TRAIL.gap));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const z = was.z + (now.z - was.z) * t;
    out.one(look, was.lx + (now.lx - was.lx) * t, was.ly + (now.ly - was.ly) * t, z, 0, 0, 0);
    out.one(look, was.rx + (now.rx - was.rx) * t, was.ry + (now.ry - was.ry) * t, z, 0, 0, 0);
  }
}
