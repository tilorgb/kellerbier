import type { ItemDefinition } from '../../../src/sim/item/definition.js';
import { Rng } from '../../../src/sim/rng/rng.js';
import type { FuzzCombination } from './harness.js';

/**
 * Deterministic combination generation for #30's synergy fuzz harness.
 *
 * "Many seeds and many combination sizes (1, 3, 10, 25 items)" — the issue's
 * own wording — reduces to: for each size, draw `seedsPerSize` independent
 * random subsets of that size from the roster. Independent means seeded
 * independently, so a combination is reproducible on its own (hand a bug
 * report `combinationSeed(base, size, index)` and the exact item set comes
 * back) without needing the whole sweep replayed to reach it — the same
 * "attach the seed" discipline `CONTRIBUTING.md` asks of a run report,
 * applied to a fuzz combination instead of a run.
 */

export interface CombinationPlan {
  readonly sizes: readonly number[];
  readonly seedsPerSize: number;
  /** Folded into every combination's seed — a sweep run twice with a different base never repeats itself. Defaults to 0. */
  readonly baseSeed?: number;
}

/**
 * Keeps one size's seeds from ever colliding with another's, for any
 * `seedsPerSize` this harness is realistically run with (comfortably above
 * the 2,500 the 10,000-combination sweep uses per size).
 */
const SEED_SIZE_STRIDE = 1_000_000;

/** The seed one specific `(size, index)` combination draws from — reproducible on its own, see above. */
export function combinationSeed(baseSeed: number, size: number, index: number): number {
  return (baseSeed + size * SEED_SIZE_STRIDE + index) >>> 0;
}

/**
 * Builds `plan.sizes.length * plan.seedsPerSize` combinations.
 *
 * A combination's items are drawn without replacement from the full roster,
 * sorted by id before the draw so the only source of variation is the seed
 * — the same "sort first, randomise second" discipline `ItemRegistry` and
 * `selectItemOffer` already use for the same reason (`docs/DECISIONS.md`).
 * A size larger than the roster clamps to the whole roster rather than
 * throwing — #30's own "25 items" bucket is meant to mean "as many as the
 * roster has, up to 25," not to fail the day the roster is smaller than 25.
 */
export function generateCombinations(
  items: readonly ItemDefinition[],
  plan: CombinationPlan,
): FuzzCombination[] {
  const ids = items.map((item) => item.id).sort();
  const baseSeed = plan.baseSeed ?? 0;
  const combinations: FuzzCombination[] = [];

  for (const size of plan.sizes) {
    const take = Math.min(size, ids.length);
    for (let index = 0; index < plan.seedsPerSize; index++) {
      const seed = combinationSeed(baseSeed, size, index);
      const shuffled = new Rng(seed).shuffle([...ids]);
      combinations.push({ seed, itemIds: shuffled.slice(0, take) });
    }
  }
  return combinations;
}
