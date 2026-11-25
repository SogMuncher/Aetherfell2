// The shape palette of the 3D layer as data: every shape a cell (1 m) or a fine cell (half a metre) can take
/**
 * A shape is one or more convex pieces (at most 4); each piece is a box, optionally sliced by up to 4 flat planes.
 * Coordinates are inside the cell, 0..1, so the same shape fits a whole cell or a fine half-metre cell. Every shape
 * can face four ways (quarter turns). Convention: slopes rise toward +x, thin walls stand on the −y edge.
 * Physics reads one solid span (bottom..top) per point of a shape's footprint, so a hole through a thin wall still
 * stops you, and a shape that is open below (an arch) is open below its underside.
 */

/** A flat plane slicing a piece: the solid side is where nx·x + ny·y + nz·z ≤ d. */
export type Cut = readonly [nx: number, ny: number, nz: number, d: number];

export interface ShapePiece {
  /** x0, y0, z0, x1, y1, z1 */
  readonly box: readonly [number, number, number, number, number, number];
  readonly cuts?: readonly Cut[];
}

export interface ShapeDef {
  readonly name: string;
  readonly pieces: readonly ShapePiece[];
  /** A door made of this shape (a cell whose material is a door) turns into that shape when opened or shut. */
  readonly swing?: string;
  /** This is the open way of a door shape. */
  readonly open?: boolean;
}

const FULL = [0, 0, 0, 1, 1, 1] as const;

