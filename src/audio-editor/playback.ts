import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playTone } from '../app/audio/synth.js';
import type { InstrumentDefinition } from '../app/audio/types.js';
import type { AudioEditorState } from './state.js';

export interface LoopPlayerHandle {
  start(): void;
  stop(): void;
  destroy(): void;
}

/**
 * Loops `state.loop` over the real synth (`app/audio/synth.ts`'s
 * `playTone`, the same code a shipped track plays with) — a lightweight
 * step-sequencer scheduler, not `app/audio/music.ts`'s tick-driven one.
 *
 * The game's `MusicPlayer` schedules off `sim.tick` because a catch-up
 * burst of simulation ticks can arrive in one JS frame and still needs each
 * note at its own precise, non-bunched time. This editor has no
 * simulation and nothing downstream depends on its timing at all — it
 * scans, once per animation frame, which notes the playhead has crossed
 * since the last frame and fires them essentially "now". At the tempos and
 * frame rates this runs at the jitter is a couple of milliseconds,
 * inaudible for a compose/preview tool.
 */
export function createLoopPlayer(
  state: AudioEditorState,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
): LoopPlayerHandle {
  let rafHandle: number | null = null;
  let startAudioTime = 0;
  let lastPositionBeats = 0;

  function secondsPerBeat(): number {
    return 60 / state.bpm;
  }

  function scheduleNote(instrument: string, note: string, durationBeats: number): void {
    const ctx = getAudioContext();
    const destination = getMasterGain();
    const instrumentDef = instrumentsById.get(instrument);
    if (ctx === null || destination === null || instrumentDef === undefined) {
      return;
    }
    const durationSeconds = durationBeats * secondsPerBeat();
    playTone(ctx, destination, instrumentDef, note, ctx.currentTime, durationSeconds, 1);
  }

  function tick(): void {
    if (!state.isPlaying) {
      return;
    }
    const ctx = getAudioContext();
    if (ctx === null) {
      rafHandle = requestAnimationFrame(tick);
      return;
    }
    const elapsedBeats = (ctx.currentTime - startAudioTime) / secondsPerBeat();
    const loopBeats = state.loop.loopBeats;
    const position = ((elapsedBeats % loopBeats) + loopBeats) % loopBeats;

    for (const note of state.loop.notes) {
      const crossed =
        position >= lastPositionBeats
          ? note.beat >= lastPositionBeats && note.beat < position
          : note.beat >= lastPositionBeats || note.beat < position;
      if (crossed) {
        scheduleNote(note.instrument, note.note, note.durationBeats);
      }
    }

    lastPositionBeats = position;
    state.playheadBeat = position;
    state.notify();
    rafHandle = requestAnimationFrame(tick);
  }

  return {
    start(): void {
      if (state.isPlaying) {
        return;
      }
      resumeAudioContext();
      const ctx = getAudioContext();
      startAudioTime = ctx?.currentTime ?? 0;
      lastPositionBeats = 0;
      state.playheadBeat = 0;
      state.isPlaying = true;
      state.notify();
      rafHandle = requestAnimationFrame(tick);
    },
    stop(): void {
      state.isPlaying = false;
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }
      state.notify();
    },
    destroy(): void {
      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
      }
    },
  };
}
