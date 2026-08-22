/**
 * A fixed-capacity pool of storage slots.
 *
 * Nothing transient in this game is allocated mid-frame. A pool is preallocated
 * to its capacity once, hands out *indices* into Structure-of-Arrays storage
 * rather than objects, and never grows — growing mid-frame is the allocation
 * this design exists to avoid, and doing it while the screen is busiest is
 * exactly when it would hurt most.
 *
 * Slots are tracked in two structures: a free stack, so acquiring is O(1), and
 * an intrusive age list threaded through the live slots, so "the oldest live
 * slot" is also O(1). The age list is what makes the overflow policy possible.
 *
 * @hot — runs in the frame loop. Nothing in here may allocate; see the
 * `no-hot-allocation` rule in tools/eslint/.
 */

/** No slot. Returned by `acquire` under a rejecting overflow policy. */
export const NO_SLOT = -1;

/**
 * What a pool does when every slot is taken.
 *
 * `recycleOldest` steals the longest-lived slot and hands it back. For
 * projectiles this is the right answer and not merely the convenient one: the
 * shot being fired right now is never the oldest, so a player who is holding
 * fire in a room full of bullets keeps seeing their own shots appear. The thing
 * that disappears is a bullet already on its way off-screen.
 *
 * `reject` refuses instead, for pools where a silently vanished element would
 * be a correctness bug rather than a cosmetic one.
 */
export type PoolOverflowPolicy = 'recycleOldest' | 'reject';

export interface SlotPoolOptions {
  /** Used in the overflow warning and in the debug overlay's statistics. */
  readonly name: string;
  readonly capacity: number;
  readonly overflow?: PoolOverflowPolicy;
  /**
   * Called with a slot about to be recycled out from under its current owner,
   * so the owner can drop any reference it holds — a sprite, a hash bucket.
   */
  readonly onRecycle?: (index: number) => void;
}

export class SlotPool {
  readonly name: string;
  readonly capacity: number;
  readonly overflow: PoolOverflowPolicy;

  private readonly freeStack: Int32Array;
  private freeTop = 0;

  private readonly inUse: Uint8Array;

  /** Intrusive doubly-linked age list: `head` is the oldest live slot. */
  private readonly olderThan: Int32Array;
  private readonly newerThan: Int32Array;
  private oldest = NO_SLOT;
  private newest = NO_SLOT;

  private readonly onRecycle: ((index: number) => void) | undefined;

  private liveCount = 0;
  private peak = 0;
  private overflowCount = 0;
  private warnedAboutOverflow = false;

  constructor(options: SlotPoolOptions) {
    if (!Number.isInteger(options.capacity) || options.capacity < 1) {
      throw new RangeError(
        `Pool "${options.name}" needs a positive integer capacity, got ${String(options.capacity)}`,
      );
    }

    this.name = options.name;
    this.capacity = options.capacity;
    this.overflow = options.overflow ?? 'recycleOldest';
    this.onRecycle = options.onRecycle;

    this.freeStack = new Int32Array(options.capacity);
    this.inUse = new Uint8Array(options.capacity);
    this.olderThan = new Int32Array(options.capacity);
    this.newerThan = new Int32Array(options.capacity);
    this.reset();
  }

  /** Slots currently handed out. */
  get used(): number {
    return this.liveCount;
  }

  get free(): number {
    return this.capacity - this.liveCount;
  }

  /**
   * The highest `used` ever reached. This is the number that says whether a
   * capacity is right: a peak that never approaches capacity is memory spent
   * for nothing, and one that sits at capacity means elements are vanishing.
   */
  get peakUsed(): number {
    return this.peak;
  }

  /** Times an acquire found the pool full. Non-zero means capacity is too low. */
  get overflows(): number {
    return this.overflowCount;
  }

  /** The oldest live slot, or `NO_SLOT`. */
  get oldestLive(): number {
    return this.oldest;
  }

  isUsed(index: number): boolean {
    return this.inUse[index] === 1;
  }

