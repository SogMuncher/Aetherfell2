export interface Camera {
  x: number;
  y: number;
  /** Eye height above sea level. */
  z: number;
  yaw: number;
  /** -1..1 look up/down (y-shearing). */
  pitch: number;
  /** Small screen bob/shake offsets in pixels. */
  shakeX: number;
  shakeY: number;
}

/** Per-frame projection values derived from a camera and the viewport size. */
export interface Projection {
  W: number;
  H: number;
  F: number;
  HOR: number;
  FX: number;
  FY: number;
  RX: number;
  RY: number;
  cam: Camera;
}

/** `focal` is the focal length in screen heights (0.86 ≈ 60° top to bottom; smaller = wider). */
export function project(cam: Camera, W: number, H: number, focal = 0.86): Projection {
  const F = H * focal;
  const HOR = H * 0.5 + cam.pitch * H * 0.62 + cam.shakeY;
  const FX = Math.cos(cam.yaw);
  const FY = Math.sin(cam.yaw);
  return { W, H, F, HOR, FX, FY, RX: -FY, RY: FX, cam };
}

/**
 * The camera's right-hand direction as seen looking from the camera's POSITION at (x, y): which side of a thing the
 * camera sees depends on where the camera stands, never on which way it is turned.
 */
export function sideFrom(p: Projection, x: number, y: number): { rx: number; ry: number } {
  const dx = x - p.cam.x;
  const dy = y - p.cam.y;
  const d = Math.hypot(dx, dy);
  return d < 1e-4 ? { rx: p.RX, ry: p.RY } : { rx: -dy / d, ry: dx / d };
}

/** World point → screen. Returns false if behind the camera. */
export function toScreen(p: Projection, x: number, y: number, z: number, out: { sx: number; sy: number; depth: number }): boolean {
  const dx = x - p.cam.x;
  const dy = y - p.cam.y;
  const fwd = dx * p.FX + dy * p.FY;
  if (fwd < 0.15) return false;
  const right = dx * p.RX + dy * p.RY;
  out.depth = fwd;
  out.sx = p.W * 0.5 + (p.F * right) / fwd + p.cam.shakeX;
  out.sy = p.HOR - (p.F * (z - p.cam.z)) / fwd;
  return true;
}
