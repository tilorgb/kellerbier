import { describe, expect, it } from 'vitest';
import worker, {
  EXPORT_PAGE_SIZE,
  MAX_RECORDS_PER_DAY,
  type TelemetryKv,
  cleanRun,
} from '../../tools/telemetry/worker.mjs';
import { sanitizeTelemetryRun } from '../../src/app/telemetry/schema.js';

/** An in-memory stand-in for the KV binding, with the same paged `list`. */
function fakeKv(): TelemetryKv & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: (key) => Promise.resolve(store.get(key) ?? null),
    put: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    list: ({ limit = 1000, cursor }) => {
      const names = [...store.keys()].sort();
      const start = cursor === undefined ? 0 : Number(cursor);
      const end = start + limit;
      return Promise.resolve({
        keys: names.slice(start, end).map((name) => ({ name })),
        list_complete: end >= names.length,
        ...(end >= names.length ? {} : { cursor: String(end) }),
      });
    },
  };
}

function run(runId: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    runId,
    recordedAt: 1,
    seed: 42,
    character: 'alois',
    outcome: 'died',
    floor: 1,
    roomRole: 'normal',
    ticksSurvived: 900,
    deathCause: { word: 'Nimmer zruckkema', enemiesPresent: ['bierratte'] },
    itemsHeld: ['der-ordner'],
    roomClears: [{ floor: 1, role: 'start', ticks: 100 }],
    promilleTierTicks: { '0': 900 },
    build: 'abc1234',
    ...extra,
  };
}

const post = (body: unknown): Request =>
  new Request('https://w.test/', { method: 'POST', body: JSON.stringify(body) });

describe('telemetry worker (#363)', () => {
  it('stores a real run unchanged, and what it stores still loads in the game', async () => {
    const kv = fakeKv();
    const response = await worker.fetch(post({ sessionId: 'sess-1', runs: [run('a')] }), {
      RUNS: kv,
    });
    expect(response.status).toBe(200);
    const stored = JSON.parse(kv.store.get('run:a') ?? 'null') as Record<string, unknown>;
    expect(stored).toEqual({ ...run('a'), sessionId: 'sess-1' });
    expect(sanitizeTelemetryRun(stored)?.build).toBe('abc1234');
  });

  it('drops what is not a run, strips unknown fields and markup-shaped ids', async () => {
    const kv = fakeKv();
    await worker.fetch(
      post({
        runs: [
          { runId: 'junk' },
          run('b', {
            itemsHeld: ['ok-item', '[x](http://evil)', 7],
            extra: 'not in the schema',
            deathCause: { word: '<img src=x>', enemiesPresent: ['@everyone'] },
          }),
          run('<script>'),
        ],
      }),
      { RUNS: kv },
    );
    expect([...kv.store.keys()].filter((key) => key.startsWith('run:'))).toEqual(['run:b']);
    const stored = JSON.parse(kv.store.get('run:b') ?? 'null') as Record<string, unknown>;
    expect(stored.itemsHeld).toEqual(['ok-item']);
    expect(stored.extra).toBeUndefined();
    expect(stored.deathCause).toEqual({ word: null, enemiesPresent: [] });
  });

  it('accepts a negative seed and rejects a run with no outcome', () => {
    expect(cleanRun(run('a', { seed: -5 }))).not.toBeNull();
    expect(cleanRun(run('a', { outcome: 'maybe' }))).toBeNull();
  });

  it('answers 429 once the day is spent, and writes nothing more', async () => {
    const kv = fakeKv();
    const day = new Date().toISOString().slice(0, 10);
    kv.store.set(`budget:${day}`, String(MAX_RECORDS_PER_DAY));
    const response = await worker.fetch(post({ runs: [run('late')] }), { RUNS: kv });
    expect(response.status).toBe(429);
    expect(kv.store.has('run:late')).toBe(false);
  });

  it('counts accepted records against the day', async () => {
    const kv = fakeKv();
    await worker.fetch(post({ runs: [run('a'), run('b')] }), { RUNS: kv });
    const budget = [...kv.store.entries()].find(([key]) => key.startsWith('budget:'));
    expect(budget?.[1]).toBe('2');
  });

  it('exports in pages, without the budget counter, and only with the key', async () => {
    const kv = fakeKv();
    const total = EXPORT_PAGE_SIZE + 5;
    for (let i = 0; i < total; i++) {
      kv.store.set(`run:${String(i).padStart(4, '0')}`, JSON.stringify(run(`r${String(i)}`)));
    }
    kv.store.set('feedback:f1', JSON.stringify({ id: 'f1', questionId: 'again', text: 'yes' }));
    kv.store.set('budget:2026-10-02', '3');
    const env = { RUNS: kv, ADMIN_KEY: 'secret' };

    const denied = await worker.fetch(new Request('https://w.test/export?key=wrong'), env);
    expect(denied.status).toBe(403);

    let runs = 0;
    let feedback = 0;
    let pages = 0;
    let cursor: string | null = null;
    do {
      const url = new URL('https://w.test/export?key=secret');
      if (cursor !== null) {
        url.searchParams.set('cursor', cursor);
      }
      const page = (await (await worker.fetch(new Request(url), env)).json()) as {
        runs: unknown[];
        feedback: unknown[];
        cursor: string | null;
      };
      runs += page.runs.length;
      feedback += page.feedback.length;
      cursor = page.cursor;
      pages += 1;
    } while (cursor !== null);
    expect(runs).toBe(total);
    expect(feedback).toBe(1);
    expect(pages).toBeGreaterThan(1);
  });
});
