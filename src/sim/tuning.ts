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
  /**
   * Floor 1's slick-puddle hazard (#35): how much of the player's
   * acceleration and deceleration a puddle steals, applied the same way
   * `promilleDriftScale` already divides the rate — `rate / (1 + slip)`.
   *
   * The hazard's whole point is stated in `docs/CONTENT_BIBLE.md` as
   * "carries your momentum": letting go of the stick on dry floor stops the
   * player in `ticksToStop` ticks; on a puddle the same release keeps them
   * sliding for roughly `ticksToStop * (1 + puddleSlip)` — visibly longer,
   * so a player learns what a puddle does by walking into one on a floor
   * with nothing in it to hurt them, per the floor's "teaches safely first"
   * job (issue #35's acceptance criteria).
   */
  puddleSlip: number;
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
   * Fraction of the player's velocity a shot inherits.
   *
   * Subtle and important. Without it, strafing while shooting feels wrong in a
   * way players notice and cannot name: the shots trail behind the motion that
   * produced them. Running right while firing up should visibly bend the stream
   * to the right, the way Isaac's does — that sway is the feature.
   *
   * It can afford to be generous because aim is eight-way: the angle between
   * where the player is running and where they are aiming holds still while
   * they strafe, so the bend is a constant slant they learn in about ten
   * seconds and then shoot through, rather than a point-aim's continuously
   * rotating angle, which would read as wobble instead (`docs/DECISIONS.md`
   * #20).
   */
  velocityInheritance: number;
  /**
   * Push applied to the player, opposite the shot. Felt, not disruptive.
   *
   * The failure mode is a player who fires from a standstill and finds
   * themselves somewhere else: kickback that fights movement stops reading as
   * the weapon having weight and starts reading as drift.
   */
  kickback: number;
  /**
   * `ProjectileTag` (#27, `sim/projectile/tags.ts`) bitmask applied to every
   * shot the player fires, before any item hook runs.
   *
   * Simulation state living in tuning rather than a dial, the same exception
   * `PromilleTuning.current` documents for itself: no character grants an
   * innate tag yet (`docs/GAME_DESIGN.md`'s roster table — Resi's arcing and
   * returning Brezn, König Ludwig's homing swans — is a later issue), and this
   * is where that will eventually be read from. Until then it is the debug
   * projectile tag chooser's (`src/debug/projectile-tag-chooser.ts`) one write
   * target: checking a box ORs its bit in, live, exactly the way a tuning
   * slider already writes any other field here.
   */
  forcedTags: number;
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
   * Ticks a struck body's own hit-stagger lasts, plus a scaling term.
   *
   * Local to the body — see `hitStun` on `GameSim` for why this is not a
   * whole-simulation freeze. It still costs nothing and is felt enormously:
   * it reads as the hit having weight, because for a couple of frames the
   * thing that got hit agrees that something happened. Capped hard: past
   * about four ticks it stops reading as impact and starts reading as the
   * body being unresponsive.
   */
  hitstunTicks: number;
  hitstunPerDamage: number;
  maxHitstunTicks: number;

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

  /**
   * Ticks the player cannot be hurt by a projectile again.
   *
   * Deliberately shorter than `contactInvulnerabilityTicks`: contact needs to
   * last long enough to walk out of whatever is touching them, but a shot is
   * instantaneous — this only needs to cover pellets from the same volley
   * arriving on the same tick, not the gap until an enemy's next volley, or a
   * ranged enemy that can only ever land its first hit stops being a threat.
   */
  projectileInvulnerabilityTicks: number;

  /** Off by default. See `DamageNumberStore` for why. */
  damageNumbers: boolean;
  damageNumberLifeTicks: number;

  /**
   * The freeze on the player's fatal hit, in ticks. Reuses `requestHitstop` —
   * a longer version of the same freeze every other hit already gets, not a
   * second mechanism.
   */
  deathFreezeTicks: number;
  /** Ticks of the slow-motion beat that follows the freeze, before the game-over screen. */
  deathSlowmoTicks: number;
  /** `loop.timeScale` during the slow-motion beat. 1 is normal speed, 0 is stopped. */
  deathSlowmoScale: number;
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
  /**
   * Chance a normal-room spawn (#156) is upgraded to an elite on Floor 1,
   * before `eliteChancePerExtraFloor` is added for every floor past it.
   * Never rolled for a special-room encounter (boss, treasure, shop,
   * secret) — a modifier layer for the ordinary roster, not for the
   * fights already authored to be harder on their own.
   */
  eliteChanceBase: number;
  /** Added to `eliteChanceBase` per floor past Floor 1 — the difficulty-rises-across-floors half of #156, cheaper than authoring a fourteenth enemy. */
  eliteChancePerExtraFloor: number;
  /** Hard ceiling on the rolled chance, however many floors deep this ever reaches. */
  eliteChanceMax: number;
  /** What an elite's health is multiplied by. "Tougher" — #156's own first example. */
  eliteHealthMultiplier: number;
  /** What an elite's contact damage is multiplied by. Smaller than the health multiplier: a body worth shooting more, not a room worth avoiding entirely. */
  eliteContactDamageMultiplier: number;
  /**
   * What an elite's collider radius (and mass, matched to it) is multiplied
   * by — "elite variants read as elite at a glance, without needing a
   * health bar to tell you" (#156's acceptance criterion) is a size
   * difference before it is a colour one.
   */
  eliteRadiusMultiplier: number;
}

