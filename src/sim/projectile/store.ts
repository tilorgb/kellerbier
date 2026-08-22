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
