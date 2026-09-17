/** How long the skip button has to be held before a story card goes. */
export const HOLD_TO_SKIP_MS = 900;

/**
 * Hold-to-skip for a one-time story card: the card only goes once the skip
 * button has been held for `HOLD_TO_SKIP_MS`, and a hold only counts if it
 * started *after* the card came up.
 *
 * "Any key skips it" was the first version, and a card that appears mid-play
 * — chapter two's, on the way out of a cleared boss room — was gone before
 * anyone saw it: the player was still firing and moving when it came up, so
 * the very next input dismissed it. Requiring the button to be seen released
 * once (`armed`) is what keeps a held fire button from carrying over.
 */
export class HoldToSkip {
  private armed = false;
  private heldMs = 0;

  /** Call when the card goes up. */
  reset(): void {
    this.armed = false;
    this.heldMs = 0;
  }

  /**
   * Advances by `deltaMs` with the skip button `held` or not, and returns the
   * hold's progress, `0`–`1`. `1` means skip now.
   */
  update(deltaMs: number, held: boolean): number {
    if (!this.armed) {
      if (!held) {
        this.armed = true;
      }
      return 0;
    }
    this.heldMs = held ? this.heldMs + Math.max(0, deltaMs) : 0;
    return Math.min(1, this.heldMs / HOLD_TO_SKIP_MS);
  }
}
