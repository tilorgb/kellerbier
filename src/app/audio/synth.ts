import type {
  DrumVoice,
  Envelope,
  InstrumentDefinition,
  InstrumentFilter,
  SfxDefinition,
} from './types.js';

/**
 * Turns `content/audio/*` data into Web Audio nodes: the chiptune Blaskapelle
 * synth (`playTone`, for `music.ts` and voice barks — dispatching to
 * `playDrumVoice` internally for a `PercussionInstrumentDefinition`) and the
 * SFX noise layer (`playNoise`, for `sfx-player.ts`).
 *
 * Every function here degrades to a no-op if its `AudioContext` is `null` —
 * callers pass whatever `context.ts#getAudioContext()` returned rather than
 * this module reaching for the singleton itself, which is what keeps
 * `noteToFrequency` (the one pure, easily-tested piece) importable from a
 * plain `vitest` unit test with nothing else in this file ever touching the
 * DOM in that test run.
 */

const SEMITONE_FROM_C: Readonly<Record<string, number>> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
};

const NOTE_PATTERN = /^([A-G])(#|b)?(-?\d+)$/;

/**
 * A handle onto a still-sounding voice, returned by every `play*` function in
 * this file. `stop()` fades it out over `FAST_STOP_SECONDS` and cuts it
 * short instead of letting its envelope finish — `sfx-player.ts`'s polyphony
 * cap is the only caller today (#157's voice-stealing: the oldest of too many
 * simultaneous SFX gets cut here rather than left to ring out and clip the
 * bus with everything still layering on top of it).
 *
 * Safe to call more than once, and safe to ignore entirely for a fire-and-
 * forget voice (`music.ts`'s notes, `sfx-player.ts`'s barks) — every voice
 * still self-disconnects via `onended` the way it always did.
 */
export interface VoiceHandle {
  stop(): void;
}

const NULL_VOICE: VoiceHandle = { stop: () => undefined };

/** How quickly `VoiceHandle.stop()` fades a cut-short voice — fast enough to read as a cut, not a click. */
const FAST_STOP_SECONDS = 0.015;

function combineVoices(handles: readonly VoiceHandle[]): VoiceHandle {
  if (handles.length === 1) {
    const only = handles[0];
    if (only !== undefined) {
      return only;
    }
  }
  return {
    stop: () => {
      for (const handle of handles) {
        handle.stop();
      }
    },
  };
}

/**
 * Scientific pitch notation ('A4', 'Eb3', 'F#5') to Hz, A4 = 440.
 * Throws on malformed input — a typo in a track's note data is a content bug
 * and belongs caught in CI (`tests/content/audio.test.ts`), the same
 * "gap vs. bug" line `docs/DECISIONS.md` #19 draws for room content.
 */
export function noteToFrequency(note: string): number {
  const match = NOTE_PATTERN.exec(note);
  if (match === null) {
    throw new Error(`not a note: "${note}" (expected scientific pitch notation, e.g. "A4")`);
  }
  const [, letter, accidental, octaveText] = match;
  if (letter === undefined || octaveText === undefined) {
    throw new Error(`not a note: "${note}"`);
  }
  const key = accidental === undefined ? letter : `${letter}${accidental}`;
  const semitone = SEMITONE_FROM_C[key];
  if (semitone === undefined) {
    throw new Error(`not a note: "${note}"`);
  }
  const octave = Number.parseInt(octaveText, 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * 2 ** ((midi - 69) / 12);
}

function applyEnvelope(
  gainNode: GainNode,
  peak: number,
  envelope: Envelope,
  startTime: number,
  noteEndTime: number,
): number {
  const { attack, decay, sustain, release } = envelope;
  const g = gainNode.gain;
  g.cancelScheduledValues(startTime);
  g.setValueAtTime(0, startTime);
  g.linearRampToValueAtTime(peak, startTime + attack);
  g.linearRampToValueAtTime(peak * sustain, startTime + attack + decay);
  const releaseStart = Math.max(startTime + attack + decay, noteEndTime);
  g.setValueAtTime(peak * sustain, releaseStart);
  g.linearRampToValueAtTime(0, releaseStart + release);
  return releaseStart + release;
}

function applyFilter(ctx: AudioContext, filter: InstrumentFilter): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = filter.type;
  node.frequency.value = filter.frequencyHz;
  node.Q.value = filter.q;
  return node;
}

/**
 * Plays one instrument voice against one note (or, for a chord, several) —
 * fire-and-forget, self-stopping and self-disconnecting via `onended`.
 *
 * `startTime`/`durationSeconds` are `AudioContext` timeline seconds, already
 * converted from a tick/beat by the caller (`music.ts`) — this function
 * itself never reads `ctx.currentTime` as anything but "now, for scheduling
 * a sound", never as a simulation input.
 */
export function playTone(
  ctx: AudioContext,
  destination: AudioNode,
  instrument: InstrumentDefinition,
  note: string | readonly string[],
  startTime: number,
  durationSeconds: number,
  velocity = 1,
  pitchJitterCents = 0,
  /** A fixed offset, unlike `pitchJitterCents` — `music.ts`'s Promille "woozy mix" drift. */
  constantDetuneCents = 0,
): VoiceHandle {
  if (instrument.kind === 'percussion') {
    // A kit has no chords and no pitch to jitter/detune — `note` is a
    // single `DrumVoice.id` (`'kick'`, not `'C4'`), and the voice's own
    // `noise`/`tone` durations are what the piano roll's own duration
    // setting can't usefully override (a drum hit doesn't sustain the way
    // a held tone does), so `durationSeconds` is intentionally unused here.
    const voiceId = typeof note === 'string' ? note : note[0];
    const voice = instrument.voices.find((candidate) => candidate.id === voiceId);
    if (voice !== undefined) {
      return playDrumVoice(ctx, destination, voice, startTime, instrument.gain * velocity);
    }
    return NULL_VOICE;
  }
  const notes: readonly string[] = typeof note === 'string' ? [note] : note;
  const handles = notes.map((n) =>
    playSingleTone(
      ctx,
      destination,
      instrument,
      n,
      startTime,
      durationSeconds,
      velocity,
      pitchJitterCents,
      constantDetuneCents,
    ),
  );
  return combineVoices(handles);
}

function playSingleTone(
  ctx: AudioContext,
  destination: AudioNode,
  instrument: Extract<InstrumentDefinition, { kind: 'tonal' }>,
  note: string,
  startTime: number,
  durationSeconds: number,
  velocity: number,
  pitchJitterCents: number,
  constantDetuneCents: number,
): VoiceHandle {
  const baseFrequency = noteToFrequency(note);
  const jitter =
    constantDetuneCents + (pitchJitterCents === 0 ? 0 : (Math.random() * 2 - 1) * pitchJitterCents);

  const voiceGain = ctx.createGain();
  let tail: AudioNode = voiceGain;
  if (instrument.filter !== undefined) {
    const filterNode = applyFilter(ctx, instrument.filter);
    voiceGain.connect(filterNode);
    tail = filterNode;
  }
  tail.connect(destination);

  const oscillators: OscillatorNode[] = [];

  const primary = ctx.createOscillator();
  primary.type = instrument.waveform;
  primary.frequency.value = baseFrequency;
  primary.detune.value = jitter;
  primary.connect(voiceGain);
  oscillators.push(primary);

  if (instrument.secondaryOscillator !== undefined) {
    const layer = instrument.secondaryOscillator;
    const layerGain = ctx.createGain();
    layerGain.gain.value = layer.mix;
    const secondary = ctx.createOscillator();
    secondary.type = layer.waveform;
    secondary.frequency.value = baseFrequency;
    secondary.detune.value = jitter + layer.detuneCents;
    secondary.connect(layerGain);
    layerGain.connect(voiceGain);
    oscillators.push(secondary);
  }

  if (instrument.vibrato !== undefined) {
    const { rateHz, depthCents } = instrument.vibrato;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rateHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = depthCents;
    lfo.connect(lfoGain);
    for (const osc of oscillators) {
      lfoGain.connect(osc.detune);
    }
    lfo.start(startTime);
    lfo.stop(startTime + durationSeconds + instrument.envelope.release + 0.05);
  }

  const peak = instrument.gain * velocity;
  const stopTime = applyEnvelope(
    voiceGain,
    peak,
    instrument.envelope,
    startTime,
    startTime + durationSeconds,
  );

  for (const osc of oscillators) {
    osc.start(startTime);
    osc.stop(stopTime + 0.05);
  }
  primary.onended = (): void => {
    voiceGain.disconnect();
    if (tail !== voiceGain) {
      tail.disconnect();
    }
  };

  return {
    stop: (): void => {
      const now = ctx.currentTime;
      const gainParam = voiceGain.gain;
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(gainParam.value, now);
      gainParam.linearRampToValueAtTime(0, now + FAST_STOP_SECONDS);
      for (const osc of oscillators) {
        try {
          osc.stop(now + FAST_STOP_SECONDS + 0.02);
        } catch {
          // Already stopped/scheduled — nothing more to cut short.
        }
      }
    },
  };
}

const noiseBufferCache = new WeakMap<AudioContext, AudioBuffer>();

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const cached = noiseBufferCache.get(ctx);
  if (cached !== undefined) {
    return cached;
  }
  const seconds = 1;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  noiseBufferCache.set(ctx, buffer);
  return buffer;
}

