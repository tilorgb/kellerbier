import { type Component, World } from '../ecs/world.js';
import { type Entity, entityIndex } from '../ecs/entity.js';
import type { InputFrame } from '../input/frame.js';
import { createInputFrame } from '../input/frame.js';
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import type { RoomGeometry } from '../room/geometry.js';
import { createPlaygroundRoom } from '../room/playground.js';
import { type SimTuning, createTuning } from '../tuning.js';
import { type CollisionLayerId, CollisionLayer, collisionMaskFor } from '../collision/layers.js';
import { SpatialHash } from '../collision/spatial-hash.js';
import { EventQueue } from '../events/queue.js';
import { DamageNumberStore } from '../particle/damage-numbers.js';
import { DecalStore } from '../particle/decals.js';
import { ParticleStore } from '../particle/store.js';
import { ProjectileStore } from '../projectile/store.js';
import { stepPlayerMovement } from '../systems/movement.js';
import { stepBodies } from '../systems/bodies.js';
import { stepCollision } from '../systems/collision.js';
import { stepContacts } from '../systems/contact.js';
import { stepImpact, stepParticles } from '../systems/impact.js';
import { stepProjectiles, stepShooting } from '../systems/shooting.js';

/** Entity slots reserved up front. Sized well above M1's population. */
const DEFAULT_CAPACITY = 8192;

/** Collider radius of the player, in pixels. */
export const PLAYER_RADIUS = 7;

/** Collider radius of a training target. */
export const TARGET_RADIUS = 10;

/**
 * The largest collider the broadphase grid is sized for.
 *
 * Kept alongside the grid's cell size rather than discovered from the entities
 * in it: a body larger than this needs a coarser grid, which is a decision, not
 * something to find out about in the middle of a frame.
 */
export const MAX_COLLIDER_RADIUS = 16;

/** Hit points of a training target. Four shots, so a kill is a small commitment. */
export const TARGET_HEALTH = 4;

/** Hit points the player starts a run with, in half-Maß. */
export const PLAYER_HEALTH = 6;

/**
 * Enemy size classes.
 *
 * Three of them, because size is the first thing a player reads about something
 * walking at them and it has to mean something consistent: how hard it is to
 * hit, how far it flies when hit, whether it can be walked through, and what it
 * costs to touch. The names are the reference points — a mini is an Isaac fly,
 * a normal is a worm, a mid is heavy enough to stop you.
 */
export const EnemySize = {
  Mini: 0,
  Normal: 1,
  Mid: 2,
} as const;

export type EnemySizeId = (typeof EnemySize)[keyof typeof EnemySize];

export interface EnemyProfile {
  readonly radius: number;
  /** What knockback and contact separation are divided by. */
  readonly mass: number;
  readonly health: number;
  /**
   * Damage dealt by touching it, in half-Maß. Zero for the ones that are only
   * in the way — not everything that can be walked into is a threat, and a room
   * where every body hurts is a room with nowhere to stand.
   */
  readonly contactDamage: number;
}

/**
 * Masses are relative to the player's 1, and every one of them is above it.
 *
 * Even the smallest: a body light enough to walk through is a body that cannot
 * hold the player anywhere, and holding the player somewhere is the entire job
 * of a swarm. Three gnats at 1.2 each stop a run cold between them, which is
 * what makes the thing shooting from across the room dangerous.
 */
export const ENEMY_PROFILES: Readonly<Record<EnemySizeId, EnemyProfile>> = {
  [EnemySize.Mini]: { radius: 4, mass: 1.2, health: 1, contactDamage: 1 },
  [EnemySize.Normal]: { radius: 7, mass: 3, health: 2, contactDamage: 0 },
  [EnemySize.Mid]: { radius: TARGET_RADIUS, mass: 6, health: TARGET_HEALTH, contactDamage: 2 },
};

/** Ticks before a killed training target comes back. Two and a half seconds. */
export const TARGET_RESPAWN_TICKS = 150;

export interface GameSimOptions {
  readonly seed?: number;
  readonly capacity?: number;
  readonly room?: RoomGeometry;
  /** Projectile pool size. Lowered by tests that want to watch it overflow. */
  readonly projectileCapacity?: number;
  readonly particleCapacity?: number;
}

