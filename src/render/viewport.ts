/**
 * The low-resolution retro frame size. The canvas holds the chosen pixel count and is scaled up crisply to the window;
 * the GPU renderer lays its own canvas over it at the same size.
 */
export class Viewport {
  width = 0;
  height = 0;

  constructor(readonly canvas: HTMLCanvasElement, private targetHeight = 200) {
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
    }
    const scale = Math.min(window.innerWidth / w, window.innerHeight / h);
    this.canvas.style.width = `${Math.floor(w * scale)}px`;
    this.canvas.style.height = `${Math.floor(h * scale)}px`;
  }
}
