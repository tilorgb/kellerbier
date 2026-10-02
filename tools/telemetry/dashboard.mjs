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

/** The post-run questions' wording, by id (`src/app/playtest/questions.ts`) — the data carries only the id. */
const QUESTION_LABELS = {
  'what-is-it': 'In your own words, what is this game?',
  confusion: 'What killed you or slowed you down that you did not understand?',
  item: 'What did you pick up or find that you did not understand?',
  blocked: 'A moment you wanted to do something the game would not let you?',
  again: 'Would you play another run right now? Why or why not?',
};

/**
 * `--public` (#362): the report is going somewhere anyone can read — the
 * comment on the balance issue — so it says how many answers each question
 * got and none of what they say. A free-text box filled in by strangers is
 * spam, abuse or somebody's personal details waiting to be published under
 * the project's name. `npm run telemetry:report` prints the full report locally.
 */
const PUBLIC_FLAG = '--public';
const publicReport = process.argv.includes(PUBLIC_FLAG);

/**
 * Tester text is untrusted and can end up in a GitHub comment: collapse it to
 * one line, defuse markup and @-mentions so it cannot ping anyone or inject a
 * link/image. That goes for ids too — the Worker accepts a POST from anyone,
 * so an item or enemy "id" is whatever the sender typed.
 */
function safeText(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
    .replace(/@/g, '@\u200b')
    .replace(/[[\]()`*_~|#]/g, (c) => `\\${c}`);
}

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
    if (path === PUBLIC_FLAG) {
      continue;
    }
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

/** One telemetry export file's parsed JSON, or `null` with a warning if it isn't one. */
function readFile(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    console.warn(`[telemetry-dashboard] skipping ${path}: not valid JSON (${error.message})`);
    return null;
  }
  if (!Array.isArray(parsed?.runs)) {
    console.warn(
      `[telemetry-dashboard] skipping ${path}: no "runs" array — not a telemetry export`,
    );
    return null;
  }
  return parsed;
}

const files = resolveFiles(inputs)
  .map(readFile)
  .filter((file) => file !== null);
const runs = files.flatMap((file) => file.runs);
// `feedback` is absent from files exported before the playtest build's questions existed.
const feedback = files.flatMap((file) => (Array.isArray(file.feedback) ? file.feedback : []));

if (runs.length === 0 && feedback.length === 0) {
  console.log('No telemetry runs found in the given files.');
  process.exit(0);
}

const wins = runs.filter((run) => run.outcome === 'won').length;
const winRate = runs.length === 0 ? 0 : wins / runs.length;

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
      ? [...run.deathCause.enemiesPresent].map(safeText).sort().join(', ')
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
    const key = `floor ${String(clear.floor)} — ${safeText(clear.role)}`;
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
    lines.push(
      `| ${safeText(itemId)} | ${String(entry.appearances)} | ${(rate * 100).toFixed(1)}% |`,
    );
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

lines.push('#### Tester answers');
lines.push('');
if (feedback.length === 0) {
  lines.push('_No answers yet._');
} else {
  const byQuestion = new Map();
  for (const entry of feedback) {
    const list = byQuestion.get(entry.questionId) ?? [];
    list.push(entry);
    byQuestion.set(entry.questionId, list);
  }
  if (publicReport) {
    lines.push('| Question | Answers |');
    lines.push('|---|---|');
    for (const [id, entries] of byQuestion) {
      lines.push(`| ${QUESTION_LABELS[id] ?? safeText(id)} | ${String(entries.length)} |`);
    }
    lines.push('');
    lines.push(
      '_What testers wrote is left out of this public report. Read it locally with `npm run telemetry:report`._',
    );
  } else {
    for (const [id, entries] of byQuestion) {
      lines.push(`**${QUESTION_LABELS[id] ?? safeText(id)}** (${String(entries.length)})`);
      lines.push('');
      for (const entry of entries) {
        lines.push(`> ${safeText(entry.text)}`);
        lines.push(`> — session \`${safeText(entry.sessionId ?? 'unknown').slice(0, 8)}\``);
        lines.push('');
      }
    }
  }
}
lines.push('');

const body = lines.join('\n');
console.log(body);
if (outPath !== undefined) {
  writeFileSync(outPath, `${body}\n`, 'utf8');
}
