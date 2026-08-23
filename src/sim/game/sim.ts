import { type Component, World } from '../ecs/world.js';
import { type Entity, entityIndex } from '../ecs/entity.js';
import { ENEMY_DEFINITIONS } from '../../content/enemies/index.js';
import type { EnemyDefinition } from '../enemy/definition.js';
import { EnemyRegistry } from '../enemy/registry.js';
import { ENEMY_PROFILES, EnemySize, type EnemySizeId } from '../enemy/size.js';
import type { InputFrame } from '../input/frame.js';
import { createInputFrame } from '../input/frame.js';
import { type RunRandom, createRunRandom } from '../rng/streams.js';
import { drawDeathWord } from './death-word.js';
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
import {
  ENEMY_MOTION_STRIDE,
  ENEMY_STRIDE,
  stepEnemies,
  stepEnemyDeaths,
} from '../systems/enemy.js';
import { stepImpact, stepParticles } from '../systems/impact.js';
import { stepProjectiles, stepShooting } from '../systems/shooting.js';

/** Entity slots reserved up front. Sized well above M1's population. */
const DEFAULT_CAPACITY = 8192;

/** Collider radius of the player, in pixels. */
export const PLAYER_RADIUS = 7;

/** Collider radius of a training target — a mid-size body. */
export const TARGET_RADIUS = ENEMY_PROFILES[EnemySize.Mid].radius;

/**
 * The largest collider the broadphase grid is sized for.
 *
 * Kept alongside the grid's cell size rather than discovered from the entities
 * in it: a body larger than this needs a coarser grid, which is a decision, not
 * something to find out about in the middle of a frame.
 */
export const MAX_COLLIDER_RADIUS = 16;

/** Hit points of a training target. Four shots, so a kill is a small commitment. */
export const TARGET_HEALTH = ENEMY_PROFILES[EnemySize.Mid].health;

/** Hit points the player starts a run with, in half-Maß. */
export const PLAYER_HEALTH = 6;

export { ENEMY_PROFILES, EnemySize, type EnemyProfile, type EnemySizeId } from '../enemy/size.js';

/** Ticks before a killed body on a spawn post comes back. Two and a half seconds. */
export const TARGET_RESPAWN_TICKS = 150;

/**
 * What the room is populated with.
 *
 * Two placeholder rigs, both replaced by room templates in #18.
 *
 * `targets` is the impact-tuning rig: inert bodies that stand where they are
 * put and come back a couple of seconds after they are killed. Tuning impact
 * feel means killing the same thing several hundred times, and a target that
 * walks away mid-tune is a target that measures something else.
 *
 * `enemies` is the game: authored definitions out of `src/content/enemies/`,
 * behaving. It is what `npm run dev` starts, and what the milestone's question
 * — is it fun to shoot things — is actually asked of.
 *
 * `empty` is a room holding the player and nothing else, for a caller that
 * populates it itself. The performance stress scene is the one that does: its
 * whole point is a population stated exactly — 200 enemies, not 200 plus
 * whichever six bodies a placeholder rig happened to leave standing there.
 */
export type RoomPopulation = 'targets' | 'enemies' | 'empty';

export interface GameSimOptions {
  readonly seed?: number;
  readonly capacity?: number;
  readonly room?: RoomGeometry;
  /** Projectile pool size. Lowered by tests that want to watch it overflow. */
  readonly projectileCapacity?: number;
  readonly particleCapacity?: number;
  /** Defaults to `targets`; see `RoomPopulation`. */
  readonly population?: RoomPopulation;
  /** Enemy data. Defaults to everything in `src/content/enemies/`. */
  readonly enemies?: readonly EnemyDefinition[];
  /**
   * The headline word the *previous* run's death screen showed, if any.
   *
   * Passed in rather than tracked as global state inside the sim: a run's own
   * death-word draw has to stay a pure function of its seed and this value, or
   * two runs sharing a seed would stop producing the same word. Cross-run
   * memory belongs to whatever is starting runs, not to the run itself.
   */
  readonly previousDeathWord?: string;
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
  /**
   * Which enemy definition, which of its states, how long it has been in it,
   * and the flags a transition reads — hit, and blocked by a wall.
   *
   * The tick counter is the only behaviour timer in the game. Telegraphs,
   * invulnerability windows, fire rates and burst spacing are all derived from
   * it, so there is never a second clock to keep in step with the first.
   */
  readonly enemy: Component<Int16Array>;
  /** Current heading, then the point the body was spawned at, for `orbitPoint`. */
  readonly enemyMotion: Component<Float32Array>;
  /**
   * Which spawn post a body belongs to, or -1.
   *
   * A post brings its body back a couple of seconds after it dies. Anything
   * that was not put there by one — a Schimmelfleck's spores, a future room's
   * reinforcements — carries -1 and stays dead.
   */
  readonly spawnPost: Component<Int16Array>;

