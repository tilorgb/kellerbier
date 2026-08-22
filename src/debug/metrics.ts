/**
 * Frame timings, kept in a ring.
 *
 * The frame graph is the reason this exists: a number that only shows the last
 * frame tells you nothing, because the frames that matter are the occasional
 * bad ones. A history of the last few seconds makes a stall visible as a spike
 * rather than as a number that briefly looked wrong while nobody was watching.
 *
 * Fixed-size typed arrays, written by index. Collecting metrics must not itself
 * be the thing that allocates during the frame loop.
 */

/** Frames of history. At 60 fps this is about three seconds. */
export const FRAME_HISTORY = 180;

/** The full-frame budget from docs/TECH_STACK.md §3, in milliseconds. */
export const FRAME_BUDGET_MS = 12;

/** The simulation's share of it. */
export const SIM_BUDGET_MS = 4;

export class FrameMetrics {
  readonly capacity: number;

  readonly simMs: Float32Array;
  readonly renderMs: Float32Array;
  readonly totalMs: Float32Array;
  /** Simulation steps run in that frame. More than one means catching up. */
  readonly steps: Int16Array;

  private cursor = 0;
  private filled = 0;

  constructor(capacity: number = FRAME_HISTORY) {
    this.capacity = capacity;
    this.simMs = new Float32Array(capacity);
    this.renderMs = new Float32Array(capacity);
    this.totalMs = new Float32Array(capacity);
    this.steps = new Int16Array(capacity);
  }

  /** Frames recorded so far, up to the capacity. */
  get count(): number {
    return this.filled;
  }

  /** Index of the most recent frame, or -1 before anything is recorded. */
  get newest(): number {
    return this.filled === 0 ? -1 : (this.cursor - 1 + this.capacity) % this.capacity;
  }

  record(simMs: number, renderMs: number, steps: number): void {
    const slot = this.cursor;
    this.simMs[slot] = simMs;
    this.renderMs[slot] = renderMs;
    this.totalMs[slot] = simMs + renderMs;
    this.steps[slot] = steps;

    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.filled < this.capacity) {
      this.filled += 1;
    }
  }

  /**
   * Walks the history oldest first, which is the order a graph draws in.
   *
   * `position` runs 0 to `count - 1` so a caller can place a bar without
   * working out where the ring's seam is.
   */
  forEachFrame(visit: (slot: number, position: number) => void): void {
    const start = (this.cursor - this.filled + this.capacity) % this.capacity;
    for (let position = 0; position < this.filled; position++) {
      visit((start + position) % this.capacity, position);
    }
  }

  /** The worst total frame time in the history. What the graph scales to. */
  peakTotalMs(): number {
    let peak = 0;
    for (let slot = 0; slot < this.filled; slot++) {
      const total = this.totalMs[slot] ?? 0;
      if (total > peak) {
        peak = total;
      }
    }
    return peak;
  }

  /** Mean of a channel over the history. */
  averageOf(channel: Float32Array): number {
    if (this.filled === 0) {
      return 0;
    }
    let sum = 0;
    for (let slot = 0; slot < this.filled; slot++) {
      sum += channel[slot] ?? 0;
    }
    return sum / this.filled;
  }

  reset(): void {
    this.cursor = 0;
    this.filled = 0;
  }
}
