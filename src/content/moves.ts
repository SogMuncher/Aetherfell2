// Body moves seen from outside: how arms, torso, head (or a beast's neck) turn through each swing direction and the throw
import type { MoveDef, MoveId } from '../types';

/**
 * Turns are [tilt, yaw, roll] degrees about each joint's pivot (see ArtPart), at wind-up, release
 * and follow-through. Tilt: negative raises a hanging arm forward. Yaw: positive brings the right
 * shoulder forward. Roll: positive lifts the right arm out sideways (the left arm, 'off', uses
 * negative). Any body whose joints carry these roles (`act` in content/looks.ts) plays them; the
 * sim's timing sets the pace, so a slow axe and a quick knife play the same move at their own speed.
 */
export const MOVES: Readonly<Record<MoveId, MoveDef>> = {
  // Chop: raised high over the head, brought down in front.
  overhead: {
    roles: {
      arm: { windup: [-170, 0, 12], strike: [-62, 0, 4], follow: [-18, 8, 0] },
      fore: { windup: [-70, 0, 0], strike: [-8, 0, 0], follow: [-20, 0, 0] },
      off: { windup: [-35, 0, -14], strike: [12, 0, -10], follow: [4, 0, -6] },
      offFore: { windup: [-30, 0, 0], strike: [-15, 0, 0], follow: [-15, 0, 0] },
      torso: { windup: [-9, -10, 0], strike: [13, 4, 0], follow: [9, 4, 0] },
      head: { windup: [-10, 0, 0], strike: [10, 0, 0], follow: [5, 0, 0] },
      neck: { windup: [-28, 0, 0], strike: [32, 0, 0], follow: [14, 0, 0] },
    },
    body: [-0.25, 0.65, 0.35],
  },
  // Thrust: the arm drawn back at the hip, then driven straight out.
  thrust: {
    roles: {
      arm: { windup: [38, 0, 10], strike: [-82, 4, 0], follow: [-72, 4, 0] },
      fore: { windup: [-100, 0, 0], strike: [-4, 0, 0], follow: [-14, 0, 0] },
      off: { windup: [-25, 0, -12], strike: [28, 0, -10], follow: [16, 0, -6] },
      offFore: { windup: [-40, 0, 0], strike: [-20, 0, 0], follow: [-20, 0, 0] },
      torso: { windup: [0, -26, 0], strike: [8, 24, 0], follow: [5, 14, 0] },
      head: { windup: [0, 10, 0], strike: [6, -8, 0], follow: [3, -4, 0] },
      neck: { windup: [-12, 0, 0], strike: [26, 0, 0], follow: [10, 0, 0] },
    },
    body: [-0.4, 0.75, 0.45],
  },
  // Backhand to the left (seen from outside): drawn across the body to its left, cut level out to its right.
  left: {
    roles: {
      arm: { windup: [-70, 62, -28], strike: [-88, -12, 28], follow: [-40, -58, 70] },
      fore: { windup: [-70, 0, 0], strike: [-8, 0, 0], follow: [-25, 0, 0] },
      off: { windup: [10, 0, -10], strike: [-10, 0, -24], follow: [-15, 0, -30] },
      offFore: { windup: [-25, 0, 0], strike: [-20, 0, 0], follow: [-20, 0, 0] },
      torso: { windup: [0, 34, 0], strike: [5, -12, 0], follow: [5, -32, 0] },
      head: { windup: [0, -12, 0], strike: [4, 6, 0], follow: [0, 12, 0] },
      neck: { windup: [-6, 32, 0], strike: [22, -8, 0], follow: [10, -34, 0] },
    },
    body: [-0.15, 0.55, 0.3],
  },
  // Sweep to the right (seen from outside): drawn back out to its right, cut level across the front, ends out to its left.
  right: {
    roles: {
      arm: { windup: [-35, -55, 78], strike: [-88, 12, 8], follow: [-62, 62, -12] },
      fore: { windup: [-45, 0, 0], strike: [-8, 0, 0], follow: [-30, 0, 0] },
      off: { windup: [-15, 0, -28], strike: [10, 0, -12], follow: [18, 0, -6] },
      offFore: { windup: [-30, 0, 0], strike: [-20, 0, 0], follow: [-20, 0, 0] },
      torso: { windup: [0, -34, 0], strike: [5, 14, 0], follow: [5, 34, 0] },
      head: { windup: [0, 14, 0], strike: [4, -6, 0], follow: [0, -12, 0] },
      neck: { windup: [-6, -32, 0], strike: [22, 8, 0], follow: [10, 34, 0] },
    },
    body: [-0.15, 0.55, 0.3],
  },
  // Overarm throw: the item drawn back over the shoulder, the other arm points at the target, let go in front.
  throw: {
    roles: {
      arm: { windup: [-145, -25, 32], strike: [-95, 4, 4], follow: [-15, 18, -6] },
      fore: { windup: [-80, 0, 0], strike: [-12, 0, 0], follow: [-10, 0, 0] },
      off: { windup: [-75, 0, -8], strike: [-20, 0, -12], follow: [10, 0, -8] },
      offFore: { windup: [-5, 0, 0], strike: [-30, 0, 0], follow: [-25, 0, 0] },
      torso: { windup: [-10, -30, 0], strike: [10, 16, 0], follow: [15, 22, 0] },
      head: { windup: [0, 18, 0], strike: [4, -8, 0], follow: [6, -10, 0] },
      neck: { windup: [-20, 0, 0], strike: [20, 0, 0], follow: [8, 0, 0] },
    },
    body: [-0.3, 0.5, 0.5],
    time: 0.55,
  },
};