  /** Rebuilt from the position arrays every tick. */
  readonly broadphase: SpatialHash;

  /** Component mask an entity needs before the broadphase will index it. */
  readonly collidableMask: number;

  /** Component mask that marks a body as running an authored behaviour. */
  readonly enemyMask: number;

  /** Every enemy definition, validated and compiled once at construction. */
  readonly enemies: EnemyRegistry;

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

  /**
   * The player's soul and eternal pools, in half-Maß.
   *
   * Red health stays in the `health` component every entity carries, since
   * enemies and targets need it too. Soul and eternal are player-only, so they
   * live here instead of on a component the rest of the world never reads —
   * the same reasoning `screenShakeScale` and `invulnerableTicks` are plain
   * fields rather than components.
   */
  private soulHp = 0;
  private eternalHp = 0;

  /** Set once, the tick every pool empties with no eternal heart to spend. */
  private playerDeadFlag = false;
  private playerDeathTick_ = -1;
  private deathWordValue: string | undefined;

  /** Carried in from `GameSimOptions`, and never written after construction. */
  private readonly previousDeathWord: string | undefined;

  /** Ticks run since construction. */
  private currentTick = 0;

  private readonly playerHandle: Entity;

  /** Neutral input, used when a caller steps without supplying a frame. */
  private readonly idleInput = createInputFrame();

  /**
   * Where the room's bodies stand, and how long until a dead one returns.
   *
   * Respawning is a playground affordance, not a game rule. Tuning by feel
   * means killing the same thing several hundred times, and a room that empties
   * after three kills makes that a chore. Room content, and what actually
   * populates a room, is #18 and #35 — at which point posts go away and the
   * room template says what stands where.
   *
   * Only a body that a post put there comes back. Anything else — the spores a
   * Schimmelfleck leaves behind, whatever a future item summons — carries -1 in
   * its `spawnPost` and stays dead.
   */
  private readonly postX: number[] = [];
  private readonly postY: number[] = [];
  private readonly postRespawnAt: number[] = [];
  /** Size class a post brings back, when it holds no definition. */
  private readonly postSize: EnemySizeId[] = [];
  /** Enemy definition a post brings back, or -1 for a plain training target. */
  private readonly postDefinition: number[] = [];

