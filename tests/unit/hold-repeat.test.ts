import { describe, expect, it } from 'vitest';
import {
  HoldRepeater,
  REPEAT_DELAY_MS,
  REPEAT_MIN_INTERVAL_MS,
  REPEAT_RAMP_MS,
  REPEAT_START_INTERVAL_MS,
  repeatInterval,
} from '../../src/app/input/hold-repeat.js';
import { sliderValueAt } from '../../src/render/ui/settings-model.js';

const FRAME_MS = 1000 / 60;

/** Holds `direction` for `ms` and returns the total steps taken, press included. */
function hold(repeater: HoldRepeater, direction: -1 | 1, ms: number, repeat = true): number {
  let total = repeater.update(0, direction, repeat);
  for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS) {
    total += repeater.update(FRAME_MS, direction, repeat);
  }
  return total;
}

describe('HoldRepeater (#460)', () => {
  it('steps once on press and not again before the delay', () => {
    const repeater = new HoldRepeater();
    expect(repeater.update(0, 1, true)).toBe(1);
    expect(hold(new HoldRepeater(), 1, REPEAT_DELAY_MS - 40)).toBe(1);
  });

  it('signs steps by direction', () => {
    expect(hold(new HoldRepeater(), -1, 1000)).toBeLessThan(0);
    expect(hold(new HoldRepeater(), 1, 1000)).toBeGreaterThan(0);
  });

  it('accelerates: the gap between repeats closes from start to min', () => {
    expect(repeatInterval(0)).toBe(REPEAT_START_INTERVAL_MS);
    expect(repeatInterval(REPEAT_RAMP_MS)).toBe(REPEAT_MIN_INTERVAL_MS);
    expect(repeatInterval(REPEAT_RAMP_MS * 10)).toBe(REPEAT_MIN_INTERVAL_MS);
    expect(repeatInterval(REPEAT_RAMP_MS / 2)).toBeLessThan(REPEAT_START_INTERVAL_MS);
  });

  it('crosses a whole 0-100% slider (20 steps of 5%) in about two seconds of holding', () => {
    const repeater = new HoldRepeater();
    const steps = hold(repeater, 1, 2200);
    expect(steps).toBeGreaterThanOrEqual(20);
    // ...but not instantly: a short hold stays a fine adjustment.
    expect(hold(new HoldRepeater(), 1, 700)).toBeLessThan(8);
  });

  it('releasing stops dead and the next press steps once more', () => {
    const repeater = new HoldRepeater();
    hold(repeater, 1, 1500);
    expect(repeater.update(FRAME_MS, 0, true)).toBe(0);
    expect(repeater.update(FRAME_MS, 0, true)).toBe(0);
    expect(repeater.update(0, 1, true)).toBe(1);
  });

  it('reversing direction counts as a fresh press', () => {
    const repeater = new HoldRepeater();
    hold(repeater, 1, 1500);
    expect(repeater.update(FRAME_MS, -1, true)).toBe(-1);
  });

  it('does not repeat at all when repeat is off', () => {
    expect(hold(new HoldRepeater(), 1, 3000, false)).toBe(1);
  });

  it('can owe several steps to one long frame without losing any', () => {
    const repeater = new HoldRepeater();
    repeater.update(0, 1, true);
    expect(
      repeater.update(REPEAT_DELAY_MS + 3 * REPEAT_START_INTERVAL_MS, 1, true),
    ).toBeGreaterThan(1);
  });
});

describe('sliderValueAt (#460)', () => {
  const volume = { min: 0, max: 1, step: 0.05 };

  it('maps the ends and the middle of the track', () => {
    expect(sliderValueAt(volume, 0)).toBe(0);
    expect(sliderValueAt(volume, 1)).toBe(1);
    expect(sliderValueAt(volume, 0.5)).toBeCloseTo(0.5);
  });

  it('snaps to the 5% grid, so a click lands where the keys would', () => {
    expect(sliderValueAt(volume, 0.37)).toBeCloseTo(0.35);
    expect(sliderValueAt(volume, 0.38)).toBeCloseTo(0.4);
  });

  it('clamps a pointer past either end of the track', () => {
    expect(sliderValueAt(volume, -0.4)).toBe(0);
    expect(sliderValueAt(volume, 3)).toBe(1);
  });

  it('can turn a value down as well as up', () => {
    // The old click always stepped up; a pointer near the left end must lower it.
    expect(sliderValueAt(volume, 0.1)).toBeLessThan(sliderValueAt(volume, 0.9));
  });
});
