import { describe, expect, it, vi } from 'vitest';
import { NO_SLOT, SlotPool } from '../../src/sim/pool/slot-pool.js';

function drain(pool: SlotPool): number[] {
  const live: number[] = [];
  pool.forEachLive((index) => {
    live.push(index);
  });
  return live;
}

describe('SlotPool', () => {
  it('hands out every slot before it considers itself full', () => {
    const pool = new SlotPool({ name: 'test', capacity: 4 });
    const taken = [pool.acquire(), pool.acquire(), pool.acquire(), pool.acquire()];
    expect(new Set(taken).size).toBe(4);
    expect(pool.used).toBe(4);
    expect(pool.free).toBe(0);
    expect(pool.overflows).toBe(0);
  });

  it('returns released slots to circulation', () => {
    const pool = new SlotPool({ name: 'test', capacity: 2 });
    const first = pool.acquire();
    pool.acquire();
    expect(pool.acquire()).not.toBe(NO_SLOT); // overflow recycles rather than fails

    pool.release(first);
    expect(pool.used).toBe(1);
    expect(pool.isUsed(first)).toBe(false);
    expect(pool.acquire()).toBe(first);
  });

  it('ignores a double release rather than corrupting the free list', () => {
    const pool = new SlotPool({ name: 'test', capacity: 2 });
    const slot = pool.acquire();
    expect(pool.release(slot)).toBe(true);
    expect(pool.release(slot)).toBe(false);
    expect(pool.used).toBe(0);
    expect(pool.free).toBe(2);
  });

  it('walks live slots oldest first, whatever order they were released in', () => {
    const pool = new SlotPool({ name: 'test', capacity: 4 });
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(drain(pool)).toEqual([a, b, c]);

    pool.release(b);
    expect(drain(pool)).toEqual([a, c]);

    const d = pool.acquire();
    expect(drain(pool)).toEqual([a, c, d]);

    pool.release(a);
    expect(drain(pool)).toEqual([c, d]);
  });

  it('survives a release from inside the live walk', () => {
    const pool = new SlotPool({ name: 'test', capacity: 4 });
    for (let i = 0; i < 4; i++) {
      pool.acquire();
    }
    pool.forEachLive((index) => {
      pool.release(index);
    });
    expect(pool.used).toBe(0);
  });

  it('recycles the oldest under overflow, so the newest element always appears', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const recycled: number[] = [];
    const pool = new SlotPool({
      name: 'test',
      capacity: 3,
      overflow: 'recycleOldest',
      onRecycle: (index) => {
        recycled.push(index);
      },
    });

    const oldest = pool.acquire();
    const middle = pool.acquire();
    const newest = pool.acquire();

    const overflowed = pool.acquire();
    expect(overflowed).toBe(oldest);
    expect(recycled).toEqual([oldest]);
    expect(pool.used).toBe(3);
    expect(drain(pool)).toEqual([middle, newest, oldest]);
    expect(pool.overflows).toBe(1);
    warn.mockRestore();
  });

  it('refuses instead, when the pool is one where losing an element is a bug', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pool = new SlotPool({ name: 'test', capacity: 2, overflow: 'reject' });
    pool.acquire();
    pool.acquire();
    expect(pool.acquire()).toBe(NO_SLOT);
    expect(pool.used).toBe(2);
    expect(pool.overflows).toBe(1);
    warn.mockRestore();
  });

  it('warns once rather than once per tick, so a full pool does not bury the console', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pool = new SlotPool({ name: 'noisy', capacity: 1, overflow: 'reject' });
    pool.acquire();
    for (let attempt = 0; attempt < 100; attempt++) {
      pool.acquire();
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(pool.overflows).toBe(100);
    warn.mockRestore();
  });

  it('tracks the peak, which is the number that says whether a capacity is right', () => {
    const pool = new SlotPool({ name: 'test', capacity: 8 });
    const taken = [pool.acquire(), pool.acquire(), pool.acquire()];
    for (const slot of taken) {
      pool.release(slot);
    }
    expect(pool.used).toBe(0);
    expect(pool.peakUsed).toBe(3);

    pool.resetStatistics();
    expect(pool.peakUsed).toBe(0);
  });

  it('rejects a capacity that is not a positive integer', () => {
    expect(() => new SlotPool({ name: 'bad', capacity: 0 })).toThrow(/positive integer/);
    expect(() => new SlotPool({ name: 'bad', capacity: 1.5 })).toThrow(/positive integer/);
  });
});
