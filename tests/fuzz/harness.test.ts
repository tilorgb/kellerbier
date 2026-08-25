import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../src/content/items/index.js';
import type { ItemDefinition } from '../../src/sim/item/definition.js';
import { combinationSeed, generateCombinations } from './lib/combinations.js';
import { type FuzzOutcome, runFuzzCombination } from './lib/harness.js';
import { detectDpsOutliers, dpsStatsBySize } from './lib/outliers.js';

/**
 * The fast half of #30's synergy fuzz harness — the part that runs on every
 * `npm run test`, same as every other content-validation and determinism
 * test. The 10,000-combination sweep itself is slow by design (that is the
 * point of it) and lives in `tests/fuzz/heavy/`, run on its own via
 * `npm run fuzz` — see that directory's exclusion in `vite.config.ts` and
 * `vitest.fuzz.config.ts`, the same split `tests/bench/` already uses.
 *
 * What belongs here instead: proof that the harness's own detectors work,
 * checked mechanically rather than by reading the code and trusting it.
 */

function brokenDivideByZeroItem(): ItemDefinition {
  return {
    id: 'test-fuzz-divide-by-zero',
    name: 'Test Item',
    description: 'Deliberately divides by zero — exists only for this test.',
    sprite: 'placeholder',
    pools: ['treasure'],
    quality: 0,
    promilleRequirement: 'any',
    hooks: {
      // Not `modifyStats`: `resolveStat` (`src/sim/stats/pipeline.ts`)
      // already guards every one of the six stats against a non-finite
      // modifier and falls back to the previous value, so routing the
      // divide-by-zero through a stat modifier would prove nothing — the
      // pipeline would quietly absorb it before this harness ever saw it
      // (found while writing this test; see the pull request body).
      // `onProjectileSpawn` writes a projectile field directly instead —
      // the same surface `src/content/items/mass.ts` uses for its radius —
      // which the engine does not guard the same way, so a divide-by-zero
      // here is the shape a real content bug would actually take.
      onProjectileSpawn: (ctx) => {
        const denominator = ctx.state.count - ctx.state.count;
        ctx.sim.projectiles.damage[ctx.projectile] = 1 / denominator;
      },
    },
  };
}

describe('synergy fuzz harness — self-test (#30 acceptance criteria)', () => {
  it('catches a deliberately introduced divide-by-zero', () => {
    const outcome = runFuzzCombination(
      { seed: 1, itemIds: ['test-fuzz-divide-by-zero'] },
      { items: [brokenDivideByZeroItem()], ticks: 60 },
    );

    expect(outcome.crashed).toBe(false);
    expect(outcome.nonFinite).toBe(true);
    expect(outcome.nonFiniteDetail).toContain('projectile');
    // Caught promptly, not eventually — the loop breaks the same tick the
    // scan first reads the bad value, so a real regression's report points
    // at the tick it actually happened on rather than somewhere ticks later.
    expect(outcome.ticksCompleted).toBeLessThanOrEqual(2);
  });

  it('reports a clean combination as neither crashed nor non-finite', () => {
    const outcome = runFuzzCombination(
      { seed: 2, itemIds: [] },
      { items: ITEM_DEFINITIONS, ticks: 30 },
    );

    expect(outcome.crashed).toBe(false);
    expect(outcome.nonFinite).toBe(false);
    expect(outcome.ticksCompleted).toBe(30);
    expect(Number.isFinite(outcome.dps)).toBe(true);
  });

  it('reports a crashing hook as crashed, not as a silent non-finite result', () => {
    const throwing: ItemDefinition = {
      id: 'test-fuzz-throws',
      name: 'Test Item',
      description: 'Throws on pickup — exists only for this test.',
      sprite: 'placeholder',
      pools: ['treasure'],
      quality: 0,
      promilleRequirement: 'any',
      hooks: {
        onPickup: () => {
          throw new Error('deliberate test failure');
        },
      },
    };

    const outcome = runFuzzCombination(
      { seed: 3, itemIds: ['test-fuzz-throws'] },
      { items: [throwing], ticks: 30 },
    );

    expect(outcome.crashed).toBe(true);
    expect(outcome.errorMessage).toContain('deliberate test failure');
  });

  it('holds up a real, small combination for a short run without crashing', () => {
    const someIds = ITEM_DEFINITIONS.slice(0, 3).map((item) => item.id);
    const outcome = runFuzzCombination(
      { seed: 4, itemIds: someIds },
      { items: ITEM_DEFINITIONS, ticks: 60 },
    );

    expect(outcome.crashed).toBe(false);
    expect(outcome.nonFinite).toBe(false);
    expect(outcome.heldItemIds.length).toBeGreaterThan(0);
    expect(outcome.ticksCompleted).toBe(60);
  });
});

