/**
 * The one `AudioContext` the game uses, plus the single master gain node
 * everything else in `app/audio/` renders into.
 *
 * Deliberately not a bus graph — routing music/SFX/voice onto separate buses
 * with ducking is #157's job (`docs/BACKLOG.md` #157, "Audio engine: buses,
 * mixing, ducking and Promille filtering"). Until that lands, every voice
 * this module's callers create connects straight to `getMasterGain()`, which
 * is the seam #157 will cut in front of rather than a design this file is
 * trying to be.
 *
 * Constructed lazily, not at import time: `vitest.config` runs tests under
 * `environment: 'node'`, which has no `AudioContext`/`window` at all, and a
 * module that touched either at the top level would fail every test that
 * imports it, transitively, even ones nowhere near audio. Every export here
 * is safe to import anywhere and returns `null` off-browser instead.
 */

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

let context: AudioContextLike | null = null;
let master: GainNode | null = null;
let unlockListenersAttached = false;
let muted = false;

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
  master.gain.value = muted ? 0 : 1;
  master.connect(context.destination);
  return context;
}

/** Every synthesised voice's destination. `null` exactly when `getAudioContext()` is. */
export function getMasterGain(): GainNode | null {
  getAudioContext();
  return master;
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
 * reaches zero." There is no settings menu yet (#53) for this to live in,
 * so `app/main.ts` binds it to a bare key (`M`) for now — a real settings
 * toggle is a rebind of this same function, not a new one, when #53 lands.
 */
export function toggleMute(): boolean {
  muted = !muted;
  if (master !== null) {
    master.gain.value = muted ? 0 : 1;
  }
  return muted;
}

export function isMuted(): boolean {
  return muted;
}
