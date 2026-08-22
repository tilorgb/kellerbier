/**
 * Live simulation tuning.
 *
 * Everything in here is a number somebody has to *feel* their way to, not one
 * that can be derived. It is deliberately mutable: the debug overlay (#8) binds
 * sliders straight to these objects, and a dev build exposes them on
 * `__kellerbier.tuning`, so a value can be changed while the game is running
 * rather than through an edit-and-reload cycle.
 *
 * Tuning is not simulation state. A replay carries a seed and an input log; it
 * does not carry these, so changing a value invalidates existing recordings the
 * same way changing the code would.
 */

export interface MovementTuning {
  /** Top speed in pixels per tick. 60 ticks make a second. */
  maxSpeed: number;
  /**
   * Ticks to reach top speed from rest, holding one direction.
   *
   * Stated as a duration rather than an acceleration because the duration is
   * the thing that is actually chosen — it is what a player feels, and what the
   * acceptance criterion on #9 is written in terms of.
   */
  ticksToTopSpeed: number;
  /** Ticks to come to rest from top speed once input stops — the slide. */
  ticksToStop: number;
  /**
   * Extra acceleration, as a multiplier, while the requested direction opposes
   * current velocity. Turning around is the moment momentum feels like a tax
   * rather than a texture, so reversing is helped without making the general
   * acceleration snappier.
   */
  turnBoost: number;
  /**
   * Pixels of overlap the player is nudged around when they very nearly cleared
   * a corner. Above roughly a third of the player radius this starts to feel
   * like the game is steering rather than forgiving.
   */
  cornerForgiveness: number;
  /** Pixels per tick the corner nudge moves. Faster than this reads as a teleport. */
  cornerNudgeSpeed: number;
}

export interface SimTuning {
  readonly movement: MovementTuning;
}

export const DEFAULT_MOVEMENT_TUNING: Readonly<MovementTuning> = {
  maxSpeed: 2.6,
  ticksToTopSpeed: 8,
  ticksToStop: 11,
  turnBoost: 1.6,
  cornerForgiveness: 5,
  cornerNudgeSpeed: 1.5,
};

/** A fresh, mutable copy of every default. */
export function createTuning(): SimTuning {
  return { movement: { ...DEFAULT_MOVEMENT_TUNING } };
}

/** Acceleration in pixels per tick squared, derived from the chosen duration. */
export function accelerationOf(tuning: Readonly<MovementTuning>): number {
  return tuning.maxSpeed / Math.max(1, tuning.ticksToTopSpeed);
}

/** Deceleration in pixels per tick squared while no direction is held. */
export function decelerationOf(tuning: Readonly<MovementTuning>): number {
  return tuning.maxSpeed / Math.max(1, tuning.ticksToStop);
}
