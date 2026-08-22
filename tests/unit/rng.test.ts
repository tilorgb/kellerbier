import { describe, expect, it } from 'vitest';
import { RNG_STATE_WORDS, Rng } from '../../src/sim/rng/rng.js';

describe('Rng determinism', () => {
  it('produces an identical sequence for the same seed', () => {
    const first = new Rng(12345);
    const second = new Rng(12345);
    for (let draw = 0; draw < 1000; draw++) {
      expect(second.nextUint32()).toBe(first.nextUint32());
    }
  });

  it('matches a recorded sequence, so a change to the algorithm cannot pass unnoticed', () => {
    // This implementation's own output, locked in deliberately. The job of
    // these numbers is not to validate xoshiro against the reference paper —
    // it is to fail loudly the moment anyone edits the generator, because
    // every shared seed and every recorded replay depends on this exact
    // sequence continuing to exist.
    const rng = new Rng(0xc0ffee);
    const drawn: number[] = [];
    for (let draw = 0; draw < 8; draw++) {
      drawn.push(rng.nextUint32());
    }
    expect(drawn).toEqual([
      3880623475, 1260627042, 399764622, 1678177384, 216311360, 3432353805, 2346155816, 600118561,
    ]);

    const floats = new Rng(0xc0ffee);
    expect([floats.nextFloat(), floats.nextFloat(), floats.nextFloat()]).toEqual([
      0.9035280614625663, 0.29351260559633374, 0.09307745425030589,
    ]);
  });

  it('gives unrelated sequences to neighbouring seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let matches = 0;
    for (let draw = 0; draw < 256; draw++) {
      if (a.nextUint32() === b.nextUint32()) {
        matches += 1;
      }
    }
    // Seeding through splitmix is what stops seed 1 and seed 2 producing
    // near-identical runs, which is what a raw counter seed would do.
    expect(matches).toBe(0);
  });

  it('resumes an identical sequence from saved state', () => {
    const rng = new Rng(999);
    for (let draw = 0; draw < 50; draw++) {
      rng.nextUint32();
    }

    const saved = rng.saveState();
    expect(saved).toHaveLength(RNG_STATE_WORDS);
    const expected = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()];

    const restored = new Rng(0);
    restored.loadState(saved);
    expect([restored.nextUint32(), restored.nextUint32(), restored.nextUint32()]).toEqual(expected);
  });

  it('writes saved state into a caller-provided array', () => {
    const rng = new Rng(7);
    const out = new Uint32Array(RNG_STATE_WORDS);
    expect(rng.saveState(out)).toBe(out);
    expect(out.some((word) => word !== 0)).toBe(true);
  });

  it('rejects an undersized state buffer', () => {
    const rng = new Rng(7);
    expect(() => rng.saveState(new Uint32Array(2))).toThrow(RangeError);
    expect(() => {
      rng.loadState(new Uint32Array(2));
    }).toThrow(RangeError);
  });

  it('returns to the start of the sequence on reseed', () => {
    const rng = new Rng(4242);
    const opening = [rng.nextUint32(), rng.nextUint32(), rng.nextUint32()];
    rng.reseed(4242);
    expect([rng.nextUint32(), rng.nextUint32(), rng.nextUint32()]).toEqual(opening);
  });
});

describe('Rng output quality', () => {
  it('fills the 32-bit range without collapsing', () => {
    const rng = new Rng(2024);
    const seen = new Set<number>();
    for (let draw = 0; draw < 20_000; draw++) {
      seen.add(rng.nextUint32());
    }
    // Birthday collisions over 20k draws in a 2^32 space are rare; a generator
    // stuck in a short cycle would show up here immediately.
    expect(seen.size).toBeGreaterThan(19_990);
  });

  it('keeps every bit position roughly balanced', () => {
    const rng = new Rng(31337);
    const ones = new Array<number>(32).fill(0);
    const draws = 20_000;
    for (let draw = 0; draw < draws; draw++) {
      const value = rng.nextUint32();
      for (let bit = 0; bit < 32; bit++) {
        if ((value & (1 << bit)) !== 0) {
          ones[bit] = (ones[bit] ?? 0) + 1;
        }
      }
    }
    for (let bit = 0; bit < 32; bit++) {
      const ratio = (ones[bit] ?? 0) / draws;
      expect(
        ratio,
        `bit ${String(bit)} was set ${(ratio * 100).toFixed(1)}% of the time`,
      ).toBeGreaterThan(0.47);
      expect(ratio).toBeLessThan(0.53);
    }
  });

  it('spreads nextFloat evenly across [0, 1)', () => {
    const rng = new Rng(8080);
    const buckets = new Array<number>(10).fill(0);
    const draws = 100_000;
    for (let draw = 0; draw < draws; draw++) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const bucket = Math.floor(value * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(draws / 10 - draws / 100);
      expect(count).toBeLessThan(draws / 10 + draws / 100);
    }
  });
});

