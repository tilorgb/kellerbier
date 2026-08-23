import { describe, expect, it } from 'vitest';
import {
  ALL_INPUT_ACTIONS,
  AXIS_RESOLUTION,
  InputAction,
  axisToUnit,
  clearInputFrame,
  copyInputFrame,
  createInputFrame,
  inputFramesEqual,
  isActionDown,
  isActionPressed,
  isActionReleased,
  quantiseAxis,
  setActionDown,
} from '../../src/sim/input/frame.js';

describe('axis quantisation', () => {
  it('maps the full stick range onto signed bytes', () => {
    expect(quantiseAxis(0)).toBe(0);
    expect(quantiseAxis(1)).toBe(AXIS_RESOLUTION);
    expect(quantiseAxis(-1)).toBe(-AXIS_RESOLUTION);
    expect(quantiseAxis(0.5)).toBe(64);
    expect(quantiseAxis(-0.5)).toBe(-64);
  });

  it('clamps past the ends of the range rather than overflowing the byte', () => {
    // Some drivers report slightly outside [-1, 1] at the extremes.
    expect(quantiseAxis(1.4)).toBe(AXIS_RESOLUTION);
    expect(quantiseAxis(-3)).toBe(-AXIS_RESOLUTION);
    expect(quantiseAxis(Number.POSITIVE_INFINITY)).toBe(AXIS_RESOLUTION);
  });

  it('treats a missing reading as centred', () => {
    expect(quantiseAxis(Number.NaN)).toBe(0);
  });

  it('always produces an integer inside the byte range', () => {
    for (let step = -200; step <= 200; step++) {
      const value = quantiseAxis(step / 100);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-127);
      expect(value).toBeLessThanOrEqual(127);
    }
  });

  it('collapses a range of floats onto each integer', () => {
    // The point of quantising: machines reporting fractionally different stick
    // values for the same physical position hand the simulation one value.
    expect(quantiseAxis(0.5)).toBe(quantiseAxis(0.50001));
    expect(quantiseAxis(0.123456789)).toBe(quantiseAxis(0.1234));

    // Note what this does *not* claim. Two floats either side of a rounding
    // boundary still land on different integers: 0.5 and 0.4996 straddle 63.5
    // and give 64 and 63. Reproducibility does not come from nearby floats
    // always agreeing; it comes from the recording storing the integer the
    // simulation actually consumed.
    expect(quantiseAxis(0.5)).toBe(64);
    expect(quantiseAxis(0.4996)).toBe(63);
  });

  it('reads the same magnitude in both directions', () => {
    for (let step = 1; step <= 100; step++) {
      const unit = step / 100;
      expect(quantiseAxis(-unit), `at ${String(unit)}`).toBe(-quantiseAxis(unit));
    }
  });

  it('normalises negative zero to zero', () => {
    // A stick centred from the left reports -0. Left in a frame it would
    // compare unequal to 0 under Object.is, so a replay diff would report a
    // difference nobody can see.
    expect(Object.is(quantiseAxis(-0), 0)).toBe(true);
    expect(Object.is(quantiseAxis(-0.001), 0)).toBe(true);
  });

  it('round-trips back to a float within one step', () => {
    for (let step = -100; step <= 100; step += 7) {
      const unit = step / 100;
      expect(Math.abs(axisToUnit(quantiseAxis(unit)) - unit)).toBeLessThan(1 / AXIS_RESOLUTION);
    }
  });
});

describe('input frame', () => {
  it('starts empty', () => {
    const frame = createInputFrame();
    expect(frame).toEqual({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, buttons: 0, analogAim: false });
  });

  it('sets and clears each action independently', () => {
    const frame = createInputFrame();
    for (const action of ALL_INPUT_ACTIONS) {
      setActionDown(frame, action, true);
      expect(isActionDown(frame, action)).toBe(true);
    }
    for (const action of ALL_INPUT_ACTIONS) {
      setActionDown(frame, action, false);
      expect(isActionDown(frame, action)).toBe(false);
    }
    expect(frame.buttons).toBe(0);
  });

  it('gives every action its own bit', () => {
    const bits = new Set(ALL_INPUT_ACTIONS.map((action) => 1 << action));
    expect(bits.size).toBe(ALL_INPUT_ACTIONS.length);
  });

  it('detects press and release edges against the previous frame', () => {
    const previous = createInputFrame();
    const current = createInputFrame();

    setActionDown(current, InputAction.Fire, true);
    expect(isActionPressed(current, previous, InputAction.Fire)).toBe(true);
    expect(isActionReleased(current, previous, InputAction.Fire)).toBe(false);

    copyInputFrame(current, previous);
    expect(isActionPressed(current, previous, InputAction.Fire)).toBe(false);

    setActionDown(current, InputAction.Fire, false);
    expect(isActionReleased(current, previous, InputAction.Fire)).toBe(true);
  });

  it('copies and compares frames by value', () => {
    const source = createInputFrame();
    source.moveX = 10;
    source.aimY = -20;
    setActionDown(source, InputAction.Bomb, true);

    const target = createInputFrame();
    expect(inputFramesEqual(source, target)).toBe(false);
    copyInputFrame(source, target);
    expect(inputFramesEqual(source, target)).toBe(true);

    clearInputFrame(target);
    expect(inputFramesEqual(source, target)).toBe(false);
  });
});
