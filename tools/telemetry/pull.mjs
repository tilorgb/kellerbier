/**
 * Pulls everything testers have sent from the telemetry Worker and prints the
 * full report — tester answers included — on this machine (#362).
 *
 * The daily report on the balance issue is public, so it carries only how
 * many answers each question got. This is where the answers themselves are
 * read: nothing in a public repository's Actions is private (run summaries,
 * logs and artifacts are all readable by anyone), so the unredacted report
 * has to be built somewhere that is not GitHub.
 *
 * Usage: `npm run telemetry:report [-- --build ID] [--out FILE]`
 * Extra arguments are passed straight to `dashboard.mjs`.
 *
 * Needs the Worker's `ADMIN_KEY` as `TELEMETRY_ADMIN_KEY`, from the
 * environment or from a `.env.local` at the repo root (git-ignored). The
 * export is written to `runs.json`, also git-ignored: it holds every answer.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

function adminKey() {
  if (process.env.TELEMETRY_ADMIN_KEY) {
    return process.env.TELEMETRY_ADMIN_KEY;
  }
  const envFile = `${root}.env.local`;
  if (existsSync(envFile)) {
    const match = /^TELEMETRY_ADMIN_KEY=(.+)$/m.exec(readFileSync(envFile, 'utf8'));
    if (match) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

const key = adminKey();
if (key === null) {
  console.error(
    'TELEMETRY_ADMIN_KEY is not set. Put `TELEMETRY_ADMIN_KEY=<the Worker ADMIN_KEY>` in .env.local, or export it.',
  );
  process.exit(1);
}

// The one place the endpoint is written down — the same line the report workflow reads.
const endpoint = /https:\/\/[^']+/.exec(
  readFileSync(`${root}src/app/telemetry/endpoint.ts`, 'utf8'),
)?.[0];
if (endpoint === undefined) {
  console.error('No telemetry endpoint is set in src/app/telemetry/endpoint.ts.');
  process.exit(1);
}

const url = new URL('export', endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
url.searchParams.set('key', key);
const response = await fetch(url);
if (!response.ok) {
  console.error(`The Worker answered ${String(response.status)} — is the key right?`);
  process.exit(1);
}
const outFile = `${root}runs.json`;
writeFileSync(outFile, await response.text(), 'utf8');

const report = spawnSync(
  process.execPath,
  [`${root}tools/telemetry/dashboard.mjs`, outFile, ...process.argv.slice(2)],
  { stdio: 'inherit' },
);
process.exit(report.status ?? 1);
