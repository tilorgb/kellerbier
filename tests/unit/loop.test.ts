import { describe, expect, it } from 'vitest';
import { FixedTimestepLoop } from '../../src/app/loop.js';
import { MAX_STEPS_PER_FRAME, TICKS_PER_SECOND } from '../../src/sim/time.js';

interface Recording {
  readonly loop: FixedTimestepLoop;
  readonly steps: number[];
  readonly alphas: number[];
}

function makeLoop(options: { maxStepsPerFrame?: number } = {}): Recording {
  const steps: number[] = [];
  const alphas: number[] = [];
  const loop = new FixedTimestepLoop({
    step: (tick) => {
      steps.push(tick);
    },
    render: (alpha) => {
      alphas.push(alpha);
    },
    ...options,
  });
  return { loop, steps, alphas };
}

/** Drives `loop` for `seconds` of wall clock at a constant display refresh rate. */
function runAtRefreshRate(loop: FixedTimestepLoop, hz: number, seconds: number): void {
  const frames = Math.round(hz * seconds);
  for (let frame = 0; frame <= frames; frame++) {
    loop.advance((frame * 1000) / hz);
  }
}

describe('FixedTimestepLoop', () => {
  it('runs no steps on the first frame, which only establishes the clock origin', () => {
    const { loop, steps, alphas } = makeLoop();
    expect(loop.advance(1234.5)).toBe(0);
    expect(steps).toEqual([]);
    expect(alphas).toEqual([0]);
  });

  it('advances exactly 60 ticks per wall-clock second over 60 seconds', () => {
    for (const hz of [30, 60, 75, 120, 144, 240]) {
      const { loop } = makeLoop();
      runAtRefreshRate(loop, hz, 60);
      expect(loop.tick, `at ${String(hz)} Hz`).toBe(TICKS_PER_SECOND * 60);
    }
  });

  it('holds 60 ticks per second under a jittery frame clock', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    // Deterministic pseudo-jitter between roughly 4 ms and 20 ms per frame.
    let now = 0;
    let noise = 12345;
    while (now < 60_000) {
      noise = (noise * 1103515245 + 12345) & 0x7fffffff;
      now = Math.min(60_000, now + 4 + (noise % 1600) / 100);
      loop.advance(now);
    }
    // A stall clamp never trips at these frame times, so no ticks are dropped.
    expect(loop.tick).toBe(TICKS_PER_SECOND * 60);
  });

  it('steps in order and never skips a tick index', () => {
    const { loop, steps } = makeLoop();
    runAtRefreshRate(loop, 144, 1);
    expect(steps).toEqual(Array.from({ length: TICKS_PER_SECOND }, (_, index) => index));
  });

  it('renders once per frame with an alpha in [0, 1)', () => {
    const { loop, alphas } = makeLoop();
    runAtRefreshRate(loop, 144, 2);
    expect(alphas).toHaveLength(289);
    for (const alpha of alphas) {
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('produces sub-tick alpha motion on a display faster than the tick rate', () => {
    const { loop, alphas } = makeLoop();
    // 240 Hz against a 60 Hz simulation: three of every four frames must
    // interpolate, or motion judders on high-refresh displays.
    runAtRefreshRate(loop, 240, 1);
    const interpolated = alphas.filter((alpha) => alpha > 0).length;
    expect(interpolated).toBeGreaterThan(alphas.length * 0.7);
  });

  it('clamps a 500 ms stall instead of running away catching up', () => {
    const { loop, steps } = makeLoop();
    loop.advance(0);
    const stalled = loop.advance(500);

    expect(stalled).toBe(MAX_STEPS_PER_FRAME);
    expect(steps).toHaveLength(MAX_STEPS_PER_FRAME);
    // The backlog is discarded rather than deferred, so the frame after a stall
    // starts from a clean sub-tick position instead of a debt.
    expect(loop.alpha).toBeGreaterThanOrEqual(0);
    expect(loop.alpha).toBeLessThan(1);
  });

  it('accounts for every tick the clamp discards', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    expect(loop.clampedFrames).toBe(0);
    expect(loop.droppedTicks).toBe(0);

    // 500 ms is 30 ticks of work; the clamp runs 5 and discards the other 25.
    loop.advance(500);
    expect(loop.clampedFrames).toBe(1);
    expect(loop.droppedTicks).toBe(25);

    // A wall-clock shortfall is exactly the dropped-tick count, which is what
    // makes a long measurement explainable instead of mysterious.
    // Note the formula: dividing by a nominal tick duration gives 29 here,
    // because 500 / (1000/60) lands at 29.999999999999996 in binary floating
    // point. Multiplying first is exact. This is the whole reason the loop
    // derives its tick target the way it does.
    const expectedTicks = Math.floor((500 * TICKS_PER_SECOND) / 1000);
    expect(loop.tick + loop.droppedTicks).toBe(expectedTicks);
  });

  it('counts no clamped frames when the machine keeps up', () => {
    const { loop } = makeLoop();
    runAtRefreshRate(loop, 144, 10);
    expect(loop.clampedFrames).toBe(0);
    expect(loop.droppedTicks).toBe(0);
    expect(loop.tick).toBe(TICKS_PER_SECOND * 10);
  });

  it('clears the clamp accounting on reset', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    loop.advance(500);
    expect(loop.droppedTicks).toBeGreaterThan(0);
    loop.reset();
    expect(loop.clampedFrames).toBe(0);
    expect(loop.droppedTicks).toBe(0);
  });

  it('recovers to real time after a stall rather than accumulating a debt', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    loop.advance(500);
    const afterStall = loop.tick;
    for (let frame = 1; frame <= 60; frame++) {
      loop.advance(500 + frame * (1000 / 60));
    }
    expect(loop.tick).toBe(afterStall + 60);
  });

  it('single-steps exactly one tick per call, even while paused', () => {
    const { loop, steps } = makeLoop();
    loop.advance(0);
    loop.paused = true;
    loop.advance(1000);
    expect(steps).toEqual([]);

    loop.stepOnce();
    loop.stepOnce();
    loop.stepOnce();
    expect(steps).toEqual([0, 1, 2]);
    expect(loop.tick).toBe(3);
    expect(loop.alpha).toBe(0);
  });

  it('renders while paused but runs no simulation', () => {
    const { loop, steps, alphas } = makeLoop();
    loop.advance(0);
    loop.paused = true;
    loop.advance(16);
    loop.advance(32);
    expect(steps).toEqual([]);
    expect(alphas).toHaveLength(3);
  });

  it('resumes from the pause point without simulating the paused interval', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    loop.paused = true;
    loop.advance(10_000);
    loop.paused = false;
    for (let frame = 1; frame <= 60; frame++) {
      loop.advance(10_000 + frame * (1000 / 60));
    }
    expect(loop.tick).toBe(TICKS_PER_SECOND);
  });

  it('scales simulation rate by timeScale', () => {
    const half = makeLoop();
    half.loop.timeScale = 0.5;
    runAtRefreshRate(half.loop, 60, 1);
    expect(half.loop.tick).toBe(30);

    const double = makeLoop({ maxStepsPerFrame: 16 });
    double.loop.timeScale = 2;
    runAtRefreshRate(double.loop, 60, 1);
    expect(double.loop.tick).toBe(120);
  });

  it('ignores a clock that jumps backwards', () => {
    const { loop, steps } = makeLoop();
    loop.advance(1000);
    loop.advance(500);
    expect(steps).toEqual([]);
    expect(loop.tick).toBe(0);
  });

  it('resyncs without simulating a backgrounded gap', () => {
    const { loop } = makeLoop();
    loop.advance(0);
    loop.resync(60_000);
    for (let frame = 1; frame <= 60; frame++) {
      loop.advance(60_000 + frame * (1000 / 60));
    }
    expect(loop.tick).toBe(TICKS_PER_SECOND);
  });

  it('rejects a non-finite clock reading', () => {
    const { loop } = makeLoop();
    expect(() => loop.advance(Number.NaN)).toThrow(/non-finite/);
  });

  it('returns to tick zero on reset', () => {
    const { loop } = makeLoop();
    runAtRefreshRate(loop, 60, 1);
    expect(loop.tick).toBe(TICKS_PER_SECOND);
    loop.reset();
    expect(loop.tick).toBe(0);
    expect(loop.alpha).toBe(0);
  });

  describe('fastForward (#45)', () => {
    it('advances the tick counter without calling stepFn', () => {
      const { loop, steps } = makeLoop();
      loop.fastForward(500);
      expect(loop.tick).toBe(500);
      expect(steps).toEqual([]);
    });

    it('leaves alpha in range so the very next advance steps cleanly from the new tick', () => {
      const { loop, steps } = makeLoop();
      loop.fastForward(120);
      loop.advance(0); // establishes the clock origin, same as the very first real frame
      loop.advance(1000 / 60);
      expect(steps).toEqual([120]);
      expect(loop.tick).toBe(121);
    });

    it('rejects a negative or non-integer tick count', () => {
      const { loop } = makeLoop();
      expect(() => {
        loop.fastForward(-1);
      }).toThrow(/non-negative integer/);
      expect(() => {
        loop.fastForward(1.5);
      }).toThrow(/non-negative integer/);
    });
  });
});
