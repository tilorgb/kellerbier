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
   * How much of the player's speed a body they walk into takes away.
   *
   * Separating two overlapping circles corrects where they are and says nothing
   * about where they were going, so on its own it lets the player keep walking
   * into a crowd at full speed while the crowd is shuffled aside a pixel at a
   * time. This bleeds off the part of their velocity that is heading *into* the
   * body, in the same mass proportion the separation uses, which is what turns
   * a group of small enemies into something that holds someone still long
   * enough for the rest of the room to act. 1 stops that motion outright
   * against a heavy body; 0 restores the old walk-through.
   */
  contactDrag: number;
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
  /**
   * Ticks a projectile lives. Speed times lifetime is the weapon's range.
   *
   * Deliberately about half the room. A range that reaches the far wall lets
   * the player clear a room from the doorway, which turns positioning — the
   * decision the whole genre is built on — into something they never have to
   * make. Standing in the corner has to be the wrong answer until an item makes
   * it the right one.
   */
  shotLifetimeTicks: number;
  /** How far from the player's centre a shot appears, along the aim direction. */
  muzzleOffset: number;
  /**
   * Fraction of the player's velocity a shot inherits, aiming with keys.
   *
   * Subtle and important. Without it, strafing while shooting feels wrong in a
   * way players notice and cannot name: the shots trail behind the motion that
   * produced them. Running right while firing up should visibly bend the stream
   * to the right, the way Isaac's does — that sway is the feature.
   *
   * This is the value for eight-way aim, and it can afford to be generous: with
   * keys, the angle between where the player is running and where they are
   * aiming holds still while they strafe, so the bend is a constant slant they
   * learn in about ten seconds and then shoot through.
   */
  velocityInheritance: number;
  /**
   * The same, for aim that comes from a mouse or a stick.
   *
   * Lower, and the reason is the device rather than the taste. With keys, aim
   * is a *direction*; with a mouse or a stick it is a *point*, and the angle
   * between running and aiming rotates continuously as the player circles that
   * point. The sway then slides through zero and changes sign under their
   * hands, which reads as wobble rather than as momentum — and because they are
   * aiming at a spot rather than along a line, the deflection reads as the gun
   * being inaccurate rather than as the player being in motion.
   *
   * The game is meant to be played on a mouse or a stick, so this is the number
   * most runs will feel. It is chosen against `velocityInheritance` rather than
   * on its own: same sway, less of it.
   */
  analogVelocityInheritance: number;
  /**
   * Push applied to the player, opposite the shot. Felt, not disruptive.
   *
   * The failure mode is a player who fires from a standstill and finds
   * themselves somewhere else: kickback that fights movement stops reading as
   * the weapon having weight and starts reading as drift.
   */
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

  /**
   * Screenshake, in pixels of camera offset.
   *
   * Screen pixels, not room units: the offset is applied to the room container
   * from outside it, so the zoom the room is drawn at does not multiply it.
   */
  shakePerDamage: number;
  deathShake: number;
  /**
   * Shake for a hit on the *player*, whatever caused it.
   *
   * Deliberately the largest shake in the game, and deliberately not the same
   * number as the shake for hitting an enemy. A player having a good run hits
   * something every few ticks, and a camera that jumps on every one of those
   * never settles: the motion stops meaning anything and becomes noise laid
   * over the run going well. Being hurt is the rare event, so it is the one
   * worth moving the camera for.
   */
  playerHitShake: number;
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
  /** Base particle size in pixels, before the per-particle jitter. */
  particleSize: number;
  /**
   * Particles a shot leaves when it ends without hitting anything.
   *
   * Fewer than a hit, on purpose. This fires on every shot that misses, which
   * during a held-down stream is most of them, and a miss that reads as loudly
   * as a hit trains the player to stop believing the hit.
   */
  particlesOnSpend: number;
  /** Particle speed multiplier for a shot that ran out of range rather than being stopped. */
  spentSpeedScale: number;
  particleSpeed: number;
  /** Half-angle of the spray around the impact normal, in radians. */
  particleSpread: number;
  particleLifeTicks: number;
  /** Per-tick survival of a particle's velocity. */
  particleDrag: number;

  /**
   * Ticks the player cannot be hurt by contact again.
   *
   * A second. Long enough to walk out of whatever is touching them, which is
   * the only thing standing between "an enemy is on me" and an emptied health
   * bar at sixty damage a second.
   */
  contactInvulnerabilityTicks: number;
  /** How hard a contact hit throws the player off whatever hurt them. */
  contactKnockback: number;

  /** Off by default. See `DamageNumberStore` for why. */
  damageNumbers: boolean;
  damageNumberLifeTicks: number;
}

