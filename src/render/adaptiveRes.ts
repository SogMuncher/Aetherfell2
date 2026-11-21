/**
 * Adaptive pixel size: when frames run slower than the wish, draw fewer lines (the view is scaled up
 * crisply, so it just looks chunkier); when there is room again, creep back up to the chosen detail.
 * Pure arithmetic on frame times, no drawing.
 */
export const ADAPTIVE = {
  minLines: 100,
  /** Seconds between changes. */
  every: 0.75,
  /** Shrink when the average frame is this much over the wish. */
  slackOver: 1.12,
  /** Grow when the average frame is within this of the wish. */
  slackUnder: 1.05,
  shrink: 0.88,
  grow: 1.06,
  /** After shrinking, wait this long before growing again (stops flip-flopping). */
  holdAfterShrink: 8,
  step: 10,
};

export class AdaptiveRes {
  private sum = 0;
  private frames = 0;
  private since = 0;
  private hold = 0;
  /** Lines now. */
  lines = 0;

  /** Feed each frame's seconds; returns the lines to draw (`maxLines` is the chosen detail, `fps` 0 = off). */
  update(dt: number, maxLines: number, fps: number): number {
    if (fps <= 0) return (this.lines = maxLines);
    if (this.lines === 0 || this.lines > maxLines) this.lines = maxLines;
    this.sum += dt;
    this.frames++;
    this.since += dt;
    this.hold = Math.max(0, this.hold - dt);
    if (this.since < ADAPTIVE.every || this.frames < 8) return this.lines;
    const avg = this.sum / this.frames;
    const wish = 1 / fps;
    this.sum = this.frames = this.since = 0;
    const snap = (v: number): number => Math.round(v / ADAPTIVE.step) * ADAPTIVE.step;
    if (avg > wish * ADAPTIVE.slackOver && this.lines > ADAPTIVE.minLines) {
      this.lines = Math.max(ADAPTIVE.minLines, Math.min(this.lines - ADAPTIVE.step, snap(this.lines * ADAPTIVE.shrink)));
      this.hold = ADAPTIVE.holdAfterShrink;
    } else if (avg < wish * ADAPTIVE.slackUnder && this.hold <= 0 && this.lines < maxLines) {
      this.lines = Math.min(maxLines, Math.max(this.lines + ADAPTIVE.step, snap(this.lines * ADAPTIVE.grow)));
    }
    return this.lines;
  }
}
