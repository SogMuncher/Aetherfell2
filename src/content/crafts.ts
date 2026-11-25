// Crafts as data: the airship's hull (boxes of cells), what is fitted aboard, and how it flies
import type { CraftDef } from '../types';

const Q = Math.PI / 2;

/**
 * The airship, in its own metres: x runs stern (0) to bow (20), y port (0) to starboard, z up from the keel.
 * Below deck (z 1-3.5) is a walled hold with windows; the main deck (stand at 4) has the throttle and altitude levers,
 * a hatch with stairs down and a plank out to starboard; the raised stern deck (stand at 7) has the wheel and the
 * fuel tank. A boarding stair runs up the port side from the keel.
 */
export const AIRSHIP: CraftDef = {
  size: [20, 14, 8],
  pivot: [10, 5],
  hull: [
    // Below deck: floor, walls up to the deck planks, windows cut through the sides.
    { from: [2, 2, 0], to: [18, 8, 1], shape: 'cube', mat: 'woodFloor' },
    { from: [2, 2, 1], to: [18, 3, 3.5], shape: 'cube', mat: 'woodWall', fine: true },
    { from: [2, 7, 1], to: [18, 8, 3.5], shape: 'cube', mat: 'woodWall', fine: true },
    { from: [2, 3, 1], to: [3, 7, 3.5], shape: 'cube', mat: 'woodWall', fine: true },
    { from: [17, 3, 1], to: [18, 7, 3.5], shape: 'cube', mat: 'woodWall', fine: true },
    { from: [5, 2, 2], to: [6, 3, 3], shape: null },
    { from: [9, 2, 2], to: [10, 3, 3], shape: null },
    { from: [13, 2, 2], to: [14, 3, 3], shape: null },
    { from: [5, 7, 2], to: [6, 8, 3], shape: null },
    { from: [9, 7, 2], to: [10, 8, 3], shape: null },
    { from: [13, 7, 2], to: [14, 8, 3], shape: null },
    // Main deck: half-metre planks (2.5 m of head room below), the bow narrowed, and a hatch with a stair down.
    { from: [0, 1, 3.5], to: [20, 9, 4], shape: 'cube', mat: 'woodFloor', fine: true },
    { from: [18, 1, 3], to: [20, 3, 4], shape: null },
    { from: [18, 7, 3], to: [20, 9, 4], shape: null },
    { from: [11, 4, 3.5], to: [14, 6, 4], shape: null, fine: true },
    // The hatch stair: quarter-metre steps from the hold floor (1) up to the deck (4).
    ...[0, 1, 2, 3, 4, 5].map((k) => ({ from: [11 + k * 0.5, 4, 1 + k * 0.5] as const, to: [11.5 + k * 0.5, 6, 1.5 + k * 0.5] as const, shape: 'stair', mat: 'woodFloor', fine: true })),
    // The raised stern deck and the stairs up to it.
    { from: [0, 1, 4], to: [6, 9, 6], shape: 'cube', mat: 'woodWall' },
    { from: [0, 1, 6], to: [6, 9, 7], shape: 'cube', mat: 'woodFloor' },
    { from: [8, 2, 4], to: [9, 4, 5], shape: 'stair', mat: 'woodFloor', rot: 2 },
    { from: [7, 2, 5], to: [8, 4, 6], shape: 'stair', mat: 'woodFloor', rot: 2 },
    { from: [6, 2, 6], to: [7, 4, 7], shape: 'stair', mat: 'woodFloor', rot: 2 },
    // Rails along the edges (rail on the outer side), gaps for the boarding stair and the plank.
    { from: [9, 1, 4], to: [18, 2, 5], shape: 'rail', mat: 'woodWall' },
    { from: [8, 8, 4], to: [10, 9, 5], shape: 'rail', mat: 'woodWall', rot: 2 },
    { from: [12, 8, 4], to: [18, 9, 5], shape: 'rail', mat: 'woodWall', rot: 2 },
    { from: [0, 1, 7], to: [6, 2, 8], shape: 'rail', mat: 'woodWall' },
    { from: [0, 8, 7], to: [6, 9, 8], shape: 'rail', mat: 'woodWall', rot: 2 },
    { from: [0, 2, 7], to: [1, 8, 8], shape: 'rail', mat: 'woodWall', rot: 3 },
    { from: [5, 4, 7], to: [6, 8, 8], shape: 'rail', mat: 'woodWall', rot: 1 },
    // Boarding stair up the port side, and the launching plank out to starboard.
    { from: [3, 0, 0], to: [4, 1, 1], shape: 'stair', mat: 'woodFloor' },
    { from: [4, 0, 1], to: [5, 1, 2], shape: 'stair', mat: 'woodFloor' },
    { from: [5, 0, 2], to: [6, 1, 3], shape: 'stair', mat: 'woodFloor' },
    { from: [6, 0, 3], to: [7, 1, 4], shape: 'stair', mat: 'woodFloor' },
    { from: [10, 9, 3.5], to: [12, 14, 4], shape: 'cube', mat: 'woodFloor', fine: true },
  ],
  fittings: [
    { thing: 'shipWheel', at: [3.5, 5, 7] },
    { thing: 'fuelTank', at: [1, 2.5, 7] },
    { thing: 'throttleLever', at: [16.5, 3.5, 4] },
    { thing: 'altitudeLever', at: [16.5, 6.5, 4] },
    { thing: 'shipHold', at: [15.5, 5, 1], face: 2 * Q },
    { thing: 'launchPlank', at: [11, 11.6, 4], face: Q },
  ],
  thrust: { channel: 'throttle', speed: 9, accel: 0.5 },
  turn: { channel: 'helm', rate: 0.35 },
  climb: { channel: 'lift', rate: 4 },
  fuel: 'fuel',
  sink: 0.8,
  wind: 0.7,
  air: { base: 40, span: 180, speed: 1.5, calm: 0.75, top: 260 },
  clearance: 0.3,
  called: { cruise: 30, near: 16 },
};
