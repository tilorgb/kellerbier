/**
 * The one `AudioContext` the game uses, and the bus graph everything else in
 * `app/audio/` renders into (#157).
 *
 * The graph: `music`/`sfx`/`voice` gain nodes each feed `promilleFilter` (a
 * lowpass parked wide open until a Promille tier closes it — see
 * `setPromilleFilterCutoff`), which feeds `master`, which feeds
 * `ctx.destination`. Three independent buses rather than one — CONTRIBUTING's
 * audio definition-of-done ("has an off switch that reaches zero") now
 * applies per-category as well as globally, and #53's settings screen is what
 * puts a slider on each.
 *
 * The filter sits after the buses and before master, not per-bus, because
 * Promille is a whole-mix effect (`docs/GAME_DESIGN.md` §5) rather than a
 * music-only one — SFX and voice barks heard "through the beer" are part of
 * the same woozy read the vignette and the movement drift already give the
 * screen. `music.ts`'s own tempo-drag/detune stays layered on top of this,
 * unaffected: that half is the "pitch shift", this is the "low-pass" #51's
 * own note called out as #157's job.
 *
 * Constructed lazily, not at import time: `vitest.config` runs tests under
 * `environment: 'node'`, which has no `AudioContext`/`window` at all, and a
 * module that touched either at the top level would fail every test that
 * imports it, transitively, even ones nowhere near audio. Every export here
 * is safe to import anywhere and returns `null` off-browser instead.
 */

import type { AudioBus, MixerSettings } from './mixer.js';
import { warmNoiseBuffer } from './synth.js';

type AudioContextLike = AudioContext;

function resolveAudioContextCtor(): (new () => AudioContextLike) | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const w = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** A lowpass this open is inaudible as filtering — sober, i.e. tier 0's `muffle`. */
const PROMILLE_FILTER_BYPASS_HZ = 20000;
/** The floor a fully-muffled tier's cutoff can reach — never silence, just dull. */
const PROMILLE_FILTER_MIN_HZ = 350;

let context: AudioContextLike | null = null;
let master: GainNode | null = null;
let promilleFilter: BiquadFilterNode | null = null;
const busGains: Partial<Record<AudioBus, GainNode>> = {};
let unlockListenersAttached = false;
let muted = false;

/** The mixer volumes currently applied — read back by `getBusVolume`/`getMasterVolume`. */
let masterVolume = 1;
const busVolumes: Record<AudioBus, number> = { music: 1, sfx: 1, voice: 1 };

/**
 * The shared context, created on first use. Returns `null` in any
 * environment without Web Audio (headless tests, very old browsers) — every
 * caller in this directory treats that as "audio is a no-op here", the same
 * way `impact.ts`/`ambience.ts`'s `SILENT_*` stand-ins already do.
 */
export function getAudioContext(): AudioContextLike | null {
  if (context !== null) {
    return context;
  }
  const Ctor = resolveAudioContextCtor();
  if (Ctor === null) {
    return null;
  }
  context = new Ctor();
  master = context.createGain();
  master.gain.value = muted ? 0 : masterVolume;
  promilleFilter = context.createBiquadFilter();
  promilleFilter.type = 'lowpass';
  promilleFilter.frequency.value = PROMILLE_FILTER_BYPASS_HZ;
  promilleFilter.Q.value = 0.707;
  promilleFilter.connect(master);
  master.connect(context.destination);

  for (const bus of ['music', 'sfx', 'voice'] as const) {
    const gain = context.createGain();
    gain.gain.value = busVolumes[bus];
    gain.connect(promilleFilter);
    busGains[bus] = gain;
  }

  // The SFX noise carrier is a synthesised buffer (`synth.ts#getNoiseBuffer`),
  // not a decoded asset — there is nothing this project fetches or decodes
  // off the main thread, per #157's "asset loading" scope. The one thing
  // that *does* cost real time is filling that buffer's samples, and doing
  // it lazily on whatever SFX happens to play first (previously: the first
  // hit of a room, i.e. mid-combat) is exactly the kind of hitch
  // `docs/TECH_STACK.md` §3's "no frame-time spike on a room transition"
  // budget rules out. Warming it here, once, at construction (boot or the
  // first user-gesture unlock, both off the hot path) moves that cost to a
  // moment nothing is judging frame time.
  warmNoiseBuffer(context);

  return context;
}

/**
 * Every synthesised voice's ultimate destination. Kept for `synth.ts`'s
 * fallback callers and anything that genuinely wants the post-fader master
 * (nothing in this directory still does — every real voice now targets
 * `getBusGain`). `null` exactly when `getAudioContext()` is.
 */
export function getMasterGain(): GainNode | null {
  getAudioContext();
  return master;
}

/** One bus's gain node — what `music.ts`/`sfx-player.ts` connect their voices into. */
export function getBusGain(bus: AudioBus): GainNode | null {
  getAudioContext();
  return busGains[bus] ?? null;
}

/**
 * Sets one bus's volume (0–1), independent of the others. A short
 * `setTargetAtTime` ramp rather than an instant `.value` write — long enough
 * to avoid a click on a fast slider drag, short enough that #53's "every
 * setting takes effect immediately" still reads as immediate.
 */
