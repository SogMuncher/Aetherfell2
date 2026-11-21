/**
 * The low-resolution retro frame. Everything is drawn into `pixels` (one Uint32 per pixel) with a
 * matching depth buffer, then blitted once per frame and scaled up with crisp nearest-neighbour.
 */
export class Viewport {
  width = 0;
  height = 0;
  pixels = new Uint32Array(0);
  depth = new Float32Array(0);
  private image: ImageData | null = null;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(readonly canvas: HTMLCanvasElement, private targetHeight = 200) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setTargetHeight(h: number): void {
    this.targetHeight = h;
    this.resize();
  }

  resize(): void {
    const aspect = Math.max(1, Math.min(2.4, window.innerWidth / Math.max(1, window.innerHeight)));
    const h = this.targetHeight;
    const w = Math.round((h * aspect) / 2) * 2;
    if (w !== this.width || h !== this.height) {
      this.width = w;
      this.height = h;
      this.canvas.width = w;
      this.canvas.height = h;
      this.image = this.ctx.createImageData(w, h);
      this.pixels = new Uint32Array(this.image.data.buffer);
      this.depth = new Float32Array(w * h);
    }
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    this.canvas.style.width = `${Math.floor(w * scale)}px`;
    this.canvas.style.height = `${Math.floor(h * scale)}px`;
  }

  present(): void {
    if (this.image) this.ctx.putImageData(this.image, 0, 0);
  }
}
