/**
 * Posts (or updates) the benchmark comment on a pull request.
 *
 * The body is written by `tools/bench/compare.mjs`; this only carries it to
 * GitHub. Split that way because the comparison is the part worth running
 * locally, and it should not need a token to do it.
 *
 * One comment, edited in place, for the reason the preview comment gives: a PR
 * with fifteen identical bot comments on it is a PR whose review conversation
 * has been buried by its own infrastructure.
 */

import { readFile } from 'node:fs/promises';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const eventPath = process.env.GITHUB_EVENT_PATH;
const bodyPath = process.env.BENCH_COMMENT_PATH;

if (!token || !repository || !eventPath || !bodyPath) {
  console.error('missing GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_EVENT_PATH or BENCH_COMMENT_PATH');
  process.exit(1);
}

const event = JSON.parse(await readFile(eventPath, 'utf8'));
const number = event.pull_request?.number;
if (number === undefined) {
  console.error('not a pull_request event');
  process.exit(1);
}

/** Marker that lets a later run find the comment it left last time. */
const MARKER = '<!-- kellerbier-bench -->';

const api = async (path, init = {}) => {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
};

const sha = (event.pull_request?.head?.sha ?? '').slice(0, 7);
const body = [
  MARKER,
  await readFile(bodyPath, 'utf8'),
  '',
  `Measured on this runner from \`${sha}\`.`,
].join('\n');

const comments = await api(`/repos/${repository}/issues/${number}/comments?per_page=100`);
const existing = comments.find((comment) => comment.body?.includes(MARKER));

if (existing) {
  await api(`/repos/${repository}/issues/comments/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
  console.log(`updated benchmark comment ${existing.id}`);
} else {
  await api(`/repos/${repository}/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  console.log('posted benchmark comment');
}