/**
 * Fills and caches the shared noise buffer ahead of the first SFX that needs
 * it. `context.ts` calls this once, right after creating the `AudioContext`
 * — see its own doc comment for why doing it there instead of lazily on
 * first use is the fix, not a micro-optimisation.
 */
export function warmNoiseBuffer(ctx: AudioContext): void {
  getNoiseBuffer(ctx);
}

/**
 * Filtered white noise with a short percussive envelope, at an explicit
 * `AudioContext` time — the shared carrier under `playNoise` (an SFX's
 * noise layer, always "now") and `playDrumVoice` (a drum hit, scheduled
 * ahead like any other note `music.ts` plays).
 */
function playFilteredNoiseAt(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  opts: {
    readonly filter?: InstrumentFilter;
    readonly durationSeconds: number;
    readonly gain: number;
  },
): VoiceHandle {
  const { filter, durationSeconds, gain } = opts;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);

  const gainNode = ctx.createGain();
  let tail: AudioNode = gainNode;
  if (filter !== undefined) {
    const filterNode = applyFilter(ctx, filter);
    gainNode.connect(filterNode);
    tail = filterNode;
  }
  tail.connect(destination);
  source.connect(gainNode);

  const g = gainNode.gain;
  g.setValueAtTime(gain, startTime);
  g.exponentialRampToValueAtTime(Math.max(gain * 0.001, 0.0001), startTime + durationSeconds);

  source.start(startTime, 0, durationSeconds);
  source.onended = (): void => {
    source.disconnect();
    gainNode.disconnect();
    if (tail !== gainNode) {
      tail.disconnect();
    }
  };

  return {
    stop: (): void => {
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FAST_STOP_SECONDS);
      try {
        source.stop(now + FAST_STOP_SECONDS + 0.01);
      } catch {
        // Already stopped/scheduled — nothing more to cut short.
      }
    },
  };
}

