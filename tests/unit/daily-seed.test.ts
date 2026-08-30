import { describe, expect, it } from 'vitest';
import { dailySeed } from '../../src/sim/rng/daily.js';
import { dailyDateKey, todaysDailySeed } from '../../src/app/daily.js';

describe('the daily run seed (#48)', () => {
  it('is identical for every player on the same date', () => {
    expect(dailySeed('2026-08-30')).toBe(dailySeed('2026-08-30'));
  });

  it('differs from one date to the next', () => {
    const seeds = new Set<number>();
    for (let day = 1; day <= 28; day++) {
      seeds.add(dailySeed(`2026-08-${String(day).padStart(2, '0')}`));
    }
    expect(seeds.size).toBe(28);
  });

  it('is a valid 32-bit unsigned seed', () => {
    for (const date of ['2026-01-01', '2026-08-30', '2099-12-31']) {
      const seed = dailySeed(date);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('rejects anything that is not a bare YYYY-MM-DD key', () => {
    expect(() => dailySeed('2026-8-30')).toThrow(RangeError);
    expect(() => dailySeed('08/30/2026')).toThrow(RangeError);
    expect(() => dailySeed('2026-08-30T00:00:00Z')).toThrow(RangeError);
    expect(() => dailySeed('')).toThrow(RangeError);
  });

  it('does not shift correlated seeds for adjacent dates', () => {
    // A weak hash (e.g. summing digits) would put consecutive dates close
    // together in seed space, which would show up as a family resemblance
    // between "today" and "yesterday"'s floors. Not a rigorous randomness
    // test — just a guard against the obviously bad implementation.
    const a = dailySeed('2026-08-30');
    const b = dailySeed('2026-08-31');
    expect(Math.abs(a - b)).toBeGreaterThan(1000);
  });
});

describe('dailyDateKey (#48)', () => {
  it('formats in UTC, not local time', () => {
    // 23:30 UTC on the 30th, which a negative-offset local time would still
    // report as the 30th but a positive-offset one would already call the
    // 31st — UTC is what keeps every player's key agreeing regardless.
    expect(dailyDateKey(new Date('2026-08-30T23:30:00Z'))).toBe('2026-08-30');
    expect(dailyDateKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('pads single-digit months and days', () => {
    expect(dailyDateKey(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05');
  });
});

describe('todaysDailySeed (#48)', () => {
  it('is the same seed dailySeed(dailyDateKey(now)) would give', () => {
    const now = new Date('2026-08-30T10:00:00Z');
    expect(todaysDailySeed(now)).toBe(dailySeed(dailyDateKey(now)));
  });
});