export const SHAPES: Record<string, ShapeDef> = {
  cube: { name: 'block', pieces: [{ box: FULL }] },
  // Lower half: a thin floor seen from above is `slabHigh` (its top is flush with the cell above).
  slabLow: { name: 'low slab', pieces: [{ box: [0, 0, 0, 1, 1, 0.5] }] },
  slabHigh: { name: 'high slab', pieces: [{ box: [0, 0, 0.5, 1, 1, 1] }] },
  // Rises one cell over one cell toward +x (turn it to face other ways).
  ramp: { name: 'ramp', pieces: [{ box: FULL, cuts: [[-1, 0, 1, 0]] }] },
  // A little roof ridge: two slopes meeting in a point half a cell up.
  ridge: { name: 'ridge', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-1, 0, 1, 0], [1, 0, 1, 1]] }] },
  // Two half-cell steps rising toward +x.
  stair: { name: 'stair', pieces: [{ box: [0, 0, 0, 0.5, 1, 0.5] }, { box: [0.5, 0, 0, 1, 1, 1] }] },
  // Outer corner of a hip roof: rises toward the +x,+y corner.
  hip: { name: 'hip corner', pieces: [{ box: FULL, cuts: [[-1, 0, 1, 0], [0, -1, 1, 0]] }] },
  // The top of a pyramid roof: four slopes meeting half a cell up.
  cap: { name: 'roof cap', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-1, 0, 1, 0], [1, 0, 1, 1], [0, -1, 1, 0], [0, 1, 1, 1]] }] },
  // Solid above a slope, open below it: the shoulder of an arch (left side; turn it for the right).
  bracket: { name: 'arch shoulder', pieces: [{ box: FULL, cuts: [[1, 0, -1, 0]] }] },
  post: { name: 'post', pieces: [{ box: [0.3, 0.3, 0, 0.7, 0.7, 1] }] },
  // A thin wall along the -y edge of the cell.
  panel: { name: 'panel', pieces: [{ box: [0, 0, 0, 1, 0.3, 1] }] },
  // Marks a cell split into 2 × 2 × 2 fine cells (each its own shape and material); it has no pieces of its own.
  fine: { name: 'fine cells', pieces: [] },
  // Gentle slopes: half a cell of rise over a cell, low half and high half.
  rampLow: { name: 'low gentle ramp', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-0.5, 0, 1, 0]] }] },
  rampHigh: { name: 'high gentle ramp', pieces: [{ box: FULL, cuts: [[-0.5, 0, 1, 0.5]] }] },
  // Half a cell cut corner to corner, seen from above: a wall running at 45 degrees (a bow, a round tower).
  wedge: { name: 'wedge', pieces: [{ box: FULL, cuts: [[-1, 1, 0, 0]] }] },
  // Inner corner of a hip roof (the valley): rises toward +x and toward +y.
  valley: { name: 'roof valley', pieces: [{ box: FULL, cuts: [[-1, 0, 1, 0]] }, { box: FULL, cuts: [[0, -1, 1, 0]] }] },
  // Four quarter-cell steps rising toward +x (a fine flight of stairs, the same pitch as a ramp).
  stairFine: { name: 'fine stair', pieces: [{ box: [0, 0, 0, 0.25, 1, 0.25] }, { box: [0.25, 0, 0, 0.5, 1, 0.5] }, { box: [0.5, 0, 0, 0.75, 1, 0.75] }, { box: [0.75, 0, 0, 1, 1, 1] }] },
  // Two quarter-cell steps rising toward +x (half the pitch).
  stairLow: { name: 'shallow stair', pieces: [{ box: [0, 0, 0, 0.5, 1, 0.25] }, { box: [0.5, 0, 0, 1, 1, 0.5] }] },
  plate: { name: 'thin floor', pieces: [{ box: [0, 0, 0.75, 1, 1, 1] }] },
  plateLow: { name: 'thin low floor', pieces: [{ box: [0, 0, 0, 1, 1, 0.25] }] },
  beam: { name: 'beam', pieces: [{ box: [0, 0.3, 0.7, 1, 0.7, 1] }] },
  beamLow: { name: 'sill beam', pieces: [{ box: [0, 0.3, 0, 1, 0.7, 0.3] }] },
  postThin: { name: 'thin post', pieces: [{ box: [0.4, 0.4, 0, 0.6, 0.6, 1] }] },
  postCorner: { name: 'corner post', pieces: [{ box: [0, 0, 0, 0.3, 0.3, 1] }] },
  panelMid: { name: 'middle panel', pieces: [{ box: [0, 0.4, 0, 1, 0.6, 1] }], swing: 'doorOpen' },
  panelThin: { name: 'thin panel', pieces: [{ box: [0, 0, 0, 1, 0.15, 1] }] },
  parapet: { name: 'low wall', pieces: [{ box: [0, 0, 0, 1, 0.3, 0.5] }] },
  // A hand rail along the -y edge with its post at the -x end.
  rail: { name: 'rail', pieces: [{ box: [0, 0, 0.8, 1, 0.15, 0.95] }, { box: [0, 0, 0, 0.15, 0.15, 0.8] }] },
  // Round (eight-sided) columns, slim and stout.
  column: { name: 'column', pieces: [{ box: [0.2, 0.2, 0, 0.8, 0.8, 1], cuts: [[1, 1, 0, 1.42], [-1, -1, 0, -0.58], [1, -1, 0, 0.42], [-1, 1, 0, 0.42]] }] },
  columnWide: { name: 'stout column', pieces: [{ box: [0.05, 0.05, 0, 0.95, 0.95, 1], cuts: [[1, 1, 0, 1.63], [-1, -1, 0, -0.37], [1, -1, 0, 0.63], [-1, 1, 0, 0.63]] }] },
  // A rounded slope rising toward +x: a quarter round (hull bilge, rounded eave, dome).
  roundRamp: { name: 'rounded slope', pieces: [{ box: FULL, cuts: [[-0.9808, 0, 0.1951, 0], [-0.8315, 0, 0.5556, 0.1493], [-0.5556, 0, 0.8315, 0.4252], [-0.1951, 0, 0.9808, 0.7857]] }] },
  // A hollow curve rising toward +x, flat at first then steep (the sweep of a hull, a cove under eaves).
  cove: { name: 'cove', pieces: [
    { box: [0, 0, 0, 0.25, 1, 1], cuts: [[-0.1272, 0, 1, 0]] },
    { box: [0.25, 0, 0, 0.5, 1, 1], cuts: [[-0.4088, 0, 1, -0.0704]] },
    { box: [0.5, 0, 0, 0.75, 1, 1], cuts: [[-0.8184, 0, 1, -0.2752]] },
    { box: [0.75, 0, 0, 1, 1, 1], cuts: [[-2.6456, 0, 1, -1.6456]] },
  ] },
  // Solid above a quarter circle, open below: half of a round arch (crown at +x; turn it for the other half).
  archCurve: { name: 'round arch', pieces: [
    { box: [0, 0, 0, 0.25, 1, 1], cuts: [[2.6456, 0, -1, 0]] },
    { box: [0.25, 0, 0, 0.5, 1, 1], cuts: [[0.8184, 0, -1, -0.4568]] },
    { box: [0.5, 0, 0, 0.75, 1, 1], cuts: [[0.4088, 0, -1, -0.6616]] },
    { box: [0.75, 0, 0, 1, 1, 1], cuts: [[0.1272, 0, -1, -0.8728]] },
  ] },
  // Four slopes meeting at a point a whole cell up (a steeple, a tower top).
  spire: { name: 'spire', pieces: [{ box: FULL, cuts: [[-2, 0, 1, 0], [2, 0, 1, 2], [0, -2, 1, 0], [0, 2, 1, 2]] }] },
  // A steep roof ridge a whole cell tall.
  gable: { name: 'steep ridge', pieces: [{ box: FULL, cuts: [[-2, 0, 1, 0], [2, 0, 1, 2]] }] },
  hipLow: { name: 'gentle hip corner', pieces: [{ box: [0, 0, 0, 1, 1, 0.5], cuts: [[-0.5, 0, 1, 0], [0, -0.5, 1, 0]] }] },
  // A thin wall with a window through it.
  window: { name: 'window', pieces: [{ box: [0, 0, 0, 1, 0.3, 0.3] }, { box: [0, 0, 0.75, 1, 0.3, 1] }, { box: [0, 0, 0.3, 0.2, 0.3, 0.75] }, { box: [0.8, 0, 0.3, 1, 0.3, 0.75] }] },
  // A V along x, point down (a keel).
  vee: { name: 'keel', pieces: [{ box: FULL, cuts: [[0, 2, -1, 1], [0, -2, -1, -1]] }] },
  // A sloping plank, open underneath (a roof you can stand under, a gangway).
  slopePlank: { name: 'sloping plank', pieces: [{ box: FULL, cuts: [[-1, 0, 1, 0], [1, 0, -1, 0.3]] }] },
  wallHalf: { name: 'half wall', pieces: [{ box: [0, 0, 0, 1, 0.5, 1] }] },
  pillarCorner: { name: 'corner pillar', pieces: [{ box: [0, 0, 0, 0.5, 0.5, 1] }] },
  // The low corner piece of a pyramid: rises toward the +x,+y corner from the middle of the cell.
  tetra: { name: 'corner wedge', pieces: [{ box: FULL, cuts: [[-1, -1, 1, -1]] }] },
  // A quarter round seen from above, round side out toward +x,+y (a round tower's wall, a rounded bow).
  roundCorner: { name: 'round corner', pieces: [{ box: FULL, cuts: [[0.9808, 0.1951, 0, 0.9808], [0.8315, 0.5556, 0, 0.9808], [0.5556, 0.8315, 0, 0.9808], [0.1951, 0.9808, 0, 0.9808]] }] },
  // A door leaf swung open: the middle panel turned back against its -x jamb.
  doorOpen: { name: 'open door', pieces: [{ box: [0, 0.45, 0, 0.12, 1, 1] }], swing: 'panelMid', open: true },
  // The rounded slope upside down: solid toward +x and the top, curving away underneath (a hull's bilge, a balloon's belly).
  bilge: { name: 'bilge', pieces: [{ box: FULL, cuts: [[-0.9808, 0, -0.1951, -0.1951], [-0.8315, 0, -0.5556, -0.4063], [-0.5556, 0, -0.8315, -0.4063], [-0.1951, 0, -0.9808, -0.1951]] }] },
};

/** Lasting numbers of shapes (a shape's place in this list + 1). Never reorder; add at the end. At most 63. */
export const SHAPE_LEDGER: readonly string[] = [
  'cube', 'slabLow', 'slabHigh', 'ramp', 'ridge', 'stair', 'post', 'panel', 'hip', 'cap', 'bracket',
  'fine', 'rampLow', 'rampHigh', 'wedge', 'valley', 'stairFine', 'stairLow', 'plate', 'plateLow', 'beam', 'beamLow',
  'postThin', 'postCorner', 'panelMid', 'panelThin', 'parapet', 'rail', 'column', 'columnWide', 'roundRamp', 'cove',
  'archCurve', 'spire', 'gable', 'hipLow', 'window', 'vee', 'slopePlank', 'wallHalf', 'pillarCorner', 'tetra', 'roundCorner',
  'doorOpen',
  'bilge',
];
