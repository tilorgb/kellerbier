import { UNLOCK_PROMILLE } from './meta/progress.js';
import type { SaveData } from './save/schema.js';

/**
 * Whether a run gets the Promille mechanic at all (#85).
 *
 * Promille is the game's signature system and a new player should not meet
 * it in their first minute: the opening reads as an ordinary twin-stick
 * roguelite, and the beer arrives later, earned by beating Der Stier and
 * announced on the results screen. This module owns the one decision that
 * implements that — the boolean `app/main.ts` hands to every `GameSim` it
 * builds — and nothing else. What the flag then *turns off* lives with the
 * thing it turns off: `GameSim.promille` (the meter, and everything derived
 * from it), `GameSim.dropLoot` (the sober half of every drop table) and
 * `itemEligibleForOffer` (Promille items).
 *
 * Kept out of `meta/` deliberately. Everything in there is about progression
 * — what has been earned — and reads the save after a run has ended. This is
 * read at run *start*, and it is the only unlock in the set that changes how
 * the simulation itself is built, so it gets its own small module rather
 * than being a fifth thing `meta/index.ts` does.
 */

/** Whether the save has earned Promille — the unlock for beating Der Stier. */
export function promilleUnlockedIn(save: SaveData): boolean {
  return save.unlocks.includes(UNLOCK_PROMILLE);
}

/**
 * The dev override (#85's "a debug override forcing either state").
 *
 * `auto` follows the save. The other two pin a run's state regardless of it,
 * which is what makes Promille workable on without playing up to the unlock
 * every time — and, just as importantly, makes the *sober* half testable
 * without wiping a save that has already earned the beer.
 */
export type PromilleOverride = 'auto' | 'sober' | 'promilled';

export const PROMILLE_OVERRIDES: readonly PromilleOverride[] = ['auto', 'sober', 'promilled'];

/**
 * Its own `localStorage` key rather than a field in the save.
 *
 * A dev override is not player progress: it must not travel through
 * `save/export-import.ts` to somebody else's machine, it must not be
 * something a save migration has to carry forward for ever, and wiping
 * progress to test an arrival (`resetProgress`) must not silently also reset
 * the override the tester set two minutes ago. Keeping it beside the save
 * instead of inside it gets all three for free.
 */
export const PROMILLE_OVERRIDE_KEY = 'kellerbier.debug.promille';

function isOverride(value: unknown): value is PromilleOverride {
  return PROMILLE_OVERRIDES.includes(value as PromilleOverride);
}

/**
 * Reads the override, or `auto` for anything unreadable — a missing key, a
 * value written by hand that is not one of the three, or a `localStorage`
 * that throws (a private window, or this project's `vitest` config, which
 * runs in `environment: 'node'`). Never throws, same contract as `loadSave`.
 */
export function readPromilleOverride(): PromilleOverride {
  try {
    const raw = localStorage.getItem(PROMILLE_OVERRIDE_KEY);
    return isOverride(raw) ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/** Persists the override, or clears the key entirely for `auto`. Never throws. */
export function writePromilleOverride(override: PromilleOverride): void {
  try {
    if (override === 'auto') {
      localStorage.removeItem(PROMILLE_OVERRIDE_KEY);
      return;
    }
    localStorage.setItem(PROMILLE_OVERRIDE_KEY, override);
  } catch {
    // Best-effort, exactly like `writeSave`: an override that does not
    // survive a reload is a worse dev tool, not a broken game.
  }
}

/** The next one along, for a key that cycles through the three states. */
export function nextPromilleOverride(override: PromilleOverride): PromilleOverride {
  const index = PROMILLE_OVERRIDES.indexOf(override);
  return PROMILLE_OVERRIDES[(index + 1) % PROMILLE_OVERRIDES.length] ?? 'auto';
}

/**
 * The flag a run actually starts with: the override where one is set, the
 * save's unlock otherwise.
 *
 * A pure function of the two, so the rule is testable without a browser and
 * without a `GameSim` — `app/main.ts` only has to decide *when* to ask.
 */
export function resolvePromilleUnlocked(save: SaveData, override: PromilleOverride): boolean {
  switch (override) {
    case 'sober':
      return false;
    case 'promilled':
      return true;
    default:
      return promilleUnlockedIn(save);
  }
}
