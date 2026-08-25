/**
 * Compares two benchmark reports and decides whether a change made the game slower.
 *
 * Usage: `node tools/bench/compare.mjs <base.json> <head.json> [--out FILE]`
 *
 * The two reports are expected to come from the *same machine, minutes apart* —
 * CI runs the benchmark twice, once on the merge base and once on the pull
 * request, on one runner. That is not belt and braces. A shared CI runner's
 * absolute numbers move by a third between mornings depending on what else is
 * on the host, so a comparison against a number recorded last week measures the
 * fleet rather than the diff, and the tolerance band needed to absorb that is
 * wide enough to hide any regression worth catching.
 *
 * Exits non-zero when a metric regressed, which is what makes this a gate
 * rather than a report.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * What counts as a regression, per metric.
 *
 * Two conditions, both required. The **band** is the proportional move, which
 * is what catches a real regression on a metric of any size. The **floor** is
 * an absolute move underneath which nothing is reported at all, and it is the
 * part that keeps this quiet: a metric sitting at 0.2 ms crosses a 15% band
 * because a core went somewhere else for a moment, and a gate that cries about
 * that is a gate people learn to ignore.
 *
 * The bands are wider than the run-to-run spread measured locally — the
 * simulation tick reads within 5% across runs and the heap figure was identical
 * to a tenth of a kilobyte three runs in a row — because the spread on a shared
 * runner is not the spread on a desk.
 */
const METRICS = [
  {
    key: 'simTick',
    label: 'Simulation tick',
    read: (report) => report.simTick.medianMs,
    format: (value) => `${value.toFixed(3)} ms`,
    band: 0.15,
    floor: 0.25,
  },
  {
    key: 'frame',
    label: 'Full frame',
    read: (report) => report.frame.medianMs,
    format: (value) => `${value.toFixed(3)} ms`,
    band: 0.15,
    floor: 0.4,
  },
  {
    key: 'simHeap',
    label: 'Simulation heap',
    read: (report) => report.simHeapBytesPerTick,
    format: (value) => `${(value / 1024).toFixed(1)} KB/tick`,
    band: 0.25,
    floor: 16 * 1024,
  },
];

const [basePath, headPath, ...rest] = process.argv.slice(2);
if (headPath === undefined) {
  console.error('usage: compare.mjs <base.json> <head.json> [--out FILE]');
  process.exit(2);
}

const outFlag = rest.indexOf('--out');
const outPath = outFlag === -1 ? undefined : rest[outFlag + 1];

const head = JSON.parse(readFileSync(headPath, 'utf8'));
const base = readOptional(basePath);

function readOptional(path) {
  if (path === undefined || path === 'none') {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // A pull request whose base predates the benchmark has nothing to compare
    // against, and that is not a failure — it is the first run.
    return undefined;
  }
}

const rows = METRICS.map((metric) => {
  const now = metric.read(head);
  if (base === undefined) {
    return { metric, now, then: undefined, delta: undefined, regressed: false };
  }
  const then = metric.read(base);
  const delta = now - then;
  const regressed = delta > metric.floor && delta > then * metric.band;
  return { metric, now, then, delta, regressed };
});

const regressions = rows.filter((row) => row.regressed);

const lines = [];
lines.push('### ⏱ Frame-time benchmark');
lines.push('');
lines.push(
  `Stress scene — ${head.scene.projectiles} projectiles, ${head.scene.enemies} enemies, ` +
    `${head.scene.particles} particles, over ${head.scene.ticks} ticks.`,
);
lines.push('');

if (base === undefined) {
  lines.push('| Metric | This branch |');
  lines.push('|---|---|');
  for (const row of rows) {
    lines.push(`| ${row.metric.label} | ${row.metric.format(row.now)} |`);
  }
  lines.push('');
  lines.push('_No benchmark on the base commit, so there is nothing to compare against yet._');
} else {
  lines.push('| Metric | Base | This branch | Delta | |');
  lines.push('|---|---|---|---|---|');
  for (const row of rows) {
    const percent = row.then === 0 ? 0 : (row.delta / row.then) * 100;
    const sign = row.delta >= 0 ? '+' : '−';
    lines.push(
      `| ${row.metric.label} | ${row.metric.format(row.then)} | ${row.metric.format(row.now)} | ` +
        `${sign}${Math.abs(percent).toFixed(1)}% | ${row.regressed ? '🔴' : '🟢'} |`,
    );
  }
  lines.push('');
  lines.push(
    regressions.length === 0
      ? '_Both runs are from the same runner, minutes apart, so the delta is about the diff._'
      : `**${regressions.length} metric${regressions.length === 1 ? '' : 's'} regressed** past ` +
          'the tolerance band. Both runs are from the same runner, minutes apart — this is ' +
          'the diff, not the weather.',
  );
}

lines.push('');
lines.push(
  '_Draw calls are not measurable headless; the debug overlay (`O`) counts them in the browser._',
);

const body = lines.join('\n');
console.log(body);
if (outPath !== undefined) {
  writeFileSync(outPath, `${body}\n`, 'utf8');
}

process.exit(regressions.length === 0 ? 0 : 1);
