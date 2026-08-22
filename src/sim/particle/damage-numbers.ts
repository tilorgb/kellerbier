import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Floating damage numbers.
 *
 * Off by default, and that is a design position rather than an oversight: a
 * number popping off every enemy tells the player how much damage they did, and
 * simultaneously tells them to read numbers instead of watching the fight. It
 * is here because some players genuinely want it, and because a build-defence
 * item eventually needs a way to show that it is doing something.
 */

/** Numbers on screen at once. Small: past a handful they are unreadable anyway. */
export const DAMAGE_NUMBER_CAPACITY = 32;

export class DamageNumberStore {
  readonly capacity: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly previousX: Float32Array;
  readonly previousY: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  readonly life: Int16Array;
  readonly maxLife: Int16Array;
  readonly amount: Float32Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = DAMAGE_NUMBER_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.life = new Int16Array(capacity);
    this.maxLife = new Int16Array(capacity);
    this.amount = new Float32Array(capacity);

    this.pool = new SlotPool({ name: 'damage numbers', capacity, overflow: 'recycleOldest' });
  }

  get liveCount(): number {
    return this.pool.used;
  }

  spawn(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    life: number,
    amount: number,
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
    this.life[index] = life;
    this.maxLife[index] = life;
    this.amount[index] = amount;
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
