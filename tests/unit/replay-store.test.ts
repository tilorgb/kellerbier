import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  buildReplayRecord,
  latestReplay,
  loadReplayFrames,
  saveReplay,
} from '../../src/app/replay/store.js';
import { exportReplayText, parseReplayText } from '../../src/app/replay/file.js';
import { loadSave } from '../../src/app/save/storage.js';
import { MAX_REPLAYS } from '../../src/app/save/schema.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const OUTCOME = {
  seed: 0xc0ffee,
  floor: 2,
  ticksSurvived: 900,
  kills: 12,
  deathWord: 'Umgfalln',
  kind: 'normal' as const,
  recordedAt: 1000,
};

describe('replay storage (#48)', () => {
  it('round-trips a replay through build/save/load, frames included', async () => {
    installFakeLocalStorage();
    const frameBytes = new Int8Array([1, -2, 3, -4, 5, 0, 0, 0, 0, 0]);
    const record = await buildReplayRecord(frameBytes, OUTCOME);
    saveReplay(record);

    const stored = loadSave().replays;
    expect(latestReplay(stored)).toEqual(record);

    const restored = await loadReplayFrames(record);
    expect(Array.from(restored)).toEqual(Array.from(frameBytes));
  });

  it('keeps the newest replay first and caps the list at MAX_REPLAYS', async () => {
    installFakeLocalStorage();
    for (let index = 0; index < MAX_REPLAYS + 3; index++) {
      const record = await buildReplayRecord(new Int8Array([index]), {
        ...OUTCOME,
        recordedAt: index,
      });
      saveReplay(record);
    }
    const replays = loadSave().replays;
    expect(replays).toHaveLength(MAX_REPLAYS);
    // Newest first: the last one saved is the highest `recordedAt`.
    expect(replays[0]?.recordedAt).toBe(MAX_REPLAYS + 2);
  });

  it('marks a daily run distinctly from an ordinary one', async () => {
    const record = await buildReplayRecord(new Int8Array([1]), { ...OUTCOME, kind: 'daily' });
    expect(record.kind).toBe('daily');
  });
});

describe('replay files (#48)', () => {
  it('parses back what it exported', async () => {
    const record = await buildReplayRecord(new Int8Array([9, 8, 7]), OUTCOME);
    const text = exportReplayText(record);
    expect(parseReplayText(text)).toEqual(record);
  });

  it('also accepts a bare ReplayRecord, not just the wrapped file shape', async () => {
    const record = await buildReplayRecord(new Int8Array([9, 8, 7]), OUTCOME);
    expect(parseReplayText(JSON.stringify(record))).toEqual(record);
  });

  it('rejects a file that is not a replay at all', () => {
    expect(parseReplayText('not json')).toBeNull();
    expect(parseReplayText('{}')).toBeNull();
    expect(parseReplayText('{"replay":{"seed":1}}')).toBeNull();
    expect(parseReplayText('42')).toBeNull();
  });
});
