import { describe, expect, it } from 'vitest';
import { HOLD_TO_SKIP_MS, HoldToSkip } from '../../src/app/input/hold-to-skip.js';

describe('HoldToSkip', () => {
  it('skips only once the button has been held for the full duration', () => {
    const hold = new HoldToSkip();
    expect(hold.update(16, false)).toBe(0);
    expect(hold.update(HOLD_TO_SKIP_MS / 2, true)).toBeCloseTo(0.5);
    expect(hold.update(HOLD_TO_SKIP_MS / 2, true)).toBe(1);
  });

  it('starts over when the button is let go early', () => {
    const hold = new HoldToSkip();
    hold.update(16, false);
    hold.update(HOLD_TO_SKIP_MS * 0.8, true);
    expect(hold.update(16, false)).toBe(0);
    expect(hold.update(HOLD_TO_SKIP_MS * 0.8, true)).toBeLessThan(1);
  });

  it('ignores a button already held when the card came up, until it is released', () => {
    const hold = new HoldToSkip();
    hold.reset();
    // Still holding fire from the fight: however long, it never counts.
    expect(hold.update(HOLD_TO_SKIP_MS * 3, true)).toBe(0);
    expect(hold.update(16, false)).toBe(0);
    expect(hold.update(HOLD_TO_SKIP_MS, true)).toBe(1);
  });
});
