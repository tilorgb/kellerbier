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
const { choosePreviewFloor, closedIssueNumbers, floorTagsFromSource } =
  await import('./preview-floor.mjs');
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

/**
 * Which floor the link starts on — `preview-floor.mjs` decides, from the PR
 * body, the issues it closes and the files it changes. Every lookup is
 * best-effort: a failed fetch only ever costs the floor parameter, never the
 * comment, so a flaky API call degrades to the plain link.
 */
async function previewFloor() {
  const prBody = event.pull_request?.body ?? '';
  const floorTags = floorTagsFromSource(await readFile('src/content/floors/definition.ts', 'utf8'));
  const { milestones } = JSON.parse(await readFile('tools/roadmap/plan.json', 'utf8'));
  const issues = [];
  for (const issueNumber of closedIssueNumbers(prBody)) {
    try {
      issues.push(await api(`/repos/${repository}/issues/${String(issueNumber)}`));
    } catch (error) {
      console.error(`could not read #${String(issueNumber)}: ${String(error)}`);
    }
  }
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(
      `/repos/${repository}/pulls/${number}/files?per_page=100&page=${String(page)}`,
    );
    files.push(...batch.map((file) => file.filename));
    if (batch.length < 100) {
      break;
    }
  }
  return choosePreviewFloor({ body: prBody, issues, files, milestones, floorTags });
}

let choice = { floor: null, reason: 'the floor could not be worked out' };
try {
  choice = await previewFloor();
} catch (error) {
  console.error(`preview floor: ${String(error)}`);
}
const separator = url.includes('?') ? '&' : '?';
const link = choice.floor === null ? url : `${url}${separator}floor=${String(choice.floor)}`;
const startsOn =
  choice.floor === null
    ? `Starts a normal run on floor 1 — ${choice.reason}.`
    : `Starts a sandbox run on **floor ${String(choice.floor)}** — ${choice.reason}. ` +
      `The whole game from floor 1: ${url}`;

const sha = (event.pull_request?.head?.sha ?? '').slice(0, 7);
const body = [
  MARKER,
  '### ▶ Playable preview',
  '',
  `**${link}**`,
  '',
  startsOn,
  '_Put `Preview floor: N` (or `none`) on its own line in the PR body to choose._',
  '',
  `Built from \`${sha}\`. A game is judged by feel, and feel cannot be reviewed in a diff —`,
  'click the link and play the change.',
  '',
  '| | |',
  '|---|---|',
  '| Controls | `WASD` move · arrows aim and fire |',
  '| Debug overlay | `O` — frame graph, hitboxes (`H`), spatial grid (`G`) |',
  '',
  '_Frame-time deltas are in the benchmark comment below._',
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
