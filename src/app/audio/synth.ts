import type { Envelope, InstrumentDefinition, InstrumentFilter, SfxDefinition } from './types.js';

/**
 * Turns `content/audio/*` data into Web Audio nodes: the chiptune Blaskapelle
 * synth (`playTone`, for `music.ts` and voice barks) and the percussion/SFX
 * layer (`playNoise`, for `sfx-player.ts`).
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
): void {
  const notes: readonly string[] = typeof note === 'string' ? [note] : note;
  for (const n of notes) {
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
    );
  }
}

function playSingleTone(
  ctx: AudioContext,
  destination: AudioNode,
  instrument: InstrumentDefinition,
  note: string,
  startTime: number,
  durationSeconds: number,
  velocity: number,
  pitchJitterCents: number,
  constantDetuneCents: number,
): void {
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
 * Plays an SFX's noise layer — filtered white noise with a short percussive
 * envelope. This is the carrier for every impact, footstep and door sound;
 * `sfx.ts`'s `SfxDefinition.tone` (via `playTone`) covers the handful that
 * want a pitched blip (UI confirm/cancel, pickups) instead of or alongside it.
 */
export function playNoise(ctx: AudioContext, destination: AudioNode, def: SfxDefinition): void {
  if (def.noise === undefined) {
    return;
  }
  const { filter, durationSeconds, gain } = def.noise;
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

  const now = ctx.currentTime;
  const g = gainNode.gain;
  g.setValueAtTime(gain, now);
  g.exponentialRampToValueAtTime(Math.max(gain * 0.001, 0.0001), now + durationSeconds);

  source.start(now, 0, durationSeconds);
  source.onended = (): void => {
    source.disconnect();
    gainNode.disconnect();
    if (tail !== gainNode) {
      tail.disconnect();
    }
  };
}

/** Plays an `SfxDefinition`'s noise and/or tone layer together, "now". */
export function playSfxSound(
  ctx: AudioContext,
  destination: AudioNode,
  def: SfxDefinition,
  instruments: ReadonlyMap<string, InstrumentDefinition>,
): void {
  playNoise(ctx, destination, def);
  if (def.tone !== undefined) {
    const instrument = instruments.get(def.tone.instrument);
    if (instrument === undefined) {
      throw new Error(`sfx "${def.id}" references unknown instrument "${def.tone.instrument}"`);
    }
    playTone(
      ctx,
      destination,
      instrument,
      def.tone.note,
      ctx.currentTime,
      def.tone.durationSeconds,
      1,
      def.pitchJitterCents ?? 0,
    );
  }
}
