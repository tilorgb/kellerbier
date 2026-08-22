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
  /**
   * Per-tick survival of an external push — kickback, knockback, a shove.
   *
   * Pushes live outside velocity so that clamping a body to its top speed does
   * not silently eat every impulse the game applies to it. 0.82 puts a shove
   * at a tenth of its original strength after about a dozen ticks.
   */
  pushDamping: number;
  /**
   * Largest push a body may be carrying, in pixels per tick.
   *
   * Impulses that arrive faster than they decay would otherwise compound
   * without limit, and the resulting launch is not a shove — it is a bug.
   */
  maxPush: number;
}

export interface ShootingTuning {
  /**
   * Ticks between shots, as a delay rather than a rate.
   *
   * A rate has to be inverted somewhere, and the day an item pushes fire rate
   * very high is the day that division produces an interval of zero and the
   * game spawns projectiles until it stops responding. A delay clamps at one
   * tick and nothing blows up.
   */
  fireDelayTicks: number;
  /** Projectile speed in pixels per tick. */
  shotSpeed: number;
  /** Projectile collider radius, in pixels. */
  shotRadius: number;
  /** Damage one projectile deals, in half-Maß units. */
  shotDamage: number;
  /** Ticks a projectile lives. Speed times lifetime is the weapon's range. */
  shotLifetimeTicks: number;
  /** How far from the player's centre a shot appears, along the aim direction. */
  muzzleOffset: number;
  /**
   * Fraction of the player's velocity a shot inherits.
   *
   * Subtle and important. Without it, strafing while shooting feels wrong in a
   * way players notice and cannot name: the shots trail behind the motion that
   * produced them.
   */
  velocityInheritance: number;
  /** Push applied to the player, opposite the shot. Felt, not disruptive. */
  kickback: number;
}

export interface SimTuning {
  readonly movement: MovementTuning;
  readonly shooting: ShootingTuning;
}

export const DEFAULT_MOVEMENT_TUNING: Readonly<MovementTuning> = {
  maxSpeed: 2.6,
  ticksToTopSpeed: 8,
  ticksToStop: 11,
  turnBoost: 1.6,
  cornerForgiveness: 5,
  cornerNudgeSpeed: 1.5,
  pushDamping: 0.82,
  maxPush: 6,
};

export const DEFAULT_SHOOTING_TUNING: Readonly<ShootingTuning> = {
  fireDelayTicks: 13,
  shotSpeed: 6,
  shotRadius: 3,
  shotDamage: 1,
  shotLifetimeTicks: 48,
  muzzleOffset: 8,
  velocityInheritance: 0.35,
  kickback: 0.6,
};

/** A fresh, mutable copy of every default. */
export function createTuning(): SimTuning {
  return {
    movement: { ...DEFAULT_MOVEMENT_TUNING },
    shooting: { ...DEFAULT_SHOOTING_TUNING },
  };
}

/** Acceleration in pixels per tick squared, derived from the chosen duration. */
export function accelerationOf(tuning: Readonly<MovementTuning>): number {
  return tuning.maxSpeed / Math.max(1, tuning.ticksToTopSpeed);
}

/** Deceleration in pixels per tick squared while no direction is held. */
export function decelerationOf(tuning: Readonly<MovementTuning>): number {
  return tuning.maxSpeed / Math.max(1, tuning.ticksToStop);
}
