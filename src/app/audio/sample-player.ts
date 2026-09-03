import type { SampleEdit } from './types.js';
import { getAudioAssetUrl } from './sample-assets.js';

/**
 * Decodes and plays a `SampleEdit` against a real `AudioBuffer` — the
 * recorded-sample counterpart of `synth.ts`: that file turns
 * `InstrumentDefinition`/`SfxDefinition` data into oscillator/noise voices,
 * this one turns a `SampleRef` into a trimmed, faded, gained (and optionally
 * filtered) `AudioBufferSourceNode` voice. Kept in its own module rather
 * than folded into `synth.ts` because decoding is asynchronous and
 * cacheable per `AudioContext` in a way no synthesised voice ever needs to
 * be — see `preloadSample`/`peekSampleBuffer` below.
 *
 * Every function here degrades to a no-op/`null` off-browser or before an
 * asset has decoded, the same "content gap degrades gracefully" shape
 * `docs/DECISIONS.md` #19 already asks of room content: a sample still
 * decoding is exactly a gap that hasn't resolved yet, not a bug, so callers
 * (`music.ts`, `sfx-player.ts`) fall back to their synthesised placeholder
 * rather than going silent or throwing.
 */

/** How quickly `VoiceHandle.stop()` fades a cut-short voice — matches `synth.ts`'s own constant so a swapped track/stolen SFX voice reads the same either way. */
const FAST_STOP_SECONDS = 0.015;

export interface SampleVoiceHandle {
  /** Ramps playback speed to `rate` (1 = normal) — `music.ts`'s Promille tempo drag, applied to a looping sample the same way it drags a synthesised track's note grid. */
  setPlaybackRate(rate: number): void;
  stop(): void;
}

/**
 * `edit`'s trim/fade numbers, clamped against a real buffer's duration —
 * pulled out as a pure function so `tests/unit/audio-sample.test.ts` can
 * assert on the clamping without a real `AudioContext`/`AudioBuffer`, the
 * same reasoning `synth.ts`'s `noteToFrequency` and `music.ts`'s
 * `audioTimeForTick` already give for staying pure and exported.
 */
export interface ResolvedSampleTiming {
  readonly trimStartSeconds: number;
  readonly trimEndSeconds: number;
  readonly durationSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
}

export function resolveSampleTiming(
  edit: SampleEdit,
  bufferDurationSeconds: number,
): ResolvedSampleTiming {
  const trimStartSeconds = Math.max(0, Math.min(edit.trimStartSeconds, bufferDurationSeconds));
  const trimEndSeconds = Math.max(
    trimStartSeconds,
    Math.min(edit.trimEndSeconds, bufferDurationSeconds),
  );
  const durationSeconds = trimEndSeconds - trimStartSeconds;
  const fadeInSeconds = Math.max(0, Math.min(edit.fadeInSeconds, durationSeconds));
  const fadeOutSeconds = Math.max(
    0,
    Math.min(edit.fadeOutSeconds, durationSeconds - fadeInSeconds),
  );
  return { trimStartSeconds, trimEndSeconds, durationSeconds, fadeInSeconds, fadeOutSeconds };
}

// --- Decode + cache, per AudioContext ---------------------------------------

const resolvedBuffers = new WeakMap<AudioContext, Map<string, AudioBuffer | null>>();
const pendingDecodes = new WeakMap<AudioContext, Map<string, Promise<AudioBuffer | null>>>();

function mapFor<V>(
  store: WeakMap<AudioContext, Map<string, V>>,
  ctx: AudioContext,
): Map<string, V> {
  let map = store.get(ctx);
  if (map === undefined) {
    map = new Map();
    store.set(ctx, map);
  }
  return map;
}

async function decodeAsset(ctx: AudioContext, assetId: string): Promise<AudioBuffer | null> {
  const url = getAudioAssetUrl(assetId);
  if (url === undefined) {
    return null;
  }
  const response = await fetch(url);
  const bytes = await response.arrayBuffer();
  return await ctx.decodeAudioData(bytes);
}

/**
 * Kicks off decoding `assetId` against `ctx` if it hasn't started yet — safe
 * to call every frame/every play attempt, it only ever fires the fetch once
 * per context per asset. `preloadContentAudioSamples` (`sfx-player.ts`) calls
 * this once at boot for every sample any content references, so in the
 * common case a real play attempt finds the buffer already resolved; direct
 * callers (the audio editor's preview) rely on the same de-duplication.
 */