/**
 * The Promille prototype (#17). Deliberately rough — the whole point of this
 * milestone is to answer "does being drunk feel good to play?" before more is
 * built on top of it.
 *
 * `current` is simulation state, not a dial — the one exception in this file.
 * It lives here anyway because the issue's own guidance is to put it here:
 * the tuning window (`src/debug/tuning-window.ts`) already binds a slider
 * straight to any numeric field on a `SimTuning` group, so this is the
 * entire cost of "a debug slider that sets it directly." No replay system
 * exists yet (#48) for this to break.
 */
export interface PromilleTuning {
  /** Current Promille, 0–5. The debug slider drives this field directly. */
  current: number;
  /** Promille lost per second, pure time decay — no eating/water/being-hit yet (#31). */
  decayPerSecond: number;
  /** Promille one beer pickup adds. */
  beerAmount: number;

  /**
   * Trinkfest (#92): tolerance. 0 is the baseline every run starts at — with
   * `promilleTierOf`/`promilleCapFor` defined so that `trinkfest === 0`
   * reproduces the pre-#92 tier boundaries and ceiling exactly, byte for
   * byte. Positive raises the Umgfalln threshold (and the Promille ceiling
   * along with it) and unlocks the post-Vollrausch stages one at a time;
   * negative pulls the threshold in from below, inside Vollrausch's own
   * range, so Umgfalln arrives before the tier is spent. Clamped to
   * `[TRINKFEST_MIN, TRINKFEST_MAX]` (`sim/game/promille.ts`) by
   * `GameSim.raiseTrinkfest`/`lowerTrinkfest` — the only two places gameplay
   * is meant to move it. The debug slider writes this field directly, the
   * same bypass `current` already allows.
   *
   * Deliberately **per-run, not a meta-progression unlock** — #92 leaves
   * that door open (an item could `onFloorStart` a permanent-for-the-run
   * raise just as easily as a temporary one), but persisting it across runs
   * would mean plumbing it into the save blob (`docs/GAME_DESIGN.md` §11),
   * which nothing else in this milestone needs and which the issue's own
   * "smallest testable slice first" guidance argues against starting with.
   */
  trinkfest: number;
  /**
   * Promille width of one whole Trinkfest level — how far one level moves
   * the Umgfalln threshold, up or down, and how wide each unlocked
   * post-Vollrausch stage is. One number rather than one per stage: every
   * stage is the same width, so widening the system later (a third stage)
   * is a tier added to `PromilleTier`, not a new tuning field.
   */
  trinkfestStageWidth: number;

  angeheitertDamageBonus: number;
  angeheitertFireRateBonus: number;
  beduseltDamageBonus: number;
  beduseltFireRateBonus: number;
  vollrauschDamageBonus: number;
  vollrauschFireRateBonus: number;
  /** Sturzbesoffen (Trinkfest level 1's stage): bigger than Vollrausch's own bonus, per #92's "unlocks higher damage than the current Vollrausch ceiling." */
  sturzbesoffenDamageBonus: number;
  sturzbesoffenFireRateBonus: number;
  /** Filmriss (Trinkfest level 2's stage): the highest bonus in the game, paired with the worst readable penalties short of falling over. */
  filmrissDamageBonus: number;
  filmrissFireRateBonus: number;

  /**
   * Drift, wobble and sway are a continuous ramp from the Promille value
   * rather than five more stepped tiers — the design doc only gives exact
   * numbers for damage and fire rate; drift/wobble/sway are described
   * qualitatively ("heavy", "very slight"), so one intensity knob each
   * reaches the same shape with far less to hand-tune.
   */
  maxDrift: number;
  /** Aim wobble amplitude at full ramp, in radians. */
  maxWobble: number;
  /**
   * Ticks per full wobble sweep. Deliberately its own field rather than
   * reusing `swayPeriodTicks` — the miss-rate calibration on `maxWobble`
   * doesn't depend on sweep speed, but sway wants to run much slower than
   * wobble to read as a smooth drift instead of a jitter.
   */
  wobblePeriodTicks: number;
  /** Camera sway at full ramp, in pixels. */
  maxSway: number;
  /** Ticks per full sway loop — slow, so it reads as drifting rather than jittering. */
  swayPeriodTicks: number;

