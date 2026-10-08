/** How long a direction has to be held before it starts repeating. */
export const REPEAT_DELAY_MS = 380;
/** The gap between repeats when they first start. */
export const REPEAT_START_INTERVAL_MS = 140;
/** The fastest the repeats ever get. */
export const REPEAT_MIN_INTERVAL_MS = 35;
/** How long, after the delay, the interval takes to close from start to min. */
export const REPEAT_RAMP_MS = 1400;

/**
 * Auto-repeat with acceleration for a held left/right (#460).
 *
 * A slider moves in 5% steps — the resolution is deliberate, a volume is
 * judged by ear in small increments — but one step per key press made
 * 0 to 100 twenty presses, and the OS's own key repeat is slow and does not
 * exist at all for a gamepad d-pad or stick. So the step stays 5% and the
 * *rate* accelerates instead: a press steps once, a hold longer than
 * `REPEAT_DELAY_MS` starts repeating, and the gap between repeats closes from
 * `REPEAT_START_INTERVAL_MS` to `REPEAT_MIN_INTERVAL_MS` over
 * `REPEAT_RAMP_MS`. Holding from 0 reaches 100% in about two seconds, and
 * letting go at any 5% stops dead.
 *
 * Fed with a level (is a direction held) rather than edges, so one instance
 * serves the keyboard and the pad together: whoever holds a direction drives
 * it. Pure — time comes in as `deltaMs`, nothing here reads a clock.
 */
export class HoldRepeater {
  private direction: -1 | 0 | 1 = 0;
  private heldMs = 0;
  /** Time into the hold at which the next repeat is due. */
  private nextAtMs = 0;

  /**
   * Advances by `deltaMs` with `direction` held (`0` for none) and returns
   * how many steps to take this frame, signed by direction — `0` most frames.
   * `repeat` false makes it a plain edge: one step on press, nothing after.
   */
  update(deltaMs: number, direction: -1 | 0 | 1, repeat: boolean): number {
    if (direction === 0) {
      this.direction = 0;
      this.heldMs = 0;
      return 0;
    }
    if (direction !== this.direction) {
      this.direction = direction;
      this.heldMs = 0;
      this.nextAtMs = REPEAT_DELAY_MS;
      return direction;
    }
    if (!repeat) {
      return 0;
    }
    this.heldMs += Math.max(0, deltaMs);
    let steps = 0;
    while (this.heldMs >= this.nextAtMs) {
      steps += 1;
      this.nextAtMs += repeatInterval(this.nextAtMs - REPEAT_DELAY_MS);
    }
    return steps * direction;
  }

  reset(): void {
    this.direction = 0;
    this.heldMs = 0;
  }
}

/** The gap before the next repeat, `intoRampMs` after repeating began. */
export function repeatInterval(intoRampMs: number): number {
  const progress = Math.min(1, Math.max(0, intoRampMs / REPEAT_RAMP_MS));
  return REPEAT_START_INTERVAL_MS + (REPEAT_MIN_INTERVAL_MS - REPEAT_START_INTERVAL_MS) * progress;
}
