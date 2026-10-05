import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Every poison cloud in the room (#401).
 *
 * A cloud is a lingering circle that poisons whoever stands in it: a handful
 * live at once, each for a second or two, so like projectiles they sit in a
 * pool over flat typed arrays rather than in the ECS — nothing ever refers to
 * a cloud after it is gone.
 *
 * Overflow follows `docs/DECISIONS.md` #4: the oldest cloud is recycled. A
 * cloud that has nearly finished is the one the player is least likely to be
 * standing in the middle of.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Hard ceiling; `tuning.poisonCloud.maxActive` may only lower it. */
export const CLOUD_CAPACITY = 32;

/** Who emitted a cloud, and therefore who it hurts. Enemy clouds poison only the player. */
export const CloudTeam = {
  Player: 0,
  Enemy: 1,
} as const;

export type CloudTeamId = (typeof CloudTeam)[keyof typeof CloudTeam];

export class CloudStore {
  readonly capacity = CLOUD_CAPACITY;

  readonly x = new Float32Array(CLOUD_CAPACITY);
  readonly y = new Float32Array(CLOUD_CAPACITY);
  /** Full radius, reached once `age` hits `growTicks`. */
  readonly radius = new Float32Array(CLOUD_CAPACITY);
  readonly growTicks = new Int16Array(CLOUD_CAPACITY);
  readonly lifetimeTicks = new Int16Array(CLOUD_CAPACITY);
  readonly age = new Int16Array(CLOUD_CAPACITY);
  readonly team = new Uint8Array(CLOUD_CAPACITY);

  private readonly pool = new SlotPool({
    name: 'poison-clouds',
    capacity: CLOUD_CAPACITY,
    overflow: 'recycleOldest',
  });

  get count(): number {
    return this.pool.used;
  }

  get peak(): number {
    return this.pool.peakUsed;
  }

  get overflows(): number {
    return this.pool.overflows;
  }

  /** The oldest live slot, or `NO_SLOT`. */
  get oldest(): number {
    return this.pool.oldestLive;
  }

  /** Every field is written here — see `SlotPool.acquire`. Returns `NO_SLOT` only if the pool is somehow unrecyclable. */
  spawn(
    x: number,
    y: number,
    radius: number,
    growTicks: number,
    lifetimeTicks: number,
    team: CloudTeamId,
  ): number {
    const index = this.pool.acquire();
    if (index === NO_SLOT) {
      return NO_SLOT;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.radius[index] = radius;
    this.growTicks[index] = growTicks;
    this.lifetimeTicks[index] = lifetimeTicks;
    this.age[index] = 0;
    this.team[index] = team;
    return index;
  }

  despawn(index: number): void {
    this.pool.release(index);
  }

  /** The radius right now: 0 → `radius` over `growTicks`, then flat. */
  currentRadius(index: number): number {
    const grow = this.growTicks[index] ?? 0;
    const full = this.radius[index] ?? 0;
    if (grow <= 0) {
      return full;
    }
    return full * Math.min(1, (this.age[index] ?? 0) / grow);
  }

  forEachLive(visit: (index: number) => void): void {
    this.pool.forEachLive(visit);
  }

  clear(): void {
    this.pool.reset();
  }
}