  /**
   * The third penalty #92 asks for, alongside sway and aim wobble/spray:
   * a readable screen distortion — see `promilleScreenDistortion` — that
   * starts at zero at the top of Beduselt (Vollrausch's own opening, where
   * the design doc's "Rausch-tier item effects activate" already begins),
   * reaches `1` at the pre-#92 Promille ceiling, and keeps climbing past it
   * through the Trinkfest stages. `render/vignette.ts` reads it to pulse the
   * tunnel-vision vignette and tint it red once it is actually doing
   * something, rather than adding a whole second full-screen effect.
   */
  maxScreenDistortion: number;
  /** Ticks per full distortion pulse — fast and separate from sway/wobble's own periods, so it reads as a flicker, not another drift. */
  screenDistortionPeriodTicks: number;

  /** How long the Umgfalln knockdown holds the player still and invulnerable. */
  umgfallnKnockdownTicks: number;
  /** Promille the player wakes at, after the knockdown ends. */
  umgfallnWakePromille: number;

  /**
   * Kater (hangover): started when the Umgfalln knockdown ends, ticking down
   * on its own clock rather than riding Promille back down — the punish is
   * "you fell over," not "you happened to still be drunk," so it survives a
   * player sobering up faster than usual. Cleared early by eating.
   */
  katerDurationTicks: number;
  /** Stammwürze multiplier while Kater is active — a flat penalty, not a ramp. */
  katerStammwuerzeMultiplier: number;
  /** Gschwindigkeit multiplier while Kater is active. */
  katerGschwindigkeitMultiplier: number;
}

/**
 * Projectile tag composition (#27): every numeric knob a tag's behaviour needs.
 *
 * One flat interface rather than one per tag, on purpose — a dozen `interface`
 * blocks of one or two fields each would scatter what is, in practice, a single
 * balance pass over `sim/projectile/behavior.ts`. The comment on each field
 * says which tag reads it.
 */
export interface ProjectileTagTuning {
  /** `piercing`: enemies a shot may fly through before it is finally stopped. */
  pierceMaxTargets: number;
  /** `bouncing`: bounces (off a wall or an enemy) a shot has before it despawns like a plain one. */
  bounceMaxCount: number;
  /** `splitting`: generations of children a hit may spawn — 1 means the root shot splits once and its children do not. */
  splitMaxDepth: number;
  /** `splitting`: children spawned per split. */
  splitCount: number;
  /** `splitting`: full angular spread the children fan across, in radians, centred on the hit's own direction of travel. */
  splitSpreadRadians: number;
  /** `splitting`: damage multiplier applied to a split child relative to what split it. */
  splitDamageScale: number;
  /** `splitting`: lifetime multiplier applied to a split child relative to what split it. */
  splitLifetimeScale: number;
  /** `homing`: how sharply a shot may turn toward its target, in radians per tick. */
  homingTurnRadiansPerTick: number;
  /** `homing`: how far away a target may be and still be picked up. Zero means unlimited. */
  homingRange: number;
  /** `arcing`: constant rotation applied to velocity every tick, in radians — positive curves clockwise. */
  arcingTurnRadiansPerTick: number;
  /** `orbiting`: radius of the circle a shot holds around its spawn point, in pixels. */
  orbitRadius: number;
  /** `orbiting`: angular speed around that circle, in radians per tick. */
  orbitAngularVelocity: number;
  /** `returning`: ticks a shot flies outward before it turns back toward where it was fired from. */
  returningTurnTicks: number;
  /** `burning`: ticks between damage applications while the status is active. */
  burnTickInterval: number;
  /** `burning`: damage dealt on each application. */
  burnDamagePerTick: number;
  /** `burning`: ticks the status lasts. A later hit refreshes rather than stacks — see `behavior.ts`. */
  burnDurationTicks: number;
  /** `poison`: the same three knobs as `burning`, kept separate so a future item can react to one and not the other. */
  poisonTickInterval: number;
  poisonDamagePerTick: number;
  poisonDurationTicks: number;
  /** `freezing`: velocity is multiplied by this every tick the status is active. */
  freezeSlowFactor: number;
  /** `freezing`: ticks the status lasts. */
  freezeDurationTicks: number;
}

