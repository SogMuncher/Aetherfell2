/** Pointer-lock mouse look plus button state. Yaw is applied instantly so looking feels smooth at any sim rate. */
export class Mouse {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  /** Settings: mouse up looks down. */
  invertY = false;
  locked = false;
  private buttons = new Set<number>();
  private pressedButtons = new Set<number>();
  /** Recent horizontal motion, decays — tells a swing which way to go. */
  sweep = 0;
  /** Same, vertical: positive = pulling the mouse toward you (a chop). */
  sweepV = 0;

  constructor(element: HTMLElement) {
    element.addEventListener('click', () => {
      if (!this.locked && this.wantsLock()) void element.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === element;
      if (!this.locked) this.buttons.clear();
      if (was && !this.locked) this.onUnlock();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw += e.movementX * this.sensitivity;
      this.pitch = Math.max(-1, Math.min(1, this.pitch - e.movementY * this.sensitivity * 1.6 * (this.invertY ? -1 : 1)));
      this.sweep = this.sweep * 0.8 + e.movementX;
      this.sweepV = this.sweepV * 0.8 + e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Called when the pointer lock ends (the player pressed Escape, or we released it). */
  onUnlock: () => void = () => {};

  /** UI can veto grabbing the pointer (e.g. while a menu is open). */
  wantsLock: () => boolean = () => true;

  isDown(button: number): boolean {
    return this.buttons.has(button);
  }

  consume(button: number): boolean {
    if (!this.pressedButtons.has(button)) return false;
    this.pressedButtons.delete(button);
    return true;
  }

  release(): void {
    if (this.locked) document.exitPointerLock();
  }
}
