import { exportTelemetryText } from './file.js';
import type { TelemetryStore } from './schema.js';

/** The answers a "Send" click would upload, by the same rule. */
export function unsentFeedback(store: TelemetryStore): TelemetryStore['feedback'] {
  return store.feedback.filter((entry) => entry.sentAt === undefined);
}

/** What a send delivered, so the caller can stamp it. */
export interface SentIds {
  readonly runIds: readonly string[];
  readonly feedbackIds: readonly string[];
}

/** The runs a "Send" click would upload: everything not already delivered by an earlier click. */
export function unsentRuns(store: TelemetryStore): TelemetryStore['runs'] {
  return store.runs.filter((run) => run.sentAt === undefined);
}

/**
 * Posts the not-yet-sent runs and answers to `endpoint`, in the same `{ schemaVersion,
 * sessionId, runs }` shape as the exported file so the dashboard reads
 * either. Resolves to what was sent, or `null` on any failure (network,
 * non-2xx) — the caller keeps the runs unsent and the player can retry.
 *
 * Sent as `text/plain` on purpose: it is a CORS "simple" request, so the
 * browser makes no preflight and the Worker needs no OPTIONS handler.
 * Only ever called from a player's own click; nothing here runs on its own.
 */
export async function sendTelemetry(
  store: TelemetryStore,
  endpoint: string,
  fetchFn: typeof fetch = fetch,
): Promise<SentIds | null> {
  const runs = unsentRuns(store);
  const feedback = unsentFeedback(store);
  if (!store.optedIn || endpoint === '' || (runs.length === 0 && feedback.length === 0)) {
    return null;
  }
  try {
    const response = await fetchFn(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: exportTelemetryText({ ...store, runs, feedback }, true),
    });
    return response.ok
      ? { runIds: runs.map((run) => run.runId), feedbackIds: feedback.map((entry) => entry.id) }
      : null;
  } catch {
    return null;
  }
}

/** The fallback for a tester who cannot or will not use Send: the same JSON on the clipboard, to paste into a message. Resolves to whether the browser allowed it. */
export async function copyTelemetry(store: TelemetryStore): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(exportTelemetryText(store, true));
    return true;
  } catch {
    return false;
  }
}