/** The pickup economy (#22): magnetism, spawn juice, need-weighting and the Bierfassl. */
export interface PickupTuning {
  /**
   * How close a pickup has to be to the player before it starts drifting
   * toward them. Zero by default — a run starts with no magnetism at all,
   * the same "unlocked, not on from the start" shape Promille uses
   * (`docs/GAME_DESIGN.md` §5) — and is meant to be raised by an item once
   * items exist (#M3), not tuned as a baseline feel constant. The debug
   * tuning window's slider (`debug/tuning-window.ts`) still reaches it for
   * testing the drift itself.
   */
  magnetRadius: number;
  /** Pixels per tick a magnetised pickup closes the distance by. */
  magnetSpeed: number;
  /** Ticks the spawn-bounce visual runs for, purely cosmetic. */
  spawnBounceTicks: number;
  /** Weight multiplier applied to a drop-table entry the player is low on. */
  needMultiplier: number;
  /** Fraction of max (health) or a bare zero (bombs/keys/currency) counted as "low". */
  needThreshold: number;
  /** Ticks between a Bierfassl being placed and it exploding. */
  bombFuseTicks: number;
  /**
   * How many tiles the blast reaches in each of the four cardinal directions
   * — a Bomberman cross, not a circle: the same width as the bomb's own tile
   * out to this many tiles north/south/east/west of it, damaging and
   * destroying destructible terrain the same distance it telegraphs and
   * animates (`sim/systems/bombs.ts`'s `blastCandidate`,
   * `render/entities.ts`'s bomb telegraph, `sim/particle/effects.ts`'s
   * `bombBlast`, all read this one number). The knob an item raises or
   * lowers later to make a bomb reach further or less far.
   */
  bombBlastArmTiles: number;
  /** Damage the blast deals to everything it reaches. */
  bombBlastDamage: number;
  /** Initial speed of a rolled Bierfassl, pixels per tick. */
  bombRollSpeed: number;
  /** Drag applied to a rolled Bierfassl every tick — see `stepBodies`. */
  bombRollDrag: number;
  /**
   * Ticks the "what did I just pick up" HUD toast (#26) stays on screen after
   * a pickup or an item is collected. Presentation state, but tick-driven
   * rather than a wall-clock timer in the render layer — the same reasoning
   * `flash`/`spawnBounce` are ticks rather than milliseconds — so the same
   * seed and input log show the same toast for the same duration on replay.
   */
  toastTicks: number;
}

/**
 * Item pools (#28): how an offer is weighted, and how a pedestal presents it.
 *
 * `qualityWeight0..3` are a plain per-tier base weight rather than an array —
 * an array field can't be a debug-window slider (`FieldSpec.key` indexes a
 * flat `Record<string, number>`), and quality only ever has the four tiers
 * `ItemQuality` already fixes. Quality 0 is the most common by a wide margin,
 * the same top-heavy curve Isaac's own pool weighting uses: a run seeing
 * mostly small items with the occasional strong one reads as a curve, a run
 * seeing them in equal proportion reads as noise.
 */
export interface ItemPoolTuning {
  readonly qualityWeight0: number;
  readonly qualityWeight1: number;
  readonly qualityWeight2: number;
  readonly qualityWeight3: number;
  /**
   * Per floor, per quality tier, added on top of that tier's base weight —
   * deeper floors skew the curve toward the items worth taking a run further
   * into (#28's "weighted... by floor depth"). Tier 0 is unaffected in
   * practice (`quality * bias` is 0), which is the point: the floor should
   * make the rare tiers *more* likely to show up, not make the common tier
   * rarer than it already reads.
   */
  floorQualityBias: number;
  /** Same shape as `floorQualityBias`, driven by the player's resolved Dusel stat instead of floor depth. */
  duselQualityBias: number;
  /** Radius (px) inside which a pedestal shows its name plate and accepts the `use` button. */
  interactRadius: number;
  /**
   * Ticks the name+description reveal panel stays up after a pedestal
   * pickup/swap — decremented in `decayPresentation`. Deliberately longer
   * than `toastTicks`: a pedestal pickup is a moment the run is meant to
   * notice and actually read, not the quick float-past-loot toast an
   * ordinary pickup gets. A pedestal pickup used to also freeze the sim for
   * a `pickupPauseTicks` hitstop while this panel came up; playtesting found
   * the freeze itself was the part that read as friction, so it is gone —
   * this field alone now carries the "give the player time to read it" job.
   */
  revealHoldTicks: number;
  /** Vertical bob amplitude, px. */
  bobAmplitude: number;
  /** Ticks per full bob cycle. */
  bobPeriodTicks: number;
}

/**
 * The three character verbs that are numbers rather than behaviour (#47).
 *
 * Barnabas's fast, Ludwig's purse and the Wolpertinger's reroll all have a
 * "how much" that has to be tunable at runtime, per `CONTRIBUTING.md`'s
 * gameplay definition of done — the *rules* themselves live in
 * `sim/character/definition.ts` as data on the roster, but nobody can feel
 * whether a fast should pay off after fifteen seconds or forty-five without
 * dragging it while playing.
 */
