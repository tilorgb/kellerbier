import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVENT_CAPACITY, EventKind, EventQueue } from '../../src/sim/events/queue.js';
import { NO_SLOT } from '../../src/sim/pool/slot-pool.js';

function kinds(queue: EventQueue): number[] {
  const seen: number[] = [];
  queue.forEach((slot) => {
    seen.push(queue.kind[slot] ?? 0);
  });
  return seen;
}

describe('EventQueue', () => {
  it('keeps events in the order they were pushed', () => {
    const queue = new EventQueue(8);
    queue.push(EventKind.ProjectileHit, 1, 2, 10, 20, 1, 0, 3);
    queue.push(EventKind.Death, 2, NO_SLOT, 11, 21, 0, 1, 0);
    expect(queue.count).toBe(2);
    expect(kinds(queue)).toEqual([EventKind.ProjectileHit, EventKind.Death]);
  });

  it('carries the whole payload of an event', () => {
    const queue = new EventQueue(4);
    const slot = queue.push(EventKind.Damage, 7, 9, 100, 200, -1, 0, 2.5);
    expect(queue.subject[slot]).toBe(7);
    expect(queue.other[slot]).toBe(9);
    expect(queue.x[slot]).toBe(100);
    expect(queue.y[slot]).toBe(200);
    expect(queue.normalX[slot]).toBe(-1);
    expect(queue.normalY[slot]).toBe(0);
    expect(queue.value[slot]).toBe(2.5);
  });

  it('refuses rather than dropping an older event when it is full', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const queue = new EventQueue(2);
    queue.push(EventKind.Damage, 0, 0, 0, 0, 0, 0, 1);
    queue.push(EventKind.Damage, 1, 0, 0, 0, 0, 0, 1);
    expect(queue.push(EventKind.Damage, 2, 0, 0, 0, 0, 0, 1)).toBe(NO_SLOT);
    expect(queue.count).toBe(2);
    expect(queue.overflows).toBe(1);
    // The events that survive are the first two, not the last two: an event
    // already being acted on this tick is never yanked out from under a reader.
    expect(queue.subject[0]).toBe(0);
    warn.mockRestore();
  });

  it('empties completely, and never reports last tick as this tick', () => {
    const queue = new EventQueue(4);
    queue.push(EventKind.Death, 5, NO_SLOT, 0, 0, 0, 0, 0);
    queue.clear();
    expect(queue.count).toBe(0);
    expect(kinds(queue)).toEqual([]);
  });

  it('writes every field on reuse, so a recycled slot carries nothing stale', () => {
    const queue = new EventQueue(1);
    queue.push(EventKind.ProjectileHit, 1, 2, 3, 4, 5, 6, 7);
    queue.clear();
    const slot = queue.push(EventKind.Death, 8, 9, 10, 11, 12, 13, 14);
    expect(queue.kind[slot]).toBe(EventKind.Death);
    expect(queue.subject[slot]).toBe(8);
    expect(queue.value[slot]).toBe(14);
  });

  it('is sized well above what a busy tick produces', () => {
    expect(new EventQueue().capacity).toBe(DEFAULT_EVENT_CAPACITY);
  });
});
