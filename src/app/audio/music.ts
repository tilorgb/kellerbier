import { TICKS_PER_SECOND } from '../../sim/time.js';
import { INSTRUMENT_DEFINITIONS } from '../../content/audio/instruments.js';
import type {
  InstrumentDefinition,
  NoteEvent,
  PromilleAudioTier,
  TrackDefinition,
} from './types.js';
import {
  getAudioContext,
  getBusGain,
  promilleMuffleToHz,
  resetPromilleFilter,
  setPromilleFilterCutoffHz,
} from './context.js';
import { playTone } from './synth.js';
import {
  peekSampleBuffer,
  playSampleBuffer,
  preloadSample,
  type SampleVoiceHandle,
} from './sample-player.js';

/**
 * Schedules and plays `content/audio/tracks.ts` tracks against `sim.tick` —
 * the Blaskapelle's actual player.
 *
 * **Tick-driven, not clock-driven.** #51's own notes are explicit: "Music
 * must never drive simulation timing — derive any rhythmic gameplay from
 * the tick counter and align the audio to *that*, not the reverse." This
 * class only ever reads `sim.tick` as an *input*; it converts a tick to an
 * `AudioContext` timeline time (`audioTimeForTick`, a pure function, unit
 * tested without a real `AudioContext`) and never the other way around, so
 * nothing downstream of it can end up reading audio playback position as a
 * simulation signal.
 *
 * **A track's loop position is always `tick % loopTicks`** — absolute tick
 * 0, never when `play()` happened to be called. That is what keeps
 * `floor2DorfUndAcker` phase-locked with `content/enemies/blaskapellist.ts`'s
 * `fireOnBeat` (which fires on `sim.tick % 30`, the same absolute grid) no
 * matter which room or floor transition started the track playing — #51's
 * "the Blaskapellist's rhythmic behaviour reads against the floor 2 track"
 * acceptance criterion. `play(track, atTick)`'s `atTick` only says *when to
 * start scheduling from*, not which beat is "first".
 *
 * **Why not just schedule at `ctx.currentTime` each call.** `loop.ts`'s
 * `FixedTimestepLoop` can run several ticks back-to-back inside one
 * synchronous JS frame when the machine falls behind (its own catch-up
 * accumulator). Scheduling "now" for each of those ticks would bunch them
 * onto the same instant instead of spacing them out musically.
 * `audioTimeForTick` fixes that: every tick maps to its own `AudioContext`
 * time from a single real-time anchor pair, captured once (the first tick
 * audio actually becomes available, e.g. after the page's first gesture)
 * and reused for the rest of the session — ticks always run at
 * `TICKS_PER_SECOND` in real time, so the same pair stays valid across every
 * later `play()` call, and a burst of ticks schedules a burst of
 * correctly-spaced future notes instead of a chord.
 *
 * **No bus, no crossfade, no ducking.** Every note this class schedules
 * goes straight to `context.ts`'s single master gain — swapping
 * `MusicPlayer.play` to a new track simply stops scheduling the old one;
 * whatever it already fired rings out on its own envelope release (under a
 * second for every instrument in `content/audio/instruments.ts`), which
 * reads as a soft handoff without needing a mix bus to fade one. A real
 * crossfade/ducking implementation is #157's.
 */

const instrumentsById = new Map<string, InstrumentDefinition>(
  INSTRUMENT_DEFINITIONS.map((instrument) => [instrument.id, instrument]),
);

/** A track's tick-offset-in-loop → the notes due there, for O(1) lookup per tick. */
export function buildScheduleIndex(
  track: TrackDefinition,
  ticksPerBeat: number,
): Map<number, readonly NoteEvent[]> {
  const index = new Map<number, NoteEvent[]>();
  for (const event of track.events) {
    const tickOffset = Math.round(event.beat * ticksPerBeat);
    const existing = index.get(tickOffset);
    if (existing === undefined) {
      index.set(tickOffset, [event]);
    } else {
      existing.push(event);
    }
  }
  return index;
}

/**
 * Converts a simulation tick to an `AudioContext` timeline time, from a
 * fixed real-time anchor pair. Pure and `AudioContext`-free —
 * `tests/unit/audio-music.test.ts` exercises this directly.
 */
export function audioTimeForTick(
  anchorAudioTime: number,
  anchorTick: number,
  tick: number,
): number {
  return anchorAudioTime + (tick - anchorTick) / TICKS_PER_SECOND;
}

/**
 * Plays every note of `track` once, starting now — for a one-shot cue
 * (`victoryTheme`) rather than a loop. Not tick-scheduled: a post-run
 * fanfare has no gameplay rhythm downstream of it to desync, so scheduling
 * it straight off `ctx.currentTime` (the one place in `app/audio/` that
 * does) is safe.
 */
