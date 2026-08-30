import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFakeLocalStorage } from '../helpers/fake-local-storage.js';
import {
  ActiveRunRecorder,
  decodeActiveRunFrames,
  persistActiveRun,
  recorderFrom,
} from '../../src/app/save/active-run.js';
import { recordRunOutcome } from '../../src/app/meta/index.js';
import { MAX_BEST_RUNS } from '../../src/app/save/schema.js';
import { loadSave } from '../../src/app/save/storage.js';
import { createInputFrame, type InputFrame } from '../../src/sim/input/frame.js';

function frame(partial: Partial<InputFrame>): InputFrame {
  return { ...createInputFrame(), ...partial };
}

describe('active-run recording and replay (#45)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('decodes exactly the frames it recorded, negative axes and a button mask included', () => {
    const recorder = new ActiveRunRecorder(1234);
    const recorded = [
      frame({ moveX: -127, moveY: 64, aimX: 0, aimY: -1, buttons: 0b10101 }),
      frame({ moveX: 0, moveY: 0, aimX: 0, aimY: 127, buttons: 0 }),
    ];
    for (const f of recorded) {
      recorder.record(f);
    }
    expect(recorder.frameCount).toBe(2);

    const decoded = decodeActiveRunFrames(recorder.toSave());
    expect(decoded).toEqual(recorded);
  });

  it('a truncated frame log decodes only the whole frames it actually holds', () => {
    const decoded = decodeActiveRunFrames({ seed: 1, frames: [1, 2, 3, 4, 5, 9, 9] });
    expect(decoded).toHaveLength(1);
  });

  it('recorderFrom continues a saved log rather than starting a second, disconnected one', () => {
    const original = new ActiveRunRecorder(99);
    original.record(frame({ moveX: 10 }));
    original.record(frame({ moveX: 20 }));

    const continued = recorderFrom(original.toSave());
    expect(continued.seed).toBe(99);
    expect(continued.frameCount).toBe(2);
    continued.record(frame({ moveX: 30 }));

    const decoded = decodeActiveRunFrames(continued.toSave());
    expect(decoded.map((f) => f.moveX)).toEqual([10, 20, 30]);
  });

  it('persistActiveRun writes the recorder’s log, and clears it with null', () => {
    installFakeLocalStorage();
    const recorder = new ActiveRunRecorder(5);
    recorder.record(frame({ moveX: 1 }));
    persistActiveRun(recorder);
    expect(loadSave().activeRun).toEqual({ seed: 5, frames: [1, 0, 0, 0, 0] });

    persistActiveRun(null);
    expect(loadSave().activeRun).toBeNull();
  });

  // The best-runs list moved to `meta/progress.ts` with #46 — a finished run
  // is one commit now (totals, last run, unlocks and this list together)
  // rather than a separate write beside the active-run recorder. The
  // behaviour it is asserting is unchanged, so the test moved rather than
  // being replaced.
  it('a finished run keeps the highest ticksSurvived first, capped at MAX_BEST_RUNS', () => {
    installFakeLocalStorage();
    for (let i = 0; i < MAX_BEST_RUNS + 3; i++) {
      recordRunOutcome({
        seed: i,
        floor: 1,
        ticksSurvived: i * 100,
        kills: i,
        deathWord: null,
        recordedAt: i,
      });
    }
    const { bestRuns } = loadSave();
    expect(bestRuns).toHaveLength(MAX_BEST_RUNS);
    expect(bestRuns[0]?.ticksSurvived).toBe((MAX_BEST_RUNS + 2) * 100);
    expect(bestRuns.at(-1)?.ticksSurvived).toBe(3 * 100);
  });
});