describe('Rng helpers', () => {
  it('keeps nextInt inside a half-open range', () => {
    const rng = new Rng(555);
    const seen = new Set<number>();
    for (let draw = 0; draw < 10_000; draw++) {
      const value = rng.nextInt(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    expect(seen).toEqual(new Set([3, 4, 5, 6]));
  });

  it('distributes nextInt without the low-end bias a modulo would give', () => {
    const rng = new Rng(24680);
    const counts = new Array<number>(6).fill(0);
    const draws = 120_000;
    for (let draw = 0; draw < draws; draw++) {
      const value = rng.nextInt(0, 6);
      counts[value] = (counts[value] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(draws / 6 - draws / 120);
      expect(count).toBeLessThan(draws / 6 + draws / 120);
    }
  });

  it('handles a single-value range', () => {
    const rng = new Rng(1);
    for (let draw = 0; draw < 10; draw++) {
      expect(rng.nextInt(5, 6)).toBe(5);
    }
  });

  it('rejects an empty or inverted nextInt range', () => {
    const rng = new Rng(1);
    expect(() => rng.nextInt(5, 5)).toThrow(RangeError);
    expect(() => rng.nextInt(7, 2)).toThrow(RangeError);
    expect(() => rng.nextInt(0.5, 4)).toThrow(RangeError);
  });

  it('treats chance(0) and chance(1) as certainties without consuming a draw', () => {
    const rng = new Rng(77);
    const before = rng.saveState();
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(Array.from(rng.saveState())).toEqual(Array.from(before));
  });

  it('lands chance near its stated probability', () => {
    const rng = new Rng(1234);
    let hits = 0;
    const draws = 100_000;
    for (let draw = 0; draw < draws; draw++) {
      if (rng.chance(0.25)) {
        hits += 1;
      }
    }
    expect(hits / draws).toBeGreaterThan(0.24);
    expect(hits / draws).toBeLessThan(0.26);
  });

  it('picks every element of an array', () => {
    const rng = new Rng(31);
    const items = ['a', 'b', 'c', 'd'];
    const seen = new Set<string>();
    for (let draw = 0; draw < 500; draw++) {
      seen.add(rng.pick(items));
    }
    expect(seen).toEqual(new Set(items));
    expect(() => rng.pick([])).toThrow(RangeError);
  });

  it('weights a pick in proportion to its weight', () => {
    const rng = new Rng(606);
    const counts = { common: 0, rare: 0 };
    const table = [
      { value: 'common' as const, weight: 9 },
      { value: 'rare' as const, weight: 1 },
    ];
    const draws = 100_000;
    for (let draw = 0; draw < draws; draw++) {
      counts[rng.weightedPick(table)] += 1;
    }
    expect(counts.rare / draws).toBeGreaterThan(0.09);
    expect(counts.rare / draws).toBeLessThan(0.11);
  });

  it('never picks a zero-weight entry', () => {
    const rng = new Rng(11);
    const table = [
      { value: 'never', weight: 0 },
      { value: 'always', weight: 1 },
    ];
    for (let draw = 0; draw < 1000; draw++) {
      expect(rng.weightedPick(table)).toBe('always');
    }
  });

  it('rejects a weight table that cannot be picked from', () => {
    const rng = new Rng(11);
    expect(() => rng.weightedPick([])).toThrow(RangeError);
    expect(() => rng.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, -1])).toThrow(RangeError);
    expect(() => rng.weightedIndex([1, Number.NaN])).toThrow(RangeError);
  });

  it('shuffles into a permutation, deterministically', () => {
    const source = Array.from({ length: 50 }, (_, index) => index);

    const first = new Rng(90210).shuffle([...source]);
    const second = new Rng(90210).shuffle([...source]);

    expect(first).toEqual(second);
    expect([...first].sort((a, b) => a - b)).toEqual(source);
    expect(first).not.toEqual(source);
  });

  it('shuffles in place and returns the same array', () => {
    const items = [1, 2, 3, 4, 5];
    const rng = new Rng(5);
    expect(rng.shuffle(items)).toBe(items);
  });

  it('handles degenerate shuffles', () => {
    const rng = new Rng(5);
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle(['only'])).toEqual(['only']);
  });
});
