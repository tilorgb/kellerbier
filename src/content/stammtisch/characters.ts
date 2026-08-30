export { CHARACTERS as STAMMTISCH_CHARACTERS } from '../characters/index.js';

/**
 * The roster the Stammtisch's run-start panel offers.
 *
 * It lives in `src/content/characters/` now (#47) — one file per character,
 * the same shape `src/content/enemies/` and `src/content/items/` already
 * use, because a character grew from three lines to a stat block, a rule list
 * and a page of reasoning. This re-export is what keeps `STAMMTISCH`'s bundle
 * reading the same as it did when the roster was one row long.
 */
