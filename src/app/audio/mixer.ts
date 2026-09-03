/**
 * The mixer's data shape (#157): independent volumes for each bus
 * `context.ts` builds, plus the plumbing to persist and re-apply them.
 *
 * Kept apart from `context.ts` the same way `content/audio/types.ts` is kept
 * apart from `synth.ts` — this file is plain data and pure validation, safe
 * to import from `save/schema.ts` (which runs in every environment, audio or
 * not) without dragging `AudioContext` along with it.
 */

/** The buses a slider can move independently — `context.ts`'s bus graph. */
export type AudioBus = 'music' | 'sfx' | 'voice';

/**
 * Plain mutable fields, not `readonly` — the settings screen mutates a live
 * `Preferences.mixer` in place (`settings.ts`'s `AccessibilitySettings` sets
 * the same precedent), the same object `app/main.ts` already holds and
 * re-applies from on every change.
 */
export interface MixerSettings {
  /** 0 (silent) to 1 (full) — attenuates every bus below it, including the master mute. */
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

export const DEFAULT_MIXER_SETTINGS: Readonly<MixerSettings> = {
  master: 1,
  music: 1,
  sfx: 1,
  voice: 1,
};

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Coerces an arbitrary parsed value into a full `MixerSettings`, field by
 * field — the same "never throw the whole blob away over one bad field"
 * shape `settings.ts`'s `sanitizeAccessibilitySettings` already uses.
 */
export function sanitizeMixerSettings(candidate: unknown): MixerSettings {
  if (typeof candidate !== 'object' || candidate === null) {
    return { ...DEFAULT_MIXER_SETTINGS };
  }
  const source = candidate as Partial<Record<keyof MixerSettings, unknown>>;
  return {
    master: isUnitInterval(source.master) ? source.master : DEFAULT_MIXER_SETTINGS.master,
    music: isUnitInterval(source.music) ? source.music : DEFAULT_MIXER_SETTINGS.music,
    sfx: isUnitInterval(source.sfx) ? source.sfx : DEFAULT_MIXER_SETTINGS.sfx,
    voice: isUnitInterval(source.voice) ? source.voice : DEFAULT_MIXER_SETTINGS.voice,
  };
}
