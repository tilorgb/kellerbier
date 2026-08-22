/**
 * Gamepad state.
 *
 * The Gamepad API is polled rather than evented — there is no "button pressed"
 * event — which suits a fixed-timestep loop exactly: sample once per tick, with
 * no queue to drain and no events arriving between ticks.
 *
 * Two details that surprise people:
 *
 * - It needs a **secure context**. HTTPS or localhost, or `getGamepads` returns
 *   nothing and no error explains why.
 * - A connected controller stays **invisible until a button is pressed on it**,
 *   as a fingerprinting defence. Any "no controller detected" UI has to ask for
 *   that press rather than reporting an absence.
 */

/** The subset of `Gamepad` this code uses, so tests can supply their own. */
export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly connected: boolean;
  readonly mapping: string;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export type GamepadPoller = () => readonly (GamepadLike | null)[];

/** Standard-mapping axis indices. */
export const GamepadAxis = {
  LeftStickX: 0,
  LeftStickY: 1,
  RightStickX: 2,
  RightStickY: 3,
} as const;

/**
 * Radial dead zone, not per-axis.
 *
 * A per-axis dead zone leaves a square hole at the centre, so a stick pushed
 * gently along a diagonal registers while the same push along an axis does not.
 * Players feel that as the stick "sticking" to the diagonals.
 */
export const DEFAULT_DEAD_ZONE = 0.22;

/** Below this, a stick is not considered deliberate activity. */
const ACTIVITY_THRESHOLD = 0.5;

/** Triggers are analog; this is where one counts as pressed. */
const TRIGGER_THRESHOLD = 0.35;

export class GamepadSource {
  private readonly poll: GamepadPoller;
  private active: GamepadLike | null = null;
  private activity = 0;

  /** Scratch output for the last dead-zoned stick read. */
  private stickX = 0;
  private stickY = 0;

  constructor(
    poll?: GamepadPoller,
    readonly deadZone = DEFAULT_DEAD_ZONE,
  ) {
    this.poll = poll ?? (() => (typeof navigator === 'undefined' ? [] : navigator.getGamepads()));
  }

  /** Increments whenever the player moves a stick or presses a button. */
  get activityCounter(): number {
    return this.activity;
  }

  /** True when a controller is connected and has announced itself. */
  get connected(): boolean {
    return this.active !== null;
  }

  /** The connected controller's id, for on-screen glyph selection. */
  get id(): string | null {
    return this.active?.id ?? null;
  }

  /**
   * True when the connected pad reports the standard mapping.
   *
   * Non-standard pads still work through rebinding, but the default button
   * layout assumes standard positions and will be wrong for them.
   */
  get isStandardMapping(): boolean {
    return this.active?.mapping === 'standard';
  }

  /**
   * Re-reads the pad list. Call once per tick, before sampling.
   *
   * Picks the lowest-numbered connected pad, and drops the active one the
   * moment it disappears — an unplugged controller mid-run has to be a fallback
   * to keyboard, not a crash.
   */
  update(): void {
    const pads = this.poll();
    let chosen: GamepadLike | null = null;
    for (const pad of pads) {
      if (pad?.connected === true) {
        chosen = pad;
        break;
      }
    }
    this.active = chosen;

    if (chosen === null) {
      return;
    }

    for (const button of chosen.buttons) {
      if (button.pressed) {
        this.activity += 1;
        return;
      }
    }
    if (
      Math.abs(this.axis(GamepadAxis.LeftStickX)) > ACTIVITY_THRESHOLD ||
      Math.abs(this.axis(GamepadAxis.LeftStickY)) > ACTIVITY_THRESHOLD ||
      Math.abs(this.axis(GamepadAxis.RightStickX)) > ACTIVITY_THRESHOLD ||
      Math.abs(this.axis(GamepadAxis.RightStickY)) > ACTIVITY_THRESHOLD
    ) {
      this.activity += 1;
    }
  }

  /** Raw axis value, before the dead zone. */
  axis(index: number): number {
    return this.active?.axes[index] ?? 0;
  }

  isButtonDown(index: number): boolean {
    const button = this.active?.buttons[index];
    if (button === undefined) {
      return false;
    }
    // Triggers report analog values and only sometimes set `pressed`.
    return button.pressed || button.value > TRIGGER_THRESHOLD;
  }

  /**
   * Reads a stick with the radial dead zone applied, into `stickX`/`stickY`.
   *
   * Output is rescaled so it starts at zero at the dead-zone edge rather than
   * jumping straight to the dead-zone magnitude, which is what makes small
   * movements possible instead of the stick feeling like a switch.
   */
  readStick(xAxis: number, yAxis: number): void {
    const rawX = this.axis(xAxis);
    const rawY = this.axis(yAxis);
    const magnitude = Math.hypot(rawX, rawY);

    if (magnitude <= this.deadZone || magnitude === 0) {
      this.stickX = 0;
      this.stickY = 0;
      return;
    }

    const rescaled = Math.min((magnitude - this.deadZone) / (1 - this.deadZone), 1);
    this.stickX = (rawX / magnitude) * rescaled;
    this.stickY = (rawY / magnitude) * rescaled;
  }

  get lastStickX(): number {
    return this.stickX;
  }

  get lastStickY(): number {
    return this.stickY;
  }

  /**
   * Wires hot-plug events. Returns a teardown function.
   *
   * The events are only a prompt to re-poll — `update` is what actually decides
   * which pad is active, so a missed event costs one tick rather than a stuck
   * controller.
   */
  attach(target: Window): () => void {
    const onChange = (): void => {
      this.update();
    };
    target.addEventListener('gamepadconnected', onChange);
    target.addEventListener('gamepaddisconnected', onChange);
    return () => {
      target.removeEventListener('gamepadconnected', onChange);
      target.removeEventListener('gamepaddisconnected', onChange);
    };
  }
}
