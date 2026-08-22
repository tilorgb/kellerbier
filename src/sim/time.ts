/**
 * Simulation time.
 *
 * The simulation's only notion of time is an integer tick counter. There is no
 * `Date.now()`, no `performance.now()` and no delta-time arithmetic anywhere
 * inside `sim/` — that is what makes a run reproducible from a seed and an input
 * log, which in turn is what makes seeded runs, replays and reproducible bug
 * reports possible.
 */

/** Simulation rate. Every system in `sim/` may assume exactly this many steps per second. */
export const TICKS_PER_SECOND = 60;

/**
 * Nominal wall-clock duration of one tick, for display and tooling only.
 *
 * The loop itself never accumulates this value: 1000/60 is not representable in
 * binary floating point, and subtracting it once per tick drifts. See
 * `FixedTimestepLoop`, which divides once instead.
 */
export const MS_PER_TICK = 1000 / TICKS_PER_SECOND;

/**
 * Spiral-of-death guard: the most simulation steps one rendered frame may run.
 *
 * If the machine cannot keep up, the backlog past this many steps is discarded
 * and the game runs in slow motion. The alternative — trying to catch up — makes
 * each frame slower still, and the window stops responding entirely.
 */
export const MAX_STEPS_PER_FRAME = 5;