export interface CharacterTuning {
  /** Ticks of fasting per step of Barnabas's Stammwürze bonus. */
  fastStepTicks: number;
  /** Stammwürze added per completed step, as a multiplier addend (0.2 = +20% per step). */
  fastStepBonus: number;
  /** Steps the fast stops paying at, so a patient run is strong rather than unbounded. */
  fastMaxSteps: number;
  /** Ticks between the Biermarken Ludwig's crown costs him. */
  purseDrainTicks: number;
  /** Ludwig's Stammwürze multiplier while the purse still has something in it. */
  pursePowerMultiplier: number;
  /** Lowest factor a Wolpertinger reroll can hand a stat. */
  chaosMinFactor: number;
  /** Highest. The band is deliberately wider upward than down — unfair in both directions, but playable. */
  chaosMaxFactor: number;
}

/**
 * Procedural room generation (#random-rooms — `sim/room/generate-room.ts`).
 *
 * Every field here is a "feel" number for how a generated room reads: how much
 * cover it carries, how often a room is near-empty or cluttered, how many mobs
 * and props it holds. Live-tunable like the rest of this file — the tuning
 * window binds a slider to each — and it is `app/main.ts` that reads `roomGen`
 * off the live `SimTuning` and hands it to the generator, so a slider drag
 * shows up on the next room generated (walk to the next room, or the `G` debug
 * key).
 *
 * These values are the **Floor 1** feel. Later floors that want a different
 * texture (denser woods, an open Wiesn) override individual fields per floor
 * tag in `content/floors/definition.ts`'s `ROOM_GEN_FLOOR_OVERRIDES`, which is
 * merged over this at generation time.
 */
export interface RoomGenTuning {
  /** Interior tiles (of 91) an ordinary room fills with obstacles — the sweet-spot band. */
  minCoverTiles: number;
  maxCoverTiles: number;
  /** Chance a room is instead near-empty. */
  sparseChance: number;
  sparseMaxTiles: number;
  /** Chance a room is instead cluttered — a higher ceiling only, still navigable. */
  busyChance: number;
  busyMaxCoverTiles: number;
  /** Stamps an attempt may try before the coverage band judges the result — the band, not this, is the real control. */
  maxScatter: number;
  maxCoverWalls: number;
  /** Layout attempts before falling back to an empty room. Not worth a slider; still tunable in code. */
  layoutRetries: number;
  /** Enemy threat budget = base + perDistance·distance-from-start + perFloor·(floor-1). */
  threatBase: number;
  threatPerDistance: number;
  threatPerFloor: number;
  maxEnemies: number;
  /** Chance a room drops one free pickup. */
  pickupChance: number;
  /** Decorative / destructible props (barrels, crates, hay bales) scattered as scenery — up to this many. */
  maxProps: number;
  /** Chance a room gets one floor-flavour hazard patch (Floor 1 puddle, Floor 2 trellis). */
  hazardChance: number;
  /**
   * Chance a `1x1` `normal` slot is filled by a hand-authored room instead of a
   * generated one — the route for a one-off room design to pop up on a floor.
   * The authored pool is every `1x1` template with no `specialRole`, weighted
   * by its `metadata.weight`.
   */
  authoredRoomChance: number;
}

/**
 * Curses (#49): a floor modifier's own numbers, kept out of the systems that
 * read them for the same "author can't tune what isn't a slider" reason
 * every other subsystem here is. `curseChance` is the one field that isn't a
 * specific curse's own number — how often a floor rolls one at all.
 */
export interface CurseTuning {
  /** Chance a generated floor carries a curse at all — see `GameSim`'s floor-start roll. */
  curseChance: number;
  /** Ticks before Sperrstunde's "last call" timer runs out. Ten seconds is one short floor, not a whole one. */
  sperrstundeTimerTicks: number;
  /**
   * Once Sperrstunde's timer expires, the Ordner's harassment (a poison tick
   * on the player, reusing `sim/systems/status-effects.ts`) refreshes this
   * often — never lethal on its own, per #49's own acceptance criterion, just
   * pressure to keep moving.
   */
  sperrstundeHarassmentIntervalTicks: number;
  /** Duration/magnitude of each Ordner poison application — see `poisonDurationTicks`/`poisonDamagePerTick` in `ProjectileTagTuning` for the shape this mirrors. */
  sperrstundeHarassmentDurationTicks: number;
  /** Radians the Föhn curse's wind direction turns per tick — same shape as the Föhn item's own constant. */
  foehnRotationRadiansPerTick: number;
  /** How hard the Föhn curse pushes every live projectile each tick. */
  foehnWindStrength: number;
  /** Radius, in px, the player can still see clearly under Blaue Stunde — render-side only, never touches simulation. */
  blaueStundeVisionRadius: number;
}

