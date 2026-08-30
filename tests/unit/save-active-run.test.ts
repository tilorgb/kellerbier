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
    const decoded = decodeActiveRunFrames({
      seed: 1,
      frames: [1, 2, 3, 4, 5, 9, 9],
      promilleUnlocked: true,
      character: 'alois',
    });
    expect(decoded).toHaveLength(1);
  });

  it('carries the run’s character beside its log, so a resume rebuilds the same run (#47)', () => {
    // Same shape of parameter, same failure without it: the Stammtisch
    // writes a character choice the moment the player cycles to it, mid-run
    // included, so the save's current pick can already describe somebody
    // other than whoever recorded this log.
    const barnabas = new ActiveRunRecorder(12, true, 'barnabas');
    barnabas.record(frame({ moveX: 1 }));
    expect(barnabas.toSave().character).toBe('barnabas');
    expect(recorderFrom(barnabas.toSave()).character).toBe('barnabas');
    // The default is the Alois run every pre-#47 recorder produced.
    expect(new ActiveRunRecorder(12).character).toBe('alois');
  });

  it('carries the run’s Promille state beside its log, so a resume rebuilds the same run (#85)', () => {
    // The flag is a run *parameter*, not an input, so it rides on the
    // recorder rather than being encoded per frame — and it has to survive
    // the round trip, because the save's own unlock set can already disagree
    // with it: beating Der Stier grants Promille mid-run, which would resume
    // a sober log as a promilled run.
    const sober = new ActiveRunRecorder(11, false);
    sober.record(frame({ moveX: 1 }));
    expect(sober.toSave().promilleUnlocked).toBe(false);
    expect(recorderFrom(sober.toSave()).promilleUnlocked).toBe(false);

    const promilled = new ActiveRunRecorder(11, true);
    expect(promilled.toSave().promilleUnlocked).toBe(true);
    // The default is the promilled run every pre-#85 recorder produced.
    expect(new ActiveRunRecorder(11).promilleUnlocked).toBe(true);
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
    expect(loadSave().activeRun).toEqual({
      seed: 5,
      frames: [1, 0, 0, 0, 0],
      promilleUnlocked: true,
      character: 'alois',
    });

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
