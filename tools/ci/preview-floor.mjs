/**
 * Which floor a pull request's playable preview link should start on.
 *
 * The preview is a reviewer build, so it honours `?floor=N` (a sandbox run,
 * `src/app/start-floor.ts`). A PR that is Floor 3 work should drop its
 * reviewer straight onto floor 3; a PR that touches the whole game — the
 * engine, the HUD, a balance pass — gets the plain link, which starts a run
 * on floor 1 like any player's. Decided in this order:
 *
 * 1. **An explicit line in the PR body**: `Preview floor: 3`, or
 *    `Preview floor: none` for the plain link. Always wins.
 * 2. **The issues the PR closes** (`Closes`/`Fixes`/`Resolves #N`): each
 *    issue's milestone label (`M10`) is looked up in
 *    `tools/roadmap/plan.json`, and a milestone named for one floor ("Floor 3
 *    — Der Wald") names that floor; failing a milestone, the issue title's own
 *    "Floor N". If the floor-specific issues all agree, that floor.
 * 3. **The files the PR changes**, when no closed issue names a floor: a
 *    path carrying one floor's tag (`wald-grove.json`, `build-floor2-roster`)
 *    names that floor. If every floor-specific file agrees, that floor.
 *
 * Anything else — no signal, or signals for two different floors — is the
 * plain link. So is floor 1: a run already starts there.
 *
 * Pure and dependency-free, so `tests/unit/preview-floor.test.ts` can pin it;
 * `comment-preview.mjs` does the fetching.
 */

/** `{ floorTag: floor }` from the source of `src/content/floors/definition.ts`'s `FLOOR_CONFIGS`. */
export function floorTagsFromSource(source) {
  const tags = {};
  const pattern = /floor:\s*(\d+),[\s\S]*?floorTag:\s*'([a-z]+)'/g;
  for (const match of source.matchAll(pattern)) {
    tags[match[2]] = Number(match[1]);
  }
  return tags;
}

/** The single floor a milestone or issue title is named for — "Floor 3 — Der Wald" — or null. */
export function floorNamedIn(text) {
  const floors = new Set(
    [...String(text ?? '').matchAll(/\bFloor (\d+)\b/g)].map((m) => Number(m[1])),
  );
  return floors.size === 1 ? [...floors][0] : null;
}

/** Issue numbers a PR body closes — `Closes #12`, `fixes #3`, `Resolves #40`. */
export function closedIssueNumbers(body) {
  const numbers = new Set();
  for (const match of String(body ?? '').matchAll(
    /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
  )) {
    numbers.add(Number(match[1]));
  }
  return [...numbers];
}

/** The floor one closed issue is about, from its milestone label first and its title second. */
export function issueFloor(issue, milestones) {
  for (const label of issue.labels ?? []) {
    const name = typeof label === 'string' ? label : label?.name;
    const milestone = milestones.find((candidate) => candidate.id === name);
    if (milestone !== undefined) {
      const floor = floorNamedIn(milestone.name);
      if (floor !== null) {
        return floor;
      }
    }
  }
  return floorNamedIn(issue.title);
}

/** The floor a changed path is specific to, or null for a path every floor shares. */
export function pathFloor(path, floorTags) {
  const segments = String(path)
    .toLowerCase()
    .split(/[/._-]+/);
  const floors = new Set();
  for (const [tag, floor] of Object.entries(floorTags)) {
    if (segments.includes(tag)) {
      floors.add(floor);
    }
  }
  for (const match of String(path)
    .toLowerCase()
    .matchAll(/floor-?(\d+)/g)) {
    floors.add(Number(match[1]));
  }
  return floors.size === 1 ? [...floors][0] : null;
}

function single(values) {
  const distinct = new Set(values);
  return distinct.size === 1 ? [...distinct][0] : null;
}

/**
 * `{ floor, reason }` — `floor` is the number to put in `?floor=`, or null
 * for the plain link; `reason` is one line for the comment.
 */
export function choosePreviewFloor({ body, issues, files, milestones, floorTags }) {
  const plain = (reason) => ({ floor: null, reason });
  const floorOrPlain = (floor, reason) =>
    floor === null || floor <= 1 ? plain(reason) : { floor, reason };

  const override = /^\s*Preview floor:\s*(\d+|none)\s*$/im.exec(String(body ?? ''));
  if (override !== null) {
    const value = override[1].toLowerCase();
    return value === 'none'
      ? plain('`Preview floor: none` in the PR body')
      : floorOrPlain(Number(value), `\`Preview floor: ${value}\` in the PR body`);
  }

  const issueFloors = issues
    .map((issue) => ({ number: issue.number, floor: issueFloor(issue, milestones) }))
    .filter((entry) => entry.floor !== null);
  if (issueFloors.length > 0) {
    const floor = single(issueFloors.map((entry) => entry.floor));
    const named = issueFloors.map((entry) => `#${String(entry.number)}`).join(', ');
    return floor === null
      ? plain(`the closed issues (${named}) span more than one floor`)
      : floorOrPlain(floor, `closes ${named}, which is Floor ${String(floor)} work`);
  }

  const fileFloors = files.map((path) => pathFloor(path, floorTags)).filter((f) => f !== null);
  if (fileFloors.length > 0) {
    const floor = single(fileFloors);
    return floor === null
      ? plain('the changed files span more than one floor')
      : floorOrPlain(floor, `its floor-specific files are all Floor ${String(floor)}`);
  }
  return plain('nothing in it is specific to one floor');
}
