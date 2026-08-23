import { NO_SLOT, SlotPool } from '../pool/slot-pool.js';

/**
 * The simulation's internal event queue.
 *
 * Systems do not call each other. A collision does not reach into the particle
 * system, and the particle system does not know what a collision is — the
 * collision writes an event and whatever cares reads it. That indirection is
 * what lets impact feel (#13) be built, tuned and switched off without touching
 * collision, and what keeps a headless test able to assert on what happened
 * rather than on what was drawn.
 *
 * Storage is Structure-of-Arrays and fixed at capacity, like everything else
 * transient. An event is seven numbers with meanings fixed by its kind, which
 * is not elegant but is exactly what a zero-allocation queue can carry.
 */

/** Event kinds. The meaning of each payload field is documented per kind. */
export const EventKind = {
  /** A projectile struck something. a: projectile slot, b: victim slot. */
  ProjectileHit: 1,
  /** A projectile ended without hitting anything — expiry or a wall. a: slot. */
  ProjectileSpent: 2,
  /** Something took damage. a: victim slot, value: amount. */
  Damage: 3,
  /** Something died. a: victim slot. */
  Death: 4,
  /**
   * A body touched something that hurts. a: victim slot, b: what it touched,
   * value: damage, normal: away from what was touched.
   */
  Contact: 5,
} as const;

export type EventKindId = (typeof EventKind)[keyof typeof EventKind];

/** Events one tick may carry. Well above what a busy room produces. */
export const DEFAULT_EVENT_CAPACITY = 1024;

export class EventQueue {
  readonly capacity: number;

  readonly kind: Uint8Array;
  /** Primary subject — usually the slot the event happened to. */
  readonly subject: Int32Array;
  /** Secondary subject — usually whatever caused it. */
  readonly other: Int32Array;
  /** Where it happened, in room coordinates. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  /** Direction it happened along: the impact normal, unit length. */
  readonly normalX: Float32Array;
  readonly normalY: Float32Array;
  /** Magnitude — damage dealt, for the kinds that carry one. */
  readonly value: Float32Array;

  private readonly pool: SlotPool;

  constructor(capacity: number = DEFAULT_EVENT_CAPACITY) {
    this.capacity = capacity;
    this.kind = new Uint8Array(capacity);
    this.subject = new Int32Array(capacity);
    this.other = new Int32Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.normalX = new Float32Array(capacity);
    this.normalY = new Float32Array(capacity);
    this.value = new Float32Array(capacity);
    // A dropped event is a hit that produced no flash and no particles, which
    // is a visible bug rather than a cosmetic one, so the newest event never
    // steals an older one's slot.
    this.pool = new SlotPool({ name: 'events', capacity, overflow: 'reject' });
  }

  get count(): number {
    return this.pool.used;
  }

  get overflows(): number {
    return this.pool.overflows;
  }

  /**
   * Appends an event. Every field is written, so a recycled slot carries
   * nothing from the event that occupied it last tick.
   *
   * Returns the slot, or `NO_SLOT` if the queue is full for this tick.
   */
  push(
    kind: EventKindId,
    subject: number,
    other: number,
    x: number,
    y: number,
    normalX: number,
    normalY: number,
    value: number,
  ): number {
    const slot = this.pool.acquire();
    if (slot === NO_SLOT) {
      return NO_SLOT;
    }
    this.kind[slot] = kind;
    this.subject[slot] = subject;
    this.other[slot] = other;
    this.x[slot] = x;
    this.y[slot] = y;
    this.normalX[slot] = normalX;
    this.normalY[slot] = normalY;
    this.value[slot] = value;
    return slot;
  }

  /** Visits this tick's events in the order they were pushed. */
  forEach(visit: (slot: number) => void): void {
    this.pool.forEachLive(visit);
  }

  /**
   * Empties the queue. Called at the end of every tick: an event describes one
   * tick and is never read on the next one.
   */
  clear(): void {
    this.pool.reset();
  }
}