/**
 * One running game.
 *
 * Owns the world, the component storage, the room and the tuning, and advances
 * all of it by exactly one tick at a time. It reads a single `InputFrame` per
 * tick and nothing else — no clock, no DOM, no renderer — which is what makes a
 * run reproducible from a seed and an input log.
 */
export class GameSim {
  readonly world: World;
  readonly random: RunRandom;
  readonly room: RoomGeometry;
  readonly tuning: SimTuning;
  readonly seed: number;

  /** Position and the previous tick's position, for render interpolation. */
  readonly transform: Component<Float32Array>;
  /** Velocity in pixels per tick. */
  readonly velocity: Component<Float32Array>;
  /** Collider radius and mass. Mass is what knockback is divided by. */
  readonly body: Component<Float32Array>;
  /**
   * External impulses — firing kickback, and knockback once things can be hit.
   *
   * Kept out of velocity so that clamping a body to its top speed does not
   * silently eat every push the game applies to it.
   */
  readonly push: Component<Float32Array>;
  /** Collision layer and the mask of layers it interacts with. */
  readonly collision: Component<Uint16Array>;
  /** Current and maximum hit points. Maximum 0 means the body cannot be hurt. */
  readonly health: Component<Int16Array>;
  /** Damage dealt by touching a body. Zero on everything harmless. */
  readonly contactDamage: Component<Int16Array>;
  /**
   * Ticks left of the white hit flash.
   *
   * Presentation state, kept in the simulation on purpose: a replay that draws
   * a different flash than the run it recorded is not evidence of anything.
   */
  readonly flash: Component<Uint8Array>;

  /** Rebuilt from the position arrays every tick. */
  readonly broadphase: SpatialHash;

  /** Component mask an entity needs before the broadphase will index it. */
  readonly collidableMask: number;

  /** Everything in flight. Pooled, fixed capacity, never grows. */
  readonly projectiles: ProjectileStore;

  /** Foam and splash. Pooled, and drawn from the seeded cosmetic stream. */
  readonly particles: ParticleStore;

  /** Floating damage numbers. Off by default — see the store for why. */
  readonly damageNumbers: DamageNumberStore;

  /** Splashes left where something died. They persist for the room. */
  readonly decals: DecalStore;

  /**
   * This tick's events.
   *
   * Cleared at the *start* of a step rather than the end, so that whatever ran
   * the step — a renderer, a test — can read what happened during it.
   */
  readonly events: EventQueue;

  /** Ticks until the player may fire again. */
  fireCooldown = 0;

  /**
   * Ticks the simulation is frozen for.
   *
   * Hitstop lives here rather than in the loop. Freezing the loop would stop
   * the clock and desynchronise the fixed timestep; freezing *inside* a tick
   * keeps ticks running at exactly 60 a second, keeps input frames being
   * consumed in lockstep, and keeps the whole thing a pure function of the
   * seed and the input log — so a replay freezes in the same places.
   */
  private hitstopTicks = 0;

  /** Current screenshake offset, in pixels, and the direction it points. */
  private shakeMagnitude = 0;
  private shakeDirectionX = 0;
  private shakeDirectionY = 0;

  /**
   * Accessibility scale on screenshake, 0 to 1.
   *
   * Reaches zero, and zero means no camera motion at all rather than a little
   * less of it. The full accessibility suite is #53; this one is here now
   * because shipping shake without an off switch is not a thing to do
   * temporarily.
   */
  screenShakeScale = 1;

  /**
   * Ticks left before the player may be hurt by contact again.
   *
   * Without it a body touching the player empties them at sixty damage a
   * second, which is not a difficulty setting, it is an instant death with
   * extra steps.
   */
  private invulnerableTicks = 0;

  /** Ticks run since construction. */
  private currentTick = 0;

  private readonly playerHandle: Entity;

  /** Neutral input, used when a caller steps without supplying a frame. */
  private readonly idleInput = createInputFrame();

  /**
   * Where the training targets stand, and how long until a dead one returns.
   *
   * Respawning is a playground affordance, not a game rule. Tuning impact feel
   * means killing the same thing several hundred times, and a room that empties
   * after three kills makes that a chore. Room content, and what actually
   * populates a room, is #18 and #35.
   */
  private readonly targetSpawnX: number[] = [];
  private readonly targetSpawnY: number[] = [];
  private readonly targetRespawnAt: number[] = [];
  /** Size class each respawn post brings back. */
  private readonly targetSize: EnemySizeId[] = [];

