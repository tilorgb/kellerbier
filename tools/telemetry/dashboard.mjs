/**
 * #54/#159's telemetry dashboard: reads one or more exported telemetry files
 * (`app/telemetry/file.ts#downloadTelemetryFile`'s `.json` shape, one per
 * playtest session) and reports the aggregate `docs/BALANCE_METHODOLOGY.md`
 * is built around — win rate, deaths by floor and cause, item pickup and win
 * rates, room clear times, and Promille tier usage.
 *
 * There is no server here on purpose — `docs/DECISIONS.md`'s entry on
 * telemetry explains why — so "a dashboard over the collected data" means a
 * report over whatever `.json` files a person has actually been handed, the
 * same shape `tools/playtest/report.mjs` already gives the balance
 * simulator's own output. A session identifier (#159) is what ties one of
 * these files back to an observed playtest session; this tool aggregates
 * across every file it is given regardless, since the balance questions it
 * answers are about the player base as a whole, not any one session.
 *
 * Usage: `node tools/telemetry/dashboard.mjs <file-or-dir...> [--out FILE]`
 * A directory argument is read non-recursively for every `*.json` inside it.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROMILLE_TIER_NAMES = {
  0: 'Nüchtern',
  1: 'Angeheitert',
  2: 'Beduselt',
  3: 'Vollrausch',
  4: 'Sturzbesoffen',
  5: 'Filmriss',
  6: 'Umgfalln',
};

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag === -1 ? undefined : args[outFlag + 1];
const inputs =
  outFlag === -1 ? args : args.filter((_, index) => index !== outFlag && index !== outFlag + 1);

if (inputs.length === 0) {
  console.error('usage: node tools/telemetry/dashboard.mjs <file-or-dir...> [--out FILE]');
  process.exit(1);
}

/** Every `.json` file named by `inputs`, expanding a directory into the files directly inside it. */
function resolveFiles(paths) {
  const files = [];
  for (const path of paths) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) {
        if (entry.endsWith('.json')) {
          files.push(join(path, entry));
        }
      }
    } else {
      files.push(path);
    }
  }
  return files;
}

/** One telemetry export file's `runs`, or `[]` with a warning if it doesn't parse as one. */
function readRuns(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.warn(`[telemetry-dashboard] skipping ${path}: not valid JSON (${error.message})`);
    return [];
  }
  if (!Array.isArray(parsed?.runs)) {
    console.warn(
      `[telemetry-dashboard] skipping ${path}: no "runs" array — not a telemetry export`,
    );
    return [];
  }
  return parsed.runs;
}

const files = resolveFiles(inputs);
const runs = files.flatMap(readRuns);

if (runs.length === 0) {
  console.log('No telemetry runs found in the given files.');
  process.exit(0);
}

const wins = runs.filter((run) => run.outcome === 'won').length;
const winRate = wins / runs.length;

const byFloor = new Map();
for (const run of runs) {
  const entry = byFloor.get(run.floor) ?? { attempts: 0, deaths: 0, wins: 0 };
  entry.attempts += 1;
  if (run.outcome === 'won') {
    entry.wins += 1;
  } else {
    entry.deaths += 1;
  }
  byFloor.set(run.floor, entry);
}

const deathCauses = new Map();
for (const run of runs) {
  if (run.outcome !== 'died') {
    continue;
  }
  const enemies =
    run.deathCause?.enemiesPresent && run.deathCause.enemiesPresent.length > 0
      ? [...run.deathCause.enemiesPresent].sort().join(', ')
      : '(no enemy recorded)';
  const key = `floor ${String(run.floor)} — ${enemies}`;
  deathCauses.set(key, (deathCauses.get(key) ?? 0) + 1);
}

const itemStats = new Map();
for (const run of runs) {
  for (const itemId of run.itemsHeld ?? []) {
    const entry = itemStats.get(itemId) ?? { appearances: 0, wins: 0 };
    entry.appearances += 1;
    if (run.outcome === 'won') {
      entry.wins += 1;
    }
    itemStats.set(itemId, entry);
  }
}

