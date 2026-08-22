import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Splashes left on the floor where something died.
 *
 * They persist for the room rather than fading. That is the whole value of
 * them: a floor that gradually becomes a record of the fight tells the player
 * that what they did mattered, and it costs one sprite each. A decal that fades
 * out after two seconds is a particle with extra steps.
 */

/** Decals kept at once. The oldest gives way rather than the floor filling up. */
export const DECAL_CAPACITY = 64;

export class DecalStore {
  readonly capacity: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: Float32Array;
  /** Rotation in radians, so a floor of splashes does not look stamped. */
  readonly rotation: Float32Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = DECAL_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.rotation = new Float32Array(capacity);
    this.pool = new SlotPool({ name: 'decals', capacity, overflow: 'recycleOldest' });
  }

  get liveCount(): number {
    return this.pool.used;
  }

  spawn(x: number, y: number, size: number, rotation: number): number {
    const index = this.pool.acquire();
    if (index === NO_SLOT) {
      return NO_SLOT;
    }
    this.x[index] = x;
    this.y[index] = y;
    this.size[index] = size;
    this.rotation[index] = rotation;
    return index;
  }

  forEachLive(visit: (index: number) => void): void {
    this.pool.forEachLive(visit);
  }

  /** Called when a room is left. Splashes do not follow the player around. */
  clear(): void {
    this.pool.reset();
  }
}
