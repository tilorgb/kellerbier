/**
 * The schema `src/content/audio/*` data is authored against — the audio
 * counterpart of `sim/enemy/definition.ts`'s `EnemyDefinition`: the engine
 * layer owns the shape, content imports it type-only
 * (`tools/eslint/architecture.js`'s `kellerbier/content-is-data`), and adding
 * a track, an instrument or an SFX id is a data change, not an engine one.
 *
 * Everything here is plain data — no `AudioContext`, no Web Audio node, no
 * DOM. `app/audio/synth.ts` is what turns it into sound; keeping the two
 * separate is what lets `tests/unit/audio-*.test.ts` assert on the data and
 * the scheduling math without a browser.
 */

/** A basic Web Audio periodic waveform — chiptune's whole vocabulary. */
export type Waveform = 'sine' | 'square' | 'sawtooth' | 'triangle';

/** Attack/decay/sustain/release, in seconds (sustain is a 0–1 gain level). */
export interface Envelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly release: number;
}

/** A second, detuned oscillator layered under the first — an instrument's "fatness". */
export interface OscillatorLayer {
  readonly waveform: Waveform;
  /** Cents (1/100 semitone) away from the primary oscillator. */
  readonly detuneCents: number;
  /** 0–1, relative to the primary oscillator's own gain. */
  readonly mix: number;
}

/** A one-pole-ish lowpass/bandpass/highpass carved onto the voice, per `BiquadFilterNode.type`. */
export interface InstrumentFilter {
  readonly type: 'lowpass' | 'bandpass' | 'highpass';
  readonly frequencyHz: number;
  readonly q: number;
}

/**
 * A synthesised, pitched instrument voice — the Blaskapelle's members, plus
 * whatever else gets added to the palette (guitar, banjo, piano, ...).
 * Every track references these by id; there is no per-note timbre, only
 * per-instrument. `kind: 'tonal'` is what tells `synth.ts#playTone` and the
 * piano roll this instrument plays pitches, not drum voices — see
 * `PercussionInstrumentDefinition` for the other branch of
 * `InstrumentDefinition`.
 */
export interface TonalInstrumentDefinition {
  readonly kind: 'tonal';
  readonly id: string;
  readonly name: string;
  readonly waveform: Waveform;
  readonly envelope: Envelope;
  readonly secondaryOscillator?: OscillatorLayer;
  readonly filter?: InstrumentFilter;
  /** A slow pitch wobble — the accordion's reed wheeze. Omit for a clean tone. */
  readonly vibrato?: { readonly rateHz: number; readonly depthCents: number };
  /** Overall voice loudness relative to the mix, 0–1. */
  readonly gain: number;
}

/**
 * One drum sound within a `PercussionInstrumentDefinition` — filtered
 * noise, optionally with a low sine "thump" underneath it (a kick wants
 * one, a hi-hat doesn't). `id` is what a percussion track's `NoteEvent.note`
 * names instead of a pitch (`'kick'`, not `'C4'`) — a kit has no scale, so
 * reusing scientific pitch notation for "which drum" would be a lie the
 * schema tells about itself. `label` is what the piano roll draws on that
 * row instead of a note name.
 */
export interface DrumVoice {
  readonly id: string;
  readonly label: string;
  readonly noise?: {
    readonly filter?: InstrumentFilter;
    readonly durationSeconds: number;
    readonly gain: number;
  };
  readonly tone?: {
    readonly frequencyHz: number;
    readonly durationSeconds: number;
    readonly gain: number;
  };
}

/**
 * A drum kit — a fixed small set of `DrumVoice`s, each its own row on the
 * piano roll rather than a pitch range (`kind: 'percussion'` is what tells
 * `synth.ts#playTone` and the piano roll to read it that way). `voices` is
 * an array, not a map, so row order is the array's own order rather than
 * relying on object-key iteration order to stay stable.
 */
export interface PercussionInstrumentDefinition {
  readonly kind: 'percussion';
  readonly id: string;
  readonly name: string;
  readonly voices: readonly DrumVoice[];
  /** Overall voice loudness relative to the mix, 0–1. */
  readonly gain: number;
}

export type InstrumentDefinition = TonalInstrumentDefinition | PercussionInstrumentDefinition;

/**
 * The non-destructive edit applied to a recorded sample at playback time —
 * a crop, a pair of fades, a gain, and (reusing `InstrumentFilter` rather
 * than inventing a second filter shape) an optional tone-shaping filter.
 * "Non-destructive" is the point: `assets/audio/<assetId>.*` always holds
 * exactly the file the DAW exported, and every edit here re-derives the
 * played sound from it on the fly, the same way `synth.ts` derives a voice
 * from an `InstrumentDefinition` rather than baking one down to a fixed
 * buffer — re-cropping or nudging a fade never re-encodes anything.
 */
export interface SampleEdit {
  /** Seconds into the source file where playback starts. */
  readonly trimStartSeconds: number;
  /** Seconds into the source file where playback ends (exclusive). */
  readonly trimEndSeconds: number;
  readonly fadeInSeconds: number;
  readonly fadeOutSeconds: number;
  /** Linear gain, 0–2 (1 = unity). */
  readonly gain: number;
  readonly filter?: InstrumentFilter;
}