const roomClearsByRole = new Map();
for (const run of runs) {
  for (const clear of run.roomClears ?? []) {
    const key = `floor ${String(clear.floor)} — ${clear.role}`;
    const entry = roomClearsByRole.get(key) ?? { count: 0, totalTicks: 0 };
    entry.count += 1;
    entry.totalTicks += clear.ticks;
    roomClearsByRole.set(key, entry);
  }
}

const tierTicks = new Map();
for (const run of runs) {
  for (const [tier, ticks] of Object.entries(run.promilleTierTicks ?? {})) {
    tierTicks.set(tier, (tierTicks.get(tier) ?? 0) + ticks);
  }
}
const tierTotal = Array.from(tierTicks.values()).reduce((a, b) => a + b, 0);

const lines = [];
lines.push('### 🍺 Playtest telemetry dashboard');
lines.push('');
lines.push(`${String(runs.length)} run(s) from ${String(files.length)} file(s).`);
lines.push('');
lines.push('| | Count |');
lines.push('|---|---|');
lines.push(`| Wins | ${String(wins)} (${(winRate * 100).toFixed(1)}%) |`);
lines.push(`| Deaths | ${String(runs.length - wins)} |`);
lines.push('');

lines.push('#### Outcomes by floor');
lines.push('');
lines.push('| Floor | Attempts | Wins | Deaths |');
lines.push('|---|---|---|---|');
for (const [floor, entry] of Array.from(byFloor.entries()).sort((a, b) => a[0] - b[0])) {
  lines.push(
    `| ${String(floor)} | ${String(entry.attempts)} | ${String(entry.wins)} | ${String(entry.deaths)} |`,
  );
}
lines.push('');

lines.push('#### Deaths by floor and cause');
lines.push('');
if (deathCauses.size === 0) {
  lines.push('_No deaths recorded._');
} else {
  lines.push('| Where | Count |');
  lines.push('|---|---|');
  for (const [key, count] of Array.from(deathCauses.entries()).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${key} | ${String(count)} |`);
  }
}
lines.push('');

lines.push('#### Item pickup and win rates');
lines.push('');
if (itemStats.size === 0) {
  lines.push('_No items recorded._');
} else {
  lines.push('| Item | Held in | Win rate when held |');
  lines.push('|---|---|---|');
  for (const [itemId, entry] of Array.from(itemStats.entries()).sort(
    (a, b) => b[1].appearances - a[1].appearances,
  )) {
    const rate = entry.wins / entry.appearances;
    lines.push(`| ${itemId} | ${String(entry.appearances)} | ${(rate * 100).toFixed(1)}% |`);
  }
}
lines.push('');

lines.push('#### Room clear times');
lines.push('');
if (roomClearsByRole.size === 0) {
  lines.push('_No room clears recorded._');
} else {
  lines.push('| Room | Clears | Avg ticks |');
  lines.push('|---|---|---|');
  for (const [key, entry] of Array.from(roomClearsByRole.entries()).sort()) {
    lines.push(
      `| ${key} | ${String(entry.count)} | ${(entry.totalTicks / entry.count).toFixed(0)} |`,
    );
  }
}
lines.push('');

lines.push('#### Promille tier usage');
lines.push('');
if (tierTotal === 0) {
  lines.push('_No Promille ticks recorded._');
} else {
  lines.push('| Tier | Share of ticks |');
  lines.push('|---|---|');
  for (const [tier, ticks] of Array.from(tierTicks.entries()).sort(
    (a, b) => Number(a[0]) - Number(b[0]),
  )) {
    const name = PROMILLE_TIER_NAMES[tier] ?? `tier ${tier}`;
    lines.push(`| ${name} | ${((ticks / tierTotal) * 100).toFixed(1)}% |`);
  }
}
lines.push('');

const body = lines.join('\n');
console.log(body);
if (outPath !== undefined) {
  writeFileSync(outPath, `${body}\n`, 'utf8');
}
