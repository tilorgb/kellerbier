/**
 * Formats #30's synergy fuzz harness output (`fuzz/results.json`) into the
 * balance report a person actually reads.
 *
 * Usage: `node tools/fuzz/report.mjs [results.json] [--out FILE]`
 *
 * Exits non-zero when the run recorded a crash or a non-finite value, the
 * same two failure modes `tests/fuzz/heavy/synergy.test.ts` itself gates
 * on — a nightly workflow step running this after the sweep gets the same
 * red/green signal a person reading the vitest output already got, plus the
 * markdown table worth putting in a step summary or an issue comment.
 * Everything else the harness detects (softlocks, projectile-pool overflow,
 * frame-budget violations, balance outliers) is reported but never turns
 * the exit code red — see `synergy.test.ts`'s own doc comment for why.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag === -1 ? undefined : args[outFlag + 1];
const positional = args.filter((_, index) => index !== outFlag && index !== outFlag + 1);
const resultsPath =
  positional[0] ?? fileURLToPath(new URL('../../fuzz/results.json', import.meta.url));

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));

function describeFailure(failure) {
  const reasons = [];
  if (failure.crashed) {
    reasons.push(`crash: ${failure.errorMessage ?? 'unknown error'}`);
  }
  if (failure.nonFinite) {
    reasons.push(`non-finite: ${failure.nonFiniteDetail ?? 'no detail'}`);
  }
  if (failure.projectileOverflow) {
    reasons.push('projectile pool overflowed');
  }
  if (failure.softlocked) {
    reasons.push(`softlock at tick ${String(failure.softlockTick)}`);
  }
  if (failure.frameBudgetViolation) {
    reasons.push(`slow tick (${failure.maxTickMs.toFixed(2)} ms)`);
  }
  return `seed ${String(failure.seed)}, [${failure.itemIds.join(', ')}] — ${reasons.join('; ')}`;
}

const lines = [];
lines.push('### 🧪 Synergy fuzz harness');
lines.push('');
lines.push(
  `${report.totalCombinations.toLocaleString()} combinations, ${String(report.ticksPerCombination)} ` +
    `ticks each, in ${(report.durationMs / 1000).toFixed(1)}s on commit ${report.commit.slice(0, 7)}.`,
);
lines.push('');
lines.push('| | Count |');
lines.push('|---|---|');
lines.push(`| Crashes | ${String(report.crashes)} |`);
lines.push(`| Non-finite (NaN/Infinity) | ${String(report.nonFiniteFailures)} |`);
lines.push(`| Projectile pool overflow | ${String(report.projectileOverflows)} |`);
lines.push(`| Softlocks | ${String(report.softlocks)} |`);
lines.push(`| Frame-budget violations | ${String(report.frameBudgetViolations)} |`);
lines.push(`| Balance outliers | ${String(report.outlierCount)} |`);
lines.push('');

if (report.failures.length > 0) {
  lines.push(`#### Failures (first ${String(report.failures.length)})`);
  lines.push('');
  for (const failure of report.failures) {
    lines.push(`- ${describeFailure(failure)}`);
  }
  lines.push('');
}

if (report.outliers.length > 0) {
  lines.push('#### Balance outliers');
  lines.push('');
  lines.push('| Size | DPS | z-score | Bucket mean ± σ | Items |');
  lines.push('|---|---|---|---|---|');
  for (const outlier of report.outliers) {
    lines.push(
      `| ${String(outlier.size)} | ${outlier.dps.toFixed(1)} | ${outlier.zScore.toFixed(2)} | ` +
        `${outlier.bucketMeanDps.toFixed(1)} ± ${outlier.bucketStdDevDps.toFixed(1)} | ` +
        `${outlier.itemIds.join(', ')} |`,
    );
  }
  lines.push('');
}

lines.push('#### Strongest combinations');
lines.push('');
for (const combo of report.strongest) {
  lines.push(
    `- **${combo.dps.toFixed(1)} dps** (${String(combo.size)} items): ${combo.itemIds.join(', ')}`,
  );
}
lines.push('');
lines.push('#### Weakest combinations');
lines.push('');
for (const combo of report.weakest) {
  lines.push(
    `- **${combo.dps.toFixed(1)} dps** (${String(combo.size)} items): ${combo.itemIds.join(', ')}`,
  );
}

const body = lines.join('\n');
console.log(body);
if (outPath !== undefined) {
  writeFileSync(outPath, `${body}\n`, 'utf8');
}

process.exit(report.crashes > 0 || report.nonFiniteFailures > 0 ? 1 : 0);
