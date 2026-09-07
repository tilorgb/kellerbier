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
 * real-time anchor pair. Pure and `AudioContext`-free —
 * `tests/unit/audio-music.test.ts` exercises this directly.
 */
export function audioTimeForTick(
  anchorAudioTime: number,
  anchorTick: number,
  tick: number,
): number {
  return anchorAudioTime + (tick - anchorTick) / TICKS_PER_SECOND;
}

/** How far ahead of `ctx.currentTime` a resynced schedule cursor is placed — clear of "now". */
export const MUSIC_SCHEDULE_LOOKAHEAD_SECONDS = 0.03;

/**
 * How far ahead of `ctx.currentTime` the cursor may legitimately run before
 * it is treated as runaway. A healthy catch-up burst is a few ticks
 * (`FixedTimestepLoop`'s `MAX_STEPS_PER_FRAME`, ~83ms); anything past this is
 * the tick clock sprinting ahead of real time — debug single-stepping, a
 * replay fast-forward — and the schedule should snap back to now.
 */
export const MUSIC_MAX_SCHEDULE_AHEAD_SECONDS = 0.5;

/**
 * Where the next batch of note starts should be scheduled from.
 *
 * `sync` walks a cursor forward one tick's worth (`1 / TICKS_PER_SECOND`) per
 * tick it schedules. That stays aligned with the audio clock only while ticks
 * run at exactly `TICKS_PER_SECOND` in real time — which `FixedTimestepLoop`
 * abandons the moment it drops ticks under load (a room-switch hitch is the
 * routine case) or runs slow-motion. The cursor then trails `ctx.currentTime`,
 * and notes get scheduled further and further in the past, where their attack
 * envelope has already elapsed by the time the browser reaches them: they play
 * quieter and quieter until they are inaudible. That is the "the music fades
 * out as you move through rooms" bug.
 *
 * When the cursor has fallen behind (or to) the audio clock — or sprinted far
 * ahead of it — this snaps it back to just ahead of now. Pure, so
 * `tests/unit/audio-music.test.ts` can pin the behaviour without a real
 * `AudioContext`.
 */
export function resolveScheduleCursor(cursor: number, now: number, lookahead: number): number {
  const floor = now + lookahead;
  if (cursor < floor || cursor > now + MUSIC_MAX_SCHEDULE_AHEAD_SECONDS) {
    return floor;
  }
  return cursor;
}

/**
 * The longest run of ticks `sync` will schedule notes for in one call. A
 * bigger gap than this means ticks were dropped (a stall) or never synced
 * (audio arrived late) and their musical moment has passed — resume near the
 * current tick rather than firing a backlog of notes. Comfortably above a
 * healthy frame's catch-up (`FixedTimestepLoop`'s own `MAX_STEPS_PER_FRAME`).
 */
const MUSIC_MAX_CATCHUP_TICKS = 8;

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
  /**
   * Audio-clock time the next unscheduled tick's notes fire at. Walks forward
   * one tick's worth per scheduled tick, and is snapped back to ~now by
   * `resolveScheduleCursor` whenever it trails the audio clock — see there.
   * `NaN` until the first `sync` with a live `AudioContext` seeds it.
   */
  private scheduleCursor = Number.NaN;
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
    // A fresh track starts scheduling from ~now, not from wherever the last
    // one's cursor had walked to.
    this.scheduleCursor = Number.NaN;
    this.rebuildIndex();
  }

  /** Stops scheduling new notes (or the looping sample). Already-sounding notes ring out on their own envelopes. */
  stop(): void {
    this.sampleVoice?.stop();
    this.sampleVoice = null;
    this.track = null;
    this.scheduleCursor = Number.NaN;
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
    if (Number.isNaN(this.scheduleCursor)) {
      this.scheduleCursor = ctx.currentTime;
      this.lastScheduledTick = tick - 1;
    }
    // Keep the schedule anchored to real time: whenever it has slipped behind
    // the audio clock (dropped ticks, a stall, slow-motion) snap it forward so
    // notes never land in the past — see `resolveScheduleCursor`.
    this.scheduleCursor = resolveScheduleCursor(
      this.scheduleCursor,
      ctx.currentTime,
      MUSIC_SCHEDULE_LOOKAHEAD_SECONDS,
    );
    if (this.track.sample !== undefined) {
      this.syncSample(ctx, destination, this.track.sample);
      this.lastScheduledTick = tick;
      return;
    }
    // Never fill more than a short catch-up: a wider gap is dropped ticks whose
    // musical moment has gone, not notes worth firing late in a bunch.
    const from = Math.max(this.lastScheduledTick + 1, tick - MUSIC_MAX_CATCHUP_TICKS + 1);
    for (let t = from; t <= tick; t += 1) {
      const posInLoop = ((t % this.loopTicks) + this.loopTicks) % this.loopTicks;
      const due = this.scheduleIndex.get(posInLoop);
      if (due === undefined) {
        continue;
      }
      const startTime = audioTimeForTick(this.scheduleCursor, from, t);
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
    // Walk the cursor past every tick just scheduled, so the next call picks up
    // exactly where this one left off while ticks keep real time.
    this.scheduleCursor += (tick - from + 1) / TICKS_PER_SECOND;
    this.lastScheduledTick = tick;
  }

  /**
   * The sample-track half of `sync()`: starts the recording looping once its
   * buffer has decoded, at the schedule cursor's audio time — a real recording
   * is still started from the same real-time-anchored cursor the note branch
   * uses, never from `ctx.currentTime` read straight, so it keeps #51's "no
   * timing dependency the wrong way round". A no-op once `sampleVoice` exists;
   * a looping sample needs no further per-tick scheduling and does not drift.
   */
  private syncSample(
    ctx: AudioContext,
    destination: AudioNode,
    sample: NonNullable<TrackDefinition['sample']>,
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
    const voice = playSampleBuffer(
      ctx,
      destination,
      buffer,
      sample.edit,
      this.scheduleCursor,
      true,
    );
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
