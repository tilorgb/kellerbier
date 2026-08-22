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

/**
 * Impact feel.
 *
 * The most consequential numbers in the project. Every one of them is small,
 * none of them is expensive, and together they are the difference between
 * shooting something and *hitting* it. Budget real time here and expect to move
 * these by feel rather than by argument.
 */
export interface ImpactTuning {
  /**
   * Ticks the whole simulation freezes on a hit, plus a scaling term.
   *
   * Hitstop costs nothing and is felt enormously. It reads as the hit having
   * weight, because for two frames the game agrees that something happened.
   * Capped hard: past about four ticks it stops reading as impact and starts
   * reading as a dropped frame.
   */
  hitstopTicks: number;
  hitstopPerDamage: number;
  maxHitstopTicks: number;
  /** A kill earns a longer freeze than a hit. */
  deathHitstopTicks: number;

  /** Ticks a struck body renders solid white. One tick is the whole effect. */
  flashTicks: number;
  deathFlashTicks: number;

  /**
   * Knockback impulse per point of damage, at mass 1.
   *
   * Divided by the body's mass, so a heavy enemy shrugs off what throws a light
   * one across the room — which is how mass becomes something the player reads
   * off the screen rather than out of a stat block.
   */
  knockback: number;

  /** Screenshake, in pixels of camera offset. */
  shakePerDamage: number;
  deathShake: number;
  /**
   * Hard cap on shake.
   *
   * Not a suggestion. Shake that scales without a ceiling turns a good moment
   * into motion sickness, and the player who suffers most is the one having the
   * best run.
   */
  maxShake: number;
  /** Per-tick survival of the shake. */
  shakeDamping: number;

  particlesPerHit: number;
  particlesOnDeath: number;
  particleSpeed: number;
  /** Half-angle of the spray around the impact normal, in radians. */
  particleSpread: number;
  particleLifeTicks: number;
  /** Per-tick survival of a particle's velocity. */
  particleDrag: number;

  /** Off by default. See `DamageNumberStore` for why. */
  damageNumbers: boolean;
  damageNumberLifeTicks: number;
}

export interface SimTuning {
  readonly movement: MovementTuning;
  readonly shooting: ShootingTuning;
  readonly impact: ImpactTuning;
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
  shotLifetimeTicks: 64,
  muzzleOffset: 8,
  velocityInheritance: 0.35,
  kickback: 0.6,
};

/** A fresh, mutable copy of every default. */
export const DEFAULT_IMPACT_TUNING: Readonly<ImpactTuning> = {
  hitstopTicks: 2,
  hitstopPerDamage: 0.6,
  maxHitstopTicks: 4,
  deathHitstopTicks: 6,

  flashTicks: 1,
  deathFlashTicks: 3,

  knockback: 2.6,

  shakePerDamage: 1.1,
  deathShake: 3,
  maxShake: 5,
  shakeDamping: 0.78,

  particlesPerHit: 8,
  particlesOnDeath: 26,
  particleSpeed: 2.4,
  particleSpread: 0.9,
  particleLifeTicks: 22,
  particleDrag: 0.9,

  damageNumbers: false,
  damageNumberLifeTicks: 36,
};

export function createTuning(): SimTuning {
  return {
    movement: { ...DEFAULT_MOVEMENT_TUNING },
    shooting: { ...DEFAULT_SHOOTING_TUNING },
    impact: { ...DEFAULT_IMPACT_TUNING },
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
