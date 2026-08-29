import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Every projectile in flight.
 *
 * Projectiles do not live in the ECS world. There are up to five thousand of
 * them, they exist for well under a second each, and none of them needs a
 * generational handle — a bullet is never referred to after it is gone. What
 * they need is to be dense in memory and free to acquire, which is exactly what
 * a pool over flat typed arrays gives.
 *
 * Storage is fixed at construction and never grows.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** The performance budget, straight from docs/TECH_STACK.md §3. */
export const PROJECTILE_CAPACITY = 5000;

/** Who fired a projectile, and therefore what it is allowed to hit. */
export const ProjectileTeam = {
  Player: 0,
  Enemy: 1,
} as const;

export type ProjectileTeamId = (typeof ProjectileTeam)[keyof typeof ProjectileTeam];

export class ProjectileStore {
  readonly capacity: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Position at the end of the previous tick — for interpolation, and for sweeps. */
  readonly previousX: Float32Array;
  readonly previousY: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly radius: Float32Array;
  readonly damage: Float32Array;
  /** Ticks of life left. Reaching zero is what gives a weapon its range. */
  readonly lifetime: Int16Array;
  readonly team: Uint8Array;
  /**
   * Bumped every time a slot is reused, so a renderer or a hash bucket holding
   * a slot index can tell "still the same bullet" from "a new one in its seat".
   */
  readonly generation: Uint32Array;

  /** Bitmask of `ProjectileTag` (#27, `sim/projectile/tags.ts`). Zero on a plain shot. */
  readonly tags: Uint32Array;
  /**
   * Where this shot was fired from — the centre `orbiting` circles and the
   * point `returning` flies back to. Written once at spawn and never moved,
   * so both tags read it as a fixed reference point regardless of how far the
   * shot has since travelled.
   */
  readonly spawnX: Float32Array;
  readonly spawnY: Float32Array;
  /** Ticks this shot has been in flight. Only `returning` reads it today. */
  readonly ticksAlive: Int16Array;
  /** Enemies a `piercing` shot may still fly through before it is stopped for good. */
  readonly pierceRemaining: Int16Array;
  /** Bounces a `bouncing` shot has left. */
  readonly bounceRemaining: Int16Array;
  /** Generations of `splitting` left. A split child is spawned with one fewer, which is what bounds the recursion. */
  readonly splitDepth: Uint8Array;
  /** The body a `sticky` shot has embedded itself in, or -1 if it has not stuck to anything. */
  readonly stickyTarget: Int32Array;
  /**
   * The body most recently hit, or -1.
   *
   * Exists only so a `piercing`/`bouncing` shot that survives a hit does not
   * register a second hit against the same body next tick before it has
   * physically cleared it — see `sim/systems/collision.ts`'s `testCandidate`.
   * Cleared the moment a tick's sweep finds nothing, which is what lets the
   * same body be hit again later (an orbiting shot lapping past it, say).
   */
  readonly lastHitTarget: Int32Array;
  /**
   * Which projectile sprite this shot is drawn as (#152) — an index into
   * `EnemyRegistry.projectileArtNames`, 0 for "the default for this team".
   *
   * Presentational, and in the store rather than in the renderer because the
   * renderer has no other way to know: a shot in flight is nine typed arrays
   * and nothing that remembers who fired it. A small integer rather than a
   * string keeps the array a `Uint8Array` and the frame loop free of string
   * comparison, the same reasoning `EnemyRegistry` already applies to state
   * and transition names.
   *
   * It cannot affect a replay — nothing in `step` reads it — but it is still
   * written by `spawn` like every other field, because "trusting `despawn` to
   * have cleared them is the classic pooling bug" applies to a cosmetic field
   * exactly as much as to a lethal one: a fresh shot inheriting the last
   * occupant's sprite is a bug a player would see.
   */
  readonly art: Uint8Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = PROJECTILE_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.radius = new Float32Array(capacity);
    this.damage = new Float32Array(capacity);
    this.lifetime = new Int16Array(capacity);
    this.team = new Uint8Array(capacity);
    this.generation = new Uint32Array(capacity);
    this.tags = new Uint32Array(capacity);
    this.art = new Uint8Array(capacity);
    this.spawnX = new Float32Array(capacity);
    this.spawnY = new Float32Array(capacity);
    this.ticksAlive = new Int16Array(capacity);
    this.pierceRemaining = new Int16Array(capacity);
    this.bounceRemaining = new Int16Array(capacity);
    this.splitDepth = new Uint8Array(capacity);
    this.stickyTarget = new Int32Array(capacity);
    this.lastHitTarget = new Int32Array(capacity);

    // Recycling the oldest is what keeps the player's own shots appearing in a
    // room already full of bullets: the shot being fired right now is never the
    // oldest one, so what gets dropped is something already on its way out.
    this.pool = new SlotPool({ name: 'projectiles', capacity, overflow: 'recycleOldest' });
  }

  get liveCount(): number {
    return this.pool.used;
  }

  get peakLive(): number {
    return this.pool.peakUsed;
  }

  get overflows(): number {
    return this.pool.overflows;
  }

  isLive(index: number): boolean {
    return this.pool.isUsed(index);
  }

  /**
   * Puts a projectile in flight and returns its slot.
   *
   * Every field is written here. Trusting `despawn` to have cleared them is the
   * classic pooling bug and it produces genuinely baffling symptoms — a fresh
   * projectile that is somehow already homing — so nothing is assumed about
   * what the previous occupant left behind.
   */
  spawn(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    radius: number,
    damage: number,
    lifetime: number,
    team: ProjectileTeamId,
    tags = 0,
    art = 0,
  ): number {
    const index = this.pool.acquire();
    if (index === NO_SLOT) {
      return NO_SLOT;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.previousX[index] = x;
    this.previousY[index] = y;
    this.velocityX[index] = velocityX;
    this.velocityY[index] = velocityY;
    this.radius[index] = radius;
    this.damage[index] = damage;
    this.lifetime[index] = lifetime;
    this.team[index] = team;
    this.generation[index] = ((this.generation[index] ?? 0) + 1) >>> 0;
    // Tag composition state. `tags` may still change after this — an item's
    // `onProjectileSpawn` hook can add more before the shot is finalised — so
    // `finalizeProjectileTags` (`sim/projectile/behavior.ts`) is what actually
    // derives `pierceRemaining`/`bounceRemaining`/`splitDepth` from whatever
    // the mask ends up being; this only has to seed the fields every path
    // needs regardless of tags, the same "everything written here" reasoning
    // as every field above.
    this.tags[index] = tags;
    this.spawnX[index] = x;
    this.spawnY[index] = y;
    this.ticksAlive[index] = 0;
    this.pierceRemaining[index] = 0;
    this.bounceRemaining[index] = 0;
    this.splitDepth[index] = 0;
    this.stickyTarget[index] = -1;
    this.lastHitTarget[index] = -1;
    this.art[index] = art;
    return index;
  }

  despawn(index: number): void {
    this.pool.release(index);
  }

  /** Visits every projectile in flight, oldest first. Safe to despawn from inside. */
  forEachLive(visit: (index: number) => void): void {
    this.pool.forEachLive(visit);
  }

  /** Clears the field. Used when a room ends and when a run restarts. */
  clear(): void {
    this.pool.reset();
  }
}
