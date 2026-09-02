import type { InstrumentDefinition } from '../../app/audio/types.js';

/**
 * The Blaskapelle's five members (`docs/CONTENT_BIBLE.md` §6: "tuba
 * bassline, brass stabs, accordion, clarinet"), plus `bell` for UI/victory
 * stings, plus a small general-purpose palette (`guitar`, `banjo`, `piano`,
 * `drums`) for anything that isn't the brass band itself — a Gstanzl's own
 * accompaniment, say. Every voice here is synthesised, not sampled, so the
 * whole palette lives in source control as data (`docs/TECH_STACK.md` §5's
 * `assets/audio/` never gets a binary in it for this).
 *
 * `tracks.ts` references these by `id`; `sfx.ts`'s handful of pitched cues
 * (UI confirm/cancel, pickups) and `barks.ts`'s bark motifs reuse the same
 * set rather than inventing one-off voices — though both of those want a
 * `kind: 'tonal'` instrument specifically (a pitch, or a bark's short note
 * sequence), never `drums`, whose `NoteEvent.note` means a `DrumVoice.id`
 * instead of a pitch.
 */

export const accordion: InstrumentDefinition = {
  kind: 'tonal',
  id: 'accordion',
  name: 'Accordion',
  waveform: 'sawtooth',
  // A second reed slightly off pitch is the accordion's own "musette"
  // beating shimmer — not a mixing effect, the real instrument does this.
  secondaryOscillator: { waveform: 'triangle', detuneCents: 9, mix: 0.6 },
  filter: { type: 'bandpass', frequencyHz: 900, q: 0.9 },
  vibrato: { rateHz: 5.2, depthCents: 6 },
  envelope: { attack: 0.03, decay: 0.08, sustain: 0.75, release: 0.12 },
  gain: 0.5,
};

export const tuba: InstrumentDefinition = {
  kind: 'tonal',
  id: 'tuba',
  name: 'Tuba',
  waveform: 'triangle',
  secondaryOscillator: { waveform: 'sine', detuneCents: 0, mix: 0.5 },
  filter: { type: 'lowpass', frequencyHz: 420, q: 0.7 },
  envelope: { attack: 0.005, decay: 0.05, sustain: 0.55, release: 0.09 },
  gain: 0.65,
};

export const brassStab: InstrumentDefinition = {
  kind: 'tonal',
  id: 'brass-stab',
  name: 'Brass stab',
  waveform: 'sawtooth',
  secondaryOscillator: { waveform: 'square', detuneCents: -6, mix: 0.35 },
  filter: { type: 'lowpass', frequencyHz: 2600, q: 1.1 },
  envelope: { attack: 0.008, decay: 0.1, sustain: 0.15, release: 0.08 },
  gain: 0.45,
};

export const clarinet: InstrumentDefinition = {
  kind: 'tonal',
  id: 'clarinet',
  name: 'Clarinet',
  // Square approximates a clarinet's dominant odd harmonics closer than a
  // sawtooth does — the reedy, hollow timbre this band's melody voice wants.
  waveform: 'square',
  filter: { type: 'lowpass', frequencyHz: 1800, q: 0.6 },
  vibrato: { rateHz: 4.6, depthCents: 4 },
  envelope: { attack: 0.04, decay: 0.06, sustain: 0.7, release: 0.1 },
  gain: 0.4,
};

export const bell: InstrumentDefinition = {
  kind: 'tonal',
  id: 'bell',
  name: 'Bell',
  waveform: 'sine',
  // An octave-up shimmer layer, quiet and fast-decaying against the
  // fundamental's long tail — a glockenspiel-ish attack for UI/victory cues.
  secondaryOscillator: { waveform: 'sine', detuneCents: 1200, mix: 0.25 },
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.6 },
  gain: 0.5,
};

/**
 * A general-purpose palette, alongside the Blaskapelle proper — for a
 * Gstanzl or anything else that wants a plucked or struck voice instead of
 * a band member. Not part of `docs/CONTENT_BIBLE.md`'s brass band; the
 * shipped floor tracks stay Blaskapelle instruments unless a future change
 * says otherwise.
 */