export function setBusVolume(bus: AudioBus, volume: number): void {
  const clamped = Math.min(1, Math.max(0, volume));
  busVolumes[bus] = clamped;
  const gain = busGains[bus];
  if (gain !== undefined) {
    rampGain(gain, clamped);
  }
}

export function getBusVolume(bus: AudioBus): number {
  return busVolumes[bus];
}

/** Sets the master volume (0–1) — composes with `toggleMute`: muted always wins. */
export function setMasterVolume(volume: number): void {
  masterVolume = Math.min(1, Math.max(0, volume));
  if (master !== null && !muted) {
    rampGain(master, masterVolume);
  }
}

export function getMasterVolume(): number {
  return masterVolume;
}

/** Applies a full `MixerSettings` in one call — #53's settings screen's own entry point. */
export function applyMixerSettings(settings: MixerSettings): void {
  setMasterVolume(settings.master);
  setBusVolume('music', settings.music);
  setBusVolume('sfx', settings.sfx);
  setBusVolume('voice', settings.voice);
}

const RAMP_TIME_CONSTANT_SECONDS = 0.015;

function rampGain(node: GainNode, target: number): void {
  const ctx = context;
  if (ctx === null) {
    node.gain.value = target;
    return;
  }
  node.gain.setTargetAtTime(target, ctx.currentTime, RAMP_TIME_CONSTANT_SECONDS);
}

/**
 * Maps a Promille tier's `muffle` (0–1, `content/audio/types.ts`'s
 * `PromilleAudioTier`) to the lowpass cutoff `setPromilleFilterCutoff` wants.
 * Exponential rather than linear: a lowpass's audible effect is logarithmic
 * in frequency, so a linear sweep from 20000Hz spends nearly all its motion
 * above human hearing's sensitive range before it does anything perceptible.
 */
export function promilleMuffleToHz(muffle: number): number {
  const clamped = Math.min(1, Math.max(0, muffle));
  const logMax = Math.log(PROMILLE_FILTER_BYPASS_HZ);
  const logMin = Math.log(PROMILLE_FILTER_MIN_HZ);
  return Math.exp(logMax + (logMin - logMax) * clamped);
}

/** Sets the whole-mix Promille lowpass cutoff directly, in Hz. */
export function setPromilleFilterCutoffHz(hz: number): void {
  if (promilleFilter === null) {
    return;
  }
  const ctx = context;
  const clamped = Math.min(PROMILLE_FILTER_BYPASS_HZ, Math.max(PROMILLE_FILTER_MIN_HZ, hz));
  if (ctx === null) {
    promilleFilter.frequency.value = clamped;
    return;
  }
  promilleFilter.frequency.setTargetAtTime(clamped, ctx.currentTime, 0.2);
}

/** Bypasses the Promille filter entirely — the accessibility escape hatch (#53's "reduce audio distortion"). */
export function resetPromilleFilter(): void {
  setPromilleFilterCutoffHz(PROMILLE_FILTER_BYPASS_HZ);
}

/**
 * Ducks the music bus: ramps down by `depth` (0–1, fraction of its current
 * user-set volume) over `attackSeconds`, holds, then ramps back over
 * `releaseSeconds` — boss-room entry, a pickup chime, a voice bark
 * (`ambience.ts`/`sfx-player.ts`'s call sites).
 *
 * A second duck before the first has released simply re-schedules from
 * "now": `cancelScheduledValues` plus a fresh `setValueAtTime` anchor is what
 * makes that a clean restart instead of two overlapping ramps fighting over
 * the same `AudioParam`.
 */
export function duckMusic(
  depth: number,
  attackSeconds: number,
  holdSeconds: number,
  releaseSeconds: number,
): void {
  const gain = busGains.music;
  const ctx = context;
  if (gain === undefined || ctx === null) {
    return;
  }
  const now = ctx.currentTime;
  const base = busVolumes.music;
  const duckedTo = base * (1 - Math.min(1, Math.max(0, depth)));
  const g = gain.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(g.value, now);
  g.linearRampToValueAtTime(duckedTo, now + attackSeconds);
  g.setValueAtTime(duckedTo, now + attackSeconds + holdSeconds);
  g.linearRampToValueAtTime(base, now + attackSeconds + holdSeconds + releaseSeconds);
}

/**
 * Browsers refuse to run an `AudioContext` until a user gesture. Call this
 * from the game's own first keydown/pointerdown handler — it is safe to call
 * repeatedly and off-browser.
 */
export function resumeAudioContext(): void {
  const ctx = getAudioContext();
  if (ctx !== null && ctx.state === 'suspended') {
    void ctx.resume();
  }
}

/**
 * Wires `resumeAudioContext` to the page's first pointer/key input, once.
 * `app/main.ts` calls this during boot; it is a no-op off-browser and a
 * no-op on every call after the first.
 */
export function attachAudioUnlockListener(): void {
  if (unlockListenersAttached || typeof window === 'undefined') {
    return;
  }
  unlockListenersAttached = true;
  const unlock = (): void => {
    resumeAudioContext();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);
}

/**
 * CONTRIBUTING.md's audio definition-of-done: "has an off switch that
 * reaches zero." `app/main.ts` binds this to a bare key (`M`) for players
 * who never open the settings screen; #53's master slider reaching exactly 0
 * is the other one.
 */
export function toggleMute(): boolean {
  muted = !muted;
  if (master !== null) {
    rampGain(master, muted ? 0 : masterVolume);
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}
