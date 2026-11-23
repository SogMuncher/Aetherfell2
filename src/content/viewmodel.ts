// First-person held item: rest and guard poses, the path of every swing, and how it moves and reacts.
import type { ArcKey, HandPose, SwingArcDef, ViewmodelDef } from '../types';

const pose = (x: number, y: number, z: number, lean: number, pitch: number, roll: number, reach = 1): HandPose => ({ x, y, z, lean, pitch, roll, reach });
const key = (at: [number, number, number], d: [number, number, number], roll: number): ArcKey => ({ at, d, roll });
const arc = (pivot: [number, number, number], from: ArcKey, hit: ArcKey, to: ArcKey): SwingArcDef => ({ pivot, from, hit, to });

/**
 * The item in your hand, in the first-person view. Each way of swinging is a path (see SwingArcDef):
 * the hand turns about a pivot while the blade turns from drawn back, through the hit, to the end of
 * its follow-through. One row per way of swinging, so a new swing is a new row here and in
 * content/rules.ts. The drawing code (render/entities/viewModel.ts) warps the item's own flat picture
 * to the pose (tilt, foreshorten, slant, taper) for every held item alike.
 */
export const VIEWMODEL: ViewmodelDef = {
  focal: 1.0,
  warp: { side: 0.36, flat: 0.3, shear: 0.35, taper: 0.5 },
  rest: pose(0.28, -0.28, 0.52, -0.3, 0.42, 0.5),
  guard: pose(0.1, -0.2, 0.55, -1.45, 0.5, 0.2),
  arcs: {
    // Sweep to the left: drawn back over the right shoulder, cuts flat across, ends low on the left.
    left: arc([0.1, -0.45, 0.3], key([0.2, -0.15, 0.5], [0.35, 0.8, -0.25], 1.1), key([0.03, -0.18, 0.6], [-0.6, 0.1, 0.8], 1.35), key([-0.16, -0.2, 0.5], [-0.8, -0.2, 0.45], 1.2)),
    // Backhand to the right: drawn across to the left shoulder, cuts across, ends out on the right.
    right: arc([0.0, -0.45, 0.3], key([-0.17, -0.15, 0.5], [-0.45, 0.75, -0.3], -1.1), key([0.03, -0.18, 0.6], [0.6, 0.1, 0.8], -1.3), key([0.2, -0.2, 0.5], [0.85, -0.2, 0.4], -1.15)),
    // Thrust: pulled back low and pointing ahead, driven straight out, held there.
    thrust: arc([0.2, -0.3, -2], key([0.17, -0.23, 0.42], [-0.2, 0.6, 0.75], 0.4), key([0.07, -0.15, 0.62], [-0.1, 0.55, 0.83], 0.3), key([0.07, -0.16, 0.66], [-0.1, 0.52, 0.85], 0.3)),
    // Chop: raised high over the right shoulder, brought down across the front, ends low on the left.
    overhead: arc([0.08, -0.4, 0.3], key([0.16, 0.0, 0.45], [0.45, 0.8, -0.3], 0.5), key([0.04, -0.13, 0.62], [-0.25, 0.45, 0.85], 0.35), key([-0.04, -0.2, 0.52], [-0.6, -0.6, 0.5], 0.3)),
  },
  motion: { aim: 11, home: 7, draw: 0.3, lag: 0.35, through: 0.45, tapWind: 0.45 },
  carry: { y: -0.12 },
  sway: { walk: 0.012, breath: 0.004, turn: 0.35, follow: 9 },
  kick: { stiff: 260, damp: 14, push: 0.07, twist: 0.35 },
  trail: { frames: 9, from: 1.1, strength: 0.5 },
  impact: { flash: 0.16, sparks: 7, fly: 0.35, gravity: 1.6 },
};