  constructor(options: GameSimOptions = {}) {
    this.seed = options.seed ?? 0;
    this.world = new World({ capacity: options.capacity ?? DEFAULT_CAPACITY });
    this.random = createRunRandom(this.seed);
    this.room = options.room ?? createPlaygroundRoom();
    this.tuning = createTuning();

    this.transform = this.world.defineComponent('transform', Float32Array, 4);
    this.velocity = this.world.defineComponent('velocity', Float32Array, 2);
    this.body = this.world.defineComponent('body', Float32Array, 2);
    this.push = this.world.defineComponent('push', Float32Array, 2);
    this.collision = this.world.defineComponent('collision', Uint16Array, 2);
    this.health = this.world.defineComponent('health', Int16Array, 2);
    this.flash = this.world.defineComponent('flash', Uint8Array, 1);
    this.contactDamage = this.world.defineComponent('contactDamage', Int16Array, 1);
    this.collidableMask = this.world.maskOf(this.transform, this.body, this.collision);

    this.broadphase = new SpatialHash({
      // The grid spans the room from the origin. Coordinates outside it clamp
      // to an edge cell, so the margin only has to cover the largest collider.
      width: this.room.maxX + MAX_COLLIDER_RADIUS,
      height: this.room.maxY + MAX_COLLIDER_RADIUS,
      capacity: options.capacity ?? DEFAULT_CAPACITY,
      maxRadius: MAX_COLLIDER_RADIUS,
    });

    this.projectiles = new ProjectileStore(options.projectileCapacity);
    this.particles = new ParticleStore(options.particleCapacity);
    this.damageNumbers = new DamageNumberStore();
    this.decals = new DecalStore();
    this.events = new EventQueue();

    this.playerHandle = this.spawnPlayer();
    this.spawnTrainingTargets();
    this.world.flush();
  }

  get tick(): number {
    return this.currentTick;
  }

  get player(): Entity {
    return this.playerHandle;
  }

  /** The player's storage slot. Stable for the lifetime of the run. */
  get playerIndex(): number {
    return entityIndex(this.playerHandle);
  }

  /** Advances the simulation exactly one tick. */
  /** Ticks left of the player's contact invulnerability. Zero means they can be hurt. */
  get playerInvulnerableTicks(): number {
    return this.invulnerableTicks;
  }

  /** Ages the invulnerability by one tick. Called once a tick by the contact system. */
  tickPlayerInvulnerability(): void {
    if (this.invulnerableTicks > 0) {
      this.invulnerableTicks -= 1;
    }
  }

  /** Starts the player's invulnerability window. Never shortens one already running. */
  makePlayerInvulnerable(ticks: number): void {
    if (ticks > this.invulnerableTicks) {
      this.invulnerableTicks = ticks;
    }
  }

  /** True while the simulation is frozen by hitstop. */
  get frozen(): boolean {
    return this.hitstopTicks > 0;
  }

  get hitstop(): number {
    return this.hitstopTicks;
  }

  /** Camera offset for this tick, after the accessibility scale. */
  get shakeX(): number {
    return this.shakeDirectionX * this.shakeMagnitude * this.screenShakeScale;
  }

  get shakeY(): number {
    return this.shakeDirectionY * this.shakeMagnitude * this.screenShakeScale;
  }

  /** Unscaled shake magnitude, for the debug overlay. */
  get shake(): number {
    return this.shakeMagnitude;
  }

  /**
   * Freezes the simulation for up to `ticks`.
   *
   * The longest request wins rather than the sum: two enemies dying on the same
   * tick should feel like one big hit, not like the game stalling twice.
   */
  requestHitstop(ticks: number): void {
    if (ticks > this.hitstopTicks) {
      this.hitstopTicks = ticks;
    }
  }

  /**
   * Adds directional screenshake, capped hard.
   *
   * The cap is not a suggestion. Shake that scales without a ceiling turns the
   * best moment of a run into motion sickness.
   */
  addShake(directionX: number, directionY: number, magnitude: number): void {
    const cap = this.tuning.impact.maxShake;
    this.shakeMagnitude = Math.min(cap, this.shakeMagnitude + magnitude);
    // The newest hit sets the direction; a shake is a punch, not an average.
    if (directionX !== 0 || directionY !== 0) {
      this.shakeDirectionX = directionX;
      this.shakeDirectionY = directionY;
    }
  }

