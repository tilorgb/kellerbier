/**
 * The game-over screen's headline word pool.
 *
 * Boarisch for "collapsed / finished". See `docs/CONTENT_BIBLE.md` §7 for the
 * full rationale. The pool is data, not code — adding a word here is the whole
 * change; nothing in the death screen or the draw logic needs to know it grew.
 *
 * Casing is kept exactly as authored. `f'reckt` and `dakerbelt` stay lowercase
 * against `Hi`, `Z'legt` and `Umgfalln` — read as a deliberate typographic
 * choice, not an inconsistency, so nothing here or at the draw site upper-cases
 * or normalises a word before it is shown.
 */
export const DEATH_WORD_POOL: readonly string[] = [
  'Umgfalln',
  'Hi',
  "Z'legt",
  "f'reckt",
  'dakerbelt',
];
