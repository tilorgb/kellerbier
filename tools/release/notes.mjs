/**
 * Seeds the release notes for the next itch.io build.
 *
 * Usage:
 *   npm run release:notes              print a draft to stdout
 *   npm run release:notes -- --write   write docs/releases/<date>.md
 *
 * The commit range runs from the `Build:` commit of the newest file in
 * `docs/releases/` to HEAD. Every merged change since then is listed by its
 * PR title (the repo squash-merges, so one commit is one PR); the bench's
 * `chore(bench): record` commits are dropped. The draft is a starting point:
 * a person groups the lines into New / Changed / Fixed and rewrites them for a
 * player, and keeps the main boss out of it (`docs/releases/README.md`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dir = join(root, 'docs', 'releases');
const write = process.argv.includes('--write');

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

/** The build commit named by the newest `YYYY-MM-DD*.md` in `docs/releases/`, if any. */
function lastBuild() {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(name))
    .sort();
  const newest = files.at(-1);
  if (newest === undefined) return undefined;
  const match = /^Build:\s*`?([0-9a-f]{7,40})`?/m.exec(readFileSync(join(dir, newest), 'utf8'));
  return match?.[1];
}

const since = lastBuild();
const head = git('rev-parse', '--short=7', 'HEAD');
const range = since === undefined ? [] : [`${since}..HEAD`];
const subjects = git('log', '--first-parent', '--format=%s', ...range)
  .split('\n')
  .filter((line) => line !== '' && !line.startsWith('chore(bench): record'));

const today = new Date().toISOString().slice(0, 10);
const lines = [
  `# <Headline for ${today}>`,
  '',
  `Build: \`${head}\``,
  '',
  '<!-- One or two sentences a player would care about. No main-boss details. -->',
  '',
  '## New',
  '',
  '## Changed',
  '',
  '## Fixed',
  '',
  '## Known',
  '',
  '<!-- Merged since ' +
    (since ?? 'the start') +
    '. Delete this block once the sections above are written. -->',
  ...subjects.map((subject) => `<!-- - ${subject.replace(/-->/g, '')} -->`),
  '',
];
const text = lines.join('\n');

if (write) {
  const file = join(dir, `${today}.md`);
  if (existsSync(file)) {
    console.error(`${file} already exists; edit it instead`);
    process.exit(1);
  }
  writeFileSync(file, text);
  console.log(`wrote ${file}  (${subjects.length} changes since ${since ?? 'the start'})`);
} else {
  process.stdout.write(text);
}