  /**
   * Takes a slot, or applies the overflow policy.
   *
   * The caller must write every field of the slot it gets back. Relying on the
   * release path to have cleared them is the classic pooling bug — it produces
   * a fresh projectile that is somehow already homing — so nothing here
   * pretends a recycled slot is blank.
   */
  acquire(): number {
    if (this.freeTop === 0) {
      this.overflowCount += 1;
      this.warnOnce();
      if (this.overflow === 'reject' || this.oldest === NO_SLOT) {
        return NO_SLOT;
      }
      const stolen = this.oldest;
      this.onRecycle?.(stolen);
      this.release(stolen);
    }

    this.freeTop -= 1;
    const index = this.freeStack[this.freeTop] ?? 0;
    this.inUse[index] = 1;
    this.liveCount += 1;
    if (this.liveCount > this.peak) {
      this.peak = this.liveCount;
    }
    this.appendToAgeList(index);
    return index;
  }

  /** Returns a slot. Releasing a slot that is already free does nothing. */
  release(index: number): boolean {
    if (this.inUse[index] !== 1) {
      return false;
    }
    this.inUse[index] = 0;
    this.liveCount -= 1;
    this.removeFromAgeList(index);
    this.freeStack[this.freeTop] = index;
    this.freeTop += 1;
    return true;
  }

  /**
   * Visits every live slot, oldest first.
   *
   * Safe against `release` from inside the visitor — the next slot is read
   * before the visitor runs.
   */
  forEachLive(visit: (index: number) => void): void {
    let index = this.oldest;
    while (index !== NO_SLOT) {
      const next = this.newerThan[index] ?? NO_SLOT;
      visit(index);
      index = next;
    }
  }

  /** Frees every slot. Statistics are kept; use `resetStatistics` to clear them. */
  reset(): void {
    this.inUse.fill(0);
    this.olderThan.fill(NO_SLOT);
    this.newerThan.fill(NO_SLOT);
    this.oldest = NO_SLOT;
    this.newest = NO_SLOT;
    this.liveCount = 0;
    // Filled in reverse so the first acquires come back as 0, 1, 2... which
    // makes a fresh pool's behaviour readable in a test and in the overlay.
    for (let slot = 0; slot < this.capacity; slot++) {
      this.freeStack[slot] = this.capacity - 1 - slot;
    }
    this.freeTop = this.capacity;
  }

  resetStatistics(): void {
    this.peak = this.liveCount;
    this.overflowCount = 0;
    this.warnedAboutOverflow = false;
  }

  private appendToAgeList(index: number): void {
    this.olderThan[index] = this.newest;
    this.newerThan[index] = NO_SLOT;
    if (this.newest === NO_SLOT) {
      this.oldest = index;
    } else {
      this.newerThan[this.newest] = index;
    }
    this.newest = index;
  }

  private removeFromAgeList(index: number): void {
    const older = this.olderThan[index] ?? NO_SLOT;
    const newer = this.newerThan[index] ?? NO_SLOT;
    if (older === NO_SLOT) {
      this.oldest = newer;
    } else {
      this.newerThan[older] = newer;
    }
    if (newer === NO_SLOT) {
      this.newest = older;
    } else {
      this.olderThan[newer] = older;
    }
    this.olderThan[index] = NO_SLOT;
    this.newerThan[index] = NO_SLOT;
  }

  /**
   * Overflow is loud, but only the first time.
   *
   * A pool that overflows overflows every tick, and a warning per tick would
   * bury the console — and cost real time — precisely during the frames that
   * are already struggling.
   */
  private warnOnce(): void {
    if (this.warnedAboutOverflow || !import.meta.env.DEV) {
      return;
    }
    this.warnedAboutOverflow = true;
    console.warn(
      `Pool "${this.name}" is full at ${String(this.capacity)} slots — ` +
        (this.overflow === 'recycleOldest'
          ? 'recycling the oldest element. Raise the capacity or find the leak.'
          : 'rejecting new elements. Raise the capacity or find the leak.'),
    );
  }
}
