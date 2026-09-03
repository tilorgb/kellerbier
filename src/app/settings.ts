import type { GameSim } from '../sim/game/sim.js';
import { loadSave, updateSave } from './save/storage.js';

/**
 * Accessibility settings: started with #33's camera-sway intensity, no-drift
 * mode and neutral reskin; #53 (the full accessibility suite) adds
 * screenshake intensity, the colourblind-safe palette, text scaling,
 * slow-mode and the Promille audio-distortion toggle to the same file rather
 * than a parallel one, since they share every mechanic below.
 *
 * Deliberately not part of `GameSim`/`SimTuning` — see `docs/DECISIONS.md`'s
 * entry on this: a settings change is a rendering/input concern, not
 * simulation state, and must never need to be deterministic or replayable
 * the way `PromilleTuning.current`'s own doc comment carves out an exception
 * for. `GameSim.swayScale`/`driftScale`/`wobbleScale`/`screenShakeScale` are
 * what actually carry the sim-facing subset of these values into the sim's
 * per-tick math — this module only owns the persisted source of truth and
 * pushes it onto whichever `GameSim` is live via `applySettingsToSim`. The
 * rest (colour, text size, real-time speed, audio) reach their own render/
 * loop/audio call sites directly — see `applySettingsToSim`'s own doc
 * comment for exactly which is which and why.
 *
 * Defaults are the full, unaccessibility-adjusted experience (issue #33's own
 * "Defaults are the full experience; these are opt-in") — a fresh install, or
 * a corrupted/missing save, behaves exactly like the game did before this
 * file existed. Persisted through the unified save (#45) via
 * `save/storage.ts`'s `loadSave`/`updateSave` — see `loadSettings`'s own doc
 * comment for why this module no longer keeps its own storage key.
 */