  constructor(options: GameSimOptions = {}) {
    this.seed = options.seed ?? 0;
    this.world = new World({ capacity: options.capacity ?? DEFAULT_CAPACITY });
    this.random = createRunRandom(this.seed);
    this.room = options.room ?? createPlaygroundRoom();
    this.tuning = createTuning();
    this.previousDeathWord = options.previousDeathWord;

    this.transform = this.world.defineComponent('transform', Float32Array, 4);
    this.velocity = this.world.defineComponent('velocity', Float32Array, 2);
    this.body = this.world.defineComponent('body', Float32Array, 2);
    this.push = this.world.defineComponent('push', Float32Array, 2);
    this.collision = this.world.defineComponent('collision', Uint16Array, 2);
    this.health = this.world.defineComponent('health', Int16Array, 2);
    this.flash = this.world.defineComponent('flash', Uint8Array, 1);
    this.contactDamage = this.world.defineComponent('contactDamage', Int16Array, 1);
    this.enemy = this.world.defineComponent('enemy', Int16Array, ENEMY_STRIDE);
    this.enemyMotion = this.world.defineComponent('enemyMotion', Float32Array, ENEMY_MOTION_STRIDE);
    this.spawnPost = this.world.defineComponent('spawnPost', Int16Array, 1);
    this.collidableMask = this.world.maskOf(this.transform, this.body, this.collision);
    this.enemyMask = this.world.maskOf(this.enemy, this.enemyMotion);

    this.enemies = new EnemyRegistry(options.enemies ?? ENEMY_DEFINITIONS);

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
    const population = options.population ?? 'targets';
    if (population === 'enemies') {
      this.spawnEnemyRoom();
    } else if (population === 'targets') {
      this.spawnTrainingTargets();
    }
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

  /** Red Maß, current and max — the pool every other entity's `health` also carries. */
  get playerHealth(): number {
    return this.health.data[this.playerIndex * 2] ?? 0;
  }

  /** Weißbier, in half-Maß. Spent before red. */
  get playerSoulHealth(): number {
    return this.soulHp;
  }

  /** Schwarzbier banked. Not spent by ordinary damage — see `applyPlayerDamage`. */
  get playerEternalHealth(): number {
    return this.eternalHp;
  }

  /** Grants soul hearts. There is no pickup to drop these yet (#22); tests and the debug window call this directly. */
  addSoulHealth(amount: number): void {
    if (amount > 0) {
      this.soulHp += amount;
    }
  }

  /** Grants eternal hearts. Same caveat as `addSoulHealth`. */
  addEternalHealth(amount: number): void {
    if (amount > 0) {
      this.eternalHp += amount;
    }
  }

  /** True once every pool has emptied with no eternal heart left to spend. */
  get playerDead(): boolean {
    return this.playerDeadFlag;
  }

  /** The tick death happened on, or -1 while the player is alive. */
  get playerDeathTick(): number {
    return this.playerDeathTick_;
  }

  /**
   * The game-over screen's headline word, drawn once at the moment of death
   * and memoised — the pool draw is a real consumption of the cosmetic
   * stream, so reading this twice must not draw twice.
   */
  get deathWord(): string | undefined {
    return this.deathWordValue;
  }

  /**
   * Applies damage to the player, spending soul before red and reaching for an
   * eternal heart only when the hit would otherwise be lethal.
   *
   * This is the one place player health changes. `applyContact` and the
   * player branch of `applyHit` (`src/sim/systems/impact.ts`) both route
   * through it rather than writing `health.data` directly, which is what
   * makes the soul-before-red-before-eternal order (and the death check)
   * apply the same way regardless of what caused the hit.
   */
  applyPlayerDamage(amount: number): void {
    if (amount <= 0 || this.playerDeadFlag) {
      return;
    }

    const health = this.health.data;
    const index = this.playerIndex;
    const red = health[index * 2] ?? 0;

    // Reaching exactly zero is lethal, same as going below it — a hit does
    // not need to overkill to end a run, it only needs to use up what is left.
    if (amount >= this.soulHp + red) {
      if (this.eternalHp > 0) {
        // A killing blow with a heart banked: the heart is spent instead of
        // the run, and comes back as the one half-Maß a player needs to keep
        // standing rather than as a full refill — an eternal heart is a save,
        // not a heal.
        this.eternalHp -= 1;
        this.soulHp = 0;
        health[index * 2] = 1;
      } else {
        this.soulHp = 0;
        health[index * 2] = 0;
        this.playerDeadFlag = true;
        this.playerDeathTick_ = this.currentTick;
        this.deathWordValue = drawDeathWord(this.random.cosmetic, this.previousDeathWord);
      }
      return;
    }

    let remaining = amount;
    if (this.soulHp > 0) {
      const spend = Math.min(this.soulHp, remaining);
      this.soulHp -= spend;
      remaining -= spend;
    }
    if (remaining > 0) {
      health[index * 2] = red - remaining;
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
    if (index === this.playerIndex) {
      // The player's slot is the one thing in the world that has to outlive
      // everything else: the camera, the input and every system that says
      // "the player" resolve through it, and a freed slot is handed to the
      // next body that spawns. Losing a run is #15, and it will not be this.
      throw new Error('The player entity cannot be killed');
    }
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
    // Enemies decide after the player has moved and before bodies integrate, so
    // a body moves on the same tick as the decision that moved it.
    stepEnemies(this);
    stepBodies(this);
    stepShooting(this, input);
    stepProjectiles(this);
    stepCollision(this);
    stepContacts(this);
    stepImpact(this);
    // After impact, because impact is what pushes the death events a split
    // reads. A body that splits does so on the tick it died.
    stepEnemyDeaths(this);
    stepParticles(this);
    this.stepRespawns();

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
   * Six things to shoot at, none of which shoot back.
   *
   * The impact rig: one of each size class in reach of the middle of the room,
   * so the three read against each other rather than against a memory of the
   * last one. Nothing here behaves — that is what `spawnEnemyRoom` is for.
   */
  private spawnTrainingTargets(): void {
    const midX = (this.room.minX + this.room.maxX) / 2;
    const midY = (this.room.minY + this.room.maxY) / 2;
    this.addPost(this.room.minX + 45, midY, EnemySize.Mid, -1);
    this.addPost(this.room.maxX - 45, midY - 35, EnemySize.Mid, -1);
    this.addPost(this.room.maxX - 45, midY + 35, EnemySize.Normal, -1);
    this.addPost(midX - 55, this.room.minY + 30, EnemySize.Normal, -1);
    this.addPost(midX - 30, this.room.maxY - 30, EnemySize.Mini, -1);
    this.addPost(midX + 30, this.room.maxY - 30, EnemySize.Mini, -1);
  }

  /**
   * The floor-one roster, hand-placed until room templates land in #18.
   *
   * One of each authored enemy, arranged so that what each of them teaches is
   * legible on its own: the Kellerasseln come at the player from opposite
   * corners, the Bierratten from the other two, the Schimmelfleck sits where it
   * cannot be ignored, and the Zapfhahn covers the right-hand wall the player
   * has to cross in front of.
   */
  private spawnEnemyRoom(): void {
    const midX = (this.room.minX + this.room.maxX) / 2;
    const midY = (this.room.minY + this.room.maxY) / 2;
    this.addEnemyPost('kellerassel', this.room.minX + 40, this.room.minY + 30);
    this.addEnemyPost('kellerassel', this.room.maxX - 60, this.room.maxY - 30);
    this.addEnemyPost('bierratte', this.room.maxX - 40, this.room.minY + 26);
    this.addEnemyPost('bierratte', this.room.minX + 36, this.room.maxY - 26);
    this.addEnemyPost('schimmelfleck', midX, this.room.minY + 24);
    // Against the right-hand wall, since it is a tap in one.
    this.addEnemyPost('zapfhahn', this.room.maxX - 10, midY);
  }

  /** Puts an authored enemy on a post, by the id its definition states. */
  private addEnemyPost(id: string, x: number, y: number): void {
    this.addPost(x, y, EnemySize.Normal, this.enemies.indexOf(id));
  }

  /**
   * Adds a post and the body standing on it.
   *
   * A post holding a definition index brings that enemy back; one holding -1
   * brings back a plain training target of its size class.
   */
  private addPost(x: number, y: number, size: EnemySizeId, definition: number): void {
    this.postX.push(x);
    this.postY.push(y);
    this.postSize.push(size);
    this.postDefinition.push(definition);
    this.postRespawnAt.push(-1);
    this.spawnOnPost(this.postX.length - 1);
  }

  /** Puts what a post holds back on it, and tells the body which post that is. */
  private spawnOnPost(post: number): void {
    const x = this.postX[post] ?? 0;
    const y = this.postY[post] ?? 0;
    const definition = this.postDefinition[post] ?? -1;
    const entity =
      definition >= 0
        ? this.spawnEnemyKind(definition, x, y)
        : this.spawnEnemy(x, y, this.postSize[post] ?? EnemySize.Mid);
    this.spawnPost.data[entityIndex(entity)] = post;
  }

  /**
   * Brings back what stood on a post a couple of seconds after it died.
   *
   * A post the player is standing on waits, and keeps waiting, rather than
   * spawning a body inside them. Contact separation would sort it out over the
   * next few ticks, and every one of those ticks looks like the player being
   * born out of an enemy — or, for something heavy, like the player shoving a
   * wall-mounted tap off its wall.
   */
  private stepRespawns(): void {
    for (let post = 0; post < this.postRespawnAt.length; post++) {
      const due = this.postRespawnAt[post] ?? -1;
      if (due < 0 || this.currentTick < due) {
        continue;
      }
      if (!this.postClearOfPlayer(post)) {
        continue;
      }
      this.postRespawnAt[post] = -1;
      this.spawnOnPost(post);
    }
  }

  /** True when the body a post holds would not appear inside the player. */
  private postClearOfPlayer(post: number): boolean {
    const definition = this.postDefinition[post] ?? -1;
    const radius =
      definition >= 0
        ? this.enemies.at(definition).radius
        : ENEMY_PROFILES[this.postSize[post] ?? EnemySize.Mid].radius;

    const player = this.playerIndex;
    const dx = (this.postX[post] ?? 0) - this.positionX(player);
    const dy = (this.postY[post] ?? 0) - this.positionY(player);
    const reach = radius + (this.body.data[player * 2] ?? 0);
    return dx * dx + dy * dy > reach * reach;
  }

  /**
   * Schedules the return of the post the body at `index` was standing on.
   *
   * Read off the body rather than matched by position: a Kellerassel dies a
   * long walk from where it started, and a body that was never on a post — the
   * spores a Schimmelfleck leaves, whatever a future item summons — carries -1
   * and stays dead.
   */
  private scheduleRespawn(index: number, delayTicks: number): void {
    const post = this.spawnPost.data[index] ?? -1;
    if (post < 0 || post >= this.postRespawnAt.length) {
      return;
    }
    if ((this.postRespawnAt[post] ?? -1) >= 0) {
      return;
    }
    this.postRespawnAt[post] = this.currentTick + delayTicks;
  }

  /**
   * Adds one shootable body of a named size class.
   *
   * The size decides everything about it that the player can feel, which is the
   * point of having classes at all rather than four numbers per spawn call. It
   * does not behave: this is the body an authored enemy is built on, and what
   * the stress scene and the collision tests populate a room with.
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

  /**
   * Adds one authored enemy, by its index in the registry.
   *
   * An index rather than an id, because this is called from the enemy system
   * while a body is splitting, and a string lookup in the frame loop is one the
   * registry already did at construction.
   */
  spawnEnemyKind(definition: number, x: number, y: number): Entity {
    const compiled = this.enemies.at(definition);
    const entity = this.spawnTarget(x, y, compiled.radius);
    const index = entityIndex(entity);

    this.world.add(entity, this.enemy);
    this.world.add(entity, this.enemyMotion);

    const body = this.body.data;
    body[index * 2 + 1] = compiled.mass;

    const health = this.health.data;
    health[index * 2] = compiled.health;
    health[index * 2 + 1] = compiled.health;
    this.contactDamage.data[index] = compiled.contactDamage;

    // `add` zeroed both components, which is most of the state a body starts
    // in: no ticks in the state, and none of the flags a transition reads.
    const enemy = this.enemy.data;
    enemy[index * ENEMY_STRIDE] = definition;
    enemy[index * ENEMY_STRIDE + 1] = compiled.initialState;

    // Heading east, and the spawn point `orbitPoint` circles.
    const motion = this.enemyMotion.data;
    const motionBase = index * ENEMY_MOTION_STRIDE;
    motion[motionBase] = 1;
    motion[motionBase + 2] = x;
    motion[motionBase + 3] = y;

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
    this.world.add(entity, this.spawnPost);

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
    // Nothing brings this one back unless a post claims it.
    this.spawnPost.data[index] = -1;

    this.setCollisionLayer(index, CollisionLayer.Obstacle);
    return entity;
  }

  private setCollisionLayer(index: number, layer: CollisionLayerId): void {
    const collision = this.collision.data;
    collision[index * 2] = layer;
    collision[index * 2 + 1] = collisionMaskFor(layer);
  }
}
