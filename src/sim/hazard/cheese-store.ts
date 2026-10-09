import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Every cheese puddle the Obazda has left in the room.
 *
 * A puddle is a circle on the floor that stays where it was dropped and slows
 * any enemy standing in it. A handful live at once, each for several seconds,
 * so like poison clouds (`cloud-store.ts`) they sit in a pool over flat typed
 * arrays rather than in the ECS — nothing refers to a puddle once it is gone.
 *
 * Overflow follows `docs/DECISIONS.md` #4: the oldest puddle is recycled, the
 * one the player is least likely to be relying on.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** Hard ceiling on puddles in a room. */
export const CHEESE_CAPACITY = 8;

export class CheeseStore {
  readonly capacity = CHEESE_CAPACITY;

  readonly x = new Float32Array(CHEESE_CAPACITY);
  readonly y = new Float32Array(CHEESE_CAPACITY);
  readonly radius = new Float32Array(CHEESE_CAPACITY);
  readonly lifetimeTicks = new Int16Array(CHEESE_CAPACITY);
  readonly age = new Int16Array(CHEESE_CAPACITY);

  private readonly pool = new SlotPool({
    name: 'cheese-puddles',
    capacity: CHEESE_CAPACITY,
    overflow: 'recycleOldest',
  });

  get count(): number {
    return this.pool.used;
  }

  /** Every field is written here — see `SlotPool.acquire`. */
  spawn(x: number, y: number, radius: number, lifetimeTicks: number): number {
    const index = this.pool.acquire();
    if (index === NO_SLOT) {
      return NO_SLOT;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.radius[index] = radius;
    this.lifetimeTicks[index] = lifetimeTicks;
    this.age[index] = 0;
    return index;
  }

  despawn(index: number): void {
    this.pool.release(index);
  }

  forEachLive(visit: (index: number) => void): void {
    this.pool.forEachLive(visit);
  }

  clear(): void {
    this.pool.reset();
  }
}