/**
 * Blutwurz (#84): a second chance you have to walk back for. Its own group
 * rather than folded into `PromilleTuning` — the mechanic borrows Promille's
 * *tiers* when a run has them (see `sim/systems/blutwurz.ts`), but its own
 * numbers (how fragile the spirit is, how far "close enough to the corpse"
 * reaches, what a recovery permanently costs) are Blutwurz's alone.
 */
export interface BlutwurzTuning {
  /** Promille raised per tick while the spirit walk is on, in a run that has the meter at all. */
  promilleRisePerTick: number;
  /** A sober run's own hidden countdown, in ticks, standing in for the meter it does not have. */
  soberFailTicks: number;
  /** How close, in px, counts as "reached the corpse." */
  corpseTouchRadius: number;
  /** Max health while the spirit walk is on, in half-Maß — fragile by design, one hit ends it. */
  spiritMaxHealth: number;
  /** Permanent reduction to max health on a successful recovery, in half-Maß. */
  recoveryMaxHealthPenalty: number;
}

export interface SimTuning {
  readonly movement: MovementTuning;
  readonly shooting: ShootingTuning;
  readonly impact: ImpactTuning;
  readonly enemy: EnemyTuning;
  readonly promille: PromilleTuning;
  readonly pickup: PickupTuning;
  readonly projectileTags: ProjectileTagTuning;
  readonly itemPool: ItemPoolTuning;
  readonly character: CharacterTuning;
  readonly roomGen: RoomGenTuning;
  readonly curse: CurseTuning;
  readonly blutwurz: BlutwurzTuning;
}

export const DEFAULT_MOVEMENT_TUNING: Readonly<MovementTuning> = {
  maxSpeed: 1.8,
  ticksToTopSpeed: 8,
  ticksToStop: 11,
  turnBoost: 1.6,
  cornerForgiveness: 5,
  cornerNudgeSpeed: 1.5,
  contactDrag: 1,
  pushDamping: 0.82,
  maxPush: 6,
  // Roughly triples both the run-up to top speed and the slide to a stop —
  // strong enough to read as "the floor changed" the instant a player's
  // shoe touches one, short of throwing them somewhere they didn't aim.
  puddleSlip: 2,
};

export const DEFAULT_SHOOTING_TUNING: Readonly<ShootingTuning> = {
  fireDelayTicks: 20,
  shotSpeed: 3.5,
  shotRadius: 3,
  shotDamage: 1,
  shotLifetimeTicks: 30,
  muzzleOffset: 8,
  velocityInheritance: 0.85,
  kickback: 0.3,
  forcedTags: 0,
};

/** A fresh, mutable copy of every default. */
export const DEFAULT_IMPACT_TUNING: Readonly<ImpactTuning> = {
  hitstunTicks: 2,
  hitstunPerDamage: 0.6,
  maxHitstunTicks: 4,

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
  projectileInvulnerabilityTicks: 20,

  damageNumbers: false,
  damageNumberLifeTicks: 36,

  deathFreezeTicks: 20,
  deathSlowmoTicks: 30,
  deathSlowmoScale: 0.4,
};

export const DEFAULT_ENEMY_TUNING: Readonly<EnemyTuning> = {
  speedScale: 1,
  telegraphScale: 1,
  fireIntervalScale: 1,
  projectileSpeedScale: 1,
  deflectParticles: 6,
  deflectShake: 0.3,
  // 8% on Floor 1, 14% on Floor 2 — noticeable without every third room
  // being an elite encounter. #54's own telemetry-driven pass is what
  // actually earns these numbers; this is a starting point, not a verdict.
  eliteChanceBase: 0.08,
  eliteChancePerExtraFloor: 0.06,
  eliteChanceMax: 0.35,
  eliteHealthMultiplier: 1.8,
  eliteContactDamageMultiplier: 1.3,
  eliteRadiusMultiplier: 1.2,
};