export function playTrackOnce(
  ctx: AudioContext,
  destination: AudioNode,
  track: TrackDefinition,
): void {
  const now = ctx.currentTime;
  if (track.sample !== undefined) {
    preloadSample(ctx, track.sample.assetId);
    const buffer = peekSampleBuffer(ctx, track.sample.assetId);
    // Still decoding (or missing) the first time this plays — falls through
    // to the synthesised `events` below rather than staying silent, the
    // same gap-degrades-gracefully shape every other sample call site here
    // follows. A later call (the buffer having since resolved) plays the
    // real recording.
    if (buffer !== null) {
      playSampleBuffer(ctx, destination, buffer, track.sample.edit, now, false);
      return;
    }
  }
  for (const event of track.events) {
    const instrument = instrumentsById.get(event.instrument);
    if (instrument === undefined) {
      throw new Error(`track "${track.id}" references unknown instrument "${event.instrument}"`);
    }
    const startTime = now + (event.beat * track.ticksPerBeat) / TICKS_PER_SECOND;
    const durationSeconds = (event.durationBeats * track.ticksPerBeat) / TICKS_PER_SECOND;
    playTone(
      ctx,
      destination,
      instrument,
      event.note,
      startTime,
      durationSeconds,
      event.velocity ?? 1,
    );
  }
}

export class MusicPlayer {
  private track: TrackDefinition | null = null;
  private lastScheduledTick = -1;
  private realTimeAnchorTick: number | null = null;
  private realTimeAnchorAudioTime = 0;
  private tempoScale = 1;
  private detuneCents = 0;
  private effectiveTicksPerBeat = 0;
  private loopTicks = 1;
  private scheduleIndex = new Map<number, readonly NoteEvent[]>();
  private currentTier: PromilleAudioTier | null = null;
  private distortionEnabled = true;
  /** The currently-looping recorded sample, when `this.track.sample` is set — `null` while a note-based track plays, or while the sample is still decoding. */
  private sampleVoice: SampleVoiceHandle | null = null;

  /** The id of the track currently playing, or `null` if silent. */
  get trackId(): string | null {
    return this.track?.id ?? null;
  }

  /**
   * Starts `track` playing, scheduling from `atTick` (the caller's current
   * `sim.tick`) onward. Replaces whatever was playing; a no-op if `track` is
   * already the one playing.
   */
  play(track: TrackDefinition, atTick: number): void {
    if (this.track?.id === track.id) {
      return;
    }
    this.sampleVoice?.stop();
    this.sampleVoice = null;
    this.track = track;
    this.lastScheduledTick = atTick - 1;
    this.rebuildIndex();
  }

  /** Stops scheduling new notes (or the looping sample). Already-sounding notes ring out on their own envelopes. */
  stop(): void {
    this.sampleVoice?.stop();
    this.sampleVoice = null;
    this.track = null;
  }

  /**
   * Applies a Promille tier's audio content
   * (`content/audio/promille-audio.ts`): the tempo drag and detune stay this
   * class's own direct approximation (the "pitch shift" #51's note asked
   * for), and `tier.muffle` now also drives `context.ts`'s real whole-mix
   * lowpass (the "low-pass" half) — see `promilleMuffleToHz`.
   *
   * `distortionEnabled` is #53's accessibility escape hatch: a player who
   * finds the woozy pitch-drag and muffle disorienting rather than
   * atmospheric gets a clean mix regardless of tier, without losing the
   * Promille meter itself or its gameplay effects (which never lived here —
   * see `GameSim.driftScale`'s doc comment for that boundary).
   */
  setPromilleTier(tier: PromilleAudioTier, distortionEnabled = true): void {
    this.currentTier = tier;
    const changed = this.distortionEnabled !== distortionEnabled;
    this.distortionEnabled = distortionEnabled;
    this.applyTierFilter();
    const tempoScale = distortionEnabled ? tier.tempoScale : 1;
    const detuneCents = distortionEnabled ? tier.detuneCents : 0;
    if (!changed && this.tempoScale === tempoScale && this.detuneCents === detuneCents) {
      return;
    }
    this.tempoScale = tempoScale;
    this.detuneCents = detuneCents;
    // A sample has no notes to re-derive a slower grid from — dragging its
    // own playback rate is the direct equivalent of `rebuildIndex`'s
    // `effectiveTicksPerBeat` slowdown, and reads as the same "woozy tape"
    // effect a detuned oscillator does.
    this.sampleVoice?.setPlaybackRate(tempoScale);
    if (this.track !== null) {
      this.rebuildIndex();
    }
  }

