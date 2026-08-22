import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * Every particle on screen.
 *
 * Particles live in the simulation rather than the renderer, and they draw from
 * the seeded cosmetic random stream. That looks like over-engineering until a
 * replay is watched back and the foam sprays a different way than it did the
 * first time — the run is still correct, but it no longer looks like the thing
 * that was recorded, and a replay that does not match is not evidence of
 * anything.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** The budget from docs/TECH_STACK.md §3. */
export const PARTICLE_CAPACITY = 1000;

/** What a particle is, which decides how it is drawn and how it moves. */
export const ParticleKind = {
  /** Beer foam: light, drags hard, fades. */
  Foam: 0,
  /** Heavier splash thrown on death. */
  Splash: 1,
} as const;

export type ParticleKindId = (typeof ParticleKind)[keyof typeof ParticleKind];

export class ParticleStore {
  readonly capacity: number;

  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly previousX: Float32Array;
  readonly previousY: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityY: Float32Array;
  /** Ticks left, and what it started at, so a fade can be a fraction. */
  readonly life: Int16Array;
  readonly maxLife: Int16Array;
  readonly size: Float32Array;
  readonly kind: Uint8Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = PARTICLE_CAPACITY) {
    this.capacity = capacity;
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.previousX = new Float32Array(capacity);
    this.previousY = new Float32Array(capacity);
    this.velocityX = new Float32Array(capacity);
    this.velocityY = new Float32Array(capacity);
    this.life = new Int16Array(capacity);
    this.maxLife = new Int16Array(capacity);
    this.size = new Float32Array(capacity);
    this.kind = new Uint8Array(capacity);

    // The newest burst is the one the player is looking at, so an old particle
    // still drifting from a kill three seconds ago gives up its slot for it.
    this.pool = new SlotPool({ name: 'particles', capacity, overflow: 'recycleOldest' });
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

  /** Emits one particle. Every field is written; nothing is inherited. */
  spawn(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    life: number,
    size: number,
    kind: ParticleKindId,
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
    this.size[index] = size;
    this.kind[index] = kind;
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