/**
 * Enemy feel, above the numbers each enemy states for itself.
 *
 * Speeds, fire rates and telegraph lengths belong to the enemy, in
 * `src/content/enemies/` — that is the point of the data format. What lives
 * here is the handful of *global* scalars that a balance pass moves once and
 * every enemy on every floor feels: how fast the roster is, how long it warns
 * you for, how often it shoots. Difficulty, and the accessibility knob for
 * telegraph length, are both this row of numbers.
 */
export interface EnemyTuning {
  /** Multiplier on every enemy's movement speed. */
  speedScale: number;
  /**
   * Multiplier on every telegraph's length.
   *
   * Above 1 is more warning, which is the accessibility direction; below 1 is
   * the difficulty one. Never 0 — an attack with no telegraph at all is not
   * hard, it is arbitrary, so it clamps to one tick.
   */
  telegraphScale: number;
  /** Multiplier on the gap between volleys. Above 1 is slower firing. */
  fireIntervalScale: number;
  /** Multiplier on the speed of everything enemies fire. */
  projectileSpeedScale: number;
  /**
   * Foam thrown by a shot that splashed off something invulnerable.
   *
   * A bullet that vanishes into a curled Kellerassel reads as the game having
   * dropped it. This is how the player is told the shot arrived and did
   * nothing, which is a different thing from a miss.
   */
  deflectParticles: number;
  /** Shake for that splash. Small: nothing actually happened. */
  deflectShake: number;
}

export interface SimTuning {
  readonly movement: MovementTuning;
  readonly shooting: ShootingTuning;
  readonly impact: ImpactTuning;
  readonly enemy: EnemyTuning;
}

export const DEFAULT_MOVEMENT_TUNING: Readonly<MovementTuning> = {
  maxSpeed: 2.6,
  ticksToTopSpeed: 8,
  ticksToStop: 11,
  turnBoost: 1.6,
  cornerForgiveness: 5,
  cornerNudgeSpeed: 1.5,
  contactDrag: 1,
  pushDamping: 0.82,
  maxPush: 6,
};

export const DEFAULT_SHOOTING_TUNING: Readonly<ShootingTuning> = {
  fireDelayTicks: 13,
  shotSpeed: 6,
  shotRadius: 3,
  shotDamage: 1,
  shotLifetimeTicks: 26,
  muzzleOffset: 8,
  velocityInheritance: 0.85,
  analogVelocityInheritance: 0.35,
  kickback: 0.3,
};

/** A fresh, mutable copy of every default. */
export const DEFAULT_IMPACT_TUNING: Readonly<ImpactTuning> = {
  hitstopTicks: 2,
  hitstopPerDamage: 0.6,
  maxHitstopTicks: 4,
  deathHitstopTicks: 6,

  flashTicks: 1,
  deathFlashTicks: 3,

  knockback: 4,

  shakePerDamage: 0.08,
  deathShake: 0.3,
  playerHitShake: 2.4,
  maxShake: 2.5,
  shakeDamping: 0.78,

  particlesPerHit: 8,
  particlesOnDeath: 18,
  particleSize: 0.7,
  particlesOnSpend: 5,
  spentSpeedScale: 0.45,
  particleSpeed: 1.5,
  particleSpread: 0.9,
  particleLifeTicks: 22,
  particleDrag: 0.9,

  contactInvulnerabilityTicks: 60,
  contactKnockback: 3.5,

  damageNumbers: false,
  damageNumberLifeTicks: 36,
};

export const DEFAULT_ENEMY_TUNING: Readonly<EnemyTuning> = {
  speedScale: 1,
  telegraphScale: 1,
  fireIntervalScale: 1,
  projectileSpeedScale: 1,
  deflectParticles: 6,
  deflectShake: 0.3,
};

export function createTuning(): SimTuning {
  return {
    movement: { ...DEFAULT_MOVEMENT_TUNING },
    shooting: { ...DEFAULT_SHOOTING_TUNING },
    impact: { ...DEFAULT_IMPACT_TUNING },
    enemy: { ...DEFAULT_ENEMY_TUNING },
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
