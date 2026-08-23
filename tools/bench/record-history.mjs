/**
 * Appends one benchmark run to the committed history.
 *
 * Usage: `node tools/bench/record-history.mjs [results.json]`
 *
 * One JSON object per line in `bench/history.jsonl`, appended by CI on every
 * push to `main` and committed. JSON Lines rather than a JSON array because an
 * append is a single line added to the end of a file: two runs landing close
 * together produce a conflict a person can resolve by keeping both lines, where
 * an array produces one in the middle of a bracket.
 *
 * The gate on a pull request is a same-runner comparison and does not read this
 * file — see `compare.mjs` for why that has to be true. What this is for is the
 * other question, the one no single comparison answers: whether the game has
 * been getting slower a percent at a time for two months. Every entry carries
 * its runner and its Node version, because a step in the trend is as likely to
 * be GitHub changing the fleet as it is to be the game.
 */

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const resultsPath =
  process.argv[2] ?? fileURLToPath(new URL('../../bench/results.json', import.meta.url));
const historyPath = fileURLToPath(new URL('../../bench/history.jsonl', import.meta.url));

const report = JSON.parse(readFileSync(resultsPath, 'utf8'));

const entry = {
  recordedAt: new Date().toISOString(),
  commit: report.commit,
  node: report.node,
  platform: report.platform,
  runner: process.env.RUNNER_NAME ?? process.env.RUNNER_OS ?? 'local',
  scene: report.scene,
  simTickMedianMs: round(report.simTick.medianMs),
  simTickP95Ms: round(report.simTick.p95Ms),
  frameMedianMs: round(report.frame.medianMs),
  frameP95Ms: round(report.frame.p95Ms),
  simHeapBytesPerTick: Math.round(report.simHeapBytesPerTick),
};

function round(value) {
  return Math.round(value * 1000) / 1000;
}

mkdirSync(dirname(historyPath), { recursive: true });
appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, 'utf8');
console.log(`appended ${entry.commit.slice(0, 7)} to bench/history.jsonl`);