/**
 * A recorded audio file dropped into `assets/audio/` (WAV/MP3/OGG — whatever
 * `AudioContext.decodeAudioData` accepts) plus how to play it back.
 * `assetId` is the file's name without its extension, matching
 * `app/audio/sample-assets.ts`'s `import.meta.glob` index — the same
 * "id is the filename" convention `pixel-editor/static-sprite-index.ts`
 * already uses for sprites.
 *
 * A `TrackDefinition`/`SfxDefinition`/`BarkDefinition` carrying a `sample`
 * plays it *instead of* its synthesised content — the recording replaces
 * the placeholder rather than layering under it, so `events`/`noise`/`tone`/
 * `motif` stay in the file as the fallback `app/audio/sample-player.ts`'s
 * callers fall back to while the asset is still decoding (or missing).
 */
export interface SampleRef {
  readonly assetId: string;
  readonly edit: SampleEdit;
}

/**
 * One note (or chord) in a track, expressed in beats from the track's own
 * start — never in seconds and never against `AudioContext.currentTime`.
 * `music.ts`'s scheduler is what converts `beat` to a playback time, and it
 * does that from `sim.tick`, per #51's "must never introduce a timing
 * dependency on audio playback position."
 */
export interface NoteEvent {
  readonly beat: number;
  readonly durationBeats: number;
  readonly instrument: string;
  /**
   * Scientific pitch notation (`'A4'`, `'Eb3'`) or a chord as several of
   * them, for a `TonalInstrumentDefinition` — `synth.ts`'s `noteToFrequency`
   * is the parser both sides agree on. For a `PercussionInstrumentDefinition`,
   * one of its `DrumVoice.id`s instead (`'kick'`, not a pitch); a kit has no
   * chords, so `note` is always a single string there.
   */
  readonly note: string | readonly string[];
  /** 0–1, layered on top of the instrument's own `gain`. Defaults to 1. */
  readonly velocity?: number;
}

/**
 * A composed piece — a floor theme, a boss theme, a stinger. `ticksPerBeat`
 * is always 30 (120 BPM at the simulation's fixed 60 ticks/second,
 * `sim/time.ts`) so every track lands on the same beat grid
 * `content/enemies/blaskapellist.ts`'s `fireOnBeat` already fires on;
 * written out per track anyway, not imported, for the same "content is a
 * literal" reason `blaskapellist.ts` gives its own copy of the number.
 */
export interface TrackDefinition {
  readonly id: string;
  readonly title: string;
  readonly ticksPerBeat: number;
  /** Loop length. A track's last beat plus its duration must not exceed this. */
  readonly loopBeats: number;
  readonly events: readonly NoteEvent[];
  /** A DAW recording standing in for `events` — see `SampleRef`'s own doc comment. */
  readonly sample?: SampleRef;
}

/** A single synthesised sound effect: filtered noise, or a short tone, or both. */
export interface SfxDefinition {
  readonly id: string;
  readonly description: string;
  readonly noise?: {
    readonly filter?: InstrumentFilter;
    readonly durationSeconds: number;
    readonly gain: number;
  };
  readonly tone?: {
    readonly instrument: string;
    readonly note: string;
    readonly durationSeconds: number;
  };
  /** Random pitch wobble per play, in cents, so a repeated hit doesn't phase-lock. Defaults to 0. */
  readonly pitchJitterCents?: number;
  /** A recorded one-shot standing in for `noise`/`tone` — see `SampleRef`'s own doc comment. */
  readonly sample?: SampleRef;
}

/**
 * A short Bavarian voice bark (`docs/CONTENT_BIBLE.md` §6) — placeholder
 * content until real voice-over lands. `motif` stands in for the recorded
 * line: a short synthesised "shout" contour (an instrument sliding across a
 * couple of notes) rather than actual speech, so the trigger, rate-limit and
 * mixing seam exist and sound distinct from the SFX/music layers today.
 */
export interface BarkDefinition {
  readonly id: string;
  readonly text: string;
  readonly motif: {
    readonly instrument: string;
    readonly notes: readonly string[];
    readonly noteDurationSeconds: number;
  };
  /** A recorded voice line standing in for `motif` — see `SampleRef`'s own doc comment. */
  readonly sample?: SampleRef;
}

/**
 * The audio *content* of a Promille tier (`docs/GAME_DESIGN.md` §5) — what
 * the filtered mix should sound like. The filter chain itself (buses,
 * ducking, the actual DSP) is #157's; this is only the target parameters
 * that chain will read, plus the light, bus-free approximation
 * `music.ts`'s `MusicPlayer.setPromilleTier` applies directly to its own
 * oscillators today so the effect is audible before #157 lands.
 */
export interface PromilleAudioTier {
  readonly tier: number;
  readonly name: string;
  /** Playback rate multiplier — sober is 1; deeper tiers drag the tempo down. */
  readonly tempoScale: number;
  /** Detune applied to every voice, in cents — a woozy, slightly-flat mix. */
  readonly detuneCents: number;
  /** 0–1 — how much a lowpass should close in once #157 owns the mix bus. */
  readonly muffle: number;
}
