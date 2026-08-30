import { type ReplayRecord, MAX_REPLAYS } from '../save/schema.js';
import { updateSave } from '../save/storage.js';
import { compressFrames, decompressFrames } from './codec.js';

/** What a finished run hands to `buildReplayRecord` — everything a `ReplayRecord` needs besides the compressed bytes. */
export interface ReplayOutcome {
  readonly seed: number;
  readonly floor: number;
  readonly ticksSurvived: number;
  readonly kills: number;
  readonly deathWord: string | null;
  readonly kind: 'normal' | 'daily';
  readonly recordedAt: number;
}

/**
 * Compresses `frameBytes` (an `InputRecording.toBytes()`) and pairs it with
 * `outcome` into a storable `ReplayRecord`.
 *
 * Async because gzip is (`codec.ts`'s `CompressionStream`) — called once, at
 * the moment a run ends, never from the frame loop, so the awaited work
 * costing a tick or two of wall time is not the kind of thing
 * `docs/TECH_STACK.md` §3's budget is about.
 */
export async function buildReplayRecord(
  frameBytes: Int8Array,
  outcome: ReplayOutcome,
): Promise<ReplayRecord> {
  const frames = await compressFrames(frameBytes);
  return {
    id: crypto.randomUUID(),
    seed: outcome.seed,
    frames,
    floor: outcome.floor,
    ticksSurvived: outcome.ticksSurvived,
    kills: outcome.kills,
    deathWord: outcome.deathWord,
    kind: outcome.kind,
    recordedAt: outcome.recordedAt,
  };
}

/**
 * Persists `replay`, newest first, capped at `MAX_REPLAYS` — the same
 * "keep a handful, drop the rest" shape `bestRuns` uses, just newest-first
 * instead of longest-first: a bug report wants the run that just happened,
 * not the run that lasted longest.
 */
export function saveReplay(replay: ReplayRecord): void {
  updateSave((save) => ({
    ...save,
    replays: [replay, ...save.replays].slice(0, MAX_REPLAYS),
  }));
}

/** The most recently recorded replay, or `null` if none has been saved yet this save. */
export function latestReplay(replays: readonly ReplayRecord[]): ReplayRecord | null {
  return replays[0] ?? null;
}

/** Decompresses a stored (or imported) replay's frames back into `InputRecording.fromBytes` input. */
export function loadReplayFrames(replay: Pick<ReplayRecord, 'frames'>): Promise<Int8Array> {
  return decompressFrames(replay.frames);
}
