/**
 * Posts (or updates) the preview comment on a pull request.
 *
 * One comment, edited in place, rather than a new one per push. A PR with
 * fifteen identical bot comments on it is a PR whose review conversation has
 * been buried by its own infrastructure.
 */

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const url = process.env.PREVIEW_URL;
const eventPath = process.env.GITHUB_EVENT_PATH;

if (!token || !repository || !url || !eventPath) {
  console.error('missing GITHUB_TOKEN, GITHUB_REPOSITORY, PREVIEW_URL or GITHUB_EVENT_PATH');
  process.exit(1);
}

const { readFile } = await import('node:fs/promises');
const event = JSON.parse(await readFile(eventPath, 'utf8'));
const number = event.pull_request?.number;
if (number === undefined) {
  console.error('not a pull_request event');
  process.exit(1);
}

/** Marker that lets a later run find the comment it left last time. */
const MARKER = '<!-- kellerbier-preview -->';

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
  '### ▶ Playable preview',
  '',
  `**${url}**`,
  '',
  `Built from \`${sha}\`. A game is judged by feel, and feel cannot be reviewed in a diff —`,
  'click the link and play the change.',
  '',
  '| | |',
  '|---|---|',
  '| Controls | `WASD` move · mouse or arrows aim and fire |',
  '| Debug overlay | `F1` — frame graph, hitboxes (`H`), spatial grid (`G`) |',
  '',
  '_Frame-time deltas from the benchmark arrive with #16._',
].join('\n');

const comments = await api(`/repos/${repository}/issues/${number}/comments?per_page=100`);
const existing = comments.find((comment) => comment.body?.includes(MARKER));

if (existing) {
  await api(`/repos/${repository}/issues/comments/${existing.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
  console.log(`updated preview comment ${existing.id}`);
} else {
  await api(`/repos/${repository}/issues/${number}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  console.log('posted preview comment');
}
