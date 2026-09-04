/**
 * Formats #54's balance-simulator output (`playtest/results.json`) into the
 * report a person actually reads.
 *
 * Usage: `node tools/playtest/report.mjs [results.json] [--out FILE]`
 *
 * Exits non-zero only when the run recorded a crash — the same one failure
 * mode `tests/playtest/run.test.ts` itself gates on. A low win rate, a
 * floor eating an outsized share of deaths, or a stuck run is reported but
 * never turns the exit code red — see that test's own doc comment for why.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag === -1 ? undefined : args[outFlag + 1];
// `outFlag === -1`: nothing to strip, so filtering by position would (with
// `outFlag + 1` reading as `0`) wrongly drop a results-path argument at
// index 0 — the exact bug fixed here and in `tools/telemetry/dashboard.mjs`'s
// identical `inputs` line.
const positional =
  outFlag === -1 ? args : args.filter((_, index) => index !== outFlag && index !== outFlag + 1);
const resultsPath =
  positional[0] ?? fileURLToPath(new URL('../../playtest/results.json', import.meta.url));

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));

/**
 * `sim/game/promille.ts#PromilleTier`'s ids, by name — duplicated here
 * rather than imported because this is a plain Node script run directly
 * (`node tools/playtest/report.mjs`, no TypeScript loader), the same reason
 * every other `tools/*.mjs` formatter in this project reads its input as
 * plain JSON rather than importing `src/`. Kept in sync by
 * `tests/playtest/lib/report.test.ts`, which asserts every id this report
 * might see has a name here.
 */
const PROMILLE_TIER_NAMES = {
  0: 'Nüchtern',
  1: 'Angeheitert',
  2: 'Beduselt',
  3: 'Vollrausch',
  4: 'Sturzbesoffen',
  5: 'Filmriss',
  6: 'Umgfalln',
};

/**
 * #54's "no item has a win rate wildly outside the expected band without a
 * deliberate reason": flagged here, not failed — see this report's own doc
 * comment on why nothing about balance turns the exit code red. A minimum
 * appearance count keeps a single-sample outlier from reading as a finding.
 */
const OUTLIER_MIN_APPEARANCES = 4;
const OUTLIER_BAND = 0.35;

function describeFailure(failure) {
  return (
    `seed ${String(failure.seed)}, ${failure.skill}, [${failure.loadoutItemIds.join(', ')}] ` +
    `(reached floor ${String(failure.floorsReached)}) — ${failure.errorMessage ?? 'unknown error'}`
  );
}

const lines = [];
lines.push('### 🍺 Balance simulator');
lines.push('');
lines.push(
  `${report.totalRuns.toLocaleString()} scripted runs through floors 1-${String(report.highestPlayableFloor)}, ` +
    `in ${(report.durationMs / 1000).toFixed(1)}s on commit ${report.commit.slice(0, 7)}.`,
);
lines.push('');
lines.push('| | Count |');
lines.push('|---|---|');
lines.push(`| Wins | ${String(report.wins)} (${(report.winRate * 100).toFixed(1)}%) |`);
lines.push(`| Deaths | ${String(report.deaths)} |`);
lines.push(`| Stuck | ${String(report.stuck)} |`);
lines.push(`| Ran out of ticks | ${String(report.ranOut)} |`);
lines.push(`| Crashes | ${String(report.crashes)} |`);
lines.push('');

lines.push('#### Win rate by skill profile');
lines.push('');
for (const [skill, rate] of Object.entries(report.winRateBySkill)) {
  lines.push(`- **${skill}**: ${(rate * 100).toFixed(1)}%`);
}
lines.push('');

lines.push('#### Per floor');
lines.push('');
lines.push('| Floor | Attempts | Ended here | Avg ticks | Avg rooms cleared | Avg damage taken |');
lines.push('|---|---|---|---|---|---|');
for (const floor of report.floors) {
  lines.push(
    `| ${String(floor.floor)} | ${String(floor.attempts)} | ${String(floor.endedHere)} | ` +
      `${floor.avgTicks.toFixed(0)} | ${floor.avgRoomsCleared.toFixed(1)} | ${floor.avgDamageTaken.toFixed(1)} |`,
  );
}
lines.push('');

lines.push('#### Promille tier usage');
lines.push('');
const tierTotal = Object.values(report.promilleTierUsage ?? {}).reduce((a, b) => a + b, 0);
if (tierTotal === 0) {
  lines.push('_No Promille ticks recorded this sweep._');
} else {
  lines.push('| Tier | Share of ticks |');
  lines.push('|---|---|');
  for (const [tier, ticks] of Object.entries(report.promilleTierUsage).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    const name = PROMILLE_TIER_NAMES[tier] ?? `tier ${tier}`;
    lines.push(`| ${name} | ${((ticks / tierTotal) * 100).toFixed(1)}% |`);
  }
}
lines.push('');

lines.push('#### Item win rates');
lines.push('');
const itemWinRates = report.itemWinRates ?? [];
if (itemWinRates.length === 0) {
  lines.push('_No item appeared in a starting loadout this sweep._');
} else {
  const outliers = itemWinRates.filter(
    (item) =>
      item.appearances >= OUTLIER_MIN_APPEARANCES &&
      Math.abs(item.winRate - report.winRate) >= OUTLIER_BAND,
  );
  if (outliers.length === 0) {
    lines.push(
      `No item is more than ${(OUTLIER_BAND * 100).toFixed(0)} points off the ${(report.winRate * 100).toFixed(1)}% ` +
        `overall win rate at ${String(OUTLIER_MIN_APPEARANCES)}+ appearances.`,
    );
  } else {
    lines.push(
      `${String(outliers.length)} item(s) more than ${(OUTLIER_BAND * 100).toFixed(0)} points off the overall win rate ` +
        `(${String(OUTLIER_MIN_APPEARANCES)}+ appearances):`,
    );
    lines.push('');
    for (const item of outliers) {
      lines.push(
        `- **${item.itemId}** — ${(item.winRate * 100).toFixed(1)}% over ${String(item.appearances)} appearances`,
      );
    }
  }
  lines.push('');
}

if (report.failures.length > 0) {
  lines.push(`#### Failures (first ${String(report.failures.length)})`);
  lines.push('');
  for (const failure of report.failures) {
    lines.push(`- ${describeFailure(failure)}`);
  }
  lines.push('');
}

const body = lines.join('\n');
console.log(body);
if (outPath !== undefined) {
  writeFileSync(outPath, `${body}\n`, 'utf8');
}

process.exit(report.crashes > 0 ? 1 : 0);
