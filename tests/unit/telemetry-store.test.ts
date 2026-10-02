import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  advanceQuestionCursor,
  joinPlaytest,
  markFeedbackSent,
  markWelcomed,
  recordFeedback,
  clearTelemetryRuns,
  loadTelemetry,
  optIntoTelemetry,
  optOutOfTelemetry,
  recordRunTelemetry,
} from '../../src/app/telemetry/store.js';
import {
  createDefaultTelemetryStore,
  MAX_FEEDBACK_LENGTH,
  MAX_TELEMETRY_FEEDBACK,
  MAX_TELEMETRY_RUNS,
  sanitizeTelemetryStore,
  type TelemetryRunRecord,
} from '../../src/app/telemetry/schema.js';
import { exportTelemetryText, parseTelemetryText } from '../../src/app/telemetry/file.js';
import { loadSave } from '../../src/app/save/storage.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeRun(overrides: Partial<TelemetryRunRecord> = {}): TelemetryRunRecord {
  return {
    runId: 'run-fixed',
    recordedAt: 1000,
    seed: 42,
    character: 'alois',
    outcome: 'died',
    floor: 2,
    roomRole: 'normal',
    ticksSurvived: 900,
    deathCause: { word: 'Umgfalln', enemiesPresent: ['gockel'] },
    itemsHeld: ['bierkrug'],
    roomClears: [{ floor: 1, role: 'normal', ticks: 300 }],
    promilleTierTicks: { '0': 900 },
    ...overrides,
  };
}