/**
 * Plays an SFX's noise layer — filtered white noise with a short percussive
 * envelope. This is the carrier for every impact, footstep and door sound;
 * `sfx.ts`'s `SfxDefinition.tone` (via `playTone`) covers the handful that
 * want a pitched blip (UI confirm/cancel, pickups) instead of or alongside it.
 */
export function playNoise(
  ctx: AudioContext,
  destination: AudioNode,
  def: SfxDefinition,
): VoiceHandle {
  if (def.noise === undefined) {
    return NULL_VOICE;
  }
  return playFilteredNoiseAt(ctx, destination, ctx.currentTime, def.noise);
}

/**
 * A short sine "thump" at a fixed pitch, decaying fast — the low body under
 * a kick or tom that `playFilteredNoiseAt`'s noise alone doesn't carry.
 */
function playDrumTone(
  ctx: AudioContext,
  destination: AudioNode,
  startTime: number,
  opts: { readonly frequencyHz: number; readonly durationSeconds: number; readonly gain: number },
): VoiceHandle {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(opts.frequencyHz, startTime);
  osc.frequency.exponentialRampToValueAtTime(
    Math.max(20, opts.frequencyHz * 0.5),
    startTime + opts.durationSeconds,
  );

  const gainNode = ctx.createGain();
  osc.connect(gainNode);
  gainNode.connect(destination);
  const g = gainNode.gain;
  g.setValueAtTime(opts.gain, startTime);
  g.exponentialRampToValueAtTime(
    Math.max(opts.gain * 0.001, 0.0001),
    startTime + opts.durationSeconds,
  );

  osc.start(startTime);
  osc.stop(startTime + opts.durationSeconds + 0.02);
  osc.onended = (): void => {
    osc.disconnect();
    gainNode.disconnect();
  };

  return {
    stop: (): void => {
      const now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + FAST_STOP_SECONDS);
      try {
        osc.stop(now + FAST_STOP_SECONDS + 0.02);
      } catch {
        // Already stopped/scheduled — nothing more to cut short.
      }
    },
  };
}

/** Plays one `DrumVoice` — its noise and/or tone layer together, at `startTime`. */
export function playDrumVoice(
  ctx: AudioContext,
  destination: AudioNode,
  voice: DrumVoice,
  startTime: number,
  gainScale: number,
): VoiceHandle {
  const handles: VoiceHandle[] = [];
  if (voice.noise !== undefined) {
    handles.push(
      playFilteredNoiseAt(ctx, destination, startTime, {
        ...voice.noise,
        gain: voice.noise.gain * gainScale,
      }),
    );
  }
  if (voice.tone !== undefined) {
    handles.push(
      playDrumTone(ctx, destination, startTime, {
        ...voice.tone,
        gain: voice.tone.gain * gainScale,
      }),
    );
  }
  return combineVoices(handles);
}

/** Plays an `SfxDefinition`'s noise and/or tone layer together, "now". */
export function playSfxSound(
  ctx: AudioContext,
  destination: AudioNode,
  def: SfxDefinition,
  instruments: ReadonlyMap<string, InstrumentDefinition>,
): VoiceHandle {
  const handles: VoiceHandle[] = [playNoise(ctx, destination, def)];
  if (def.tone !== undefined) {
    const instrument = instruments.get(def.tone.instrument);
    if (instrument === undefined) {
      throw new Error(`sfx "${def.id}" references unknown instrument "${def.tone.instrument}"`);
    }
    handles.push(
      playTone(
        ctx,
        destination,
        instrument,
        def.tone.note,
        ctx.currentTime,
        def.tone.durationSeconds,
        1,
        def.pitchJitterCents ?? 0,
      ),
    );
  }
  return combineVoices(handles);
}
