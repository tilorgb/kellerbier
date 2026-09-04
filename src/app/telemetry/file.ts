import { type TelemetryStore, sanitizeTelemetryStore } from './schema.js';

/**
 * The buffered telemetry as a standalone `.json` file — `replay/file.ts`'s
 * download shape, reused for the same reason: this is a file a player
 * chooses to hand to whoever is running the balance pass
 * (`docs/BALANCE_METHODOLOGY.md`), not a value that only ever lives in
 * `localStorage`. Wrapped in `{ schemaVersion, sessionId, runs }` rather than
 * a bare array so `tools/telemetry/dashboard.mjs` can tell which session a
 * file came from without the player having to type it in separately.
 */
export const TELEMETRY_FILE_VERSION = 1;

interface TelemetryFile {
  readonly schemaVersion: number;
  readonly sessionId: string | null;
  readonly runs: TelemetryStore['runs'];
}

/** The buffered telemetry, as JSON text fit for a `.json` download. */
export function exportTelemetryText(store: TelemetryStore): string {
  const file: TelemetryFile = {
    schemaVersion: TELEMETRY_FILE_VERSION,
    sessionId: store.sessionId,
    runs: store.runs,
  };
  return JSON.stringify(file, null, 2);
}

/** Parses an exported `.json` file's text back into a `TelemetryStore` shape — used by `tools/telemetry/dashboard.mjs`'s own reader and tested here so the two stay in sync. */
export function parseTelemetryText(text: string): TelemetryStore | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const candidate = parsed as Partial<TelemetryFile>;
  return sanitizeTelemetryStore({
    optedIn: true,
    sessionId: candidate.sessionId ?? null,
    runs: candidate.runs ?? [],
  });
}

/** Offers the buffered telemetry as a `.json` download via a plain `<a download>` blob — `replay/file.ts#downloadReplayFile`'s identical mechanism. */
export function downloadTelemetryFile(store: TelemetryStore): void {
  const blob = new Blob([exportTelemetryText(store)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `kellerbier-telemetry-${store.sessionId ?? 'unknown'}-${String(Date.now())}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
