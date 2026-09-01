/**
 * The dev-only endless floor loop (#155's "the endless floor loop still
 * exists behind a debug toggle, and a player cannot reach it").
 *
 * Before #155 there was no win condition at all: clearing the last floor's
 * boss wrapped back to floor 1, `sim` intact, so an item stack could be run
 * through the floors repeatedly during a playtest — genuinely useful, and
 * explicitly not the thing a player should ever fall into by just playing.
 * Now that clearing Der Stier ends the run, that same loop only runs when
 * this override is on, which defaults to off.
 *
 * Its own `localStorage` key rather than a field in the save, same
 * reasoning `promille-gate.ts`'s `PROMILLE_OVERRIDE_KEY` already gives: a
 * dev override is not player progress, must not travel through
 * `save/export-import.ts`, and must not be silently reset by
 * `resetProgress`.
 */

export const ENDLESS_FLOORS_KEY = 'kellerbier.debug.endlessFloors';

/** Reads the override — `false` (the real win path) for anything unreadable, same contract as `readPromilleOverride`. */
export function readEndlessFloors(): boolean {
  try {
    return localStorage.getItem(ENDLESS_FLOORS_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Persists the override, or clears the key entirely for `false`. Never throws. */
export function writeEndlessFloors(value: boolean): void {
  try {
    if (!value) {
      localStorage.removeItem(ENDLESS_FLOORS_KEY);
      return;
    }
    localStorage.setItem(ENDLESS_FLOORS_KEY, 'true');
  } catch {
    // Best-effort, exactly like `writePromilleOverride`.
  }
}
