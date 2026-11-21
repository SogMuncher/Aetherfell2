import type { HandPose, ViewmodelDef } from '../types';

const pose = (x: number, y: number, z: number, lean: number, pitch: number, roll: number, reach = 1): HandPose => ({ x, y, z, lean, pitch, roll, reach });

/**
 * The item in your hand, in the first-person view. Poses are the hand position and the way the
 * item points (see HandPose); one table row per way of swinging, so a new swing is a new row here
 * and in content/rules.ts. The drawing code (render/entities/viewModel.ts) warps the item's own flat
 * picture to the pose (tilt, foreshorten, slant, taper) for every held item alike.
 */
export const VIEWMODEL: ViewmodelDef = {
  focal: 1.0,
  warp: { side: 0.36, flat: 0.3, shear: 0.35, taper: 0.5 },
  rest: pose(0.28, -0.28, 0.52, -0.3, 0.42, 0.5),
  guard: pose(0.1, -0.2, 0.55, -1.45, 0.5, 0.2),
  wind: {
    left: pose(0.36, -0.2, 0.5, 0.85, 0.25, 1.1),
    right: pose(0.0, -0.18, 0.5, -1.35, 0.3, -0.9),
    thrust: pose(0.36, -0.36, 0.34, -0.2, 0.75, 0.5, 0.9),
    overhead: pose(0.26, 0.0, 0.52, -0.1, -0.2, 0.4),
  },
  end: {
    left: pose(-0.18, -0.24, 0.72, -1.55, 0.7, -0.5, 1.05),
    right: pose(0.42, -0.26, 0.7, 0.95, 0.7, 1.4, 1.05),
    thrust: pose(0.1, -0.2, 0.86, -0.05, 1.3, 0.3, 1.1),
    overhead: pose(0.1, -0.2, 0.8, 0.0, 1.95, 0.3, 1),
  },
  carry: { y: -0.12 },
  sway: { walk: 0.012, breath: 0.004, turn: 0.35, follow: 9 },
  kick: { stiff: 260, damp: 14, push: 0.07, twist: 0.35 },
  trail: { frames: 9, from: 1.1, strength: 0.5 },
  impact: { flash: 0.16, sparks: 7, fly: 0.35, gravity: 1.6 },
};
