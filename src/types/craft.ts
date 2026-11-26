// Crafts (an airship): a box of 3D cells flown as one body, worked from stations by named control channels
import type { ItemId, ThingId } from './defs/ids';
import type { Vec2 } from './math';

/** One box of hull cells in the craft's own metres: x forward along the keel, y across, z up from the keel; end exclusive. `shape: null` cuts it out. */
export interface HullBox {
  from: readonly [number, number, number];
  to: readonly [number, number, number];
  shape: string | null;
  /** A tile kind (content/tiles.ts): it burns, soaks and freezes like that stuff anywhere. */
  mat?: string;
  /** Quarter turns. */
  rot?: number;
  /** Only every n-th cell along x and y (rail posts). */
  every?: number;
  /** Half-metre fine cells: the box is on a half-metre grid and every half-metre cell in it gets the shape. */
  fine?: boolean;
}

/** A thing fitted aboard (a station, the hold, the plank): where its foot stands in craft metres, and its facing (radians from forward). */
export interface Fitting {
  thing: ThingId;
  at: readonly [number, number, number];
  face?: number;
  /** A station's channel when the craft is made (fuel in a tank). */
  fill?: number;
  /** Not fixed in place: it lies where it is put and can be carried off (an anchor). */
  loose?: boolean;
  /** Tied by its chain (`ThingDef.chain` long) to this point aboard, in craft metres. */
  tie?: readonly [number, number, number];
}

/**
 * How a craft is made and flies. Stations write named channels (`StationDef.channel`); the craft reads them here, so
 * a new vehicle is new data. Speeds are metres (or radians) a second at full.
 */
export interface CraftDef {
  /** Box of cells it occupies, from `low` (x, y; default 0, 0, where something overhangs the keel's corner) to `size` (x, y, z), and the pivot it turns about (x, y). */
  size: readonly [number, number, number];
  low?: readonly [number, number];
  pivot: readonly [number, number];
  hull: readonly HullBox[];
  fittings: readonly Fitting[];
  thrust: { channel: string; speed: number; accel: number };
  turn: { channel: string; rate: number };
  climb: { channel: string; rate: number };
  /** Channel holding the fuel (seconds of powered flight). It burns while thrust, turn or climb is used. */
  fuel: string;
  /** Sinks this fast with no fuel. */
  sink: number;
  /** Share of the wind it drifts with while aloft. Within `still` m of where it would rest the wind leaves it be, and it takes its full share at twice that. */
  wind: number;
  still: number;
  /** Thin air: from height `base` over `span` metres; at the top speed is × (1 + speed) and the wind × (1 - calm). Never climbs above `top`. */
  air: { base: number; span: number; speed: number; calm: number; top: number };
  /** Its keel stays this far above the ground; resting this low it is moored (the wind leaves it be). */
  clearance: number;
  /** Called (a horn): cruises this high over the ground, then settles within `near` m of the caller. */
  called: { cruise: number; near: number };
}

export interface StationDef {
  channel: string;
  /** Moved by the movement keys of the one working it: forward/back or left/right. Without it the station is fed (`feed`). */
  axis?: 'forward' | 'strafe';
  /** Change a second while pushed; back toward the middle a second while manned and let be. */
  rate?: number;
  decay?: number;
  /** Where the one working it stands: metres behind it and to its side. */
  seat?: readonly [number, number];
  /** Prompt verb ("Take the wheel"). */
  text: string;
  /** Fed with items: each adds `amount` to the channel, up to `max`. */
  feed?: { item: ItemId; amount: number; max: number };
  /** Pictures of its state `<sprite>0..gauge-1`, by how far the channel is from its low end. */
  gauge?: number;
}

/** A flying craft's state (its pose is the entity's pos, z and angle). */
export interface CraftData {
  /** Where its cells are kept in the 3D layer (store coordinates of its box corner). */
  anchor: { x: number; y: number; z: number };
  vel: Vec2;
  vz: number;
  spin: number;
  prevYaw: number;
  /** Flying to a caller by itself (a horn) until it settles there. */
  goal: Vec2 | null;
}

/** Fixed aboard a craft: where in its metres, and facing. */
export interface RideData {
  craft: number;
  x: number;
  y: number;
  z: number;
  face: number;
}

/** A chain from a thing to a point aboard a craft: at most `len` long. `top` is where that point is in the world now (set each tick). */
export interface TetherData {
  craft: number;
  x: number;
  y: number;
  z: number;
  len: number;
  top?: { x: number; y: number; z: number };
}

/** A station's control: the channel's value (-1..1 for levers, fuel seconds for a tank) and who works it. */
export interface ControlData {
  v: number;
  by: number | null;
}
