/**
 * Zips the tester build for itch.io's HTML5 upload (#365).
 *
 * Usage:
 *   npm run build:itch           (builds `dist-tester/`, then this)
 *   node tools/release/itch-zip.mjs [build-dir] [--out FILE]
 *
 * The tester build is already the right shape — a plain folder, relative
 * asset paths, `index.html` at the top (`vite.tester.config.ts`). This only
 * packs it, and refuses to pack something itch.io would reject: the checks
 * below are its documented limits for an HTML5 game, and finding out from an
 * upload form is slower than finding out here.
 *
 * `tools/release/ITCH.md` has the page settings and the embed checklist.
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createZip } from './zip.mjs';

const MAX_FILES = 1000;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_PATH_LENGTH = 240;

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outArg = outFlag === -1 ? undefined : args.splice(outFlag, 2)[1];
const buildDir = args[0] ?? join(root, 'dist-tester');

if (!existsSync(join(buildDir, 'index.html'))) {
  console.error(`no index.html in ${buildDir} — run \`npm run build:tester\` first`);
  process.exit(1);
}

function commit() {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) {
    return fromCi.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short=7 HEAD', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

/** Every file under `dir`, as paths relative to `buildDir` with forward slashes, sorted so the archive is reproducible. */
function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else {
      found.push(relative(buildDir, full).split(sep).join('/'));
    }
  }
  return found.sort();
}

const entries = walk(buildDir).map((path) => ({
  path,
  data: readFileSync(join(buildDir, path)),
}));
// The licence notices have to travel with the game (docs/LEGAL_REVIEW.md §3.1): the build
// minifies them out of the bundle, so the upload carries the file itself.
entries.push({
  path: 'THIRD-PARTY-NOTICES.txt',
  data: readFileSync(join(root, 'THIRD-PARTY-NOTICES.md')),
});

const problems = [];
if (entries.length > MAX_FILES) {
  problems.push(`${String(entries.length)} files; itch.io allows ${String(MAX_FILES)}`);
}
const total = entries.reduce((sum, entry) => sum + entry.data.length, 0);
if (total > MAX_TOTAL_BYTES) {
  problems.push(`${(total / 1048576).toFixed(0)} MB extracted; itch.io allows 500 MB`);
}
for (const entry of entries) {
  if (entry.data.length > MAX_FILE_BYTES) {
    problems.push(`${entry.path} is over 200 MB`);
  }
  if (entry.path.length > MAX_PATH_LENGTH) {
    problems.push(`${entry.path} is longer than ${String(MAX_PATH_LENGTH)} characters`);
  }
}
if (problems.length > 0) {
  console.error(`itch.io would reject this build:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const outFile = outArg ?? join(root, 'dist-itch', `kellerbier-${commit()}.zip`);
mkdirSync(dirname(outFile), { recursive: true });
const zip = createZip(entries);
writeFileSync(outFile, zip);
console.log(
  `${outFile}\n  ${String(entries.length)} files, ${(total / 1048576).toFixed(1)} MB extracted, ${(zip.length / 1048576).toFixed(1)} MB zipped`,
);
