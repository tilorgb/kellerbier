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
 * collectable garbage reads as zero growth. What is wanted is the opposite: the
 * bytes handed out, whether or not they lived.
 *
 * So `heapUsed` is sampled after every pass, and the measurement is the sum of
 * the **rises** between consecutive samples. Between two collections `heapUsed`
 * only moves one way, so a rise is allocation; a fall is a collection, and a
 * collection is not evidence about the loop at all. Counting rises therefore
 * survives a scavenge landing in the middle of the window, which at these
 * populations is not an edge case but the normal outcome — a full frame hands
 * out enough to fill V8's young generation in a couple of dozen passes.
 *
 * What it costs is the allocation between the last sample before a collection
 * and the collection itself, which is at most one pass's worth per collection
 * and there are one or two per window. Calibrated against known loops: an empty
 * pass reads 0.28 KB, six thousand typed-array writes read 0.19 KB, and a
 * thousand `{x, y}` objects read 39.25 KB — 40.2 bytes each, which is what a
 * two-field object costs. The floor of about a quarter of a kilobyte is the
 * instrument itself: `process.memoryUsage()` returns an object, once per pass.
 *
 * ## Why the smallest window wins
 *
 * The window is measured several times and the smallest result is kept.
 * Everything else in the process allocates too — the test runner, timers, the
 * reporter — and whatever of that lands inside a window is added to whatever
 * the loop did. That noise can only push the number up, so the minimum across
 * rounds is the closest estimate of the loop's own cost. Averaging would fold
 * the noise in, and a single window is at the mercy of whatever the machine
 * happened to be doing: the ECS measurement reads 0.2 KB across rounds, read
 * 16 KB from one window locally, and failed CI at 141 KB against a 128 KB
 * budget. All three were the same loop allocating the same nothing.
 *
 * A previous version of this file took that minimum over *net* deltas, which
 * inverts the argument the moment a collection lands inside a window: a
 * scavenge pushes a window's number down, and against a minimum the most
 * corrupted window always wins. The frame-time benchmark's deliberate
 * regression — 310 KB an object at a time — measured 10 KB that way, and passed
 * a gate set at 64 KB.
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

/**
 * Heap bytes handed out per call of `pass`.
 *
 * Reads about 0.3 KB for a loop that allocates nothing — see the note on the
 * instrument's own floor above. Budgets built on this should sit far enough
 * above that floor to ignore it.
 */
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
    // Not because the window needs an empty heap — it does not, rises are
    // counted either way — but so that every round starts from the same place
    // and a round is not handed the previous one's pending collection.
    gc();

    let previous = process.memoryUsage().heapUsed;
    let grown = 0;
    for (let i = 0; i < passes; i++) {
      pass();
      const sample = process.memoryUsage().heapUsed;
      if (sample > previous) {
        grown += sample - previous;
      }
      previous = sample;
    }
    smallest = Math.min(smallest, grown / passes);
  }
  return smallest;
}