  /**
   * Call once per real simulation tick (`app/main.ts`'s `advanceOneTick`,
   * inside its `if (live)` block — the same gate `playImpactAudio` and
   * `AmbienceTracker.sync` already use, so a replay never re-schedules
   * historical music). Advances tick-by-tick from the last call to `tick`
   * inclusive, so a catch-up burst still visits and schedules every tick in
   * order rather than skipping to the latest one — and, symmetrically,
   * still advances its own bookkeeping while audio is unavailable (no
   * `AudioContext` yet, no gesture), so a run played for a while before the
   * page's first click never schedules a flood of backlogged notes once it
   * appears.
   */
  sync(tick: number, live: boolean): void {
    if (!live || this.track === null) {
      return;
    }
    const ctx = getAudioContext();
    const destination = getBusGain('music');
    if (ctx === null || destination === null) {
      this.lastScheduledTick = tick;
      return;
    }
    if (this.realTimeAnchorTick === null) {
      this.realTimeAnchorTick = tick;
      this.realTimeAnchorAudioTime = ctx.currentTime;
    }
    if (this.track.sample !== undefined) {
      this.syncSample(ctx, destination, this.track.sample, tick);
      this.lastScheduledTick = tick;
      return;
    }
    const from = this.lastScheduledTick + 1;
    for (let t = from; t <= tick; t += 1) {
      const posInLoop = ((t % this.loopTicks) + this.loopTicks) % this.loopTicks;
      const due = this.scheduleIndex.get(posInLoop);
      if (due === undefined) {
        continue;
      }
      const startTime = audioTimeForTick(this.realTimeAnchorAudioTime, this.realTimeAnchorTick, t);
      for (const event of due) {
        const instrument = instrumentsById.get(event.instrument);
        if (instrument === undefined) {
          throw new Error(
            `track "${this.track.id}" references unknown instrument "${event.instrument}"`,
          );
        }
        const durationSeconds =
          (event.durationBeats * this.effectiveTicksPerBeat) / TICKS_PER_SECOND;
        playTone(
          ctx,
          destination,
          instrument,
          event.note,
          startTime,
          durationSeconds,
          event.velocity ?? 1,
          0,
          this.detuneCents,
        );
      }
    }
    this.lastScheduledTick = tick;
  }

  /**
   * The sample-track half of `sync()`: starts the recording looping once its
   * buffer has decoded, at the tick-derived audio time (`audioTimeForTick`,
   * the exact same conversion the note branch uses) — a real recording is
   * still started *from a tick*, never from `ctx.currentTime` directly, so
   * it keeps #51's "no timing dependency the wrong way round" even though a
   * looping sample has nothing further to schedule per tick after that.
   * A no-op once `sampleVoice` exists, aside from re-asserting the sample's
   * own gain/filter never drift out from under a Promille tier's filter
   * changes (they don't touch this bus at all, so there's nothing to redo).
   */
  private syncSample(
    ctx: AudioContext,
    destination: AudioNode,
    sample: NonNullable<TrackDefinition['sample']>,
    tick: number,
  ): void {
    if (this.sampleVoice !== null) {
      return;
    }
    preloadSample(ctx, sample.assetId);
    const buffer = peekSampleBuffer(ctx, sample.assetId);
    if (buffer === null) {
      // Still decoding — tried again next tick, same "gap degrades
      // gracefully" shape every other sample call site in this module uses.
      return;
    }
    const startTime = audioTimeForTick(
      this.realTimeAnchorAudioTime,
      this.realTimeAnchorTick ?? tick,
      tick,
    );
    const voice = playSampleBuffer(ctx, destination, buffer, sample.edit, startTime, true);
    voice.setPlaybackRate(this.tempoScale);
    this.sampleVoice = voice;
  }

  private rebuildIndex(): void {
    if (this.track === null) {
      return;
    }
    this.effectiveTicksPerBeat = this.track.ticksPerBeat / this.tempoScale;
    this.loopTicks = Math.max(1, Math.round(this.track.loopBeats * this.effectiveTicksPerBeat));
    this.scheduleIndex = buildScheduleIndex(this.track, this.effectiveTicksPerBeat);
  }

  /** Pushes `currentTier`'s `muffle` onto `context.ts`'s whole-mix lowpass, or bypasses it. */
  private applyTierFilter(): void {
    if (!this.distortionEnabled || this.currentTier === null || this.currentTier.tier === 0) {
      resetPromilleFilter();
      return;
    }
    setPromilleFilterCutoffHz(promilleMuffleToHz(this.currentTier.muffle));
  }
}