  /**
   * Removes a body from the world, leaving a splash where it stood.
   *
   * The splash persists for the room. A floor that gradually becomes a record
   * of the fight is worth one sprite per kill.
   */
  kill(index: number): void {
    const random = this.random.cosmetic;
    this.decals.spawn(
      this.positionX(index),
      this.positionY(index),
      // Smaller than the body that left it. A splash wider than the thing that
      // died reads as the floor having been painted rather than as a corpse.
      (this.body.data[index * 2] ?? 8) * (0.7 + random.nextFloat() * 0.4),
      random.nextFloat() * Math.PI * 2,
    );
    this.scheduleRespawn(index, TARGET_RESPAWN_TICKS);
    this.world.destroy(this.world.entityAt(index));
  }

  step(input: Readonly<InputFrame> = this.idleInput): void {
    this.events.clear();

    // Hitstop freezes everything, including the flash that caused it — which is
    // the point: the white frame is held up for the player to see.
    if (this.hitstopTicks > 0) {
      this.hitstopTicks -= 1;
      this.currentTick += 1;
      return;
    }

    // Presentation decays at the start of a tick, so an effect started at the
    // end of this one survives to be drawn.
    this.decayPresentation();

    // Order matters and is fixed: the player moves, then fires from where they
    // now are, then everything already in flight advances. Anything else and a
    // shot appears a tick behind the player who fired it.
    stepPlayerMovement(this, input);
    stepBodies(this);
    stepShooting(this, input);
    stepProjectiles(this);
    stepCollision(this);
    stepContacts(this);
    stepImpact(this);
    stepParticles(this);
    this.stepTargetRespawns();

    this.world.flush();
    this.currentTick += 1;
  }

  /** Ages the flash on every body and bleeds the shake down. */
  private decayPresentation(): void {
    const flash = this.flash.data;
    const highWater = this.world.highWater;
    for (let index = 0; index < highWater; index++) {
      const ticks = flash[index] ?? 0;
      if (ticks > 0) {
        flash[index] = ticks - 1;
      }
    }

    this.shakeMagnitude *= this.tuning.impact.shakeDamping;
    // Below a fifth of a pixel the camera is not moving, it is jittering.
    if (this.shakeMagnitude < 0.2) {
      this.shakeMagnitude = 0;
    }
  }

  /** Reads a transform field without the index arithmetic at every call site. */
  positionX(index: number): number {
    return this.transform.data[index * 4] ?? 0;
  }

  positionY(index: number): number {
    return this.transform.data[index * 4 + 1] ?? 0;
  }

  previousX(index: number): number {
    return this.transform.data[index * 4 + 2] ?? 0;
  }

  previousY(index: number): number {
    return this.transform.data[index * 4 + 3] ?? 0;
  }