describe('combination generation', () => {
  it('is deterministic — the same plan produces the same combinations every time', () => {
    const plan = { sizes: [1, 3], seedsPerSize: 5 };
    const first = generateCombinations(ITEM_DEFINITIONS, plan);
    const second = generateCombinations(ITEM_DEFINITIONS, plan);
    expect(second).toEqual(first);
  });

  it('draws exactly the requested count and size, without duplicate item ids in one combination', () => {
    const combinations = generateCombinations(ITEM_DEFINITIONS, {
      sizes: [1, 3, 10],
      seedsPerSize: 4,
    });
    expect(combinations).toHaveLength(3 * 4);
    for (const combination of combinations) {
      expect(new Set(combination.itemIds).size).toBe(combination.itemIds.length);
    }
    expect(combinations.filter((c) => c.itemIds.length === 10)).toHaveLength(4);
  });

  it('clamps a size larger than the roster instead of throwing', () => {
    const combinations = generateCombinations(ITEM_DEFINITIONS, {
      sizes: [ITEM_DEFINITIONS.length + 50],
      seedsPerSize: 1,
    });
    expect(combinations[0]?.itemIds.length).toBe(ITEM_DEFINITIONS.length);
  });

  it("gives every (size, index) pair its own seed, so a bug report's seed reproduces one combination", () => {
    const a = combinationSeed(0, 3, 0);
    const b = combinationSeed(0, 3, 1);
    const c = combinationSeed(0, 10, 0);
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe('DPS outlier detection', () => {
  function fakeOutcome(dps: number, size: number): FuzzOutcome {
    return {
      seed: 0,
      itemIds: Array.from({ length: size }, (_, index) => `item-${String(index)}`),
      heldItemIds: [],
      ticksRequested: 60,
      ticksCompleted: 60,
      crashed: false,
      crashTick: undefined,
      errorMessage: undefined,
      nonFinite: false,
      nonFiniteDetail: undefined,
      projectileOverflow: false,
      softlocked: false,
      softlockTick: undefined,
      maxTickMs: 0,
      meanTickMs: 0,
      frameBudgetViolation: false,
      damageDealt: dps,
      kills: 0,
      dps,
    };
  }

  it('flags a combination that wildly out-damages its own size bucket', () => {
    const tightCluster = [98, 99, 100, 101, 102, 100, 99].map((dps) => fakeOutcome(dps, 3));
    const spike = fakeOutcome(5000, 3);
    const outliers = detectDpsOutliers([...tightCluster, spike]);

    expect(outliers).toHaveLength(1);
    expect(outliers[0]?.outcome).toBe(spike);
    expect(outliers[0]?.zScore).toBeGreaterThan(2.5);
  });

  it('does not flag ordinary noise inside a tight cluster', () => {
    const cluster = [95, 98, 99, 100, 101, 102, 105].map((dps) => fakeOutcome(dps, 3));
    expect(detectDpsOutliers(cluster)).toHaveLength(0);
  });

  it('never compares DPS across different combination sizes', () => {
    // A 1-item build dealing far less than a 25-item build is expected, not
    // a balance finding — the whole reason the bucket is keyed by size.
    const small = Array.from({ length: 5 }, () => fakeOutcome(10, 1));
    const large = Array.from({ length: 5 }, () => fakeOutcome(1000, 25));
    expect(detectDpsOutliers([...small, ...large])).toHaveLength(0);

    const stats = dpsStatsBySize([...small, ...large]);
    expect(stats.get(1)?.meanDps).toBe(10);
    expect(stats.get(25)?.meanDps).toBe(1000);
  });

  it('leaves a bucket too small to say anything about alone', () => {
    const outcomes = [fakeOutcome(10, 7), fakeOutcome(9999, 7)];
    expect(detectDpsOutliers(outcomes)).toHaveLength(0);
  });
});
