/**
 * Preferences (#53): the Video and Controls tabs of the settings screen,
 * plus the Audio tab's mixer volumes.
 *
 * Kept apart from `settings.ts`'s `AccessibilitySettings` — not because the
 * two are unrelated (they persist through the same unified save, and the
 * settings screen shows both as tabs of one thing), but because these three
 * groups share nothing `AccessibilitySettings`'s own field-by-field
 * sanitiser was built around: `Bindings` is a nested, mutable structure
 * validated action-by-action (`input/bindings.ts#sanitizeBindings`), not a
 * flat set of numbers and booleans. Splitting the file is what let that
 * sanitiser live next to the type it validates instead of settings.ts
 * growing a second, differently-shaped block of field-by-field checks.
 */

import { type Bindings, createDefaultBindings, sanitizeBindings } from './input/bindings.js';
import { DEFAULT_DEAD_ZONE } from './input/gamepad.js';
import {
  DEFAULT_MIXER_SETTINGS,
  type MixerSettings,
  sanitizeMixerSettings,
} from './audio/mixer.js';
import { loadSave, updateSave } from './save/storage.js';

/**
 * The internal-resolution scale factor (`render/resolution.ts`'s own doc
 * comment on why it must be a whole number). `'auto'` is today's only
 * behaviour — the largest whole multiple that fits the window — and stays
 * the default; a numeric value pins it instead, for a player on a very
 * large display where "biggest that fits" reads uncomfortably large, or one
 * who wants more of the room visible on screen.
 */
export interface VideoPreferences {
  scale: number | 'auto';
}

/** A generous ceiling — well past any display this project's whole-number scaling makes sense on. */
export const MAX_VIDEO_SCALE = 8;

/**
 * Plain mutable fields throughout this file's types, not `readonly` —
 * `settings-screen.ts` mutates a live `Preferences` in place, the same
 * object `app/main.ts` holds and re-applies from on every change, matching
 * `settings.ts`'s own `AccessibilitySettings` convention.
 */
export interface ControlsPreferences {
  bindings: Bindings;
  /** Radial dead zone (`input/dead-zone.ts`), 0-1 — `GamepadSource.deadZone`'s persisted counterpart. */
  gamepadDeadZone: number;
  /** Nudges analog aim toward the nearest enemy within a narrow cone — `input/aim-assist.ts`. */
  aimAssist: boolean;
}

export interface Preferences {
  video: VideoPreferences;
  mixer: MixerSettings;
  controls: ControlsPreferences;
}

/**
 * A function rather than a frozen constant, unlike `settings.ts`'s
 * `DEFAULT_ACCESSIBILITY_SETTINGS`: `Bindings` is nested and mutable (a
 * rebind mutates its arrays in place, `input/bindings.ts#addBinding`), so a
 * shared default object would let one caller's rebind leak into everyone
 * else's "default" value.
 */
export function createDefaultPreferences(): Preferences {
  return {
    video: { scale: 'auto' },
    mixer: { ...DEFAULT_MIXER_SETTINGS },
    controls: {
      bindings: createDefaultBindings(),
      gamepadDeadZone: DEFAULT_DEAD_ZONE,
      aimAssist: false,
    },
  };
}

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function sanitizeVideoPreferences(candidate: unknown): VideoPreferences {
  if (typeof candidate !== 'object' || candidate === null) {
    return { scale: 'auto' };
  }
  const scale = (candidate as Partial<Record<'scale', unknown>>).scale;
  if (scale === 'auto') {
    return { scale: 'auto' };
  }
  if (
    typeof scale === 'number' &&
    Number.isInteger(scale) &&
    scale >= 1 &&
    scale <= MAX_VIDEO_SCALE
  ) {
    return { scale };
  }
  return { scale: 'auto' };
}

function sanitizeControlsPreferences(candidate: unknown): ControlsPreferences {
  const defaults = {
    bindings: createDefaultBindings(),
    gamepadDeadZone: DEFAULT_DEAD_ZONE,
    aimAssist: false,
  };
  if (typeof candidate !== 'object' || candidate === null) {
    return defaults;
  }
  const source = candidate as Partial<Record<keyof ControlsPreferences, unknown>>;
  return {
    bindings: sanitizeBindings(source.bindings),
    gamepadDeadZone: isUnitInterval(source.gamepadDeadZone)
      ? source.gamepadDeadZone
      : defaults.gamepadDeadZone,
    aimAssist: typeof source.aimAssist === 'boolean' ? source.aimAssist : defaults.aimAssist,
  };
}

/**
 * Coerces an arbitrary parsed value into a full `Preferences`, group by
 * group — the same "never throw the whole blob away over one bad field"
 * shape every other save-backed sanitiser in this project uses.
 */
export function sanitizePreferences(candidate: unknown): Preferences {
  if (typeof candidate !== 'object' || candidate === null) {
    return createDefaultPreferences();
  }
  const source = candidate as Partial<Record<keyof Preferences, unknown>>;
  return {
    video: sanitizeVideoPreferences(source.video),
    mixer: sanitizeMixerSettings(source.mixer),
    controls: sanitizeControlsPreferences(source.controls),
  };
}

/** Reads the persisted preferences from the unified save (#45) — see `settings.ts#loadSettings`'s identical reasoning. */
export function loadPreferences(): Preferences {
  return loadSave().preferences;
}

/** Persists `preferences` into the unified save — best-effort, same as every other field `updateSave` writes. */
export function savePreferences(preferences: Preferences): void {
  updateSave((save) => ({ ...save, preferences }));
}