  private spawnPlayer(): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);

    const index = entityIndex(entity);
    const startX = (this.room.minX + this.room.maxX) / 2;
    const startY = (this.room.minY + this.room.maxY) / 2;
    const transform = this.transform.data;
    transform[index * 4] = startX;
    transform[index * 4 + 1] = startY;
    transform[index * 4 + 2] = startX;
    transform[index * 4 + 3] = startY;

    const body = this.body.data;
    body[index * 2] = PLAYER_RADIUS;
    body[index * 2 + 1] = 1;

    const health = this.health.data;
    health[index * 2] = PLAYER_HEALTH;
    health[index * 2 + 1] = PLAYER_HEALTH;
    this.contactDamage.data[index] = 0;

    this.setCollisionLayer(index, CollisionLayer.Player);

    return entity;
  }

  /**
   * Three things to shoot at.
   *
   * Placeholders, and deliberately the smallest ones that make the collision
   * pipeline visible end to end. The first real enemy — with behaviour, health
   * and a reason to exist — is #14.
   */
  private spawnTrainingTargets(): void {
    const midX = (this.room.minX + this.room.maxX) / 2;
    const midY = (this.room.minY + this.room.maxY) / 2;
    // One of each size in reach of the middle of the room, so the three read
    // against each other rather than against a memory of the last one.
    this.addTrainingTarget(this.room.minX + 45, midY, EnemySize.Mid);
    this.addTrainingTarget(this.room.maxX - 45, midY - 35, EnemySize.Mid);
    this.addTrainingTarget(this.room.maxX - 45, midY + 35, EnemySize.Normal);
    this.addTrainingTarget(midX - 55, this.room.minY + 30, EnemySize.Normal);
    this.addTrainingTarget(midX - 30, this.room.maxY - 30, EnemySize.Mini);
    this.addTrainingTarget(midX + 30, this.room.maxY - 30, EnemySize.Mini);
  }

  private addTrainingTarget(x: number, y: number, size: EnemySizeId): void {
    this.targetSpawnX.push(x);
    this.targetSpawnY.push(y);
    this.targetSize.push(size);
    this.targetRespawnAt.push(-1);
    this.spawnEnemy(x, y, size);
  }

  /** Brings back a training target a couple of seconds after it was killed. */
  private stepTargetRespawns(): void {
    for (let post = 0; post < this.targetRespawnAt.length; post++) {
      const due = this.targetRespawnAt[post] ?? -1;
      if (due < 0 || this.currentTick < due) {
        continue;
      }
      this.targetRespawnAt[post] = -1;
      this.spawnEnemy(
        this.targetSpawnX[post] ?? 0,
        this.targetSpawnY[post] ?? 0,
        this.targetSize[post] ?? EnemySize.Mid,
      );
    }
  }

  /**
   * Schedules the return of whichever post the body at `index` was standing on.
   *
   * Matched by position, because the entity is on its way out and its slot is
   * about to be recycled.
   */
  private scheduleRespawn(index: number, delayTicks: number): void {
    const x = this.positionX(index);
    const y = this.positionY(index);
    let closest = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let post = 0; post < this.targetSpawnX.length; post++) {
      if ((this.targetRespawnAt[post] ?? -1) >= 0) {
        continue;
      }
      const dx = x - (this.targetSpawnX[post] ?? 0);
      const dy = y - (this.targetSpawnY[post] ?? 0);
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = post;
      }
    }
    if (closest >= 0) {
      this.targetRespawnAt[closest] = this.currentTick + delayTicks;
    }
  }

  /**
   * Adds one shootable body.
   *
   * Public because the stress scene and the collision tests need to build a
   * populated room, and because it is what #14 will grow into.
   */
  /**
   * Adds one body of a named size class.
   *
   * The size decides everything about it that the player can feel, which is the
   * point of having classes at all rather than four numbers per spawn call.
   */
  spawnEnemy(x: number, y: number, size: EnemySizeId): Entity {
    const profile = ENEMY_PROFILES[size];
    const entity = this.spawnTarget(x, y, profile.radius);
    const index = entityIndex(entity);

    const body = this.body.data;
    body[index * 2 + 1] = profile.mass;

    const health = this.health.data;
    health[index * 2] = profile.health;
    health[index * 2 + 1] = profile.health;

    this.contactDamage.data[index] = profile.contactDamage;
    return entity;
  }

  spawnTarget(x: number, y: number, radius: number = TARGET_RADIUS): Entity {
    const entity = this.world.create();
    this.world.add(entity, this.transform);
    this.world.add(entity, this.velocity);
    this.world.add(entity, this.body);
    this.world.add(entity, this.push);
    this.world.add(entity, this.collision);
    this.world.add(entity, this.health);
    this.world.add(entity, this.contactDamage);
    this.world.add(entity, this.flash);

    const index = entityIndex(entity);
    const transform = this.transform.data;
    transform[index * 4] = x;
    transform[index * 4 + 1] = y;
    transform[index * 4 + 2] = x;
    transform[index * 4 + 3] = y;

    const body = this.body.data;
    body[index * 2] = radius;
    body[index * 2 + 1] = 3;

    const health = this.health.data;
    health[index * 2] = TARGET_HEALTH;
    health[index * 2 + 1] = TARGET_HEALTH;

    // Written rather than assumed clear: slots are recycled, and a body that
    // inherited the contact damage of whatever last used its slot is a bug that
    // only shows up after something died.
    this.contactDamage.data[index] = 0;

    this.setCollisionLayer(index, CollisionLayer.Obstacle);
    return entity;
  }

  private setCollisionLayer(index: number, layer: CollisionLayerId): void {
    const collision = this.collision.data;
    collision[index * 2] = layer;
    collision[index * 2 + 1] = collisionMaskFor(layer);
  }
}
