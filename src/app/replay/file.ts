import { type ReplayRecord, sanitizeReplay } from '../save/schema.js';

/**
 * A replay as a standalone `.json` file — what `CONTRIBUTING.md`'s "attach
 * the replay file" bug-report step actually attaches (#48).
 *
 * Wrapped in `{ schemaVersion, replay }` rather than a bare `ReplayRecord`,
 * the same reasoning `save/schema.ts`'s own versioning already gives: a
 * format that can only ever be read one way is a format that has to be
 * thrown away the day it needs to change, and this is a file a player keeps
 * around and pastes into an issue, not a value that only ever lives as long
 * as one `localStorage` write.
 */
export const REPLAY_FILE_VERSION = 1;

interface ReplayFile {
  readonly schemaVersion: number;
  readonly replay: ReplayRecord;
}

/** The replay, as JSON text fit for a `.json` download. */
export function exportReplayText(replay: ReplayRecord): string {
  const file: ReplayFile = { schemaVersion: REPLAY_FILE_VERSION, replay };
  return JSON.stringify(file, null, 2);
}

/**
 * Parses a `.json` file's text back into a `ReplayRecord`.
 *
 * Returns `null` on anything that doesn't decode cleanly — a file picked by
 * mistake, one a future version wrote in a shape this build doesn't
 * recognise — rather than throwing, since the caller is a file input a
 * player just used and "that wasn't a replay" is worth a message, not a
 * crash.
 */
export function parseReplayText(text: string): ReplayRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = 'replay' in parsed ? parsed.replay : parsed;
  return sanitizeReplay(candidate);
}

/** Offers `replay` as a `.json` download via a plain `<a download>` blob. */
export function downloadReplayFile(replay: ReplayRecord): void {
  const blob = new Blob([exportReplayText(replay)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `kellerbier-replay-${String(replay.seed)}-${String(replay.recordedAt)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
