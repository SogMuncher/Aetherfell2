import type { BodyRegionId, InputSnapshot, ItemId, RuneId, ThrowAim, WearRequest } from '../types';
import { Keyboard } from './keyboard';
import { Mouse } from './mouse';
import { QUICK_SLOTS, QuickSlots } from './quickSlots';

/** Local UI actions that never touch the simulation. */
export type UiAction = 'inventory' | 'paperdoll' | 'journal' | 'map' | 'runebook' | 'debug' | 'save' | 'load' | 'escape' | 'host' | 'settings';

/**
 * Turns raw keyboard + mouse into one InputSnapshot per sim tick, and a list of local UI actions.
 * Edge-triggered actions are latched until the next snapshot so nothing is lost between ticks.
 */
export class InputSystem {
  readonly keyboard: Keyboard;
  readonly mouse: Mouse;
  private seq = 0;
  private latched = { interact: false, grab: false, cast: false, jump: false };
  private prepare: RuneId[] | null = null;
  private useItem: ItemId | null = null;
  private dropItem: ItemId | null = null;
  private choice: number | null = null;
  private throwItem: ThrowAim | null = null;
  private pickUp: number | null = null;
  private wear: WearRequest | null = null;
  private uiQueue: UiAction[] = [];
  /** Set by main while a conversation is open: number keys pick replies. */
  dialogueOpen = false;
  /** Settings: how fast the arrow keys turn you (1 = normal). */
  turnSpeed = 1;
  /** Quick-use keys 1..4. */
  readonly quick: QuickSlots;
  /** Set by main: the item picked in the open bag (a number key then puts it on that key). */
  pickedItem: () => ItemId | null = () => null;
  /** Set by main: told when a key gets a new item. */
  onQuickSet: (key: number, id: ItemId) => void = () => undefined;

  constructor(canvas: HTMLElement, quickDefaults: readonly string[] = []) {
    this.quick = new QuickSlots(quickDefaults);
    this.keyboard = new Keyboard(window);
    this.mouse = new Mouse(canvas);
  }

  /** Called every animation frame: latches presses and collects UI actions. */
  poll(): UiAction[] {
    const k = this.keyboard;
    const m = this.mouse;
    if (k.consume('KeyE')) this.latched.interact = true;
    if (k.consume('KeyF')) this.latched.grab = true;
    if (k.consume('KeyQ') || m.consume(1)) this.latched.cast = true;
    if (k.consume('Space')) this.latched.jump = true;
    for (let i = 0; i < 6; i++) {
      if (!k.consume(`Digit${i + 1}`)) continue;
      if (this.dialogueOpen) this.choice = i;
      else if (i < QUICK_SLOTS) this.quickKey(i);
    }
    // The old keys still work: H is quick key 1, G quick key 2.
    if (k.consume('KeyH')) this.quickKey(0);
    if (k.consume('KeyG')) this.quickKey(1);
    if (k.consume('KeyI') || k.consume('Tab')) this.uiQueue.push('inventory');
    if (k.consume('KeyC')) this.uiQueue.push('paperdoll');
    if (k.consume('KeyJ')) this.uiQueue.push('journal');
    if (k.consume('KeyB')) this.uiQueue.push('runebook');
    if (k.consume('KeyM')) this.uiQueue.push('map');
    if (k.consume('F3')) this.uiQueue.push('debug');
    if (k.consume('F5')) this.uiQueue.push('save');
    if (k.consume('F9')) this.uiQueue.push('load');
    if (k.consume('Escape')) this.uiQueue.push('escape');
    if (k.consume('KeyO')) this.uiQueue.push('settings');
    m.consume(0);
    const out = this.uiQueue;
    this.uiQueue = [];
    return out;
  }

  /** A quick key: with an item picked in the open bag, the key takes it; otherwise use what it holds. */
  private quickKey(i: number): void {
    const picked = this.pickedItem();
    if (picked) {
      this.quick.set(i, picked);
      this.onQuickSet(i + 1, picked);
      return;
    }
    const id = this.quick.get(i);
    if (id) this.useItem = id;
  }

  /** UI buttons (inventory, dialogue) feed choices through here. */
  queueUse(id: ItemId): void {
    this.useItem = id;
  }
  queueDrop(id: ItemId): void {
    this.dropItem = id;
  }
  /** The bag: an item was let go over the view. */
  queueThrow(aim: ThrowAim): void {
    this.throwItem = { ...aim };
  }
  /** The bag: a loose item in the view was dragged into it. */
  queuePickUp(entity: number): void {
    this.pickUp = entity;
  }
  /** The paperdoll and the bag: put a piece from the bag on. */
  queueWear(item: ItemId): void {
    this.wear = { do: 'wear', item };
  }
  /** A piece of armour lying in the view was dragged onto the paperdoll. */
  queueWearFrom(entity: number): void {
    this.wear = { do: 'wearFrom', entity };
  }
  /** Take what is worn on this part of the body off. */
  queueRemove(region: BodyRegionId): void {
    this.wear = { do: 'remove', region };
  }
  queueChoice(i: number): void {
    this.choice = i;
  }
  /** The runebook asks for these runes to become the prepared spell. */
  queuePrepare(runes: readonly RuneId[]): void {
    this.prepare = [...runes];
  }

  /**
   * Called once per sim tick. `frozen` (a panel has the mouse) keeps you standing still but still
   * delivers what the panel asked for, like using an item or preparing a spell.
   */
  snapshot(frozen = false): InputSnapshot {
    const k = this.keyboard;
    const m = this.mouse;
    const fwd = (k.isDown('KeyW') || k.isDown('ArrowUp') ? 1 : 0) - (k.isDown('KeyS') || k.isDown('ArrowDown') ? 1 : 0);
    const str = (k.isDown('KeyD') ? 1 : 0) - (k.isDown('KeyA') ? 1 : 0);
    if (k.isDown('ArrowLeft')) m.yaw -= 0.08 * this.turnSpeed;
    if (k.isDown('ArrowRight')) m.yaw += 0.08 * this.turnSpeed;
    const sweep = m.sweep;
    const chop = m.sweepV > 6 && m.sweepV > Math.abs(sweep) * 0.9;
    // Motion fades between ticks, so holding still goes back to a straight thrust.
    m.sweep *= 0.85;
    m.sweepV *= 0.85;
    const snap: InputSnapshot = {
      seq: ++this.seq,
      forward: fwd,
      strafe: str,
      yaw: m.yaw,
      pitch: m.pitch,
      sprint: k.isDown('ShiftLeft') || k.isDown('ShiftRight'),
      jump: this.latched.jump,
      jumpHeld: k.isDown('Space'),
      attack: m.isDown(0),
      swingDir: chop ? 'overhead' : sweep > 6 ? 'right' : sweep < -6 ? 'left' : 'thrust',
      block: m.isDown(2),
      interact: this.latched.interact,
      grab: this.latched.grab,
      cast: this.latched.cast,
      prepare: this.prepare,
      useItem: this.useItem,
      dropItem: this.dropItem,
      throwItem: this.throwItem,
      pickUp: this.pickUp,
      wear: this.wear,
      choice: this.choice,
    };
    this.latched = { interact: false, grab: false, cast: false, jump: false };
    if (frozen) {
      snap.forward = snap.strafe = 0;
      snap.sprint = snap.jump = snap.jumpHeld = snap.attack = snap.block = false;
      snap.interact = snap.grab = snap.cast = false;
    }
    this.prepare = null;
    this.useItem = null;
    this.dropItem = null;
    this.throwItem = null;
    this.pickUp = null;
    this.wear = null;
    this.choice = null;
    return snap;
  }
}