export const guitar: InstrumentDefinition = {
  kind: 'tonal',
  id: 'guitar',
  name: 'Guitar',
  // Triangle for the fundamental's roundness, a detuned sawtooth layer for
  // the pluck's initial bite — the two fade at different rates as the note
  // decays, which is most of what makes a plucked string read as plucked.
  waveform: 'triangle',
  secondaryOscillator: { waveform: 'sawtooth', detuneCents: 4, mix: 0.3 },
  filter: { type: 'lowpass', frequencyHz: 2200, q: 0.8 },
  envelope: { attack: 0.002, decay: 0.18, sustain: 0.15, release: 0.25 },
  gain: 0.45,
};

export const banjo: InstrumentDefinition = {
  kind: 'tonal',
  id: 'banjo',
  name: 'Banjo',
  // Square + a sharp bandpass is banjo's whole character next to the
  // guitar above: brighter, buzzier, and gone almost as soon as it's
  // struck — a drumhead resonator's decay, not a wooden body's.
  waveform: 'square',
  secondaryOscillator: { waveform: 'sawtooth', detuneCents: 7, mix: 0.4 },
  filter: { type: 'bandpass', frequencyHz: 2800, q: 1.4 },
  envelope: { attack: 0.001, decay: 0.12, sustain: 0.05, release: 0.15 },
  gain: 0.4,
};

export const piano: InstrumentDefinition = {
  kind: 'tonal',
  id: 'piano',
  name: 'Piano',
  // A detuned sine layer under the triangle fundamental is the same
  // "two strings per note, very slightly apart" beating a real piano's
  // unison stringing gives it — subtle, not the accordion's obvious wobble.
  waveform: 'triangle',
  secondaryOscillator: { waveform: 'sine', detuneCents: -5, mix: 0.5 },
  filter: { type: 'lowpass', frequencyHz: 3200, q: 0.5 },
  envelope: { attack: 0.004, decay: 0.3, sustain: 0.35, release: 0.4 },
  gain: 0.5,
};

/**
 * A small kit — six voices, ordered here high to low the way a piano roll
 * draws them (the array order *is* the row order, `DrumVoice`'s own doc
 * comment). Every voice is filtered noise, a low sine thump, or both;
 * there is no pitch to speak of, so a percussion track's `NoteEvent.note`
 * names one of these `id`s instead of a note name.
 */
export const drums: InstrumentDefinition = {
  kind: 'percussion',
  id: 'drums',
  name: 'Drums',
  gain: 0.8,
  voices: [
    {
      id: 'hihat-open',
      label: 'Hi-hat (open)',
      noise: {
        filter: { type: 'highpass', frequencyHz: 5000, q: 0.6 },
        durationSeconds: 0.25,
        gain: 0.3,
      },
    },
    {
      id: 'hihat-closed',
      label: 'Hi-hat (closed)',
      noise: {
        filter: { type: 'highpass', frequencyHz: 6000, q: 0.7 },
        durationSeconds: 0.04,
        gain: 0.35,
      },
    },
    {
      id: 'clap',
      label: 'Clap',
      noise: {
        filter: { type: 'bandpass', frequencyHz: 1500, q: 0.9 },
        durationSeconds: 0.15,
        gain: 0.4,
      },
    },
    {
      id: 'rim',
      label: 'Rim',
      noise: {
        filter: { type: 'highpass', frequencyHz: 3000, q: 2 },
        durationSeconds: 0.03,
        gain: 0.25,
      },
      tone: { frequencyHz: 400, durationSeconds: 0.03, gain: 0.3 },
    },
    {
      id: 'snare',
      label: 'Snare',
      noise: {
        filter: { type: 'bandpass', frequencyHz: 2000, q: 1.2 },
        durationSeconds: 0.12,
        gain: 0.6,
      },
      tone: { frequencyHz: 180, durationSeconds: 0.08, gain: 0.3 },
    },
    {
      id: 'kick',
      label: 'Kick',
      noise: {
        filter: { type: 'lowpass', frequencyHz: 800, q: 0.5 },
        durationSeconds: 0.03,
        gain: 0.3,
      },
      tone: { frequencyHz: 60, durationSeconds: 0.18, gain: 0.9 },
    },
  ],
};

export const INSTRUMENT_DEFINITIONS: readonly InstrumentDefinition[] = [
  accordion,
  tuba,
  brassStab,
  clarinet,
  bell,
  guitar,
  banjo,
  piano,
  drums,
];
