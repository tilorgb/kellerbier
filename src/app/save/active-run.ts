import { type InputFrame, createInputFrame } from '../../sim/input/frame.js';
import { type ActiveRunSave, type BestRunRecord, type SaveData, MAX_BEST_RUNS } from './schema.js';
import { updateSave } from './storage.js';

/** Numbers per encoded frame — `[moveX, moveY, aimX, aimY, buttons]`. See `ActiveRunSave.frames`. */
export const FRAME_LOG_STRIDE = 5;

/**
 * Accumulates one run's input log in memory and turns it into the
 * `ActiveRunSave` `storage.ts` persists.
 *
 * Kept as a flat `number[]` rather than an `InputFrame[]` — it is exactly
 * what `ActiveRunSave.frames` stores, so `toSave` is a slice rather than a
 * conversion, and a 15-minute run (~54,000 ticks, `docs/ROADMAP.md`'s own
 * estimate) is 270,000 numbers either way; a flat array of small integers
 * keeps that JSON reasonably compact without needing a byte-packed encoding
 * this feature doesn't yet need to earn its keep.
 */
export class ActiveRunRecorder {
  private readonly frames: number[] = [];

  constructor(readonly seed: number) {}

  get frameCount(): number {
    return this.frames.length / FRAME_LOG_STRIDE;
  }

  record(frame: Readonly<InputFrame>): void {
    this.frames.push(frame.moveX, frame.moveY, frame.aimX, frame.aimY, frame.buttons);
  }

  toSave(): ActiveRunSave {
    return { seed: this.seed, frames: this.frames.slice() };
  }
}

/**
 * Rebuilds an `ActiveRunRecorder` already carrying `active`'s frames — used
 * when a resumed run keeps recording from where the saved log left off,
 * rather than starting a second, disconnected recorder.
 */
export function recorderFrom(active: ActiveRunSave): ActiveRunRecorder {
  const recorder = new ActiveRunRecorder(active.seed);
  for (const frame of decodeActiveRunFrames(active)) {
    recorder.record(frame);
  }
  return recorder;
}

/**
 * Decodes a saved frame log back into `InputFrame`s, in recording order —
 * exactly the sequence to feed back through `GameSim.step` (one call per
 * frame, in a tight loop with rendering skipped) to fast-forward a fresh
 * `GameSim` to the tick the run was saved at. See `ActiveRunSave`'s own doc
 * comment for why replaying reproduces every bit of simulation state,
 * RNG stream position included, without a dedicated snapshot format.
 */
export function decodeActiveRunFrames(active: Readonly<ActiveRunSave>): InputFrame[] {
  const flat = active.frames;
  const frames: InputFrame[] = [];
  for (let index = 0; index + FRAME_LOG_STRIDE <= flat.length; index += FRAME_LOG_STRIDE) {
    const frame = createInputFrame();
    frame.moveX = flat[index] ?? 0;
    frame.moveY = flat[index + 1] ?? 0;
    frame.aimX = flat[index + 2] ?? 0;
    frame.aimY = flat[index + 3] ?? 0;
    frame.buttons = flat[index + 4] ?? 0;
    frames.push(frame);
  }
  return frames;
}

/** Persists (or clears) the in-progress run. `recorder: null` means "no run in progress". */
export function persistActiveRun(recorder: ActiveRunRecorder | null): SaveData {
  return updateSave((save) => ({
    ...save,
    activeRun: recorder === null ? null : recorder.toSave(),
  }));
}

/**
 * Appends a completed run to `bestRuns`, highest `ticksSurvived` first,
 * capped at `MAX_BEST_RUNS` — the "best runs" list #45 asks the save to
 * carry, populated with the one summary already computed today
 * (`app/run-summary.ts`'s kill count, plus `GameSim`'s own tick/death-word).
 * The Stammtisch hub that actually shows this list is #46; this is what it
 * will read once it exists, the same "store it before the UI needs it"
 * shape as `unlocks`/`achievements`.
 */
export function recordBestRun(record: BestRunRecord): SaveData {
  return updateSave((save) => {
    const bestRuns = [...save.bestRuns, record]
      .sort((a, b) => b.ticksSurvived - a.ticksSurvived)
      .slice(0, MAX_BEST_RUNS);
    return { ...save, bestRuns };
  });
}