export function preloadSample(ctx: AudioContext, assetId: string): void {
  const resolved = mapFor(resolvedBuffers, ctx);
  if (resolved.has(assetId)) {
    return;
  }
  const pending = mapFor(pendingDecodes, ctx);
  if (pending.has(assetId)) {
    return;
  }
  const promise = decodeAsset(ctx, assetId)
    .catch(() => null)
    .then((buffer) => {
      resolved.set(assetId, buffer);
      return buffer;
    });
  pending.set(assetId, promise);
}

/** A synchronous peek at whatever `preloadSample` has resolved so far — `null` while still decoding, unavailable, or never requested. Never throws, never awaits. */
export function peekSampleBuffer(ctx: AudioContext, assetId: string): AudioBuffer | null {
  return mapFor(resolvedBuffers, ctx).get(assetId) ?? null;
}

/** Awaits a decode, starting one first if none is in flight — the audio editor's upload flow uses this so it can draw a waveform right after picking a file. */
export async function waitForSampleBuffer(
  ctx: AudioContext,
  assetId: string,
): Promise<AudioBuffer | null> {
  preloadSample(ctx, assetId);
  const resolved = mapFor(resolvedBuffers, ctx);
  if (resolved.has(assetId)) {
    return resolved.get(assetId) ?? null;
  }
  return await (mapFor(pendingDecodes, ctx).get(assetId) ?? Promise.resolve(null));
}

/** Decodes an in-memory file (the editor's file-picker path) without touching the asset cache — nothing to key it by until it's actually saved as an asset. */
export async function decodeArrayBuffer(
  ctx: AudioContext,
  bytes: ArrayBuffer,
): Promise<AudioBuffer> {
  return await ctx.decodeAudioData(bytes);
}

// --- Playback ----------------------------------------------------------------

/**
 * Plays `buffer` per `edit`, starting at `startTime` — trimmed to
 * `edit.trimStartSeconds`/`trimEndSeconds`, faded in/out, gained, and
 * optionally filtered (reusing `synth.ts`'s `InstrumentFilter` shape). Looped
 * playback (`music.ts`'s tracks) fades in once at the start and otherwise
 * loops the trimmed region continuously — a fade-out only applies to a
 * one-shot (`sfx-player.ts`'s SFX/barks), which always has a definite end.
 */
export function playSampleBuffer(
  ctx: AudioContext,
  destination: AudioNode,
  buffer: AudioBuffer,
  edit: SampleEdit,
  startTime: number,
  loop: boolean,
): SampleVoiceHandle {
  const timing = resolveSampleTiming(edit, buffer.duration);
  const gainTarget = Math.max(0, edit.gain);

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gainNode = ctx.createGain();
  let tail: AudioNode = gainNode;
  if (edit.filter !== undefined) {
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = edit.filter.type;
    filterNode.frequency.value = edit.filter.frequencyHz;
    filterNode.Q.value = edit.filter.q;
    gainNode.connect(filterNode);
    tail = filterNode;
  }
  tail.connect(destination);
  source.connect(gainNode);

  const g = gainNode.gain;
  g.cancelScheduledValues(startTime);
  g.setValueAtTime(0, startTime);
  g.linearRampToValueAtTime(gainTarget, startTime + timing.fadeInSeconds);

  if (loop && timing.durationSeconds > 0) {
    source.loop = true;
    source.loopStart = timing.trimStartSeconds;
    source.loopEnd = timing.trimEndSeconds;
    source.start(startTime, timing.trimStartSeconds);
  } else {
    const fadeOutStart =
      startTime + Math.max(timing.fadeInSeconds, timing.durationSeconds - timing.fadeOutSeconds);
    g.setValueAtTime(gainTarget, fadeOutStart);
    g.linearRampToValueAtTime(0, fadeOutStart + timing.fadeOutSeconds);
    source.start(startTime, timing.trimStartSeconds, timing.durationSeconds);
    source.stop(startTime + timing.durationSeconds + 0.05);
  }

  source.onended = (): void => {
    source.disconnect();
    gainNode.disconnect();
    if (tail !== gainNode) {
      tail.disconnect();
    }
  };

  return {
    setPlaybackRate(rate: number): void {
      source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.05);
    },
    stop(): void {
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FAST_STOP_SECONDS);
      try {
        source.stop(now + FAST_STOP_SECONDS + 0.02);
      } catch {
        // Already stopped/scheduled — nothing more to cut short.
      }
    },
  };
}
