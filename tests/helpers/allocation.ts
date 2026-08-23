/**
 * Measuring what a loop allocates.
 *
 * GC spikes are the defining failure mode of a JavaScript bullet hell: a
 * `{x, y}` allocated inside the frame loop becomes a periodic frame spike that
 * lands exactly when the screen is busiest. Structure-of-Arrays storage and
 * pooling are the fix; these measurements are what prove the fix is in force.
 *
 * ## How it works, and why it is shaped this way
 *
 * Forcing a collection *after* the loop and reading `heapUsed` measures what
 * survived, not what was allocated — a loop producing megabytes of immediately
 * collectable garbage reads as zero growth. So instead: collect once before,
 * run few enough passes that the total stays inside V8's young generation, and
 * read `heapUsed` with no collection in between. Nothing is reclaimed during
 * the window, so the delta is the allocation.
 *
 * The window is measured several times and the **smallest** result is kept.
 * Everything else in the process allocates too — the test runner, timers, the
 * reporter — and whatever of that lands inside a window is added to whatever
 * the loop did. Noise can only push the number up, so the minimum across rounds
 * is the closest estimate of the loop's own cost. Averaging would fold the
 * noise in, and a single window is at the mercy of whatever the machine happened
 * to be doing: the ECS measurement reads 0.2 KB across rounds, read 16 KB from
 * one window locally, and failed CI at 141 KB against a 128 KB budget. All three
 * were the same loop allocating the same nothing.
 */

const forceGc = (globalThis as { gc?: () => void }).gc;

/** Passes inside one measurement window. */
export const PASSES_PER_WINDOW = 20;

/** Windows measured. The smallest is the answer. */
export const MEASUREMENT_ROUNDS = 5;

export function requireGc(): () => void {
  if (forceGc === undefined) {
    // Deliberately a failure rather than a skip: a silently skipped allocation
    // test is how this guarantee gets lost without anyone noticing.
    throw new Error('Run vitest with --expose-gc — see test.execArgv in vite.config.ts');
  }
  return forceGc;
}

export interface MeasureOptions {
  /** Runs after warm-up and before each window's collection. */
  readonly prepare?: () => void;
  readonly passes?: number;
  readonly rounds?: number;
  readonly warmUpPasses?: number;
}

/** Heap bytes allocated per call of `pass`, with nothing reclaimed in between. */
export function bytesPerPass(pass: () => void, options: MeasureOptions = {}): number {
  const gc = requireGc();
  const passes = options.passes ?? PASSES_PER_WINDOW;
  const rounds = options.rounds ?? MEASUREMENT_ROUNDS;

  // Let V8 tier up to optimised code first; the tiering itself allocates, and
  // that is not what is being measured.
  for (let warm = 0; warm < (options.warmUpPasses ?? 300); warm++) {
    pass();
  }

  let smallest = Number.POSITIVE_INFINITY;
  for (let round = 0; round < rounds; round++) {
    options.prepare?.();
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < passes; i++) {
      pass();
    }
    const after = process.memoryUsage().heapUsed;
    smallest = Math.min(smallest, (after - before) / passes);
  }
  return smallest;
}