describe('telemetry store (#54, #159)', () => {
  it('defaults to opted out, with no session id and nothing recorded', () => {
    installFakeLocalStorage();
    expect(loadTelemetry()).toEqual(createDefaultTelemetryStore());
  });

  it('does not record anything while opted out', () => {
    installFakeLocalStorage();
    recordRunTelemetry(fakeRun());
    expect(loadTelemetry().runs).toEqual([]);
  });

  it('opting in mints a fresh anonymous session id and unlocks recording', () => {
    installFakeLocalStorage();
    const store = optIntoTelemetry();
    expect(store.optedIn).toBe(true);
    expect(store.sessionId).not.toBeNull();

    const run = fakeRun();
    recordRunTelemetry(run);
    expect(loadTelemetry().runs).toEqual([run]);
  });

  it('mints a new session id on every opt-in, not the id from a previous one', () => {
    installFakeLocalStorage();
    const first = optIntoTelemetry();
    optOutOfTelemetry();
    const second = optIntoTelemetry();
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('opting out stops new recordings but keeps what is already buffered', () => {
    installFakeLocalStorage();
    optIntoTelemetry();
    const run = fakeRun();
    recordRunTelemetry(run);
    optOutOfTelemetry();
    expect(loadTelemetry().runs).toEqual([run]);
    recordRunTelemetry(fakeRun({ runId: 'later-run' }));
    expect(loadTelemetry().runs).toEqual([run]);
  });

  it('keeps the newest run first and caps the buffer at MAX_TELEMETRY_RUNS', () => {
    installFakeLocalStorage();
    optIntoTelemetry();
    for (let index = 0; index < MAX_TELEMETRY_RUNS + 5; index++) {
      recordRunTelemetry(fakeRun({ runId: `run-${String(index)}`, recordedAt: index }));
    }
    const runs = loadTelemetry().runs;
    expect(runs).toHaveLength(MAX_TELEMETRY_RUNS);
    expect(runs[0]?.runId).toBe(`run-${String(MAX_TELEMETRY_RUNS + 4)}`);
  });

  it('clearing drops every buffered run but keeps opt-in state and session id', () => {
    installFakeLocalStorage();
    const opted = optIntoTelemetry();
    recordRunTelemetry(fakeRun());
    const cleared = clearTelemetryRuns();
    expect(cleared.runs).toEqual([]);
    expect(cleared.optedIn).toBe(true);
    expect(cleared.sessionId).toBe(opted.sessionId);
  });

  it('survives a save round-trip through sanitizeSave (via loadSave)', () => {
    installFakeLocalStorage();
    optIntoTelemetry();
    recordRunTelemetry(fakeRun());
    expect(loadSave().telemetry).toEqual(loadTelemetry());
  });
});

describe('telemetry sanitisation (#54, #159)', () => {
  it('produces the default store from anything that is not a plain object', () => {
    for (const junk of [null, undefined, 42, 'nope', [1, 2, 3]]) {
      expect(sanitizeTelemetryStore(junk)).toEqual(createDefaultTelemetryStore());
    }
  });

  it('drops a run record missing a required field rather than keeping it half-formed', () => {
    const sanitized = sanitizeTelemetryStore({
      optedIn: true,
      sessionId: 'abc',
      runs: [fakeRun(), { runId: 'bad', outcome: 'died' }],
    });
    expect(sanitized.runs).toHaveLength(1);
    expect(sanitized.runs[0]?.runId).toBe(fakeRun().runId);
  });

  it('rejects an empty session id string as no session at all', () => {
    expect(sanitizeTelemetryStore({ optedIn: true, sessionId: '' }).sessionId).toBeNull();
  });
});

describe('telemetry file export (#54)', () => {
  it('parses back what it exported', () => {
    const store = {
      ...createDefaultTelemetryStore(),
      optedIn: true,
      sessionId: 'session-1',
      runs: [fakeRun()],
      feedback: [{ id: 'f1', questionId: 'confusion', text: 'the Maibaum', answeredAt: 5 }],
    };
    const text = exportTelemetryText(store);
    const parsed = parseTelemetryText(text);
    expect(parsed?.sessionId).toBe('session-1');
    expect(parsed?.runs).toEqual([fakeRun()]);
    expect(parsed?.feedback).toEqual(store.feedback);
  });

  it('rejects a file that is not telemetry at all', () => {
    expect(parseTelemetryText('not json')).toBeNull();
    expect(parseTelemetryText('42')).toBeNull();
  });
});

describe('playtest feedback (#159)', () => {
  it('records an answer only when opted in, and never a blank one', () => {
    installFakeLocalStorage();
    recordFeedback('confusion', 'the Maibaum', 1);
    expect(loadTelemetry().feedback).toHaveLength(0);
    optIntoTelemetry();
    recordFeedback('confusion', '   ', 2);
    expect(loadTelemetry().feedback).toHaveLength(0);
    recordFeedback('confusion', '  the Maibaum  ', 3);
    expect(loadTelemetry().feedback.map((entry) => entry.text)).toEqual(['the Maibaum']);
  });

  it('caps an answer at MAX_FEEDBACK_LENGTH and the buffer at MAX_TELEMETRY_FEEDBACK', () => {
    installFakeLocalStorage();
    optIntoTelemetry();
    recordFeedback('q', 'x'.repeat(MAX_FEEDBACK_LENGTH + 500), 1);
    expect(loadTelemetry().feedback[0]?.text).toHaveLength(MAX_FEEDBACK_LENGTH);
    for (let index = 0; index < MAX_TELEMETRY_FEEDBACK + 5; index += 1) {
      recordFeedback('q', `answer ${String(index)}`, index);
    }
    expect(loadTelemetry().feedback).toHaveLength(MAX_TELEMETRY_FEEDBACK);
  });

  it('stamps delivered answers and advances the question cursor', () => {
    installFakeLocalStorage();
    optIntoTelemetry();
    recordFeedback('q', 'hello', 1);
    const id = loadTelemetry().feedback[0]?.id ?? '';
    markFeedbackSent([id], 9);
    expect(loadTelemetry().feedback[0]?.sentAt).toBe(9);
    expect(loadTelemetry().questionCursor).toBe(0);
    advanceQuestionCursor();
    expect(loadTelemetry().questionCursor).toBe(1);
    markWelcomed();
    expect(loadTelemetry().welcomed).toBe(true);
  });

  it("keeps a run's build id, and still loads a run recorded before there was one", () => {
    const [stamped, old] = sanitizeTelemetryStore({
      optedIn: true,
      runs: [fakeRun({ runId: 'new', build: 'abc1234' }), fakeRun({ runId: 'old' })],
    }).runs;
    expect(stamped?.build).toBe('abc1234');
    expect(old?.runId).toBe('old');
    expect(old?.build).toBeUndefined();
  });

  it('defaults an older save that has none of the new fields', () => {
    const store = sanitizeTelemetryStore({ optedIn: true, sessionId: 's', runs: [] });
    expect(store.feedback).toEqual([]);
    expect(store.welcomed).toBe(false);
    expect(store.questionCursor).toBe(0);
    // #360: an opt-in from before auto-send existed never agreed to it.
    expect(store.autoSend).toBe(false);
  });

  it('joins the playtest with auto-send on, and opting out withdraws it', () => {
    installFakeLocalStorage();
    const joined = joinPlaytest();
    expect(joined.optedIn).toBe(true);
    expect(joined.autoSend).toBe(true);
    expect(joined.sessionId).not.toBeNull();
    expect(optOutOfTelemetry().autoSend).toBe(false);
    // Back in through Settings is the click-to-send consent.
    expect(optIntoTelemetry().autoSend).toBe(false);
  });

  it('keeps the session id of a tester who was already opted in', () => {
    installFakeLocalStorage();
    const before = optIntoTelemetry().sessionId;
    expect(joinPlaytest().sessionId).toBe(before);
  });
});
