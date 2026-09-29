import { loadSave, updateSave } from '../save/storage.js';
import {
  MAX_FEEDBACK_LENGTH,
  MAX_TELEMETRY_FEEDBACK,
  MAX_TELEMETRY_RUNS,
  type TelemetryRunRecord,
  type TelemetryStore,
} from './schema.js';

/** Reads the persisted telemetry store from the unified save (#45) — see `settings.ts#loadSettings`'s identical reasoning. */
export function loadTelemetry(): TelemetryStore {
  return loadSave().telemetry;
}

/**
 * Turns telemetry on and mints a fresh anonymous `sessionId` — called only
 * from the settings screen's opt-in checkbox. A new id every time consent is
 * (re-)granted, not reused from a previous opt-in: a player who opted out and
 * later opts back in is, as far as this store is concerned, starting a new
 * playtest session, and reusing an old id would let two genuinely separate
 * sessions read as one in a dashboard.
 */
export function optIntoTelemetry(): TelemetryStore {
  return updateSave((save) => ({
    ...save,
    telemetry: { ...save.telemetry, optedIn: true, sessionId: crypto.randomUUID() },
  })).telemetry;
}

/** Turns telemetry off. Deliberately leaves `sessionId` and any buffered `runs` alone — see `clearTelemetry` for the separate, explicit way to discard them. */
export function optOutOfTelemetry(): TelemetryStore {
  return updateSave((save) => ({
    ...save,
    telemetry: { ...save.telemetry, optedIn: false },
  })).telemetry;
}

/**
 * Appends a finished run's telemetry, newest first, capped at
 * `MAX_TELEMETRY_RUNS` — the same "keep a handful, drop the rest" shape
 * `replay/store.ts#saveReplay` uses. A no-op when telemetry is off, which is
 * what makes "opt-in" real rather than a label on a checkbox nobody checks:
 * every call site in `app/main.ts` calls this unconditionally at the moment
 * a run ends, and whether anything actually gets written lives here, once.
 */
export function recordRunTelemetry(record: TelemetryRunRecord): TelemetryStore {
  return updateSave((save) => {
    if (!save.telemetry.optedIn) {
      return save;
    }
    return {
      ...save,
      telemetry: {
        ...save.telemetry,
        runs: [record, ...save.telemetry.runs].slice(0, MAX_TELEMETRY_RUNS),
      },
    };
  }).telemetry;
}

/** Discards every buffered run, keeping the opt-in state and session id — what the settings screen's "Clear" button does after an export. */
export function clearTelemetryRuns(): TelemetryStore {
  return updateSave((save) => ({
    ...save,
    telemetry: { ...save.telemetry, runs: [] },
  })).telemetry;
}

/** Records that the playtest welcome screen has been answered (either way), so it is never shown again. */
export function markWelcomed(): TelemetryStore {
  return updateSave((save) => ({
    ...save,
    telemetry: { ...save.telemetry, welcomed: true },
  })).telemetry;
}

/** Moves the post-run prompt on to the next question; called once per prompt shown, answered or skipped. */
export function advanceQuestionCursor(): TelemetryStore {
  return updateSave((save) => ({
    ...save,
    telemetry: { ...save.telemetry, questionCursor: save.telemetry.questionCursor + 1 },
  })).telemetry;
}

/**
 * Stores a tester's answer, newest first, capped like `recordRunTelemetry`.
 * A no-op unless opted in — the same single gate — and for a blank answer:
 * skipping is not an answer.
 */
export function recordFeedback(
  questionId: string,
  text: string,
  answeredAt: number,
): TelemetryStore {
  const trimmed = text.trim().slice(0, MAX_FEEDBACK_LENGTH);
  return updateSave((save) => {
    if (!save.telemetry.optedIn || trimmed === '') {
      return save;
    }
    return {
      ...save,
      telemetry: {
        ...save.telemetry,
        feedback: [
          { id: crypto.randomUUID(), questionId, text: trimmed, answeredAt },
          ...save.telemetry.feedback,
        ].slice(0, MAX_TELEMETRY_FEEDBACK),
      },
    };
  }).telemetry;
}

/** Stamps delivered feedback, like `markRunsSent`. */
export function markFeedbackSent(ids: readonly string[], sentAt: number): TelemetryStore {
  const sent = new Set(ids);
  return updateSave((save) => ({
    ...save,
    telemetry: {
      ...save.telemetry,
      feedback: save.telemetry.feedback.map((entry) =>
        sent.has(entry.id) ? { ...entry, sentAt } : entry,
      ),
    },
  })).telemetry;
}

/** Stamps the given runs as delivered by a "Send" click, so the next click uploads only what is new. Unknown ids are ignored. */
export function markRunsSent(runIds: readonly string[], sentAt: number): TelemetryStore {
  const sent = new Set(runIds);
  return updateSave((save) => ({
    ...save,
    telemetry: {
      ...save.telemetry,
      runs: save.telemetry.runs.map((run) => (sent.has(run.runId) ? { ...run, sentAt } : run)),
    },
  })).telemetry;
}
