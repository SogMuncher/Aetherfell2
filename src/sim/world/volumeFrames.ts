// Moving frames of the 3D layer (an airship): world questions asked again in each frame's own cells, turned and moved
import type { VolumeFrame } from '../../types';

/** The store's own answers, in store coordinates (no frames). */
export interface RawVolume {
  rawTop(x: number, y: number): number;
  rawFloor(x: number, y: number, zMax: number, zMin?: number): number;
  rawCeiling(x: number, y: number, z: number): number;
  rawSolid(x: number, y: number, z0: number, z1: number): boolean;
}

/** World point -> the frame's store point, or null when it is outside the frame's box (seen from above). */
export function intoFrame(f: VolumeFrame, x: number, y: number): { x: number; y: number } | null {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const dx = x - f.wx;
  const dy = y - f.wy;
  const sx = f.px + dx * c + dy * s;
  const sy = f.py - dx * s + dy * c;
  return sx >= f.x0 && sx < f.x1 && sy >= f.y0 && sy < f.y1 ? { x: sx, y: sy } : null;
}

/** A world point in the store coordinates of every frame whose box it is within `pad` m of (a blast reaching a ship). */
export function framedPoints(frames: Iterable<VolumeFrame>, x: number, y: number, z: number, pad: number): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (const f of frames) {
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const sx = f.px + (x - f.wx) * c + (y - f.wy) * s;
    const sy = f.py - (x - f.wx) * s + (y - f.wy) * c;
    const sz = z - f.wz + f.z0;
    if (sx >= f.x0 - pad && sx < f.x1 + pad && sy >= f.y0 - pad && sy < f.y1 + pad && sz >= f.z0 - pad && sz < f.z1 + pad) out.push({ x: sx, y: sy, z: sz });
  }
  return out;
}

/** Store point of a frame -> world point. */
export function outOfFrame(f: VolumeFrame, sx: number, sy: number, sz: number): { x: number; y: number; z: number } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  const dx = sx - f.px;
  const dy = sy - f.py;
  return { x: f.wx + dx * c - dy * s, y: f.wy + dx * s + dy * c, z: sz - f.z0 + f.wz };
}

export function framedTop(v: RawVolume, frames: Iterable<VolumeFrame>, x: number, y: number): number {
  let best = v.rawTop(x, y);
  for (const f of frames) {
    const p = intoFrame(f, x, y);
    if (p) best = Math.max(best, v.rawTop(p.x, p.y) - f.z0 + f.wz);
  }
  return best;
}

export function framedFloor(v: RawVolume, frames: Iterable<VolumeFrame>, x: number, y: number, zMax: number, zMin?: number): number {
  let best = v.rawFloor(x, y, zMax, zMin);
  for (const f of frames) {
    const p = intoFrame(f, x, y);
    const sz = zMax - f.wz + f.z0;
    if (!p || sz < f.z0) continue;
    best = Math.max(best, v.rawFloor(p.x, p.y, sz, f.z0) - f.z0 + f.wz);
  }
  return best;
}

export function framedCeiling(v: RawVolume, frames: Iterable<VolumeFrame>, x: number, y: number, z: number): number {
  let best = v.rawCeiling(x, y, z);
  for (const f of frames) {
    const p = intoFrame(f, x, y);
    const sz = z - f.wz + f.z0;
    if (!p || sz > f.z1) continue;
    best = Math.min(best, v.rawCeiling(p.x, p.y, Math.max(sz, f.z0)) - f.z0 + f.wz);
  }
  return best;
}

export function framedSolid(v: RawVolume, frames: Iterable<VolumeFrame>, x: number, y: number, z0: number, z1: number): boolean {
  if (v.rawSolid(x, y, z0, z1)) return true;
  for (const f of frames) {
    const p = intoFrame(f, x, y);
    if (p && v.rawSolid(p.x, p.y, z0 - f.wz + f.z0, z1 - f.wz + f.z0)) return true;
  }
  return false;
}

export function framedCell(v: RawVolume, frames: Iterable<VolumeFrame>, x: number, y: number, z: number): { x: number; y: number; z: number } {
  for (const f of frames) {
    const p = intoFrame(f, x, y);
    const sz = z - f.wz + f.z0;
    if (p && v.rawSolid(p.x, p.y, sz - 0.01, sz + 0.01)) return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(sz) };
  }
  return { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
}

export function framedPlace(frames: Iterable<VolumeFrame>, x: number, y: number, z: number): { x: number; y: number; z: number } {
  for (const f of frames) {
    if (x >= f.x0 && x < f.x1 && y >= f.y0 && y < f.y1 && z >= f.z0 && z < f.z1) return outOfFrame(f, x + 0.5, y + 0.5, z + 0.5);
  }
  return { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
}
