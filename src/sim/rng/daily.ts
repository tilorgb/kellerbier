/**
 * The daily run's seed (#48): one seed per calendar date, identical for every
 * player who opens the game that day.
 *
 * A pure hash over the date's own key rather than anything that reads the
 * clock — `docs/DECISIONS.md` #3 is explicit that `sim/` (and this lives next
 * to `rng/seed.ts`, which the rest of the run's identity already goes
 * through) touches no wall clock. `app/`'s job is to turn "today" into the
 * `YYYY-MM-DD` key this takes; this file's job is only to turn that key into
 * a seed, deterministically, the same way on every machine.
 */

import { splitmix32 } from './rng.js';

/** `YYYY-MM-DD`, matching what `app/daily.ts`'s `dailyDateKey` produces. */
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Derives a 32-bit seed from a date key.
 *
 * Every character folds into the mixer with `splitmix32`, the same expansion
 * `Rng.reseed` uses to turn a small input into well-distributed state — so
 * "2026-08-30" and "2026-08-31" land on unrelated seeds rather than adjacent
 * ones, the same property `streamSeed` relies on for its own stream ids.
 *
 * Throws on anything that isn't `YYYY-MM-DD`: a malformed key is a bug at the
 * call site (a locale-formatted date, an off-by-one on the dash), not a
 * legitimate "no daily run today" — see `CLAUDE.md`'s distinction between a
 * content gap and a bug.
 */
export function dailySeed(dateKey: string): number {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new RangeError(`A daily seed key is "YYYY-MM-DD", got "${dateKey}"`);
  }
  let mixer = 0x5da1_7e5e; // Arbitrary odd-ish constant: keeps this stream distinct from a raw seed of 0.
  for (let index = 0; index < dateKey.length; index++) {
    mixer = (mixer + Math.imul(dateKey.charCodeAt(index) + 1, 0x9e3779b9)) | 0;
    mixer = splitmix32(mixer) | 0;
  }
  return splitmix32(mixer);
}
