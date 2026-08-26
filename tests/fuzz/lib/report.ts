import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FuzzOutcome } from './harness.js';
import type { DpsOutlier } from './outliers.js';

/**
 * What the synergy fuzz harness writes down.
 *
 * Same reasoning as `tests/bench/report.ts`: a JSON file rather than console
 * output, because something other than a person watching a terminal reads
 * it — `tools/fuzz/report.mjs`, which turns it into the balance report a
 * human actually reads (and the CI job's step summary), and any future
 * comparison against a previous night's run. `fuzz/results.json` mirrors
 * `bench/results.json`'s own per-machine, gitignored convention — see
 * `.gitignore`.
 */

export interface RankedCombo {
  readonly seed: number;
  readonly size: number;
  readonly itemIds: readonly string[];
  readonly dps: number;
  readonly kills: number;
}

export interface OutlierSummary extends RankedCombo {
  readonly zScore: number;
  readonly bucketMeanDps: number;
  readonly bucketStdDevDps: number;
}

export interface FailureSummary {
  readonly seed: number;
  readonly itemIds: readonly string[];
  readonly heldItemIds: readonly string[];
  readonly crashed: boolean;
  readonly crashTick: number | undefined;
  readonly errorMessage: string | undefined;
  readonly nonFinite: boolean;
  readonly nonFiniteDetail: string | undefined;
  readonly projectileOverflow: boolean;
  readonly softlocked: boolean;
  readonly softlockTick: number | undefined;
  readonly frameBudgetViolation: boolean;
  readonly maxTickMs: number;
}

export interface FuzzReportMeta {
  readonly commit: string;
  readonly node: string;
  readonly platform: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly ticksPerCombination: number;
}

export interface FuzzReport extends FuzzReportMeta {
  /** Bumped when the shape changes, so an old report on disk stays readable. */
  readonly schema: 1;
  readonly totalCombinations: number;
  readonly crashes: number;
  readonly nonFiniteFailures: number;
  readonly projectileOverflows: number;
  readonly softlocks: number;
  readonly frameBudgetViolations: number;
  readonly outlierCount: number;
  /** Capped at `MAX_FAILURES_LISTED` — every combination that tripped a detector, worst offenders are already sorted first by the harness's own run order isn't guaranteed, so this is first-found rather than worst-first. */
  readonly failures: readonly FailureSummary[];
  /** Capped at `MAX_OUTLIERS_LISTED`, strongest z-score first. */
  readonly outliers: readonly OutlierSummary[];
  readonly strongest: readonly RankedCombo[];
  readonly weakest: readonly RankedCombo[];
}

const MAX_FAILURES_LISTED = 25;
const MAX_OUTLIERS_LISTED = 25;
const TOP_BOTTOM_COUNT = 10;

function toRanked(outcome: FuzzOutcome): RankedCombo {
  return {
    seed: outcome.seed,
    size: outcome.itemIds.length,
    itemIds: outcome.itemIds,
    dps: outcome.dps,
    kills: outcome.kills,
  };
}

function toFailure(outcome: FuzzOutcome): FailureSummary {
  return {
    seed: outcome.seed,
    itemIds: outcome.itemIds,
    heldItemIds: outcome.heldItemIds,
    crashed: outcome.crashed,
    crashTick: outcome.crashTick,
    errorMessage: outcome.errorMessage,
    nonFinite: outcome.nonFinite,
    nonFiniteDetail: outcome.nonFiniteDetail,
    projectileOverflow: outcome.projectileOverflow,
    softlocked: outcome.softlocked,
    softlockTick: outcome.softlockTick,
    frameBudgetViolation: outcome.frameBudgetViolation,
    maxTickMs: outcome.maxTickMs,
  };
}

/** Assembles every outcome from one sweep into the report the harness writes down. */
export function buildFuzzReport(
  outcomes: readonly FuzzOutcome[],
  outliers: readonly DpsOutlier[],
  meta: FuzzReportMeta,
): FuzzReport {
  const failing = outcomes.filter(
    (outcome) =>
      outcome.crashed ||
      outcome.nonFinite ||
      outcome.projectileOverflow ||
      outcome.softlocked ||
      outcome.frameBudgetViolation,
  );
  const eligible = outcomes.filter(
    (outcome) => !outcome.crashed && !outcome.nonFinite && outcome.ticksCompleted > 0,
  );
  const byDps = [...eligible].sort((a, b) => b.dps - a.dps);

  return {
    ...meta,
    schema: 1,
    totalCombinations: outcomes.length,
    crashes: outcomes.filter((outcome) => outcome.crashed).length,
    nonFiniteFailures: outcomes.filter((outcome) => outcome.nonFinite).length,
    projectileOverflows: outcomes.filter((outcome) => outcome.projectileOverflow).length,
    softlocks: outcomes.filter((outcome) => outcome.softlocked).length,
    frameBudgetViolations: outcomes.filter((outcome) => outcome.frameBudgetViolation).length,
    outlierCount: outliers.length,
    failures: failing.slice(0, MAX_FAILURES_LISTED).map(toFailure),
    outliers: outliers.slice(0, MAX_OUTLIERS_LISTED).map((outlier) => ({
      ...toRanked(outlier.outcome),
      zScore: outlier.zScore,
      bucketMeanDps: outlier.bucketMeanDps,
      bucketStdDevDps: outlier.bucketStdDevDps,
    })),
    strongest: byDps.slice(0, TOP_BOTTOM_COUNT).map(toRanked),
    weakest: byDps.slice(-TOP_BOTTOM_COUNT).reverse().map(toRanked),
  };
}

const REPORT_PATH = fileURLToPath(new URL('../../../fuzz/results.json', import.meta.url));

export function writeFuzzReport(report: FuzzReport): string {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return REPORT_PATH;
}
