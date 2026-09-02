import type { InstrumentDefinition } from '../../app/audio/types.js';

/**
 * The Blaskapelle's five members (`docs/CONTENT_BIBLE.md` §6: "tuba
 * bassline, brass stabs, accordion, clarinet"), plus `bell` for UI/victory
 * stings — synthesised, not sampled, so the whole band lives in source
 * control as data (`docs/TECH_STACK.md` §5's `assets/audio/` never gets a
 * binary in it for this).
 *
 * `tracks.ts` references these by `id`; `sfx.ts`'s handful of pitched cues
 * (UI confirm/cancel, pickups) and `barks.ts`'s bark motifs reuse the same
 * set rather than inventing one-off voices.
 */

export const accordion: InstrumentDefinition = {
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
  id: 'tuba',
  name: 'Tuba',
  waveform: 'triangle',
  secondaryOscillator: { waveform: 'sine', detuneCents: 0, mix: 0.5 },
  filter: { type: 'lowpass', frequencyHz: 420, q: 0.7 },
  envelope: { attack: 0.005, decay: 0.05, sustain: 0.55, release: 0.09 },
  gain: 0.65,
};

export const brassStab: InstrumentDefinition = {
  id: 'brass-stab',
  name: 'Brass stab',
  waveform: 'sawtooth',
  secondaryOscillator: { waveform: 'square', detuneCents: -6, mix: 0.35 },
  filter: { type: 'lowpass', frequencyHz: 2600, q: 1.1 },
  envelope: { attack: 0.008, decay: 0.1, sustain: 0.15, release: 0.08 },
  gain: 0.45,
};

export const clarinet: InstrumentDefinition = {
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
  id: 'bell',
  name: 'Bell',
  waveform: 'sine',
  // An octave-up shimmer layer, quiet and fast-decaying against the
  // fundamental's long tail — a glockenspiel-ish attack for UI/victory cues.
  secondaryOscillator: { waveform: 'sine', detuneCents: 1200, mix: 0.25 },
  envelope: { attack: 0.001, decay: 0.15, sustain: 0.0, release: 0.6 },
  gain: 0.5,
};

export const INSTRUMENT_DEFINITIONS: readonly InstrumentDefinition[] = [
  accordion,
  tuba,
  brassStab,
  clarinet,
  bell,
];
