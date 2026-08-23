/**
 * Applies the label scheme in `labels.json`.
 *
 * Labels created through the API arrive grey and undescribed, which makes an
 * issue list unreadable at a glance — the milestone and the kind of work are
 * the two things you want to see without opening anything, and grey-on-grey
 * gives you neither.
 *
 * The scheme lives in a file rather than in somebody's memory of a settings
 * page, so that adding a label is a reviewable change and re-running this is
 * always safe. Existing labels are updated in place; nothing is deleted, since
 * a label this file does not know about is far more likely to be deliberate
 * than to be a mistake.
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node tools/labels/apply-labels.mjs
 *   node tools/labels/apply-labels.mjs --dry-run
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dryRun = process.argv.includes('--dry-run');
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!dryRun && (!token || !repository)) {
  console.error('Set GITHUB_TOKEN and GITHUB_REPOSITORY, or pass --dry-run.');
  process.exit(1);
}

const scheme = JSON.parse(
  await readFile(fileURLToPath(new URL('./labels.json', import.meta.url)), 'utf8'),
);

/** Every label the scheme defines, flattened. */
const wanted = new Map();
for (const group of Object.values(scheme)) {
  for (const [name, spec] of Object.entries(group)) {
    wanted.set(name, spec);
  }
}

if (dryRun) {
  for (const [name, spec] of wanted) {
    console.log(`#${spec.color}  ${name.padEnd(10)} ${spec.description}`);
  }
  console.log(`\n${String(wanted.size)} labels defined.`);
  process.exit(0);
}

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
};

const existing = new Map();
for (let page = 1; ; page++) {
  const batch = await api(`/repos/${repository}/labels?per_page=100&page=${String(page)}`);
  for (const label of batch) {
    existing.set(label.name, label);
  }
  if (batch.length < 100) {
    break;
  }
}

let created = 0;
let updated = 0;
let unchanged = 0;

for (const [name, spec] of wanted) {
  const current = existing.get(name);
  if (current === undefined) {
    await api(`/repos/${repository}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name, color: spec.color, description: spec.description }),
    });
    console.log(`created  ${name}`);
    created += 1;
    continue;
  }
  if (current.color === spec.color && (current.description ?? '') === spec.description) {
    unchanged += 1;
    continue;
  }
  await api(`/repos/${repository}/labels/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify({ color: spec.color, description: spec.description }),
  });
  console.log(`updated  ${name}`);
  updated += 1;
}

const unknown = [...existing.keys()].filter((name) => !wanted.has(name));
if (unknown.length > 0) {
  console.log(`\nNot in the scheme, left alone: ${unknown.join(', ')}`);
}
console.log(
  `\n${String(created)} created, ${String(updated)} updated, ${String(unchanged)} already correct.`,
);
