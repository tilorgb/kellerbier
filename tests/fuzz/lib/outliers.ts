import type { FuzzOutcome } from './harness.js';

/**
 * Balance-outlier detection for #30's synergy fuzz harness.
 *
 * "Flags balance outliers: combinations producing damage per second far
 * outside the expected band, in either direction" — the issue's own words —
 * and the one thing worth being careful about is what "the expected band"
 * is a band *of*. A 25-item build deals more damage than a 1-item build by
 * construction; comparing DPS across sizes would flag "more items is more
 * damage" as the finding on every single run, which is exactly the noise
 * the issue's third acceptance criterion ("genuinely useful... rather than
 * noise") warns against. So the band is per combination size: a combo's
 * z-score is relative to the mean and standard deviation of every other
 * combo drawn at the *same* size.
 */

export interface DpsStats {
  readonly size: number;
  readonly count: number;
  readonly meanDps: number;
  readonly stdDevDps: number;
}

export interface DpsOutlier {
  readonly outcome: FuzzOutcome;
  readonly zScore: number;
  readonly bucketMeanDps: number;
  readonly bucketStdDevDps: number;
}

/** Excludes anything whose DPS number does not mean what DPS is supposed to mean — a crash or a non-finite run measures the bug, not the build. */
function eligible(outcome: FuzzOutcome): boolean {
  return !outcome.crashed && !outcome.nonFinite && outcome.ticksCompleted > 0;
}

/** Mean and standard deviation of DPS, grouped by combination size. */
export function dpsStatsBySize(outcomes: readonly FuzzOutcome[]): Map<number, DpsStats> {
  const bySize = new Map<number, number[]>();
  for (const outcome of outcomes) {
    if (!eligible(outcome)) {
      continue;
    }
    const size = outcome.itemIds.length;
    const values = bySize.get(size) ?? [];
    values.push(outcome.dps);
    bySize.set(size, values);
  }

  const stats = new Map<number, DpsStats>();
  for (const [size, values] of bySize) {
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    stats.set(size, { size, count: values.length, meanDps: mean, stdDevDps: Math.sqrt(variance) });
  }
  return stats;
}

/**
 * Every eligible combination whose DPS sits `threshold` standard deviations
 * from its size bucket's mean, sorted strongest-signal first.
 *
 * A bucket needs at least three samples and a non-zero spread before it can
 * say anything about an outlier at all — a bucket of one has no "far
 * outside" to be measured against, and a bucket where nothing varies (every
 * sample crashed or produced identical DPS) has a standard deviation of
 * zero, which would turn every non-identical value into a division by zero
 * rather than a real signal.
 */
export function detectDpsOutliers(outcomes: readonly FuzzOutcome[], threshold = 2.5): DpsOutlier[] {
  const stats = dpsStatsBySize(outcomes);
  const outliers: DpsOutlier[] = [];

  for (const outcome of outcomes) {
    if (!eligible(outcome)) {
      continue;
    }
    const bucket = stats.get(outcome.itemIds.length);
    if (bucket === undefined || bucket.count < 3 || bucket.stdDevDps === 0) {
      continue;
    }
    const zScore = (outcome.dps - bucket.meanDps) / bucket.stdDevDps;
    if (Math.abs(zScore) >= threshold) {
      outliers.push({
        outcome,
        zScore,
        bucketMeanDps: bucket.meanDps,
        bucketStdDevDps: bucket.stdDevDps,
      });
    }
  }

  outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
  return outliers;
}
