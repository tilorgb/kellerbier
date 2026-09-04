import { loadSave, updateSave } from '../save/storage.js';
import { MAX_TELEMETRY_RUNS, type TelemetryRunRecord, type TelemetryStore } from './schema.js';

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
