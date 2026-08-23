/**
 * Selects the least noisy report from several independent benchmark runs.
 *
 * Heap allocation has two stable V8 modes on the CI runner. The lower mode is
 * the useful baseline because the measurement's own noise can only increase
 * the result; a real allocation remains present in every process.
 *
 * Usage: `node tools/bench/select.mjs <report...> --out FILE`
 */

import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outPath = outFlag === -1 ? undefined : args[outFlag + 1];
const reportPaths = args.filter((arg, index) => arg !== '--out' && index !== outFlag + 1);

if (reportPaths.length === 0 || outPath === undefined) {
  console.error('usage: node tools/bench/select.mjs <report...> --out FILE');
  process.exit(2);
}

const reports = reportPaths.map((path) => JSON.parse(readFileSync(path, 'utf8')));
const selected = reports.reduce((best, report) =>
  report.simHeapBytesPerTick < best.simHeapBytesPerTick ? report : best,
);

writeFileSync(outPath, `${JSON.stringify(selected, null, 2)}\n`, 'utf8');
console.log(
  `selected ${selected.simHeapBytesPerTick.toFixed(1)} bytes/tick from ${String(reports.length)} reports`,
);
