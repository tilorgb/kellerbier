/**
 * The audio editor's bridge to the local sound bench — the text-to-sound
 * counterpart of the pixel bench (`docs/DECISIONS.md` #77), a small server
 * outside this repo (`D:\repos\ComfyUI\sound-bench`, port 8198) that runs a
 * prompt through Stable Audio Open and cleans each take into a one-shot.
 *
 * Kept apart from `server.mjs` for the same reason `tools/pixel-editor/
 * strip.mjs` is: these are the parts with logic worth a unit test, and
 * neither needs a Vite dev server to run — the bench call takes its `fetch`
 * as an argument, the README bookkeeping is text in, text out.
 *
 * The bench is a per-machine tool, not a dependency: it exists on the
 * machine with the GPU and nowhere else. So a missing bench is an expected
 * state with its own message (`SoundBenchOfflineError`), not a 500.
 */

export const SOUND_BENCH_URL = 'http://127.0.0.1:8198';

/** `assets/audio/README.md`'s section a generated file is recorded under. */
export const GENERATED_HEADING = '## Generated files';

const PICKS = new Set(['loudest', 'first', 'all']);

export class SoundBenchOfflineError extends Error {
  constructor() {
    super(
      `the sound bench is not running at ${SOUND_BENCH_URL} — start it (start-sound-bench.bat in ComfyUI's sound-bench folder) and try again`,
    );
    this.name = 'SoundBenchOfflineError';
  }
}

function clamp(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

/**
 * The editor's request, narrowed to what the bench is asked for. A one-shot
 * is the editor's default (`pick: 'loudest'`) where the bench's own is
 * `'all'`: an SFX slot wants one event, and a model asked for "a clink" tends
 * to return three.
 */
export function benchRequestFor(body) {
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length === 0) {
    throw new Error('"prompt" must be a non-empty string');
  }
  return {
    prompt,
    negative: typeof body.negative === 'string' ? body.negative : '',
    seconds: clamp(body.seconds, 3, 1, 20),
    count: Math.round(clamp(body.count, 4, 1, 8)),
    pick: PICKS.has(body.pick) ? body.pick : 'loudest',
    format: 'mp3',
    destFolder: 'kellerbier-audio-editor',
  };
}

/**
 * Asks the bench for takes and brings each usable one back *with its bytes*,
 * so the browser never talks to the bench itself (a second origin, and one
 * that sends no CORS headers). A take the bench's own report rejected —
 * silence, nothing above its gate — is counted in `dropped`, not returned:
 * there is nothing in it to audition.
 */
export async function generateTakes(body, fetchImpl = fetch) {
  const request = benchRequestFor(body);

  let response;
  try {
    response = await fetchImpl(`${SOUND_BENCH_URL}/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new SoundBenchOfflineError();
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(`the sound bench failed: ${result.error ?? String(response.status)}`);
  }

  const takes = [];
  let dropped = 0;
  for (const [index, take] of result.takes.entries()) {
    if (!take.report.ok || take.candidateUrl === null) {
      dropped += 1;
      continue;
    }
    const file = await fetchImpl(`${SOUND_BENCH_URL}${take.candidateUrl}`);
    if (!file.ok) {
      throw new Error(`the sound bench lost take ${String(index + 1)}: ${String(file.status)}`);
    }
    takes.push({
      take: index + 1,
      seconds: take.report.seconds,
      events: take.report.events,
      fillsTake: take.report.fillsTake === true,
      dataBase64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    });
  }

  return {
    prompt: request.prompt,
    seed: result.seed,
    count: result.takes.length,
    extension: result.format,
    takes,
    dropped,
  };
}

/** `null` if `origin` is a usable `{ prompt, seed, take, count }`, else what is wrong with it. */
export function validateGeneratedOrigin(origin) {
  if (typeof origin?.prompt !== 'string' || origin.prompt.trim().length === 0) {
    return 'generated.prompt must be a non-empty string';
  }
  for (const field of ['seed', 'take', 'count']) {
    if (!Number.isInteger(origin[field]) || origin[field] < 0) {
      return `generated.${field} must be a non-negative integer`;
    }
  }
  return null;
}

/** One table cell: a prompt is free text, and a `|` or a newline in it would break the row it sits in. */
function cell(text) {
  return String(text).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

function generatedRow(fileName, origin, date) {
  const seed = `${String(origin.seed)}, take ${String(origin.take)} of ${String(origin.count)}`;
  return `| \`${fileName}\` | ${cell(origin.prompt)} | ${seed} | ${date} |`;
}

const isRowFor = (fileName) => (line) => line.startsWith(`| \`${fileName}\` |`);

/** Whether the README already lists `fileName` as generated — what makes it safe for another take to replace it. */
export function isRecordedAsGenerated(readmeText, fileName) {
  return readmeText.split('\n').some(isRowFor(fileName));
}

/**
 * `assets/audio/README.md` with `fileName` recorded as generated — a row in
 * the table under `GENERATED_HEADING`, replacing the file's existing row if
 * it has one (an upload under a name already in use overwrites the file, so
 * its old origin is no longer true of it).
 *
 * This is what keeps that README's provenance statement honest without
 * anybody having to remember to: the same request that writes a generated
 * file writes down that it was generated, with enough to make it again.
 * Throws if the section is missing rather than inventing one, since the
 * section's own prose (which model, which licence) is not this function's to
 * write.
 */
export function recordGeneratedFile(readmeText, { fileName, origin, date }) {
  const lines = readmeText.split('\n');
  const heading = lines.findIndex((line) => line.trim() === GENERATED_HEADING);
  if (heading === -1) {
    throw new Error(`assets/audio/README.md has no "${GENERATED_HEADING}" section to record into`);
  }
  let sectionEnd = lines.findIndex((line, index) => index > heading && line.startsWith('## '));
  if (sectionEnd === -1) {
    sectionEnd = lines.length;
  }

  const row = generatedRow(fileName, origin, date);
  const isRow = isRowFor(fileName);
  const existing = lines.findIndex(
    (line, index) => index > heading && index < sectionEnd && isRow(line),
  );
  if (existing !== -1) {
    lines[existing] = row;
    return lines.join('\n');
  }

  let lastTableLine = -1;
  for (let index = heading + 1; index < sectionEnd; index += 1) {
    if (lines[index].startsWith('|')) {
      lastTableLine = index;
    }
  }
  if (lastTableLine === -1) {
    throw new Error(`the "${GENERATED_HEADING}" section of assets/audio/README.md has no table`);
  }
  lines.splice(lastTableLine + 1, 0, row);
  return lines.join('\n');
}

/**
 * The reverse of `recordGeneratedFile`, for a file that is being overwritten
 * by something that was *not* generated — a real recording uploaded under a
 * name a generated one held. Leaving the row would claim the recording came
 * out of a model.
 */
export function forgetGeneratedFile(readmeText, fileName) {
  const isRow = isRowFor(fileName);
  return readmeText
    .split('\n')
    .filter((line) => !isRow(line))
    .join('\n');
}
