/**
 * The rebinding flow: "press the key you want for this action".
 *
 * Kept apart from the bindings data so the settings screen has one object to
 * drive and one place to read the result from, and so the whole flow is
 * testable without a DOM or a controller.
 *
 * No key is reserved. Escape is bindable like everything else, so cancelling is
 * `cancel()` — a UI decision — rather than a key this module steals. A player
 * who wants Escape on `fire` gets Escape on `fire`.
 */

import {
  type BindableAction,
  type BindingDevice,
  type Bindings,
  addBinding,
  clearBindings,
} from './bindings.js';
import type { GamepadSource } from './gamepad.js';

/** Standard-mapping button count, the range `pollGamepad` scans. */
export const GAMEPAD_BUTTON_COUNT = 16;

/**
 * What a capture does with the bindings already on the action.
 *
 * `replace` is what a settings row does by default; `add` is the alternate
 * binding a player adds so an action answers to two inputs.
 */
export type CaptureMode = 'replace' | 'add';

export interface PendingCapture {
  readonly action: BindableAction;
  readonly device: BindingDevice;
  readonly mode: CaptureMode;
}

export interface CaptureResult {
  readonly action: BindableAction;
  readonly device: BindingDevice;
  /** A `KeyboardEvent.code` or a gamepad button index. */
  readonly input: string | number;
  /**
   * Other actions already using this input.
   *
   * The binding is applied regardless — a player who wants two actions on one
   * button is allowed to. Non-empty means the UI shows a warning, not that the
   * rebind failed.
   */
  readonly conflicts: readonly BindableAction[];
}

export class BindingCapture {
  private pendingCapture: PendingCapture | null = null;

  /**
   * Buttons held when the capture started, which are ignored until released.
   *
   * Without this, the button that opened the rebind row is still down on the
   * next poll and instantly binds itself.
   */
  private ignoredButtons = new Set<number>();

  /** False until the first poll has recorded what was already held. */
  private primed = false;

  constructor(private readonly bindings: Bindings) {}

  /** The capture in progress, or null. */
  get pending(): PendingCapture | null {
    return this.pendingCapture;
  }

  get capturing(): boolean {
    return this.pendingCapture !== null;
  }

  /**
   * Starts listening for the next input.
   *
   * A second call replaces the first: clicking another row while one is armed
   * moves the capture rather than queueing two.
   */
  begin(action: BindableAction, device: BindingDevice, mode: CaptureMode = 'replace'): void {
    this.pendingCapture = { action, device, mode };
    this.ignoredButtons = new Set();
    this.primed = false;
  }

  cancel(): void {
    this.pendingCapture = null;
    this.ignoredButtons.clear();
    this.primed = false;
  }

  /** Feeds a `KeyboardEvent.code`. Returns null when no keyboard capture is armed. */
  captureKey(code: string): CaptureResult | null {
    const pending = this.pendingCapture;
    if (pending?.device !== 'keyboard') {
      return null;
    }
    return this.apply(pending, code);
  }

  /** Feeds a gamepad button index. Returns null when no gamepad capture is armed. */
  captureGamepadButton(button: number): CaptureResult | null {
    const pending = this.pendingCapture;
    if (pending?.device !== 'gamepad') {
      return null;
    }
    return this.apply(pending, button);
  }

  /**
   * Polls a gamepad for the first button pressed since the capture began.
   *
   * The Gamepad API has no button event, so a rebind row has to poll — once per
   * tick, from the same place everything else samples input.
   */
  pollGamepad(source: GamepadSource): CaptureResult | null {
    const pending = this.pendingCapture;
    if (pending?.device !== 'gamepad') {
      return null;
    }

    // The first poll only records what was already held. The button that
    // opened the rebind row is still down on that poll, and without this it
    // would instantly bind itself to the action it just opened.
    if (!this.primed) {
      this.ignoreHeldButtons(source);
      this.primed = true;
      return null;
    }

    for (let button = 0; button < GAMEPAD_BUTTON_COUNT; button++) {
      const down = source.isButtonDown(button);
      if (!down) {
        this.ignoredButtons.delete(button);
        continue;
      }
      if (this.ignoredButtons.has(button)) {
        continue;
      }
      return this.apply(pending, button);
    }
    return null;
  }

  /** Marks the buttons currently held as not counting until they are released. */
  ignoreHeldButtons(source: GamepadSource): void {
    for (let button = 0; button < GAMEPAD_BUTTON_COUNT; button++) {
      if (source.isButtonDown(button)) {
        this.ignoredButtons.add(button);
      }
    }
  }

  private apply(pending: PendingCapture, input: string | number): CaptureResult {
    if (pending.mode === 'replace') {
      clearBindings(this.bindings, pending.action, pending.device);
    }
    const { conflicts } = addBinding(this.bindings, pending.action, pending.device, input);
    this.pendingCapture = null;
    this.ignoredButtons.clear();
    this.primed = false;
    return { action: pending.action, device: pending.device, input, conflicts };
  }
}
