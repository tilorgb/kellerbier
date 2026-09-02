export { CHARACTERS as PROGRESSION_CHARACTERS } from '../characters/index.js';

/**
 * The roster the run-start path offers.
 *
 * Lives in `src/content/characters/` — one file per character, the same
 * shape `src/content/enemies/` and `src/content/items/` already use. This
 * re-export is what keeps the progression bundle's shape stable regardless of
 * where the roster itself is authored.
 */
