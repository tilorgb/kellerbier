import { describe, expect, it, vi } from 'vitest';
import { copyTelemetry, sendTelemetry, unsentRuns } from '../../src/app/telemetry/send.js';
import { exportTelemetryText } from '../../src/app/telemetry/file.js';
import {
  createDefaultTelemetryStore,
  type TelemetryRunRecord,
  type TelemetryStore,
} from '../../src/app/telemetry/schema.js';

function run(runId: string, extra: Partial<TelemetryRunRecord> = {}): TelemetryRunRecord {
  return {
    runId,
    recordedAt: 1,
    seed: 1,
    character: 'alois',
    outcome: 'died',
    floor: 1,
    roomRole: 'normal',
    ticksSurvived: 10,
    deathCause: null,
    itemsHeld: [],
    roomClears: [],
    promilleTierTicks: {},
    ...extra,
  };
}

function store(runs: TelemetryRunRecord[], optedIn = true): TelemetryStore {
  return { ...createDefaultTelemetryStore(), optedIn, sessionId: 'sess', runs };
}

const ok = (): Promise<Response> => Promise.resolve(new Response('ok', { status: 200 }));

describe('sendTelemetry', () => {
  it('posts only unsent runs as text/plain and returns their ids', async () => {
    const fetchFn = vi.fn((_url: string, _init: RequestInit) => ok());
    const s = store([run('a'), run('b', { sentAt: 5 })]);
    expect(unsentRuns(s).map((r) => r.runId)).toEqual(['a']);
    const sent = await sendTelemetry(s, 'https://x.test', fetchFn as unknown as typeof fetch);
    expect(sent).toEqual({ runIds: ['a'], feedbackIds: [] });
    const init = fetchFn.mock.calls[0]?.[1];
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    const body = JSON.parse(init?.body as string) as { sessionId: string; runs: unknown[] };
    expect(body.sessionId).toBe('sess');
    expect(body.runs).toHaveLength(1);
    expect(init?.body as string).not.toContain('sentAt');
  });

  it('sends nothing when opted out, with no endpoint, or with nothing new', async () => {
    const fetchFn = vi.fn(ok) as unknown as typeof fetch;
    expect(await sendTelemetry(store([run('a')], false), 'https://x.test', fetchFn)).toBeNull();
    expect(await sendTelemetry(store([run('a')]), '', fetchFn)).toBeNull();
    expect(
      await sendTelemetry(store([run('a', { sentAt: 1 })]), 'https://x.test', fetchFn),
    ).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports failure on a non-2xx response or a network error', async () => {
    const bad = (() => Promise.resolve(new Response('no', { status: 500 }))) as typeof fetch;
    const down = (() => Promise.reject(new Error('offline'))) as typeof fetch;
    expect(await sendTelemetry(store([run('a')]), 'https://x.test', bad)).toBeNull();
    expect(await sendTelemetry(store([run('a')]), 'https://x.test', down)).toBeNull();
  });
});

describe('copyTelemetry / export', () => {
  it('copies the same JSON shape as the file, without local state', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const s = store([run('a', { sentAt: 9 })]);
    expect(await copyTelemetry(s)).toBe(true);
    expect(writeText).toHaveBeenCalledWith(exportTelemetryText(s, true));
    expect(exportTelemetryText(s)).not.toContain('sentAt');
    vi.unstubAllGlobals();
  });

  it('returns false when the clipboard refuses', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    expect(await copyTelemetry(store([run('a')]))).toBe(false);
    vi.unstubAllGlobals();
  });
});
