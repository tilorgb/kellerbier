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
const positional = args.filter((_, index) => index !== outFlag && index !== outFlag + 1);
const resultsPath =
  positional[0] ?? fileURLToPath(new URL('../../playtest/results.json', import.meta.url));

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));

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
