/**
 * `?floor=N`: start a run on a later floor (a *sandbox* run), so a floor that
 * a normal run rarely reaches can be tested straight away. Whether the
 * parameter is honoured at all is `FLOOR_SKIP_ENABLED`'s business
 * (`app/build-mode.ts`); this is the pure parsing.
 */
export interface StartFloorRequest {
  /** The floor the run will actually start on, never above `highest`. */
  readonly floor: number;
  /** What the URL asked for, so the player can be told when it was clamped. */
  readonly requested: number;
}

/**
 * Reads `?floor=` out of a query string. `null` — a normal run — when the
 * parameter is absent, not a whole number, below 2 (floor 1 *is* a normal
 * run), or `enabled` is false. A floor above `highest` is clamped to it
 * rather than refused (`docs/DECISIONS.md` #19: a floor whose content is not
 * authored yet must not freeze or throw), and the caller says so.
 */
export function parseStartFloor(
  search: string,
  enabled: boolean,
  highest: number,
): StartFloorRequest | null {
  if (!enabled) {
    return null;
  }
  const raw = new URLSearchParams(search).get('floor');
  if (raw === null || !/^\d+$/.test(raw.trim())) {
    return null;
  }
  const requested = Number(raw.trim());
  if (requested < 2) {
    return null;
  }
  const floor = Math.min(requested, highest);
  return floor < 2 ? null : { floor, requested };
}
