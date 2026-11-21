/** Tracks held keys and keys pressed since the last poll (edge-triggered). */
export class Keyboard {
  private held = new Set<string>();
  private pressed = new Set<string>();

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
      if (GAME_KEYS.has(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  /** True once per physical press. */
  consume(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  clearPressed(): void {
    this.pressed.clear();
  }
}

const GAME_KEYS = new Set(['Space', 'Tab', 'F3', 'F5', 'F9', 'KeyQ']);

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
