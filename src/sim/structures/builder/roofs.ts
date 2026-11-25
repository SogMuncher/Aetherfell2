// Roofs of the house form: gable and hip, with eaves and verges that overhang the walls by a metre
import { CAP, HIP, type Mats, Placer, RAMP, RIDGE, SLOPE_PLANK } from './placer';

/** Pitched roof with a ridge along the longer side; the short ends are filled up into gables. Planks overhang every side. */
export function gable(p: Placer, top: number, m: Mats): number {
  const { W, D } = p;
  const alongY = W <= D;
  const S = alongY ? W : D;
  const L = alongY ? D : W;
  const half = Math.floor(S / 2);
  let peak = top;
  const cell = (across: number, along: number, lz: number, shape: number, turns: number, over: boolean): void => {
    const [lx, ly, t] = alongY ? [across, along, turns] : [along, across, turns + 1];
    if (over) p.putSoft(lx, ly, lz, shape, t, m.roof);
    else p.put(lx, ly, lz, shape, t, m.roof);
  };
  const fill = (across: number, along: number, lz: number): void => {
    if (alongY) p.cube(across, along, lz, m.wall);
    else p.cube(along, across, lz, m.wall);
  };
  // Rows -1 and L are the verges past the gable ends; slope -1 is the eave past the side walls: thin planks, open below.
  for (let along = -1; along <= L; along++) {
    const verge = along < 0 || along >= L;
    const end = along === 0 || along === L - 1;
    for (let r = -1; r < half; r++) {
      const over = verge || r < 0;
      cell(r, along, top + r, over ? SLOPE_PLANK : RAMP, 0, over);
      cell(S - 1 - r, along, top + r, over ? SLOPE_PLANK : RAMP, 2, over);
      peak = Math.max(peak, top + r + 1);
      if (end) {
        for (let lz = top; lz < top + r; lz++) {
          fill(r, along, lz);
          fill(S - 1 - r, along, lz);
        }
      }
    }
    if (S % 2 === 1) {
      cell(half, along, top + half, RIDGE, 0, verge);
      peak = Math.max(peak, top + half + 1);
      if (end) for (let lz = top; lz < top + half; lz++) fill(half, along, lz);
    }
  }
  return peak;
}

/** Roof sloping down on all four sides, built ring by ring from the eaves (ring -1 overhangs the walls) inward. */
export function hip(p: Placer, top: number, m: Mats): number {
  const { W, D } = p;
  let peak = top;
  for (let r = -1; ; r++) {
    const wi = W - 2 * r;
    const di = D - 2 * r;
    if (wi <= 0 || di <= 0) break;
    const z = top + r;
    const x0 = r;
    const y0 = r;
    const x1 = W - 1 - r;
    const y1 = D - 1 - r;
    const over = r < 0;
    const slope = over ? SLOPE_PLANK : RAMP;
    const put = (x: number, y: number, shape: number, turns: number): void => (over ? p.putSoft(x, y, z, shape, turns, m.roof) : p.put(x, y, z, shape, turns, m.roof));
    peak = Math.max(peak, z + 1);
    if (wi === 1 && di === 1) {
      put(x0, y0, CAP, 0);
      break;
    }
    if (wi === 1 || di === 1) {
      // A ridge line; the cells at its ends are pyramid tops.
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const endCell = (wi === 1 && (y === y0 || y === y1)) || (di === 1 && (x === x0 || x === x1));
          put(x, y, endCell ? CAP : RIDGE, wi === 1 ? 0 : 1);
        }
      }
      break;
    }
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const onX = x === x0 || x === x1;
        const onY = y === y0 || y === y1;
        if (!onX && !onY) continue;
        if (onX && onY) {
          // Outer corner: its high point faces the middle of the roof.
          put(x, y, HIP, x === x0 ? (y === y0 ? 0 : 3) : y === y0 ? 1 : 2);
        } else if (onX) put(x, y, slope, x === x0 ? 0 : 2);
        else put(x, y, slope, y === y0 ? 1 : 3);
      }
    }
    if (wi === 2 || di === 2) break;
  }
  return peak;
}
