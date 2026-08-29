/**
 * Touch state: two virtual analog sticks plus the four tap buttons a
 * gamepad's face/shoulder buttons cover.
 *
 * Unlike `KeyboardSource`/`GamepadSource`, nothing here listens to DOM events
 * directly — `app/touch-controls.ts` owns the on-screen joystick and button
 * widgets and pushes their state in through the setters below. That split
 * keeps this class (and the sampler code that reads it) testable without a
 * DOM, the same reason `KeyboardSource`'s own doc comment gives.
 *
 * Fire has no button here: aiming fires, the same convention the gamepad and
 * keyboard already follow (`InputSampler.sampleGamepad`/`sampleKeyboard`) —
 * deflecting the aim stick is the fire command.
 */

import { applyRadialDeadZone } from './dead-zone.js';

export type TouchButton = 'bomb' | 'use' | 'map' | 'pause';

/**
 * Small relative to the gamepad's dead zone: a virtual stick has no spring
 * centring it, so there is no resting drift to filter out, only the last
 * pixel or two of precision near the knob's own centre.
 */
export const DEFAULT_TOUCH_DEAD_ZONE = 0.08;

/** Below this a stick deflection does not count as deliberate activity. */
const ACTIVITY_THRESHOLD = 0.5;

export class TouchSource {
  private activity = 0;
  private readonly buttonsDown = new Set<TouchButton>();

  /** Raw stick input from the widgets, both axes in [-1, 1] before the dead zone. */
  private rawMoveX = 0;
  private rawMoveY = 0;
  private rawAimX = 0;
  private rawAimY = 0;

  /** Scratch output for the last dead-zoned read of each stick. */
  private moveX = 0;
  private moveY = 0;
  private aimX = 0;
  private aimY = 0;

  constructor(readonly deadZone = DEFAULT_TOUCH_DEAD_ZONE) {}

  /** Increments whenever the player deflects a stick or presses a button. */
  get activityCounter(): number {
    return this.activity;
  }

  /** True while any control is being touched — for showing/hiding UI chrome. */
  get engaged(): boolean {
    return (
      this.buttonsDown.size > 0 ||
      this.rawMoveX !== 0 ||
      this.rawMoveY !== 0 ||
      this.rawAimX !== 0 ||
      this.rawAimY !== 0
    );
  }

  /** Called by the move-stick widget with its knob offset, in [-1, 1] per axis. */
  setMoveStick(x: number, y: number): void {
    this.rawMoveX = x;
    this.rawMoveY = y;
  }

  /** Called by the aim-stick widget with its knob offset, in [-1, 1] per axis. */
  setAimStick(x: number, y: number): void {
    this.rawAimX = x;
    this.rawAimY = y;
  }

  setButtonDown(button: TouchButton, down: boolean): void {
    if (down) {
      if (!this.buttonsDown.has(button)) {
        this.activity += 1;
      }
      this.buttonsDown.add(button);
    } else {
      this.buttonsDown.delete(button);
    }
  }

  isButtonDown(button: TouchButton): boolean {
    return this.buttonsDown.has(button);
  }

  /**
   * Releases everything.
   *
   * Called on blur/visibility change: a finger lifted while the tab is
   * backgrounded never sends its pointerup, and the player comes back to a
   * character walking into a wall — the same failure mode `KeyboardSource`'s
   * own `clear` exists for.
   */
  clear(): void {
    this.rawMoveX = 0;
    this.rawMoveY = 0;
    this.rawAimX = 0;
    this.rawAimY = 0;
    this.buttonsDown.clear();
  }

  /**
   * Re-derives dead-zoned stick output and activity from whatever the widgets
   * last reported. Call once per simulation tick, before reading the sticks.
   */
  update(): void {
    const move = applyRadialDeadZone(this.rawMoveX, this.rawMoveY, this.deadZone);
    this.moveX = move.x;
    this.moveY = move.y;

    const aim = applyRadialDeadZone(this.rawAimX, this.rawAimY, this.deadZone);
    this.aimX = aim.x;
    this.aimY = aim.y;

    if (
      Math.abs(this.moveX) > ACTIVITY_THRESHOLD ||
      Math.abs(this.moveY) > ACTIVITY_THRESHOLD ||
      Math.abs(this.aimX) > ACTIVITY_THRESHOLD ||
      Math.abs(this.aimY) > ACTIVITY_THRESHOLD
    ) {
      this.activity += 1;
    }
  }

  get lastMoveX(): number {
    return this.moveX;
  }

  get lastMoveY(): number {
    return this.moveY;
  }

  get lastAimX(): number {
    return this.aimX;
  }

  get lastAimY(): number {
    return this.aimY;
  }
}
