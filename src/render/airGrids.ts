// A square grid of map cells round the eye, stored wrapped and filled nearest first within a time budget (moisture, water).
/**
 * Each slot holds cell (ix, iy) at slot (ix mod n, iy mod n), so a texture with repeat wrapping reads it straight from
 * world spots, and moving the eye only fills the cells that came into reach. Values are 0..1, kept as bytes.
 */
export class WrapGrid {
  readonly data: Uint8Array;
  private readonly kx: Int32Array;
  private readonly ky: Int32Array;
  /** Offsets from the centre, nearest first. */
  private readonly order: Int16Array;
  /** Bumps when any slot changed (the drawer re-uploads). */
  version = 0;

  constructor(readonly n: number, readonly cell: number, private readonly fn: (ix: number, iy: number) => number) {
    this.data = new Uint8Array(n * n);
    this.kx = new Int32Array(n * n).fill(-0x7fffffff);
    this.ky = new Int32Array(n * n);
    const offs: [number, number][] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) offs.push([i - n / 2, j - n / 2]);
    offs.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    this.order = Int16Array.from(offs.flat());
  }

  /** Fills missing cells round (x, y), nearest first, until `ms` milliseconds are spent. */
  update(x: number, y: number, ms: number): void {
    const n = this.n;
    const cx = Math.floor(x / this.cell);
    const cy = Math.floor(y / this.cell);
    const end = performance.now() + ms;
    let changed = false;
    for (let o = 0; o < this.order.length; o += 2) {
      const ix = cx + (this.order[o] ?? 0);
      const iy = cy + (this.order[o + 1] ?? 0);
      const s = (((iy % n) + n) % n) * n + (((ix % n) + n) % n);
      if (this.kx[s] === ix && this.ky[s] === iy) continue;
      this.kx[s] = ix;
      this.ky[s] = iy;
      this.data[s] = Math.round(Math.max(0, Math.min(1, this.fn(ix, iy))) * 255);
      changed = true;
      if ((o & 31) === 0 && performance.now() > end) break;
    }
    if (changed) this.version++;
  }
}
