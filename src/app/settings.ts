import type { GameSim } from '../sim/game/sim.js';

/**
 * Accessibility settings (#33): camera-sway intensity, no-drift mode, and the
 * neutral reskin. Deliberately not part of `GameSim`/`SimTuning` — see
 * `docs/DECISIONS.md`'s entry on this: a settings change is a rendering/input
 * concern, not simulation state, and must never need to be deterministic or
 * replayable the way `PromilleTuning.current`'s own doc comment carves out an
 * exception for. `GameSim.swayScale`/`driftScale`/`wobbleScale` are what
 * actually carry these values into the sim's per-tick math — this module only
 * owns the persisted source of truth and pushes it onto whichever `GameSim`
 * is live via `applySettingsToSim`.
 *
 * Defaults are the full, unaccessibility-adjusted experience (issue #33's own
 * "Defaults are the full experience; these are opt-in") — a fresh install, or
 * a corrupted/missing `localStorage` entry, behaves exactly like the game did
 * before this file existed.
 */
export interface AccessibilitySettings {
  /**
   * 0 (silent) to 1 (full) — `app/accessibility-panel.ts`'s slider is 0-100%,
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
}

export const DEFAULT_ACCESSIBILITY_SETTINGS: Readonly<AccessibilitySettings> = {
  swayScale: 1,
  noDrift: false,
  neutralReskin: false,
};

/**
 * Versioned so a later, incompatible shape can migrate or discard an old
 * blob instead of crashing on it — same reasoning `docs/GAME_DESIGN.md` §11
 * gives for the (still-unbuilt) save-file key.
 */
const STORAGE_KEY = 'kellerbier.settings.v1';

function isUnitInterval(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Reads the persisted settings, falling back to defaults field-by-field
 * rather than all-or-nothing — a future field this version doesn't know
 * about, or one saved by an older version that lacked a later field, should
 * not throw the whole blob away.
 *
 * Never throws: a private window, disabled storage, or a headless/test
 * environment with no `localStorage` at all (this repo's own `vitest`
 * config runs in `environment: 'node'`) all fall through to the defaults.
 */
export function loadSettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
    }
    const candidate = parsed as Partial<Record<keyof AccessibilitySettings, unknown>>;
    return {
      swayScale: isUnitInterval(candidate.swayScale)
        ? candidate.swayScale
        : DEFAULT_ACCESSIBILITY_SETTINGS.swayScale,
      noDrift:
        typeof candidate.noDrift === 'boolean'
          ? candidate.noDrift
          : DEFAULT_ACCESSIBILITY_SETTINGS.noDrift,
      neutralReskin:
        typeof candidate.neutralReskin === 'boolean'
          ? candidate.neutralReskin
          : DEFAULT_ACCESSIBILITY_SETTINGS.neutralReskin,
    };
  } catch {
    return { ...DEFAULT_ACCESSIBILITY_SETTINGS };
  }
}

/** Best-effort persistence — a write that fails (storage full, private mode) should not crash a settings change. */
export function saveSettings(settings: AccessibilitySettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Nothing to do: the setting still applies for the rest of this session,
    // it just won't survive a reload.
  }
}

/**
 * Pushes the settings fields that have a live `GameSim` counterpart onto it.
 * Called once after every `GameSim` is constructed (`app/main.ts`'s
 * `startRun`, since a restart builds a fresh `sim`) and again every time the
 * accessibility panel changes a value, so a mid-run edit takes effect on the
 * next tick rather than the next run.
 *
 * `neutralReskin` has no entry here on purpose: nothing in `GameSim` needs
 * it — it only ever changes *how* a Promille value is displayed
 * (`promilleTierDisplayName` and friends), never what the simulation does
 * with it, so render/debug call sites read `settings.neutralReskin` directly
 * instead of it round-tripping through the sim.
 */
export function applySettingsToSim(sim: GameSim, settings: AccessibilitySettings): void {
  sim.swayScale = settings.swayScale;
  sim.driftScale = settings.noDrift ? 0 : 1;
  sim.wobbleScale = settings.noDrift ? 0 : 1;
}
