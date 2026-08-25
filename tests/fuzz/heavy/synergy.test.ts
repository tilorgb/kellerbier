import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ITEM_DEFINITIONS } from '../../../src/content/items/index.js';
import { generateCombinations } from '../lib/combinations.js';
import { type FuzzOutcome, runFuzzCombination } from '../lib/harness.js';
import { detectDpsOutliers } from '../lib/outliers.js';
import { type FuzzReport, buildFuzzReport, writeFuzzReport } from '../lib/report.js';

/**
 * #30's synergy fuzz harness: the actual sweep.
 *
 * "Runs across many seeds and many combination sizes (1, 3, 10, 25 items)"
 * and "Runs 10,000 combinations in under 5 minutes headless" — both the
 * issue's own words, and both asserted here rather than merely arranged: if
 * a future change makes combination construction expensive enough to blow
 * the budget, this fails the same way a benchmark regression fails
 * `tests/bench/frame-time.test.ts`.
 *
 * Kept out of the default `npm run test` suite — see `vite.config.ts`'s
 * `test.exclude` and `vitest.fuzz.config.ts` — the same split
 * `tests/bench/` already uses and for the same reason: this is meant to run
 * nightly and on demand (`.github/workflows/fuzz.yml`), not on every commit
 * a contributor makes to an unrelated file.
 *
 * What this test gates on is deliberately narrow: a crash or a non-finite
 * value, the two failure modes #30's acceptance criteria names explicitly.
 * Softlocks, projectile-pool overflow and frame-budget violations are
 * detected and reported (`fuzz/results.json`, `tools/fuzz/report.mjs`) but
 * do not fail the run — an item combination that legitimately fires
 * thousands of shots, or a genuinely weak build that struggles to land a
 * hit, produces the same signal a real bug would, and a nightly job that
 * goes red for either is a nightly job people stop reading. The same is
 * true of balance outliers: they are what this harness exists to surface
 * for a human to look at, not something a build should fail on.
 */

const SIZES = [1, 3, 10, 25];

/** `4 * 2,500 = 10,000` — #30's own acceptance-criteria number. */
const SEEDS_PER_SIZE = 2_500;

/** Three seconds of combat per combination — see `harness.ts`'s `DEFAULT_TICKS` doc comment for the same reasoning, shortened here to fit ten thousand of them in the time budget. */
const TICKS_PER_COMBINATION = 180;

const TIME_BUDGET_MS = 5 * 60 * 1000;

function currentCommit(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi !== undefined && fromCi !== '') {
    return fromCi;
  }
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function describeCombo(outcome: FuzzOutcome): string {
  return `seed ${String(outcome.seed)}, [${outcome.itemIds.join(', ')}]`;
}

function printSummary(report: FuzzReport, path: string): void {
  process.stdout.write(
    [
      '',
      `synergy fuzz — ${String(report.totalCombinations)} combinations, ` +
        `${String(report.ticksPerCombination)} ticks each, in ` +
        `${(report.durationMs / 1000).toFixed(1)}s`,
      `  crashes                 ${String(report.crashes)}`,
      `  non-finite               ${String(report.nonFiniteFailures)}`,
      `  projectile overflow      ${String(report.projectileOverflows)}`,
      `  softlocks                ${String(report.softlocks)}`,
      `  frame-budget violations  ${String(report.frameBudgetViolations)}`,
      `  balance outliers         ${String(report.outlierCount)}`,
      `  written to ${path}`,
      '',
    ].join('\n'),
  );
}

describe('synergy fuzz harness (#30)', () => {
  it(
    'runs 10,000 combinations across sizes 1/3/10/25 in under 5 minutes, with no crash and no non-finite value',
    () => {
      const combinations = generateCombinations(ITEM_DEFINITIONS, {
        sizes: SIZES,
        seedsPerSize: SEEDS_PER_SIZE,
      });
      expect(combinations).toHaveLength(SIZES.length * SEEDS_PER_SIZE);

      const startedAt = new Date().toISOString();
      const started = performance.now();
      const outcomes: FuzzOutcome[] = [];
      for (const combination of combinations) {
        outcomes.push(
          runFuzzCombination(combination, {
            items: ITEM_DEFINITIONS,
            ticks: TICKS_PER_COMBINATION,
          }),
        );
      }
      const durationMs = performance.now() - started;

      const outliers = detectDpsOutliers(outcomes);
      const report = buildFuzzReport(outcomes, outliers, {
        commit: currentCommit(),
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        startedAt,
        durationMs,
        ticksPerCombination: TICKS_PER_COMBINATION,
      });
      const path = writeFuzzReport(report);
      printSummary(report, path);

      const crashes = outcomes.filter((outcome) => outcome.crashed);
      const nonFinite = outcomes.filter((outcome) => outcome.nonFinite);

      expect(
        crashes.map(
          (outcome) => `${describeCombo(outcome)}: ${outcome.errorMessage ?? 'unknown error'}`,
        ),
      ).toEqual([]);
      expect(
        nonFinite.map(
          (outcome) =>
            `${describeCombo(outcome)}: ${outcome.nonFiniteDetail ?? 'non-finite value'}`,
        ),
      ).toEqual([]);

      expect(
        durationMs,
        `${(durationMs / 1000).toFixed(1)}s for ${String(combinations.length)} combinations`,
      ).toBeLessThan(TIME_BUDGET_MS);
    },
    // Comfortably above the 5-minute acceptance criterion, so a real
    // regression fails as the assertion above rather than as a hard vitest
    // timeout with no report written.
    10 * 60 * 1000,
  );
});