export const DEFAULT_PROMILLE_TUNING: Readonly<PromilleTuning> = {
  current: 0,
  decayPerSecond: 0.05,
  // Halved from the M1 prototype's 0.8 — one beer used to put a sober player
  // most of the way to Angeheitert, and six landed Umgfalln with barely a
  // decision along the way. At 0.4, Angeheitert takes two, Vollrausch eight,
  // Umgfalln twelve — enough drinks apart, at this decay rate, that going up
  // a tier is a choice made mid-fight rather than a side effect of picking
  // up whatever a room happened to drop.
  beerAmount: 0.4,

  // Baseline — see the field's own doc comment for why this has to be 0.
  trinkfest: 0,
  // One level buys one whole extra "beer or two" of headroom before Umgfalln
  // — roughly what one stage's own damage/fire-rate jump is worth trading
  // for, so raising Trinkfest reads as a real decision rather than a free
  // stat stick.
  trinkfestStageWidth: 1.0,

  angeheitertDamageBonus: 0.15,
  angeheitertFireRateBonus: 0.1,
  beduseltDamageBonus: 0.35,
  beduseltFireRateBonus: 0.25,
  vollrauschDamageBonus: 0.7,
  vollrauschFireRateBonus: 0.5,
  // Meaningfully past Vollrausch's own numbers (#92's "unlocks higher damage
  // than the current Vollrausch ceiling"), each stage a clear step up from
  // the last — the whole point of paying for Trinkfest.
  sturzbesoffenDamageBonus: 1.0,
  sturzbesoffenFireRateBonus: 0.65,
  filmrissDamageBonus: 1.4,
  filmrissFireRateBonus: 0.8,

  maxDrift: 0.6,
  // Measured against a Normal enemy (radius 7, `src/sim/enemy/size.ts`) at a
  // ~70px engagement range, firing continuously and reading where the shots
  // actually land relative to a dead-on aim: 0% miss through Beduselt and
  // into the start of Vollrausch, climbing through the low-to-mid 3.0s of
  // Promille, and roughly 60% miss by the top of Vollrausch and beyond. A
  // sine, not RNG — the same shot fired at the same tick count always lands
  // the same place, so a player who reads the sweep can still time a burst
  // to the zero-crossings. That's the "deterministic spray" #17 asks for.
  maxWobble: 0.3,
  /** Ticks per full wobble sweep. Kept separate from `swayPeriodTicks` — the
   * miss-rate calibration above doesn't depend on how fast the sweep runs,
   * but sway wants to be much slower than wobble to read as smooth rather
   * than jittery, and coupling the two would fight both goals. */
  wobblePeriodTicks: 145,
  maxSway: 12,
  /** Ticks per full sway loop. Slow on purpose — this is what separates a
   * gentle drift from a jitter that gets mistaken for hit-shake. */
  swayPeriodTicks: 220,

  // 1 at the old ceiling, ~1.75 by the top of Filmriss (level 2) — a visible
  // difference without the screen becoming unreadable; see `render/
  // vignette.ts`'s `sync`, which caps how much of this it actually spends.
  maxScreenDistortion: 1,
  // Fast relative to sway (220) and wobble (145) — a flicker, not a drift.
  screenDistortionPeriodTicks: 50,

  umgfallnKnockdownTicks: 90,
  umgfallnWakePromille: 1.5,

  // 12 seconds at 60 ticks/second — long enough to matter, short enough that
  // a room or two of caution clears it rather than making the player wait.
  katerDurationTicks: 720,
  katerStammwuerzeMultiplier: 0.8,
  katerGschwindigkeitMultiplier: 0.85,
};

export const DEFAULT_PICKUP_TUNING: Readonly<PickupTuning> = {
  magnetRadius: 0,
  magnetSpeed: 1.4,
  spawnBounceTicks: 14,
  needMultiplier: 2,
  needThreshold: 0.5,
  bombFuseTicks: 90,
  bombBlastArmTiles: 2,
  bombBlastDamage: 4,
  bombRollSpeed: 2.6,
  bombRollDrag: 0.9,
  toastTicks: 120,
};

export const DEFAULT_ITEM_POOL_TUNING: Readonly<ItemPoolTuning> = {
  qualityWeight0: 100,
  qualityWeight1: 55,
  qualityWeight2: 25,
  qualityWeight3: 8,
  floorQualityBias: 0.06,
  duselQualityBias: 0.05,
  interactRadius: 28,
  revealHoldTicks: 180,
  bobAmplitude: 3,
  bobPeriodTicks: 90,
};

/**
 * Split children deal less and range less than the shot that made them —
 * otherwise a splitting weapon's total damage output scales with its split
 * count for free, which is not a balance decision this file should be the one
 * making. Homing turns briskly enough to visibly curve onto a target within a
 * few ticks without snapping instantly; orbiting and returning are both sized
 * against the training room's own scale, `docs/TECH_STACK.md`'s 640×360 room.
 */
export const DEFAULT_PROJECTILE_TAG_TUNING: Readonly<ProjectileTagTuning> = {
  pierceMaxTargets: 2,
  bounceMaxCount: 2,
  splitMaxDepth: 1,
  splitCount: 2,
  splitSpreadRadians: Math.PI / 3,
  splitDamageScale: 0.6,
  splitLifetimeScale: 0.7,
  homingTurnRadiansPerTick: 0.12,
  homingRange: 220,
  arcingTurnRadiansPerTick: 0.05,
  orbitRadius: 36,
  orbitAngularVelocity: 0.15,
  returningTurnTicks: 18,
  burnTickInterval: 15,
  burnDamagePerTick: 1,
  burnDurationTicks: 90,
  poisonTickInterval: 20,
  poisonDamagePerTick: 1,
  poisonDurationTicks: 120,
  freezeSlowFactor: 0.15,
  freezeDurationTicks: 45,
};

