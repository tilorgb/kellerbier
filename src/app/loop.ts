import { MAX_STEPS_PER_FRAME, TICKS_PER_SECOND } from '../sim/time.js';

export interface FixedTimestepLoopOptions {
  /** Advances the simulation exactly one tick. Receives the tick index being run. */
  readonly step: (tick: number) => void;
  /**
   * Draws a frame. `alpha` is the fraction of a tick elapsed since the last step,
   * in [0, 1) — interpolate between the previous and current simulation state by
   * this much and motion stays smooth on displays faster than 60 Hz.
   */
  readonly render: (alpha: number) => void;
  readonly ticksPerSecond?: number;
  readonly maxStepsPerFrame?: number;
}

/**
 * Fixed-timestep accumulator loop.
 *
 * The simulation advances at a fixed rate; rendering happens as often as the
 * display allows, interpolating between the two most recent simulation states.
 *
 * The loop takes the current time as an argument rather than reading a clock, so
 * it can be driven by `requestAnimationFrame` in the browser and by a synthetic
 * clock in tests. Nothing here reads wall time on its own.
 */
export class FixedTimestepLoop {
  private readonly stepFn: (tick: number) => void;
  private readonly renderFn: (alpha: number) => void;
  private readonly ticksPerSecond: number;
  private readonly maxStepsPerFrame: number;

  /**
   * Scaled simulation time in milliseconds. The tick index is derived from this
   * by a single division, so rounding error does not accumulate per tick the way
   * it does when a nominal tick duration is subtracted 3,600 times a minute.
   */
  private simTimeMs = 0;
  private lastNowMs: number | null = null;
  private currentTick = 0;
  private clampedFrameCount = 0;
  private droppedTickCount = 0;

  /** When paused, `advance` still renders but runs no steps. */
  paused = false;

  /** Debug time scale. 1 is real time, 0.25 is quarter speed, 2 is double speed. */
  timeScale = 1;

  constructor(options: FixedTimestepLoopOptions) {
    this.stepFn = options.step;
    this.renderFn = options.render;
    this.ticksPerSecond = options.ticksPerSecond ?? TICKS_PER_SECOND;
    this.maxStepsPerFrame = options.maxStepsPerFrame ?? MAX_STEPS_PER_FRAME;
  }

  /** Number of simulation ticks run since construction or the last `reset`. */
  get tick(): number {
    return this.currentTick;
  }

  /**
   * Frames whose backlog hit the clamp. Non-zero means the machine could not
   * keep up on that frame and the game ran briefly in slow motion.
   */
  get clampedFrames(): number {
    return this.clampedFrameCount;
  }

  /**
   * Simulation ticks discarded by the clamp since construction or the last
   * reset.
   *
   * This is the honest accounting for why a long measurement can come up a few
   * ticks short of `seconds * 60`: a single 130 ms hitch costs about three
   * ticks. It is wall-clock slippage, not drift, and it does not affect
   * determinism — a replay replays ticks, not seconds, so the tick sequence is
   * identical either way.
   */
  get droppedTicks(): number {
    return this.droppedTickCount;
  }

  /** Fraction of a tick elapsed since the last step, in [0, 1). */
  get alpha(): number {
    return this.tickTarget() - this.currentTick;
  }

  /**
   * Runs the simulation up to `nowMs` and then renders once.
   *
   * Returns the number of steps taken, which the debug overlay reports and the
   * spiral-of-death test asserts on.
   */
  advance(nowMs: number): number {
    if (!Number.isFinite(nowMs)) {
      throw new Error(`FixedTimestepLoop.advance called with a non-finite time: ${String(nowMs)}`);
    }

    // First frame: establish the origin, draw the initial state, run nothing.
    if (this.lastNowMs === null) {
      this.lastNowMs = nowMs;
      this.renderFn(0);
      return 0;
    }

    // A clock that jumps backwards (a tab restored from bfcache, a manual system
    // clock change) contributes nothing rather than a negative step count.
    const elapsedMs = Math.max(0, nowMs - this.lastNowMs);
    this.lastNowMs = nowMs;

    let steps = 0;
    if (!this.paused) {
      this.simTimeMs += elapsedMs * this.timeScale;

      const target = Math.floor(this.tickTarget());
      while (this.currentTick < target && steps < this.maxStepsPerFrame) {
        this.stepFn(this.currentTick);
        this.currentTick += 1;
        steps += 1;
      }

      // Backlog past the clamp is discarded, not deferred: the game runs slow
      // instead of spiralling. Dropping the leftover fraction too keeps alpha
      // in range on the frame after a stall.
      if (this.currentTick < target) {
        this.clampedFrameCount += 1;
        this.droppedTickCount += target - this.currentTick;
        this.simTimeMs = (this.currentTick * 1000) / this.ticksPerSecond;
      }
    }

    this.renderFn(this.alpha);
    return steps;
  }

  /**
   * Advances exactly one tick, ignoring the clock and the pause flag, then
   * renders. This is the debug single-step.
   */
  stepOnce(): void {
    this.stepFn(this.currentTick);
    this.currentTick += 1;
    this.simTimeMs = (this.currentTick * 1000) / this.ticksPerSecond;
    this.renderFn(0);
  }

  /** Returns the loop to tick 0 and forgets the clock origin. */
  reset(): void {
    this.simTimeMs = 0;
    this.lastNowMs = null;
    this.currentTick = 0;
    this.clampedFrameCount = 0;
    this.droppedTickCount = 0;
  }

  /**
   * Reattaches to the clock without running the gap as simulation time. Call
   * this when the tab regains focus after being throttled or backgrounded.
   */
  resync(nowMs: number): void {
    this.lastNowMs = nowMs;
  }

  /** Fractional tick position implied by the accumulated simulation time. */
  private tickTarget(): number {
    return (this.simTimeMs * this.ticksPerSecond) / 1000;
  }
}

/**
 * Drives a loop from `requestAnimationFrame`. Returns a teardown function.
 *
 * A backgrounded tab stops receiving animation frames; on return the loop is
 * resynced rather than asked to simulate the minutes that passed.
 */
export function runAnimationFrameLoop(loop: FixedTimestepLoop): () => void {
  let handle = 0;
  let running = true;

  const frame = (nowMs: number): void => {
    if (!running) {
      return;
    }
    loop.advance(nowMs);
    handle = requestAnimationFrame(frame);
  };

  const onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible') {
      loop.resync(performance.now());
    }
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  handle = requestAnimationFrame(frame);

  return () => {
    running = false;
    cancelAnimationFrame(handle);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