export interface AccessibilitySettings {
  /**
   * 0 (silent) to 1 (full) — `app/settings-screen.ts`'s slider is 0-100%,
   * stored here as a fraction so it plugs straight into `GameSim.swayScale`.
   * 0 must produce a literally-zero camera offset, not merely a small one —
   * `GameSim.swayScale`'s own doc comment, and `promille.test.ts`, are what
   * guarantee that.
   */
  swayScale: number;
  /**
   * No-drift mode: keeps Promille's damage/fire-rate bonuses and its visual
   * language (HUD tint, screen distortion), removes the movement drift and
   * aim wobble penalties. See `GameSim.driftScale`'s doc comment for the
   * exact scope and why screen distortion is deliberately excluded.
   */
  noDrift: boolean;
  /**
   * Relabels the Promille meter and its tiers with non-alcohol strings and
   * colours — see `sim/game/promille.ts`'s `promilleTierDisplayName` and
   * neighbours, and `render/promille-hud.ts`'s neutral colour table.
   */
  neutralReskin: boolean;
  /**
   * Reduced motion (#153, #53's first half): damps screen shake, and stops
   * every *decorative* effect from being drawn — the room-clear ring, the door
   * puffs, the pickup glints, the promille vignette's pulse.
   *
   * What it deliberately keeps: the foam and splash a hit throws, the hit
   * flash, the telegraph ring's growth. Those are the only copy of something —
   * "that connected", "that died", "that is about to attack" — and an
   * accessibility toggle that removes information is not an accessibility
   * toggle. Shake is damped rather than removed for the same reason: it is
   * the cheapest signal that a hit was *yours*, and a floor of it is still
   * readable where none at all is not. `swayScale` above is the separate,
   * finer control for the camera specifically.
   *
   * Suppressed in the renderer, never in the simulation — see
   * `docs/DECISIONS.md` #41 for why a reduced-motion run has to produce the
   * identical simulation to a full one.
   */
  reducedMotion: boolean;
  /**
   * Reduced flashing (#153, #53's other half): stops the effects that
   * *repeat* brightly — the muzzle flash on every shot, the room-clear amber
   * door pulse, the promille vignette's breathing, the telegraph ring's alpha
   * pulse.
   *
   * The one-frame white hit flash is deliberately **not** in that list. It
   * fires once per hit rather than continuously, it is what tells the player a
   * shot landed, and removing it would leave a hit reading as a shot the game
   * dropped. The hazard this setting exists for is repetition — a muzzle
   * flashing eight times a second is the thing worth being able to switch off.
   */
  reduceFlashes: boolean;
  /**
   * Screenshake intensity (#53), 0-1 — the settings screen's Video-tab
   * sibling to `swayScale`. Plugs straight into `GameSim.screenShakeScale`,
   * which existed since before this field did (`sim.ts`'s own default of 1)
   * but had nothing driving it from a persisted setting until now.
   */
  screenshakeScale: number;
  /**
   * The colourblind-safe projectile palette (#53, `docs/GAME_DESIGN.md`
   * §12): player and enemy shots read apart by shape and brightness rather
   * than hue alone. Read directly by render call sites
   * (`render/projectile-view.ts` and neighbours) rather than round-tripping
   * through `GameSim` — a palette swap is exactly the kind of "how it looks,
   * never what it does" concern `neutralReskin` above already keeps out of
   * the simulation.
   */
  colorblindPalette: boolean;
  /**
   * Text scale multiplier (#53) for the pixel-font UI kit
   * (`render/ui/text.ts`) — 1, 1.25 or 1.5. Kept as a plain multiplier
   * rather than a named size so a HUD element can apply it without knowing
   * the settings screen's own labels for it.
   */
  textScale: number;
  /**
   * Optional slow-mode (#53): a real-time speed multiplier applied to
   * `FixedTimestepLoop.timeScale`'s baseline (`app/loop.ts`) — 1 is off.
   * Every tick still runs the same simulation math at the same tick rate;
   * only how many ticks happen per real second changes, which is what
   * "without changing balance" means here — nothing about damage,
   * cooldowns or drop rates reads real time anywhere in `sim/`.
   */
  slowModeScale: number;
  /**
   * Reduces the Promille meter's audio disorientation — the tempo drag,
   * detune and lowpass `MusicPlayer.setPromilleTier` applies (#157) — while
   * leaving the meter's gameplay effects and its HUD/visual language alone.
   * See `ambience.ts`'s `syncPromilleTier` call site for where this reaches
   * the audio layer.
   */
  reduceAudioDistortion: boolean;
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: Readonly<AccessibilitySettings> = {
  swayScale: 1,
  noDrift: false,
  neutralReskin: false,
  reducedMotion: false,
  reduceFlashes: false,
  screenshakeScale: 1,
  colorblindPalette: false,
  textScale: 1,
  slowModeScale: 1,
  reduceAudioDistortion: false,
};

/** The text scales the settings screen offers — anything else sanitises back to 1. */
export const TEXT_SCALE_OPTIONS: readonly number[] = [1, 1.25, 1.5];

/** The slow-mode speeds the settings screen offers — 1 is off. */
export const SLOW_MODE_OPTIONS: readonly number[] = [1, 0.85, 0.7];

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isOneOf(value: unknown, options: readonly number[]): value is number {
  return typeof value === 'number' && options.includes(value);
}

/**
 * Coerces an arbitrary parsed value into a full `AccessibilitySettings`,
 * falling back to defaults field-by-field rather than all-or-nothing — a
 * future field this version doesn't know about, or one saved by an older
 * version that lacked a later field, should not throw the whole blob away.
 *
 * Exported so the save system (#45) can reuse the exact same validation when
 * it folds settings into the unified save blob, instead of a second copy of
 * this field-by-field logic drifting out of sync with this one.
 */
export function sanitizeAccessibilitySettings(candidate: unknown): AccessibilitySettings {
  if (typeof candidate !== 'object' || candidate === null) {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
  const source = candidate as Partial<Record<keyof AccessibilitySettings, unknown>>;
  return {
    swayScale: isUnitInterval(source.swayScale)
      ? source.swayScale
      : DEFAULT_ACCESSIBILITY_SETTINGS.swayScale,
    noDrift:
      typeof source.noDrift === 'boolean' ? source.noDrift : DEFAULT_ACCESSIBILITY_SETTINGS.noDrift,
    neutralReskin:
      typeof source.neutralReskin === 'boolean'
        ? source.neutralReskin
        : DEFAULT_ACCESSIBILITY_SETTINGS.neutralReskin,
    reducedMotion:
      typeof source.reducedMotion === 'boolean'
        ? source.reducedMotion
        : DEFAULT_ACCESSIBILITY_SETTINGS.reducedMotion,
    reduceFlashes:
      typeof source.reduceFlashes === 'boolean'
        ? source.reduceFlashes
        : DEFAULT_ACCESSIBILITY_SETTINGS.reduceFlashes,
    screenshakeScale: isUnitInterval(source.screenshakeScale)
      ? source.screenshakeScale
      : DEFAULT_ACCESSIBILITY_SETTINGS.screenshakeScale,
    colorblindPalette:
      typeof source.colorblindPalette === 'boolean'
        ? source.colorblindPalette
        : DEFAULT_ACCESSIBILITY_SETTINGS.colorblindPalette,
    textScale: isOneOf(source.textScale, TEXT_SCALE_OPTIONS)
      ? source.textScale
      : DEFAULT_ACCESSIBILITY_SETTINGS.textScale,
    slowModeScale: isOneOf(source.slowModeScale, SLOW_MODE_OPTIONS)
      ? source.slowModeScale
      : DEFAULT_ACCESSIBILITY_SETTINGS.slowModeScale,
    reduceAudioDistortion:
      typeof source.reduceAudioDistortion === 'boolean'
        ? source.reduceAudioDistortion
        : DEFAULT_ACCESSIBILITY_SETTINGS.reduceAudioDistortion,
  };
}

/**
 * Reads the persisted settings from the unified save (#45) — see
 * `save/storage.ts#loadSave`'s own doc comment for the recovery order
 * (corrupted primary -> backup -> a first-run adoption of the standalone
 * key this module used to own -> defaults) and why it never throws.
 *
 * This module used to keep its own `localStorage` key entirely separate
 * from the unified save, which was #53's own acceptance criterion to fix:
 * "every setting survives a restart, through #45 rather than through its
 * own storage." `loadSave` already handled adopting that legacy key into a
 * fresh save on its first run (`storage.ts`'s `readLegacySettings`); this
 * function just needed to start asking it instead of reading the old key
 * directly.
 */
export function loadSettings(): AccessibilitySettings {
  return loadSave().settings;
}

/** Persists `settings` into the unified save — best-effort, same as every other field `updateSave`/`writeSave` write. */
export function saveSettings(settings: AccessibilitySettings): void {
  updateSave((save) => ({ ...save, settings }));
}

/**
 * Pushes the settings fields that have a live `GameSim` counterpart onto it.
 * Called once after every `GameSim` is constructed (`app/main.ts`'s
 * `startRun`, since a restart builds a fresh `sim`) and again every time the
 * accessibility panel changes a value, so a mid-run edit takes effect on the
 * next tick rather than the next run.
 *
 * `neutralReskin`, `reducedMotion` and `reduceFlashes` have no entry here on
 * purpose. The last two are the load-bearing case: a reduced-motion run must
 * step *identically* to a full one, or a replay recorded with the toggle on
 * plays back differently with it off (`docs/DECISIONS.md` #41), so they never
 * reach the simulation at all — every effect is spawned either way and the
 * renderer decides what to draw. `neutralReskin` is the milder version of the
 * same thing: nothing in `GameSim` needs — it only ever changes *how* a Promille value is displayed
 * (`promilleTierDisplayName` and friends), never what the simulation does
 * with it, so render/debug call sites read `settings.neutralReskin` directly
 * instead of it round-tripping through the sim.
 *
 * #53's four new fields follow the same split, each for its own reason:
 * `colorblindPalette` and `textScale` are draw-time concerns read directly by
 * their render call sites, the same as `neutralReskin`. `slowModeScale`
 * drives `FixedTimestepLoop.timeScale` (`app/loop.ts`), not `GameSim` — it
 * changes how many real seconds a tick takes, never what a tick computes.
 * `reduceAudioDistortion` reaches `app/audio/`'s `syncPromilleTier` call
 * site, not the sim, for the identical reduced-motion reason: an accessible
 * *presentation* of the Promille tier, with the tier's actual gameplay
 * effects — and a replay recorded with it on — untouched either way.
 */
export function applySettingsToSim(sim: GameSim, settings: AccessibilitySettings): void {
  sim.swayScale = settings.swayScale;
  sim.driftScale = settings.noDrift ? 0 : 1;
  sim.wobbleScale = settings.noDrift ? 0 : 1;
  sim.screenShakeScale = settings.screenshakeScale;
}