export const DEFAULT_CHARACTER_TUNING: Readonly<CharacterTuning> = {
  // Fifteen seconds a step, four steps: a Barnabas who has eaten nothing for
  // a minute is hitting twice as hard as one who just drank. Long enough
  // that walking past a Brezn is a decision, short enough to be felt inside
  // one floor.
  fastStepTicks: 900,
  fastStepBonus: 0.25,
  fastMaxSteps: 4,
  // A Biermarke every one and a half seconds. Ludwig starts with a purse
  // (`content/characters/koenig-ludwig.ts`) that buys him about a minute of
  // being Ludwig, which is roughly a room and a half — so the coins a room
  // drops are the thing keeping him in the air, not decoration.
  purseDrainTicks: 90,
  pursePowerMultiplier: 3,
  chaosMinFactor: 0.6,
  chaosMaxFactor: 1.8,
};

/**
 * Floor 1's room-generation feel. A moderate amount of cover in most rooms
 * (`minCoverTiles`–`maxCoverTiles` of 91), a near-empty room now and then, a
 * cluttered one rarely — the mob fight is the challenge, not the walk.
 */
export const DEFAULT_ROOM_GEN_TUNING: Readonly<RoomGenTuning> = {
  minCoverTiles: 8,
  maxCoverTiles: 22,
  sparseChance: 0.05,
  sparseMaxTiles: 3,
  busyChance: 0.16,
  busyMaxCoverTiles: 40,
  // Per single-screen cell. High enough that an attempt can reach the busy
  // ceiling — the coverage band, not these, decides what a room ends up with.
  maxScatter: 10,
  maxCoverWalls: 3,
  layoutRetries: 40,
  threatBase: 2,
  threatPerDistance: 1.2,
  threatPerFloor: 0.5,
  maxEnemies: 6,
  pickupChance: 0.2,
  maxProps: 5,
  hazardChance: 0.18,
  authoredRoomChance: 0.12,
};

/**
 * Sperrstunde's timer is deliberately generous — #49's own acceptance
 * criterion is urgency without making exploration pointless, and the Ordner's
 * harassment reuses poison's tick shape (`ProjectileTagTuning`) rather than
 * inventing a second damage-over-time curve: pressure enough to notice,
 * capped low enough that standing still never turns into a death by itself.
 */
export const DEFAULT_CURSE_TUNING: Readonly<CurseTuning> = {
  curseChance: 0.35,
  sperrstundeTimerTicks: 1800,
  sperrstundeHarassmentIntervalTicks: 240,
  sperrstundeHarassmentDurationTicks: 60,
  foehnRotationRadiansPerTick: 0.01,
  foehnWindStrength: 0.05,
  blaueStundeVisionRadius: 140,
};

/**
 * Roughly half a minute to walk back from a dead stop, either path — a
 * sober run's hidden countdown and a promilled run's rise are tuned to the
 * same rough runway (`soberFailTicks` ≈ `umgfallnThreshold / promilleRisePerTick`
 * from a cold meter) so neither feels like the easier half of the mechanic.
 * A run that was already mid-drink when it died gets *less* runway than
 * that, which is the point: Blutwurz is 50% spirit, and how much spirit was
 * already spent is exactly the run's own business.
 */
export const DEFAULT_BLUTWURZ_TUNING: Readonly<BlutwurzTuning> = {
  promilleRisePerTick: 0.0025,
  soberFailTicks: 1800,
  corpseTouchRadius: 20,
  spiritMaxHealth: 1,
  recoveryMaxHealthPenalty: 2,
};

export function createTuning(): SimTuning {
  return {
    movement: { ...DEFAULT_MOVEMENT_TUNING },
    shooting: { ...DEFAULT_SHOOTING_TUNING },
    impact: { ...DEFAULT_IMPACT_TUNING },
    enemy: { ...DEFAULT_ENEMY_TUNING },
    promille: { ...DEFAULT_PROMILLE_TUNING },
    pickup: { ...DEFAULT_PICKUP_TUNING },
    projectileTags: { ...DEFAULT_PROJECTILE_TAG_TUNING },
    itemPool: { ...DEFAULT_ITEM_POOL_TUNING },
    curse: { ...DEFAULT_CURSE_TUNING },
    blutwurz: { ...DEFAULT_BLUTWURZ_TUNING },
    character: { ...DEFAULT_CHARACTER_TUNING },
    roomGen: { ...DEFAULT_ROOM_GEN_TUNING },
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
